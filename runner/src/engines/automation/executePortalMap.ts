import { chromium, Dialog, Page } from "playwright";
import { getStorage } from "firebase-admin/storage";
import { getApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { randomUUID } from "crypto";
import { resolveValue } from "../../executor/resolveValue";
import { normalizePortalSteps } from "../../executor/normalizePortalSteps";
import { normalizeBillingAttemptFields } from "../../utils/normalizeFields";
import { createRunnerLog } from "../../logging/createRunnerLog";
import { collectDocuments, setupNetworkSniffer } from "../../executor/documentSniffer";
import { collectVisiblePortalErrors, diagnosePortalError } from "../../executor/portalDoctor";
import { solveCaptchaOnPage } from "../../executor/captchaResolver";
import { healSelectorWithAi } from "../../executor/selfHealing";
import { classifyPortalMessage } from "../errors/errors";
import { getConnectorStrategy } from "../connectors/registry";
import { recoverExistingInvoiceFromPortal, RecoveryResult } from "./recoverInvoice";
import { capturePortalSnapshot } from "../../diagnostics/capturePortalSnapshot";

async function dismissPortalAlerts(page: Page) {
  try {
    const alertButtons = page.locator(
      "button:has-text('Ok'), button:has-text('OK'), button:has-text('Aceptar'), button:has-text('Cerrar'), .swal2-confirm, .alert-button:has-text('Ok'), .alert-button:has-text('OK'), button.confirm"
    ).filter({ visible: true });
    
    const count = await alertButtons.count().catch(() => 0);
    if (count > 0) {
      console.log(`[dismissPortalAlerts] Found ${count} visible alert dismiss button(s). Clicking the first one.`);
      await alertButtons.first().click().catch(() => null);
      await page.waitForTimeout(1000);
    }
  } catch (e) {
    console.warn("[dismissPortalAlerts] Failed to dismiss alerts:", e);
  }
}

export interface ExecutionResult {
  success: boolean;
  paused?: boolean;
  waitingForFields?: string[];
  xmlContent?: string;
  pdfHtml?: string;
  error?: string;
  errorCode?: string;
  downloadedXmlPath?: string;
  downloadedPdfPath?: string;
  screenshotPath?: string;
  stepIndex?: number;
  maskedReference?: string;
  documentSource?: string;
  rawPortalMessage?: string;
  portalMessageSource?: string;
  portalMessageSelector?: string;
  classificationConfidence?: number;
  wasAlreadyInvoiced?: boolean;
  alreadyInvoiced?: boolean;
  recoveryAttempted?: boolean;
  portalMessage?: string;
  validationOnly?: boolean;
  recoveryPathsTried?: string[];
  recoveryButtonsClicked?: string[];
  recoveryFormsDetected?: string[];
  nextRecommendedAction?: string;
  duplicateDetected?: boolean;
  duplicateBasis?: string;
  duplicateReference?: string;
  duplicatePortalMessage?: string;
  duplicateIsFiscalProof?: boolean;
  portalSnapshot?: any;
}

function maskString(str: string): string {
  if (!str) return "";
  if (str.length <= 6) return "***";
  return str.substring(0, 3) + "*".repeat(str.length - 6) + str.substring(str.length - 3);
}

interface CaptchaEvidence {
  selector: string;
  description: string;
}

async function checkCaptcha(page: Page, captchaSelectors: string[]): Promise<CaptchaEvidence | null> {
  const defaultSelectors = [
    "iframe[src*='recaptcha']",
    "iframe[src*='captcha']",
    ".g-recaptcha",
    "input[name*='captcha']",
    "input[id*='captcha']"
  ];
  const allSelectors = [...new Set([...defaultSelectors, ...captchaSelectors])];

  for (const selector of allSelectors) {
    try {
      const matches = page.locator(selector);
      const count = await matches.count();
      for (let index = 0; index < count; index++) {
        const match = matches.nth(index);
        if (!await match.isVisible()) continue;
        const evidence = await match.evaluate((element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return {
            interactiveSize: rect.width >= 20 && rect.height >= 20,
            inViewport: rect.bottom > 0 && rect.right > 0 &&
              rect.top < window.innerHeight && rect.left < window.innerWidth,
            invisibleWidget:
              element.getAttribute("data-size") === "invisible" ||
              element.getAttribute("aria-hidden") === "true" ||
              style.pointerEvents === "none"
          };
        });
        if (evidence.interactiveSize && evidence.inViewport && !evidence.invisibleWidget) {
          return { selector, description: "Control CAPTCHA visible e interactivo" };
        }
      }
    } catch (e) {}
  }

  for (const text of ["No soy un robot", "Introduce el captcha", "Resuelve el CAPTCHA"]) {
    try {
      const message = page.getByText(text, { exact: false }).first();
      if (await message.count() && await message.isVisible()) {
        const box = await message.boundingBox();
        if (box && box.y < 800 && box.y + box.height > 0) {
          return { selector: `text=${text}`, description: "Mensaje CAPTCHA visible" };
        }
      }
    } catch (e) {
      // Ignore detached and cross-origin elements.
    }
  }

  return null;
}

async function checkPortalError(page: Page, errorSelectors: string[]): Promise<string | null> {
  for (const selector of errorSelectors) {
    try {
      const locators = page.locator(selector);
      const count = await locators.count();
      for (let idx = 0; idx < count; idx++) {
        const element = locators.nth(idx);
        const visible = await element.isVisible();
        if (visible) {
          const isStaticLabel = await element.evaluate(el => {
            return el.closest('.ui-fieldset-legend, legend, .ui-selectbooleancheckbox, fieldset, label') !== null;
          }).catch(() => false);
          
          const text = await element.innerText().catch(() => "");
          console.log(`[checkPortalError] Selector: ${selector}, Visible: ${visible}, isStaticLabel: ${isStaticLabel}, Text: "${text}"`);
          
          if (isStaticLabel) continue;

          if (text && text.trim().length > 0) {
            const cleanText = text.trim();
            const normalized = cleanText.replace(/^[\s⚠️]+|[\s]+$/g, "");
            const lower = normalized.toLowerCase();
            if (lower.includes("pendiente") && lower.includes("validar")) {
              console.log(`[checkPortalError] Skipped text containing pending & validate: "${text}"`);
              continue;
            }
            console.log(`[checkPortalError] Matched error text: "${text}"`);
            return cleanText;
          }
        }
      }
    } catch (e) {
      console.error(`[checkPortalError] Error checking selector ${selector}:`, e);
    }
  }
  return null;
}

export interface DetectedMessage {
  message: string;
  source: "growl" | "modal" | "alert" | "inline" | "field_validation" | "body_scan";
  selector?: string;
  appearedAfterAction: boolean;
  confidence: number;
}

async function captureErrorMessagesSnapshot(page: Page, errorSelectors: string[]): Promise<string[]> {
  const messages: string[] = [];

  const addText = (text: string) => {
    if (text && text.trim().length > 0) {
      messages.push(text.trim());
    }
  };

  // Check custom error selectors
  for (const selector of errorSelectors) {
    try {
      const locators = page.locator(selector);
      const count = await locators.count().catch(() => 0);
      for (let idx = 0; idx < count; idx++) {
        if (await locators.nth(idx).isVisible().catch(() => false)) {
          const text = await locators.nth(idx).innerText().catch(() => "");
          addText(text);
        }
      }
    } catch {}
  }

  // Check fallback selectors
  const fallbacks = [
    ".ui-growl-message",
    ".ui-messages-error-detail",
    ".ui-message-error-detail",
    ".ui-messages-error",
    ".ui-message-error",
    ".ui-messages-fatal-detail",
    ".ui-message-fatal-detail",
    ".swal-text",
    ".swal2-content",
    ".swal2-html-container",
    ".alert-danger",
    ".alert-error",
    ".text-danger",
    ".error-message",
    ".invalid-feedback"
  ];
  for (const selector of fallbacks) {
    try {
      const locators = page.locator(selector);
      const count = await locators.count().catch(() => 0);
      for (let idx = 0; idx < count; idx++) {
        if (await locators.nth(idx).isVisible().catch(() => false)) {
          const text = await locators.nth(idx).innerText().catch(() => "");
          addText(text);
        }
      }
    } catch {}
  }

  // Check body scan lines
  try {
    const bodyText = await page.locator("body").innerText().catch(() => "");
    if (bodyText) {
      bodyText.split("\n").forEach(line => {
        const clean = line.trim();
        if (clean.length > 5 && clean.length < 200) {
          messages.push(clean);
        }
      });
    }
  } catch {}

  return [...new Set(messages)];
}

async function detectPortalErrorMessage(
  page: Page,
  errorSelectors: string[],
  preActionErrorsSnapshot: string[]
): Promise<DetectedMessage | null> {
  const candidates: DetectedMessage[] = [];

  const isNewMessage = (msg: string) => {
    const clean = msg.trim();
    if (!clean) return false;
    return !preActionErrorsSnapshot.some(pre => pre.includes(clean) || clean.includes(pre));
  };

  // 1. Growl / Toast / PrimeFaces messages (confidence: 1.0)
  const growlSelectors = [
    ".ui-growl-message",
    ".ui-messages-error-detail",
    ".ui-message-error-detail",
    ".ui-messages-error",
    ".ui-message-error",
    ".ui-messages-fatal-detail",
    ".ui-message-fatal-detail"
  ];
  for (const sel of growlSelectors) {
    try {
      const loc = page.locator(sel);
      const count = await loc.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const el = loc.nth(i);
        if (await el.isVisible().catch(() => false)) {
          const text = await el.innerText().catch(() => "");
          if (text.trim()) {
            candidates.push({
              message: text.trim(),
              source: "growl",
              selector: sel,
              appearedAfterAction: isNewMessage(text),
              confidence: 1.0
            });
          }
        }
      }
    } catch {}
  }

  // 2. Modals / SweetAlert (confidence: 0.95)
  const modalSelectors = [
    ".swal-text",
    ".swal2-content",
    ".swal2-html-container",
    "ion-alert:visible",
    "ion-modal:visible",
    "[role='dialog']:visible",
    ".modal.show"
  ];
  for (const sel of modalSelectors) {
    try {
      const loc = page.locator(sel);
      const count = await loc.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const el = loc.nth(i);
        if (await el.isVisible().catch(() => false)) {
          const text = await el.innerText().catch(() => "");
          if (text.trim()) {
            candidates.push({
              message: text.trim(),
              source: "modal",
              selector: sel,
              appearedAfterAction: isNewMessage(text),
              confidence: 0.95
            });
          }
        }
      }
    } catch {}
  }

  // 3. Alerts visible (confidence: 0.90)
  const alertSelectors = [
    ".alert-danger",
    ".alert-error",
    ".alert"
  ];
  for (const sel of alertSelectors) {
    try {
      const loc = page.locator(sel);
      const count = await loc.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const el = loc.nth(i);
        if (await el.isVisible().catch(() => false)) {
          const text = await el.innerText().catch(() => "");
          if (text.trim()) {
            candidates.push({
              message: text.trim(),
              source: "alert",
              selector: sel,
              appearedAfterAction: isNewMessage(text),
              confidence: 0.90
            });
          }
        }
      }
    } catch {}
  }

  // 4. Custom / Map selectors - inline near form (confidence: 0.85)
  for (const sel of errorSelectors) {
    try {
      const loc = page.locator(sel);
      const count = await loc.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const el = loc.nth(i);
        if (await el.isVisible().catch(() => false)) {
          const isStaticLabel = await el.evaluate(el => {
            return el.closest('.ui-fieldset-legend, legend, .ui-selectbooleancheckbox, fieldset, label') !== null;
          }).catch(() => false);
          if (isStaticLabel) continue;

          const text = await el.innerText().catch(() => "");
          if (text.trim()) {
            candidates.push({
              message: text.trim(),
              source: "inline",
              selector: sel,
              appearedAfterAction: isNewMessage(text),
              confidence: 0.85
            });
          }
        }
      }
    } catch {}
  }

  // 5. Form validation / Field errors (confidence: 0.80)
  const fieldValidationSelectors = [
    ".text-danger",
    ".error-message",
    ".invalid-feedback"
  ];
  for (const sel of fieldValidationSelectors) {
    try {
      const loc = page.locator(sel);
      const count = await loc.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const el = loc.nth(i);
        if (await el.isVisible().catch(() => false)) {
          const text = await el.innerText().catch(() => "");
          if (text.trim()) {
            candidates.push({
              message: text.trim(),
              source: "field_validation",
              selector: sel,
              appearedAfterAction: isNewMessage(text),
              confidence: 0.80
            });
          }
        }
      }
    } catch {}
  }

  // 6. Body text scan (confidence: 0.60)
  try {
    const errorPhrases = [
      "no se localizó",
      "no se localizo",
      "no registrado",
      "rfc no existe",
      "inválido",
      "invalido",
      "incorrecto",
      "no coincide",
      "ya se facturó",
      "ya fue facturado",
      "ya cuenta con factura",
      "plazo permitido",
      "expirado",
      "vencido",
      "mes fiscal",
      "pendiente de validar",
      "pendiente por validar",
      "validando en comercio",
      "intente más tarde",
      "intente mas tarde",
      "en proceso de validación",
      "en proceso de validacion"
    ];

    const bodyText = await page.locator("body").innerText().catch(() => "");
    if (bodyText) {
      const lines = bodyText.split("\n");
      for (const line of lines) {
        const cleanLine = line.trim();
        if (cleanLine.length > 10 && cleanLine.length < 200) {
          const lowerLine = cleanLine.toLowerCase();
          for (const phrase of errorPhrases) {
            if (lowerLine.includes(phrase)) {
              candidates.push({
                message: cleanLine,
                source: "body_scan",
                appearedAfterAction: isNewMessage(cleanLine),
                confidence: 0.60
              });
              break;
            }
          }
        }
      }
    }
  } catch {}

  const newCandidates = candidates.filter(c => c.appearedAfterAction);
  if (newCandidates.length > 0) {
    newCandidates.sort((a, b) => b.confidence - a.confidence);
    return newCandidates[0];
  }

  return null;
}

async function waitForSelectorOrError(
  page: Page,
  selector: string,
  iframeSelector: string | undefined,
  captchaSelectors: string[],
  errorSelectors: string[],
  timeoutMs: number
): Promise<void> {
  const getLocator = (sel: string, iframeSel?: string) => {
    if (iframeSel) return page.frameLocator(iframeSel).locator(sel);
    return page.locator(sel);
  };

  const start = Date.now();
  const targetLocator = getLocator(selector, iframeSelector);

  while (Date.now() - start < timeoutMs) {
    try {
      const count = await targetLocator.count();
      if (count > 0 && await targetLocator.first().isVisible()) {
        return;
      }
    } catch (e) {}

    const captcha = await checkCaptcha(page, captchaSelectors);
    if (captcha) {
      throw {
        message: "Se detectó un CAPTCHA visible en el portal del comercio.",
        code: "CAPTCHA_DETECTED",
        captchaEvidence: captcha
      };
    }

    const portalError = await checkPortalError(page, errorSelectors);
    if (portalError) {
      throw { message: `Error devuelto por el portal: ${portalError}`, code: "PORTAL_RETURNED_ERROR" };
    }

    // Automatically dismiss blocking modals if they cover our target selector
    await dismissBlockingModal(page).catch(() => null);

    await page.waitForTimeout(400);
  }

  throw new Error(`Timeout de ${timeoutMs}ms excedido esperando al selector: ${selector}`);
}

async function smartTypeIntoField(page: Page, locator: any, value: string): Promise<void> {
  const target = locator.first();
  await target.click({ clickCount: 3 }).catch(() => target.click());
  await page.keyboard.press("Backspace").catch(() => null);
  await page.keyboard.type(value, { delay: 30 });
  await target.evaluate((element: HTMLInputElement | HTMLTextAreaElement) => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  });
  const registered = await target.inputValue().catch(() => "");
  if (registered !== value) {
    await target.fill(value);
    await target.evaluate((element: HTMLInputElement | HTMLTextAreaElement) => {
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));
    });
  }
}

async function handleDatePicker(page: Page, locator: any, value: string): Promise<void> {
  const target = locator.first();
  const type = await target.getAttribute("type").catch(() => "");
  if (type === "date") {
    await target.evaluate((element: HTMLInputElement, dateValue: string) => {
      element.value = dateValue;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    return;
  }
  await smartTypeIntoField(page, locator, value);
}

async function dismissBlockingModal(page: Page): Promise<boolean> {
  // Hide announcement modals like Modal40 and backdrops via CSS to prevent pointer event blockages
  await page.addStyleTag({
    content: `
      #Modal40, .modal-backdrop, .modal.fade.show[id*='Modal'] {
        display: none !important;
        pointer-events: none !important;
      }
      body {
        overflow: auto !important;
      }
    `
  }).catch(() => null);

  const modal = page.locator("dialog[open], .modal.show, .swal2-popup:visible, [role='dialog']:visible").first();
  if (!await modal.count().catch(() => 0) || !await modal.isVisible().catch(() => false)) return false;
  const button = modal.getByRole("button", { name: /aceptar|continuar|cerrar|entendido|ok|×/i }).first();
  if (await button.count().catch(() => 0) && await button.isVisible().catch(() => false)) {
    await button.click().catch(() => null);
    return true;
  }
  const closeBtn = modal.locator(".btn-close, .close, button[class*='close' i], [aria-label*='close' i]").first();
  if (await closeBtn.count().catch(() => 0) && await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click().catch(() => null);
    return true;
  }
  return false;
}


async function tryAlternativeRoute(page: Page, connector: any): Promise<string | null> {
  const alternatives = Array.isArray(connector?.alternativePortals) ? connector.alternativePortals : [];
  for (const candidate of alternatives.slice(0, 5)) {
    try {
      await page.goto(candidate, { waitUntil: "domcontentloaded", timeout: 20000 });
      const hasForm = await page.locator("form, input, select, textarea").count() > 0;
      if (hasForm) return candidate;
    } catch {
      // Continue with the next configured official alternative.
    }
  }
  return null;
}

export async function executePortalMap(
  jobId: string,
  ticketId: string,
  portalMap: any,
  connector: any,
  ticketData: any,
  fiscalProfile: any,
  attemptId?: string,
  options: { validationOnly?: boolean } = {}
): Promise<ExecutionResult> {
  const userId = fiscalProfile.userId;
  const connectorId = connector?.id || portalMap?.connectorId || "";
  let wasAlreadyInvoiced = false;
  // Gemini output is evidence for a future proposal, never an executable
  // production selector unless an explicit server-side rollout enables it.
  const allowGeminiSelectorExecution = process.env.JIT_SELECTOR_EXECUTION_ENABLED === "true";

  // Validate ticket date period (current calendar month check)
  if (ticketData.portalFields?.fecha) {
    const ticketDate = new Date(ticketData.portalFields.fecha + "T00:00:00");
    if (!isNaN(ticketDate.getTime())) {
      const now = new Date();
      const ticketYear = ticketDate.getFullYear();
      const ticketMonth = ticketDate.getMonth();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      
      if (ticketYear < currentYear || (ticketYear === currentYear && ticketMonth < currentMonth)) {
        await createRunnerLog(jobId, ticketId, "ERROR", `El plazo permitido para facturar ha expirado. Fecha ticket: ${ticketData.portalFields.fecha}, Fecha actual: ${now.toISOString().split('T')[0]}`);
        return {
          success: false,
          error: "El plazo permitido por el comercio para facturar este ticket ha expirado.",
          errorCode: "PERIOD_EXPIRED",
          maskedReference: maskString(ticketData.folio || ticketData.billingReference || "")
        };
      }
    }
  }

  const captchaSelectors = JSON.parse(portalMap.captchaSelectorsJson || portalMap.captchaSelectors || "[]");
  const errorSelectors = JSON.parse(portalMap.errorSelectorsJson || portalMap.errorSelectors || "[]");
  const rawSteps = JSON.parse(portalMap.stepsJson || portalMap.steps || "[]");
  const steps = normalizePortalSteps(rawSteps, connector);
  const tmpDir = path.join(os.tmpdir(), "zenticket-runner", jobId);
  fs.mkdirSync(tmpDir, { recursive: true });

  await createRunnerLog(jobId, ticketId, "INFO", `Iniciando navegador headless para: ${connector.nombre}`);

  // The runner is deployed only in the pinned Playwright Cloud Run image.
  // Never fall back to a host, Functions, or locally installed Chromium.
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromium.executablePath()
  });

  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 800 }
  });
  const traceFilePath = path.join(tmpDir, `attempt-${attemptId || "unassigned"}.zip`);
  let traceStarted = false;
  let retainTrace = true;
  try {
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    traceStarted = true;
  } catch (error: any) {
    await createRunnerLog(jobId, ticketId, "WARNING", `No se pudo iniciar Playwright Trace: ${error.message || String(error)}`);
  }

  let page = await context.newPage();
  const downloadedFiles: { filename: string; path: string }[] = [];
  const networkSniffer = setupNetworkSniffer(page);
  const downloadWaiters = new Set<() => void>();
  page.on("dialog", (dialog: Dialog) => dialog.accept().catch(() => null));

  const attachDownloadListener = (targetPage: Page) => targetPage.on("download", async (download: any) => {
      try {
        const filename = download.suggestedFilename();
        const savePath = path.join(tmpDir, filename);
        await download.saveAs(savePath);
        downloadedFiles.push({ filename, path: savePath });
        for (const notify of downloadWaiters) notify();
        downloadWaiters.clear();
        await createRunnerLog(jobId, ticketId, "INFO", `Archivo descargado capturado: ${filename}`);
      } catch (error: any) {
        await createRunnerLog(jobId, ticketId, "ERROR", `No se pudo persistir una descarga del portal: ${error?.message || String(error)}`);
      }
    });
  attachDownloadListener(page);

  const waitForDocumentSignal = async (
    previousDownloads: number,
    previousNetworkCaptures: number,
    timeoutMs: number,
    action: string
  ): Promise<boolean> => {
    if (downloadedFiles.length > previousDownloads || networkSniffer.captures.length > previousNetworkCaptures) return true;
    const observed = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        downloadWaiters.delete(onDownload);
        clearInterval(networkPoll);
        resolve(false);
      }, timeoutMs);
      const finish = () => {
        clearTimeout(timeout);
        clearInterval(networkPoll);
        downloadWaiters.delete(onDownload);
        resolve(true);
      };
      const onDownload = () => finish();
      const networkPoll = setInterval(() => {
        if (networkSniffer.captures.length > previousNetworkCaptures) finish();
      }, 100);
      downloadWaiters.add(onDownload);
    });
    if (!observed) {
      const portalError = await checkPortalError(page, errorSelectors) || await collectVisiblePortalErrors(page, errorSelectors);
      if (portalError) throw { code: "PORTAL_RETURNED_ERROR", message: `El portal reportÃ³ un error tras ${action}: ${portalError}` };
      await createRunnerLog(jobId, ticketId, "WARNING", `No se observÃ³ una descarga ni respuesta documental tras ${action}.`, {
        action,
        timeoutMs
      });
    }
    return observed;
  };

  const clickForDocument = async (locator: any, action: string, timeoutMs = 15000): Promise<boolean> => {
    const previousDownloads = downloadedFiles.length;
    const previousNetworkCaptures = networkSniffer.captures.length;
    await locator.scrollIntoViewIfNeeded();
    await locator.click({ timeout: Math.min(timeoutMs, 10000) });
    return waitForDocumentSignal(previousDownloads, previousNetworkCaptures, timeoutMs, action);
  };

  context.on("page", (newPage: any) => {
    console.log("[download] New tab/popup opened. Attaching download listener.");
    attachDownloadListener(newPage);
  });

  const getLocator = (selector: string, iframeSelector?: string) => {
    if (iframeSelector) {
      return page.frameLocator(iframeSelector).locator(selector);
    }
    return page.locator(selector);
  };

  let lastScreenshotPath = "";
  let lastScreenshotUrl = "";
  let currentStepIdx = 0;

  const uploadErrorScreenshot = async (reason: string) => {
    try {
      const screenshotPath = path.join(tmpDir, `error_${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      const bucket = getStorage().bucket();
      const destPath = `users/${userId}/tickets/${ticketId}/runner-errors/${Date.now()}.png`;
      const downloadToken = randomUUID();
      await bucket.upload(screenshotPath, {
        destination: destPath,
        metadata: {
          contentType: "image/png",
          metadata: { firebaseStorageDownloadTokens: downloadToken }
        }
      });
      lastScreenshotPath = destPath;
      lastScreenshotUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(destPath)}?alt=media&token=${downloadToken}`;
      await createRunnerLog(jobId, ticketId, "ERROR", `Captura de error guardada en Storage: ${destPath}`, { screenshotPath: destPath });
    } catch (e: any) {
      await createRunnerLog(jobId, ticketId, "WARNING", `Fallo al capturar/guardar captura de pantalla de error: ${e.message}`);
    }
  };

  const CAPTCHA_VERIFY_TIMEOUT_MS = 180000; // 3 minutes

  type CaptchaOutcome =
    | "resolved_by_next_step"
    | "resolved_by_url_change"
    | "resolved_by_success_selector"
    | "probably_resolved_by_captcha_hidden"
    | "invalid"
    | "timeout";

  const waitForCaptchaOutcome = async (targetPage: Page, targetCaptchaSelectors: string[]): Promise<CaptchaOutcome> => {
    // Find the active CAPTCHA selector from the list
    let activeSelector: string | null = null;
    for (const sel of targetCaptchaSelectors) {
      const isVis = await targetPage.locator(sel).first().isVisible().catch(() => false);
      if (isVis) {
        activeSelector = sel;
        break;
      }
    }

    const promises: Promise<CaptchaOutcome>[] = [];
    let timeoutId: NodeJS.Timeout;

    // A. Timeout Promise
    const timeoutPromise = new Promise<"timeout">((resolve) => {
      timeoutId = setTimeout(() => resolve("timeout"), CAPTCHA_VERIFY_TIMEOUT_MS);
    });
    promises.push(timeoutPromise);

    // B. Captcha Disappeared Promise
    if (activeSelector) {
      const disappearedPromise = targetPage.waitForFunction((sel) => {
        const el = document.querySelector(sel);
        if (!el) return true;
        const style = window.getComputedStyle(el);
        return style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0;
      }, activeSelector, { timeout: CAPTCHA_VERIFY_TIMEOUT_MS })
        .then(() => "probably_resolved_by_captcha_hidden" as const)
        .catch(() => "timeout" as const);
      promises.push(disappearedPromise);
    }

    // C. Error message visible Promise
    const errorPromise = targetPage.waitForSelector("text=/incorrecto|inválido|invalido|no coincide|intente de nuevo|error de captcha|captcha incorrecto/i", { state: "visible", timeout: CAPTCHA_VERIFY_TIMEOUT_MS })
      .then(() => "invalid" as const)
      .catch(() => "timeout" as const);
    promises.push(errorPromise);

    // D. URL changed Promise (or next page loaded)
    const initialUrl = targetPage.url();
    const urlChangedPromise = targetPage.waitForFunction((initUrl) => window.location.href !== initUrl, initialUrl, { timeout: CAPTCHA_VERIFY_TIMEOUT_MS })
      .then(() => "resolved_by_url_change" as const)
      .catch(() => "timeout" as const);
    promises.push(urlChangedPromise);

    // E. Success selector/confirmation visible Promise
    const successPromise = targetPage.waitForSelector("ion-alert:visible, ion-modal:visible, [role='dialog']:visible, .modal.show, .swal2-popup:visible, text=/facturando|confirmar|emitir factura/i", { state: "visible", timeout: CAPTCHA_VERIFY_TIMEOUT_MS })
      .then(() => "resolved_by_success_selector" as const)
      .catch(() => "timeout" as const);
    promises.push(successPromise);

    try {
      const outcome = await Promise.race(promises);
      clearTimeout(timeoutId!);
      return outcome;
    } catch (err) {
      clearTimeout(timeoutId!);
      return "timeout";
    }
  };

  const waitForHumanSolution = (jobDocRef: any, captchaAttemptId: string, captchaDetectedAt: Date): Promise<string> => {
    return new Promise((resolve, reject) => {
      let resolved = false;
      
      const safetyTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          unsubscribe();
          reject(new Error("HUMAN_TIMEOUT"));
        }
      }, 300000); // 5 minutes safety timeout

      const unsubscribe = jobDocRef.onSnapshot(
        (snapshot: any) => {
          if (snapshot.exists()) {
            const data = snapshot.data() || {};
            
            // Only accept solution if captchaAttemptId matches, and it was submitted after captchaDetectedAt
            const isCorrectAttempt = data.captchaAttemptId === captchaAttemptId;
            const hasSolution = typeof data.captchaSolution === "string" && data.captchaSolution.trim().length > 0;
            const submittedAt = data.captchaSolutionAt || data.captchaSubmittedAt;
            
            let isFresh = false;
            if (submittedAt) {
              const submittedMs = new Date(submittedAt).getTime();
              const detectedMs = captchaDetectedAt.getTime();
              isFresh = submittedMs > detectedMs;
            }
            
            if (data.status === "captcha_submitted" && isCorrectAttempt && hasSolution && isFresh) {
              resolved = true;
              clearTimeout(safetyTimeout);
              unsubscribe();
              resolve(String(data.captchaSolution).trim());
            }
          }
        },
        (err: any) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(safetyTimeout);
            unsubscribe();
            reject(err);
          }
        }
      );
    });
  };

  const waitForHumanCaptcha = async (): Promise<boolean> => {
    const databaseId = "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee";
    const db = getFirestore(getApp(), databaseId);
    const jobRef = db.collection("invoice_jobs").doc(jobId);
    const ticketRef = db.collection("tickets").doc(ticketId);

    const deleteCaptchaScreenshot = async () => {
      if (!lastScreenshotPath) return;
      await getStorage().bucket().file(lastScreenshotPath).delete({ ignoreNotFound: true }).catch(() => undefined);
    };

    // 1. Try Auto-resolving first (up to 2 attempts)
    const capSolverKey = process.env.CAPSOLVER_API_KEY || "";
    const twoCaptchaKey = process.env.TWOCAPTCHA_API_KEY || "";
    const hasKeys = !!capSolverKey || !!twoCaptchaKey;

    if (hasKeys) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        await createRunnerLog(jobId, ticketId, "INFO", `Intentando resolución automática de CAPTCHA (Intento ${attempt}/2)...`);
        const autoSolution = await solveCaptchaOnPage(page, captchaSelectors).catch(() => null);
        if (autoSolution) {
          // Transition job and ticket status to verifying_captcha
          await jobRef.update({
            status: "verifying_captcha",
            captchaFailed: false,
            updatedAt: new Date().toISOString()
          });
          await ticketRef.update({
            status: "verifying_captcha",
            captchaFailed: false,
            updatedAt: new Date().toISOString()
          });
          await createRunnerLog(jobId, ticketId, "INFO", `CAPTCHA automático enviado. Solución sugerida: ${autoSolution}. Iniciando verificación...`);
          
          let captchaInput = page.locator("input[name*='captcha' i], input[id*='captcha' i], input[placeholder*='captcha' i], input[placeholder*='código' i], input[placeholder*='codigo' i], input[placeholder*='verificac' i]").first();
          if (!await captchaInput.isVisible().catch(() => false)) {
            const inputs = page.locator("input[type='text']:visible, input:not([type]):visible");
            const count = await inputs.count().catch(() => 0);
            for (let idx = 0; idx < count; idx++) {
              const ipt = inputs.nth(idx);
              const name = (await ipt.getAttribute("name").catch(() => "")) || "";
              const id = (await ipt.getAttribute("id").catch(() => "")) || "";
              const placeholder = (await ipt.getAttribute("placeholder").catch(() => "")) || "";
              if (/captcha|code|codigo|código|verif|seguridad|text/i.test(name + id + placeholder)) {
                captchaInput = ipt;
                break;
              }
            }
          }

          if (await captchaInput.isVisible().catch(() => false)) {
            await smartTypeIntoField(page, captchaInput, autoSolution);
            const submit = page.getByRole("button", { name: /^facturar$/i })
              .or(page.locator("button:has-text('FACTURAR'), ion-button:has-text('FACTURAR')"))
              .or(page.locator("input[type='submit']:visible, button[type='submit']:visible, input[value*='Facturar' i]"))
              .first();
            await submit.click();
            
            // Wait for portal to process submission
            await page.waitForTimeout(4000);

            // Handle optional confirmation dialogs
            const confirmation = page.locator(
              "ion-alert:visible, ion-modal:visible, [role='dialog']:visible, .modal.show, .swal2-popup:visible"
            ).filter({ hasText: /facturando|confirmar|emitir factura/i }).last();
            if (await confirmation.isVisible().catch(() => false)) {
              const confirmButton = confirmation.getByRole("button", { name: /^(s[ií]|aceptar|confirmar|continuar)$/i })
                .or(confirmation.locator("button:has-text('Sí'), button:has-text('SI'), .alert-button:has-text('Sí'), .alert-button:has-text('SI')"))
                .first();
              if (await confirmButton.isVisible().catch(() => false)) {
                await confirmButton.click();
                await page.waitForTimeout(4000);
              }
            }

            // Verify if CAPTCHA was bypassed
            const outcome = await waitForCaptchaOutcome(page, captchaSelectors);
            let finalResolved = ["resolved_by_next_step", "resolved_by_url_change", "resolved_by_success_selector", "probably_resolved_by_captcha_hidden"].includes(outcome);
            
            if (outcome === "probably_resolved_by_captcha_hidden") {
              await page.waitForTimeout(3000);
              const hasError = await page.locator("text=/incorrecto|inválido|invalido|no coincide|intente de nuevo|error de captcha|captcha incorrecto/i").isVisible().catch(() => false);
              if (hasError) {
                finalResolved = false;
              }
            }

            if (finalResolved) {
              await jobRef.update({
                status: "captcha_resolved",
                waitingAction: FieldValue.delete(),
                captchaSolution: FieldValue.delete(),
                captchaScreenshotUrl: FieldValue.delete(),
                lockedBy: "captcha-session",
                updatedAt: new Date().toISOString()
              });
              await ticketRef.update({
                status: "runner_processing",
                captchaScreenshotUrl: FieldValue.delete(),
                updatedAt: new Date().toISOString()
              });
              await deleteCaptchaScreenshot();
              await createRunnerLog(jobId, ticketId, "INFO", "CAPTCHA resuelto automáticamente con éxito por la API.");
              return true;
            } else if (outcome === "invalid" || !finalResolved) {
              await jobRef.update({
                status: "captcha_failed",
                updatedAt: new Date().toISOString()
              });
              await createRunnerLog(jobId, ticketId, "WARNING", `Intento ${attempt}/2 de CAPTCHA automático fallido o incorrecto.`);
              // Clear input for retry
              await captchaInput.fill("").catch(() => null);
              await page.waitForTimeout(2000);
              continue;
            } else {
              // Timeout
              await jobRef.update({
                status: "captcha_timeout",
                updatedAt: new Date().toISOString()
              });
              await createRunnerLog(jobId, ticketId, "ERROR", "Timeout en resolución automática de CAPTCHA.");
              break;
            }
          }
        }
      }
      await createRunnerLog(jobId, ticketId, "WARNING", "No se pudo resolver el CAPTCHA automáticamente. Escalando a resolución humana.");
    }

    // 2. Durable human handoff. Cloud Run must release the browser instead of
    // retaining a Firestore listener and an interactive portal session.
    const durableCaptchaAttemptId = randomUUID();
    const durableCaptchaMessage = "El portal solicita una verificaciÃ³n humana. ZenTicket pausÃ³ este intento de forma segura.";
    await jobRef.set({
      status: "waiting_human_verification",
      waitingAction: "captcha",
      captchaScreenshotPath: lastScreenshotPath,
      captchaScreenshotUrl: lastScreenshotUrl,
      captchaRequestedAt: new Date().toISOString(),
      captchaAttemptId: durableCaptchaAttemptId,
      captchaFlowActive: false,
      requiresUserAction: true,
      lockedBy: null,
      lockedAt: null,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    await ticketRef.set({
      status: "waiting_user_captcha",
      jobId,
      errorMsg: durableCaptchaMessage,
      reviewReasonCode: "CAPTCHA_DETECTED",
      captchaScreenshotUrl: lastScreenshotUrl,
      captchaAttemptId: durableCaptchaAttemptId,
      captchaFlowActive: false,
      requiresUserAction: true,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    await createRunnerLog(jobId, ticketId, "WARNING", "CAPTCHA detectado; el intento se pausÃ³ durablemente y el navegador se liberarÃ¡.");
    return false;

    // Legacy interactive flow retained only as historical source during the
    // transition; it is unreachable and no longer executes in Cloud Run.
    // 2. Fallback to human captcha
    const captchaAttemptId = randomUUID();
    const captchaDetectedAt = new Date();
    const message = "El portal solicita el código de verificación mostrado. Captúralo para continuar.";

    console.debug('[CAPTCHA_BACKEND_STATE]', {
      jobId,
      previousStatus: "running",
      nextStatus: "waiting_human_verification",
      captchaAttemptId,
      captchaFlowActive: true,
      requiresUserAction: true,
      reason: "CAPTCHA detected, falling back to human verification",
      timestamp: new Date().toISOString(),
    });

    await jobRef.set({
      status: "waiting_human_verification",
      waitingAction: "captcha",
      captchaScreenshotPath: lastScreenshotPath,
      captchaScreenshotUrl: lastScreenshotUrl,
      captchaRequestedAt: new Date().toISOString(),
      captchaAttemptId,
      captchaSolution: null,
      captchaSolutionAt: null,
      captchaSubmittedAt: null,
      captchaFlowActive: true,
      requiresUserAction: true,
      captchaError: null,
      captchaFailed: false,
      lockedBy: null,
      lockedAt: null,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    await ticketRef.set({
      status: "waiting_user_captcha", // Compatibility with frontend captcha view
      jobId,
      errorMsg: message,
      reviewReasonCode: "CAPTCHA_DETECTED",
      captchaScreenshotUrl: lastScreenshotUrl,
      captchaAttemptId,
      captchaFlowActive: true,
      requiresUserAction: true,
      captchaFailed: false,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    await createRunnerLog(jobId, ticketId, "WARNING", "CAPTCHA detectado en el portal. Esperando resolución humana.");

    let currentAttemptId = captchaAttemptId;
    let currentDetectedAt = captchaDetectedAt;

    while (true) {
      let solution = "";
      try {
        solution = await waitForHumanSolution(jobRef, currentAttemptId, currentDetectedAt);
      } catch (err: any) {
        await createRunnerLog(jobId, ticketId, "ERROR", `Timeout o error esperando resolución humana del CAPTCHA: ${err.message}`);
        
        console.debug('[CAPTCHA_BACKEND_STATE]', {
          jobId,
          previousStatus: "waiting_human_verification",
          nextStatus: "captcha_timeout",
          captchaAttemptId: currentAttemptId,
          captchaFlowActive: false,
          requiresUserAction: false,
          reason: "Human timeout waiting for captcha solution",
          timestamp: new Date().toISOString(),
        });

        await jobRef.update({
          status: "captcha_timeout",
          lastErrorCode: "captcha_timeout",
          captchaFlowActive: false,
          requiresUserAction: false,
          updatedAt: new Date().toISOString()
        });
        await ticketRef.update({
          status: "requires_manual_review",
          reviewReasonCode: "captcha_timeout",
          captchaFlowActive: false,
          requiresUserAction: false,
          updatedAt: new Date().toISOString()
        });
        await deleteCaptchaScreenshot();
        return false;
      }

      // Transition to verifying_captcha
      console.debug('[CAPTCHA_BACKEND_STATE]', {
        jobId,
        previousStatus: "waiting_human_verification",
        nextStatus: "verifying_captcha",
        captchaAttemptId: currentAttemptId,
        captchaFlowActive: true,
        requiresUserAction: false,
        reason: "User submitted captcha solution, starting verification",
        timestamp: new Date().toISOString(),
      });

      await jobRef.update({
        status: "verifying_captcha",
        captchaFailed: false,
        updatedAt: new Date().toISOString()
      });
      await ticketRef.update({
        status: "verifying_captcha",
        captchaFailed: false,
        updatedAt: new Date().toISOString()
      });
      await createRunnerLog(jobId, ticketId, "INFO", "CAPTCHA enviado. Iniciando verificación en el portal...");

      // Dismiss any open error modals or dialog popups first!
      await dismissPortalAlerts(page);

      let captchaInput = page.locator("input[name*='captcha' i], input[id*='captcha' i], input[placeholder*='captcha' i], input[placeholder*='código' i], input[placeholder*='codigo' i], input[placeholder*='verificac' i]").first();
      if (!await captchaInput.isVisible().catch(() => false)) {
        const inputs = page.locator("input[type='text']:visible, input:not([type]):visible");
        const count = await inputs.count().catch(() => 0);
        for (let idx = 0; idx < count; idx++) {
          const ipt = inputs.nth(idx);
          const name = (await ipt.getAttribute("name").catch(() => "")) || "";
          const id = (await ipt.getAttribute("id").catch(() => "")) || "";
          const placeholder = (await ipt.getAttribute("placeholder").catch(() => "")) || "";
          if (/captcha|code|codigo|código|verif|seguridad|text/i.test(name + id + placeholder)) {
            captchaInput = ipt;
            break;
          }
        }
      }

      if (!await captchaInput.isVisible().catch(() => false)) {
        await jobRef.update({
          status: "failed",
          lastErrorCode: "CAPTCHA_INPUT_NOT_FOUND",
          updatedAt: new Date().toISOString()
        });
        await deleteCaptchaScreenshot();
        return false;
      }

      await smartTypeIntoField(page, captchaInput, solution);
      const submit = page.getByRole("button", { name: /^facturar$/i })
        .or(page.locator("button:has-text('FACTURAR'), ion-button:has-text('FACTURAR')"))
        .or(page.locator("input[type='submit']:visible, button[type='submit']:visible, input[value*='Facturar' i]"))
        .first();
      await submit.click();
      
      const confirmation = page.locator(
        "ion-alert:visible, ion-modal:visible, [role='dialog']:visible, .modal.show, .swal2-popup:visible"
      ).filter({ hasText: /facturando|confirmar|emitir factura/i }).last();
      if (await confirmation.waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false)) {
        const confirmButton = confirmation.getByRole("button", { name: /^(s[ií]|aceptar|confirmar|continuar)$/i })
          .or(confirmation.locator("button:has-text('Sí'), button:has-text('SI'), .alert-button:has-text('Sí'), .alert-button:has-text('SI')"))
          .first();
        if (await confirmButton.isVisible().catch(() => false)) {
          await confirmButton.click();
          await createRunnerLog(jobId, ticketId, "INFO", "Confirmación de emisión aceptada después del CAPTCHA.");
        }
      }

      // Verify if CAPTCHA was bypassed
      const outcome = await waitForCaptchaOutcome(page, captchaSelectors);
      let finalResolved = ["resolved_by_next_step", "resolved_by_url_change", "resolved_by_success_selector", "probably_resolved_by_captcha_hidden"].includes(outcome);
      
      if (outcome === "probably_resolved_by_captcha_hidden") {
        await page.waitForTimeout(3000);
        const hasError = await page.locator("text=/incorrecto|inválido|invalido|no coincide|intente de nuevo|error de captcha|captcha incorrecto/i").isVisible().catch(() => false);
        if (hasError) {
          finalResolved = false;
        }
      }

      if (finalResolved) {
        console.debug('[CAPTCHA_BACKEND_STATE]', {
          jobId,
          previousStatus: "verifying_captcha",
          nextStatus: "captcha_resolved",
          captchaAttemptId: currentAttemptId,
          captchaFlowActive: false,
          requiresUserAction: false,
          reason: "Captcha successfully solved",
          timestamp: new Date().toISOString(),
        });

        await jobRef.update({
          status: "captcha_resolved",
          waitingAction: FieldValue.delete(),
          captchaSolution: FieldValue.delete(),
          captchaScreenshotUrl: FieldValue.delete(),
          lockedBy: "captcha-session",
          captchaFlowActive: false,
          requiresUserAction: false,
          updatedAt: new Date().toISOString()
        });
        await ticketRef.update({
          status: "runner_processing",
          captchaScreenshotUrl: FieldValue.delete(),
          captchaFlowActive: false,
          requiresUserAction: false,
          updatedAt: new Date().toISOString()
        });
        await deleteCaptchaScreenshot();
        await page.waitForTimeout(5000);
        return true;
      } else if (outcome === "invalid" || !finalResolved) {
        await createRunnerLog(jobId, ticketId, "WARNING", "La solución de CAPTCHA ingresada por el usuario fue incorrecta.");
        
        // Clear input
        await captchaInput.fill("").catch(() => null);
        await page.waitForTimeout(2000);

        // Upload new screenshot of the refreshed CAPTCHA
        try {
          const screenshotPath = path.join(tmpDir, `captcha_${Date.now()}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: true });
          const bucket = getStorage().bucket();
          const destPath = `users/${userId}/tickets/${ticketId}/runner-errors/${Date.now()}.png`;
          const downloadToken = randomUUID();
          await bucket.upload(screenshotPath, {
            destination: destPath,
            metadata: {
              contentType: "image/png",
              metadata: { firebaseStorageDownloadTokens: downloadToken }
            }
          });
          lastScreenshotPath = destPath;
          lastScreenshotUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(destPath)}?alt=media&token=${downloadToken}`;
        } catch (e: any) {
          console.warn("[waitForHumanCaptcha] Failed to capture new captcha screenshot:", e);
        }

        // Generate a new captchaAttemptId for the next try!
        currentAttemptId = randomUUID();
        currentDetectedAt = new Date();

        // Return to waiting state
        console.debug('[CAPTCHA_BACKEND_STATE]', {
          jobId,
          previousStatus: "verifying_captcha",
          nextStatus: "waiting_human_verification",
          captchaAttemptId: currentAttemptId,
          captchaFlowActive: true,
          requiresUserAction: true,
          reason: "Captcha solution failed, retrying",
          timestamp: new Date().toISOString(),
        });

        await jobRef.update({
          status: "waiting_human_verification",
          captchaAttemptId: currentAttemptId,
          captchaSolution: FieldValue.delete(),
          captchaSolutionAt: FieldValue.delete(),
          captchaSubmittedAt: FieldValue.delete(),
          captchaScreenshotPath: lastScreenshotPath,
          captchaScreenshotUrl: lastScreenshotUrl,
          captchaFlowActive: true,
          requiresUserAction: true,
          captchaFailed: true,
          updatedAt: new Date().toISOString()
        });
        await ticketRef.update({
          status: "waiting_user_captcha",
          captchaAttemptId: currentAttemptId,
          captchaScreenshotUrl: lastScreenshotUrl,
          captchaFlowActive: true,
          requiresUserAction: true,
          captchaFailed: true,
          updatedAt: new Date().toISOString()
        });
        continue;
      } else {
        await createRunnerLog(jobId, ticketId, "ERROR", "Timeout al verificar el CAPTCHA (límite de 3 minutos excedido).");
        
        console.debug('[CAPTCHA_BACKEND_STATE]', {
          jobId,
          previousStatus: "verifying_captcha",
          nextStatus: "captcha_timeout",
          captchaAttemptId: currentAttemptId,
          captchaFlowActive: false,
          requiresUserAction: false,
          reason: "Timeout verifying captcha solution",
          timestamp: new Date().toISOString(),
        });

        await jobRef.update({
          status: "captcha_timeout",
          lastErrorCode: "captcha_timeout",
          captchaFlowActive: false,
          requiresUserAction: false,
          updatedAt: new Date().toISOString()
        });
        await ticketRef.update({
          status: "requires_manual_review",
          reviewReasonCode: "captcha_timeout",
          captchaFlowActive: false,
          requiresUserAction: false,
          updatedAt: new Date().toISOString()
        });
        await deleteCaptchaScreenshot();
        return false;
      }
    }
    await deleteCaptchaScreenshot();
    return false;
  };

  let lastPreActionErrorsSnapshot: string[] = [];

  try {
    for (let i = 0; i < steps.length; i++) {
      currentStepIdx = i;
      const step = steps[i];
      await createRunnerLog(jobId, ticketId, "INFO", `Ejecutando paso ${i + 1}/${steps.length}: [${step.type}]`, { stepIndex: i, stepType: step.type });
      
      try {
        lastPreActionErrorsSnapshot = await captureErrorMessagesSnapshot(page, errorSelectors);
      } catch (snapshotErr) {
        console.warn("Failed to capture pre-action error snapshot:", snapshotErr);
      }
      if (await dismissBlockingModal(page)) {
        await createRunnerLog(jobId, ticketId, "INFO", "Modal bloqueante cerrado automáticamente.", {
          stepIndex: i, stepType: step.type, healingAttempt: 1, strategy: "dismiss_modal", success: true
        });
      }

      // Check if step requires missing fields
      if (step.type === "fill" || step.type === "select" || step.type === "assertText" || step.type === "evaluate") {
        const template = step.value || "";
        const matches = [...template.matchAll(/\{\{([^}]+)\}\}/g)];
        if (options.validationOnly && matches.some((match) => match[1].trim().startsWith("fiscalProfile."))) {
          await createRunnerLog(jobId, ticketId, "INFO", "ValidaciÃ³n de ticket completada; se detiene antes de datos fiscales.", { stepIndex: i, stepType: step.type });
          return { success: true, validationOnly: true, stepIndex: i };
        }
        const missingFieldsForStep: string[] = [];

        for (const m of matches) {
          const pathStr = m[1].trim();
          const parts = pathStr.split(".");
          const base = parts[0];
          const key = parts[1];

          if (base === "fiscalProfile") {
            let mappedKey = key;
            if (key === "rfc") mappedKey = "rfc";
            else if (key === "businessName" || key === "razonSocial") mappedKey = "razonSocial";
            else if (key === "postalCode" || key === "codigoPostal") mappedKey = "codigoPostal";
            else if (key === "taxRegime" || key === "regimenFiscal") mappedKey = "regimenFiscal";
            else if (key === "cfdiUse" || key === "usoCFDI") mappedKey = "usoCFDI";
            else if (key === "email") mappedKey = "correoElectronico";

            const val = fiscalProfile[mappedKey];
            if (!val || !val.trim()) {
              missingFieldsForStep.push(`fiscalProfile.${key}`);
            }
          } else if (base === "portalFields" || base === "ticket") {
            const pFields = ticketData.portalFields || {};
            let val = pFields[key] || ticketData[key];
            if ((val === undefined || val === null || (typeof val === "string" && !val.trim())) && (key === "transactionId" || key === "transactionNumber")) {
              const fallbackKey = key === "transactionId" ? "transactionNumber" : "transactionId";
              val = pFields[fallbackKey] || ticketData[fallbackKey];
            }
            if (val === undefined || val === null || (typeof val === "string" && !val.trim())) {
              missingFieldsForStep.push(`portalFields.${key}`);
            }
          }
        }

        if (missingFieldsForStep.length > 0) {
          await createRunnerLog(jobId, ticketId, "WARNING", `Ejecución pausada: Faltan campos requeridos en el paso ${i + 1} (${missingFieldsForStep.join(", ")})`);
          return {
            success: false,
            paused: true,
            stepIndex: i,
            waitingForFields: missingFieldsForStep
          };
        }
      }

      // Pre-step Captcha and Portal Error checks
      const captcha = await checkCaptcha(page, captchaSelectors);
      if (captcha) {
        await uploadErrorScreenshot("CAPTCHA_DETECTED");
        await createRunnerLog(jobId, ticketId, "WARNING", "CAPTCHA visible confirmado.", { captchaEvidence: captcha });
        if (!await waitForHumanCaptcha()) {
          return {
            success: false,
            error: "Se detectó un CAPTCHA visible en el portal del comercio.",
            errorCode: "CAPTCHA_DETECTED",
            screenshotPath: lastScreenshotPath,
            stepIndex: currentStepIdx,
            maskedReference: maskString(ticketData.folio || ticketData.billingReference || "")
          };
        }
      }
      const portalError = await checkPortalError(page, errorSelectors);
      if (portalError) {
        await uploadErrorScreenshot("PORTAL_RETURNED_ERROR");
        let errorMsg = `Error devuelto por el portal: ${portalError}`;
        let errorCode = "PORTAL_RETURNED_ERROR";
        
        if (portalError === "TICKET_TOO_NEW") {
          errorCode = "TICKET_TOO_NEW";
          const strategy = getConnectorStrategy(connectorId);
          const violation = strategy?.detectBusinessRuleViolation?.(portalError, ticketData.portalFields?.fecha);
          if (violation) {
            errorCode = violation.errorCode;
            errorMsg = violation.errorMsg;
          } else {
            errorMsg = "El ticket es demasiado reciente. El comercio puede tardar hasta 24 horas en sincronizarlo. Reintentaremos automáticamente más tarde.";
          }
        }

        return {
          success: false,
          error: errorMsg,
          errorCode: errorCode,
          screenshotPath: lastScreenshotPath,
          stepIndex: currentStepIdx,
          maskedReference: maskString(ticketData.folio || ticketData.billingReference || "")
        };
      }

      if (step.type === "goto") {
        const url = resolveValue(step.url, ticketData, fiscalProfile, connector, portalMap);
        let destination: URL;
        try {
          destination = new URL(url);
        } catch {
          throw {
            code: "CONNECTOR_SCHEMA_INVALID",
            message: "El conector no proporcionó una dirección válida para iniciar la navegación."
          };
        }
        if (!["http:", "https:"].includes(destination.protocol)) {
          throw {
            code: "CONNECTOR_SCHEMA_INVALID",
            message: "El conector proporcionó una dirección de navegación no permitida."
          };
        }
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: step.timeout || 30000 });
      } else if (step.type === "fill") {
        const value = resolveValue(step.value, ticketData, fiscalProfile, connector, portalMap, step.transform);
        let locator: any;
        try {
          await waitForSelectorOrError(page, step.selector, step.iframeSelector, captchaSelectors, errorSelectors, step.timeout || 15000);
          locator = getLocator(step.selector, step.iframeSelector);
        } catch (primaryError: any) {
          // A. Try standard iframe heuristic
          for (const frame of page.frames().filter((candidate: any) => candidate !== page.mainFrame())) {
            const framed = frame.locator(step.selector).first();
            if (await framed.isVisible().catch(() => false)) {
              locator = framed;
              await createRunnerLog(jobId, ticketId, "INFO", "Campo localizado dentro de un iframe.", {
                stepIndex: i, stepType: step.type, healingAttempt: 3, strategy: "iframe_search", success: true
              });
              break;
            }
          }
          
          if (!locator) {
            // B. Try semantic label / placeholder heuristic
            const semantic = step.label || step.placeholder;
            if (semantic) {
              try {
                const semLocator = page.getByLabel(semantic, { exact: false }).or(page.getByPlaceholder(semantic, { exact: false }));
                await semLocator.first().waitFor({ state: "visible", timeout: 10000 });
                locator = semLocator;
                await createRunnerLog(jobId, ticketId, "INFO", "Campo reparado con búsqueda semántica.", {
                  stepIndex: i, stepType: step.type, healingAttempt: 2, strategy: "label_or_placeholder", success: true
                });
              } catch {}
            }
          }

          if (!locator) {
            // C. Try AI Self-Healing
            const healed = await healSelectorWithAi(page, step, step.selector, primaryError.message || String(primaryError)).catch(() => null);
            if (healed?.healedSelector && allowGeminiSelectorExecution) {
              try {
                const aiLocator = page.locator(healed.healedSelector);
                await aiLocator.first().waitFor({ state: "visible", timeout: 10000 });
                locator = aiLocator;
                await createRunnerLog(jobId, ticketId, "INFO", `Paso reparado dinámicamente con IA (Self-Healing). Selector elegido: ${healed.healedSelector}. Razón: ${healed.explanation}`, {
                  stepIndex: i, stepType: step.type, healingAttempt: 4, strategy: "ai_self_healing", success: true
                });
              } catch (aiErr) {
                console.warn("[SelfHealing] AI healed selector failed to resolve on page:", aiErr);
              }
            } else if (healed?.healedSelector) {
              await createRunnerLog(jobId, ticketId, "WARNING", "Selector sugerido por IA bloqueado; requiere revision humana antes de ejecutarse.", {
                stepIndex: i,
                stepType: step.type,
                strategy: "ai_self_healing",
                proposalStatus: "pending_review",
                proposedSelector: healed.healedSelector,
                explanation: healed.explanation
              });
            }
          }

          if (!locator) {
            throw primaryError;
          }
        }
        const target = locator.first();
        let fieldState = await target.evaluate((element: HTMLInputElement | HTMLTextAreaElement) => ({
          disabled: element.disabled,
          readOnly: element.readOnly,
          value: element.value || element.getAttribute("value") || ""
        }));
        const isPFDisabled = await target.evaluate((el: any) => el.classList.contains("ui-state-disabled")).catch(() => false);
        if (fieldState.disabled || fieldState.readOnly || isPFDisabled) {
          const enabled = await target.evaluate(async (element: any) => {
            for (let i = 0; i < 50; i++) {
              const isDisabled = element.disabled || element.classList.contains("ui-state-disabled");
              const isReadOnly = element.readOnly;
              if (!isDisabled && !isReadOnly) return true;
              await new Promise(r => setTimeout(r, 100));
            }
            return false;
          }).catch(() => false);
          if (enabled) {
            fieldState.disabled = false;
            fieldState.readOnly = false;
          }
        }
        if (fieldState.disabled || fieldState.readOnly) {
          const normalize = (input: string) => input.trim().toUpperCase().replace(/[\s-]/g, "");
          if (!fieldState.value || normalize(fieldState.value) !== normalize(value)) {
            throw {
              code: "PORTAL_LOCKED_FIELD_MISMATCH",
              message: `El portal bloqueó el campo ${step.selector} con un valor distinto al esperado.`
            };
          }
          await createRunnerLog(jobId, ticketId, "INFO", "Campo bloqueado ya validado por el portal; se omite la escritura.", {
            stepIndex: i,
            stepType: step.type,
            selector: step.selector
          });
        } else {
          const isDate = step.transform === "portalDate" ||
            await target.getAttribute("type").catch(() => "") === "date" ||
            await target.evaluate((element: HTMLElement) => element.classList.contains("flatpickr-input")).catch(() => false);
           if (isDate) await handleDatePicker(page, locator, value);
           else {
             await smartTypeIntoField(page, locator, value);
             if (String(step.selector).includes("codigo")) {
               console.log("[fill] Postal code filled. Triggering change/blur events...");
               await target.evaluate((el: any) => {
                 el.dispatchEvent(new Event('change', { bubbles: true }));
                 el.dispatchEvent(new Event('blur', { bubbles: true }));
               }).catch(() => null);
               
               console.log("[fill] Waiting for address AJAX loaders and PrimeFaces queue to become idle...");
               await page.waitForFunction(() => {
                 const progress = document.querySelector(".ui-progressbar");
                 const statusDlg = document.querySelector("[id='form:statusDialog']");
                 const blocker = document.querySelector(".ui-blockui");
                 const isProgressVisible = progress && window.getComputedStyle(progress).display !== "none" && (progress as any).offsetHeight > 0;
                 const isStatusVisible = statusDlg && window.getComputedStyle(statusDlg).display !== "none" && (statusDlg as any).offsetHeight > 0;
                 const isBlockerVisible = blocker && window.getComputedStyle(blocker).display !== "none" && (blocker as any).offsetHeight > 0;
                 
                 const pf = (window as any).PrimeFaces;
                 const isPfAjaxBusy = pf && pf.ajax && pf.ajax.Queue && !pf.ajax.Queue.isEmpty();
                 
                 return !isProgressVisible && !isStatusVisible && !isBlockerVisible && !isPfAjaxBusy;
               }, { timeout: 25000 }).catch(() => null);
               await page.waitForTimeout(1500);
             }
           }
        }
      } else if (step.type === "evaluate") {
        const value = resolveValue(step.value, ticketData, fiscalProfile, connector, portalMap, step.transform);
        await waitForSelectorOrError(page, step.selector, step.iframeSelector, captchaSelectors, errorSelectors, step.timeout || 15000);
        const locator = getLocator(step.selector, step.iframeSelector);
        await locator.first().evaluate((el: any, val: string) => {
          el.value = val;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
        }, value);
      } else if (step.type === "select") {
        const value = resolveValue(step.value, ticketData, fiscalProfile, connector, portalMap, step.transform);
        let locator: any;
        try {
          await waitForSelectorOrError(page, step.selector, step.iframeSelector, captchaSelectors, errorSelectors, step.timeout || 15000);
          locator = getLocator(step.selector, step.iframeSelector);
        } catch (primaryError: any) {
          // Try AI Self-Healing for select dropdown
          const healed = await healSelectorWithAi(page, step, step.selector, primaryError.message || String(primaryError)).catch(() => null);
          if (healed?.healedSelector) {
            try {
              const aiLocator = page.locator(healed.healedSelector);
              await aiLocator.first().waitFor({ state: "visible", timeout: 10000 });
              locator = aiLocator;
              await createRunnerLog(jobId, ticketId, "INFO", `Selector de dropdown reparado dinámicamente con IA (Self-Healing). Selector elegido: ${healed.healedSelector}. Razón: ${healed.explanation}`, {
                stepIndex: i, stepType: step.type, healingAttempt: 4, strategy: "ai_self_healing", success: true
              });
            } catch (aiErr) {
              console.warn("[SelfHealing] AI healed select selector failed to resolve:", aiErr);
            }
          }
          if (!locator) throw primaryError;
        }
        const targetTag = await locator.first().evaluate((el: any) => el.tagName);

        // Ionic renders ion-select as a button plus a popover, not as a native <select>.
        if (targetTag === "ION-SELECT") {
          await locator.first().click();
          const optionLabels: Record<string, string[]> = {
            "626": ["Régimen Simplificado de Confianza", "Simplificado de Confianza"],
            "601": ["General de Ley Personas Morales", "General de Ley"],
            "603": ["Personas Morales con Fines no Lucrativos", "Fines no Lucrativos"],
            "605": ["Sueldos y Salarios"],
            "606": ["Arrendamiento"],
            "608": ["Demás ingresos", "Intereses"],
            "612": ["Personas Físicas con Actividades Empresariales", "Actividades Empresariales"],
            "G01": ["Adquisición de mercancías"],
            "G02": ["Devoluciones, descuentos o bonificaciones"],
            "G03": ["Gastos en general"],
            "I01": ["Construcciones"],
            "S01": ["Sin efectos fiscales"],
            "CP01": ["Pagos"]
          };
          const candidates = [value, ...(optionLabels[value] || [])];
          const popover = page.locator("ion-popover:visible, ion-alert:visible").last();
          await popover.waitFor({ state: "visible", timeout: step.timeout || 15000 });
          let selected = false;
          for (const candidate of candidates) {
            const option = popover.locator("ion-item, ion-radio, button").filter({ hasText: candidate }).first();
            if (await option.count()) {
              await option.click();
              selected = true;
              break;
            }
          }
          if (!selected) {
            throw {
              message: `No se encontró la opción '${value}' en el selector fiscal.`,
              code: "PORTAL_CHANGED"
            };
          }
          continue;
        }

        // If it's a PrimeFaces dropdown container, wait for it to be enabled (i.e. not have .ui-state-disabled)
        const isPrimeFacesDropdown = await locator.first().evaluate((el: any) => el.classList.contains("ui-selectonemenu"));
        if (isPrimeFacesDropdown) {
          console.log(`[select] PrimeFaces dropdown detected for ${step.selector}. Waiting for it to become enabled (removing .ui-state-disabled)...`);
          await page.waitForFunction(
            (sel: string) => {
              const cleanSel = sel.replace(/:visible/g, "");
              const elements = Array.from(document.querySelectorAll(cleanSel));
              const visibleEnabledEl = elements.find(el => {
                const style = window.getComputedStyle(el);
                const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && (el as any).offsetHeight > 0;
                return isVisible && !el.classList.contains("ui-state-disabled");
              });
              return !!visibleEnabledEl;
            },
            step.selector,
            { timeout: 15000 }
          ).catch((e: any) => console.warn(`[select] Warning: dropdown ${step.selector} did not enable: ${e.message}`));

          // Click the dropdown to open the panel so that PrimeFaces populates and updates options correctly
          await locator.first().click().catch(() => null);
          await page.waitForTimeout(500);
        }

        let selected = false;
        if (isPrimeFacesDropdown) {
          console.log(`[select] PrimeFaces dropdown detected. Skipping native select to guarantee AJAX triggers, using visual selection.`);
        } else {
          selected = await locator.first().evaluate((targetNode: any, val: string) => {
            const selectEl = targetNode.tagName === "SELECT" ? targetNode : targetNode.querySelector("select");
            if (!selectEl) return false;

            const triggerPFChange = (el: any) => {
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('blur', { bubbles: true }));
              if ((window as any).jQuery) {
                (window as any).jQuery(el).trigger('change');
              }
            };

            // 1. Try to find option by exact value matching (standard)
            let opt = Array.from(selectEl.options).find((o: any) => o.value === val);
            if (opt) {
              selectEl.value = val;
              triggerPFChange(selectEl);

              const container = selectEl.closest(".ui-selectonemenu");
              const id = container ? container.id : selectEl.id.replace(/_input$/, "");
              const panel = document.getElementById(id + "_panel");
              if (panel) {
                const label = container ? container.querySelector(".ui-selectonemenu-label") : null;
                if (label) label.textContent = (opt as any).text;
                const items = Array.from(panel.querySelectorAll("li.ui-selectonemenu-item"));
                const itemIdx = Array.from(selectEl.options).indexOf(opt as any);
                items.forEach((item: any, idx: number) => {
                  if (idx === itemIdx) {
                    item.classList.add("ui-state-highlight");
                    item.click();
                  } else {
                    item.classList.remove("ui-state-highlight");
                  }
                });
              }
              return true;
            }

            // 2. Try to find option by text content fuzzy matching (handles UUIDs/custom labels!)
            const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

            const mappers: Record<string, string> = {
              "626": "simplificado de confianza",
              "601": "general de ley",
              "603": "fines no lucrativos",
              "605": "sueldos y salarios",
              "606": "arrendamiento",
              "608": "intereses",
              "612": "actividades empresariales",
              "G01": "adquisicion",
              "G02": "devoluciones",
              "G03": "gastos en general",
              "I01": "construcciones",
              "S01": "sin efectos fiscales",
              "CP01": "codigo postal"
            };

            const targetText = mappers[val] || val;
            const targetNorm = norm(targetText);

            const idx = Array.from(selectEl.options).findIndex((o: any) => norm(o.text).includes(targetNorm));
            if (idx !== -1) {
              selectEl.selectedIndex = idx;
              triggerPFChange(selectEl);

              const container = selectEl.closest(".ui-selectonemenu");
              const id = container ? container.id : selectEl.id.replace(/_input$/, "");
              const panel = document.getElementById(id + "_panel");
              if (panel) {
                const label = container ? container.querySelector(".ui-selectonemenu-label") : null;
                const optText = selectEl.options[idx] ? selectEl.options[idx].text : "";
                if (label && optText) label.textContent = optText;
                const items = Array.from(panel.querySelectorAll("li.ui-selectonemenu-item"));
                const targetItem: any = items.find((item: any) => norm(item.textContent || "").includes(targetNorm));
                if (targetItem) {
                  targetItem.classList.add("ui-state-highlight");
                  targetItem.click();
                }
              }
              return true;
            }
            return false;
          }, value);
        }

        if (!selected) {
          console.log(`[select] Native selection failed for '${value}'. Trying visual PrimeFaces fallback...`);

          const containerId = await locator.first().evaluate((el: any) => {
            const container = el.classList.contains("ui-selectonemenu") ? el : el.closest(".ui-selectonemenu");
            return container ? container.id : null;
          });

          if (containerId) {
            const panelId = containerId + "_panel";
            console.log(`[select] PrimeFaces Panel ID: ${panelId}`);

            const panelLocator = page.locator(`[id='${panelId}']`);
            const isPanelVisible = await panelLocator.isVisible().catch(() => false);
            if (!isPanelVisible) {
              console.log("[select] Opening visual panel...");
              await locator.first().click().catch(() => null);
              await page.waitForTimeout(1000);
            }

            let panelOptions: any[] = [];
            for (let t = 0; t < 10; t++) {
              panelOptions = await panelLocator.locator("li.ui-selectonemenu-item").evaluateAll((elements: any[]) => {
                return elements.map(el => ({
                  text: el.innerText || "",
                  dataLabel: el.getAttribute("data-label") || "",
                  id: el.id
                }));
              });

              const hasValidOptions = panelOptions.some(o => o.text.trim() !== "" && !o.text.toLowerCase().includes("seleccione"));
              if (hasValidOptions) {
                break;
              }
              await page.waitForTimeout(500);
            }

            console.log(`[select] Panel options (loaded):`, JSON.stringify(panelOptions));

            const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            const mappers: Record<string, string> = {
              "626": "simplificado de confianza",
              "601": "general de ley",
              "603": "fines no lucrativos",
              "605": "sueldos y salarios",
              "606": "arrendamiento",
              "608": "intereses",
              "612": "actividades empresariales",
              "G01": "adquisicion",
              "G02": "devoluciones",
              "G03": "gastos en general",
              "I01": "construcciones",
              "S01": "sin efectos fiscales",
              "CP01": "codigo postal"
            };

            const targetText = mappers[value] || value;
            const targetNorm = norm(targetText);

            const matchedOption = panelOptions.find((o: any) => 
              norm(o.text).includes(targetNorm) || 
              norm(o.dataLabel).includes(targetNorm) ||
              norm(o.text).includes(norm(value))
            );

            if (matchedOption) {
              console.log(`[select] Found visual match: "${matchedOption.text}". Clicking...`);
              if (matchedOption.id) {
                await page.locator(`[id='${panelId}'] li[id='${matchedOption.id}']`).first().click();
              } else {
                await page.locator(`[id='${panelId}'] li.ui-selectonemenu-item`).filter({ hasText: matchedOption.text }).first().click();
              }
              await page.waitForTimeout(1500);
            } else {
              const available = panelOptions.map((o: any) => o.text).join(", ");
              throw {
                code: "OPTION_NOT_FOUND",
                message: `No se pudo encontrar la opción '${value}' ('${targetText}') en el dropdown de PrimeFaces. Opciones disponibles: [${available}]`
              };
            }
          } else {
            throw {
              code: "OPTION_NOT_FOUND",
              message: `No se pudo encontrar el contenedor de PrimeFaces para el selector ${step.selector}.`
            };
          }
        }
      } else if (step.type === "click") {
        // Self-heal fields using connector strategy if available
        if (String(step.selector).includes("generarFactura")) {
          const strategy = getConnectorStrategy(connectorId);
          if (strategy?.selfHealFields) {
            await strategy.selfHealFields(page, {
              ...ticketData,
              codigoPostal: fiscalProfile.postalCode || ticketData.codigoPostal || "64000"
            });
          }
        }

        let clicked = false;
        try {
          await waitForSelectorOrError(page, step.selector, step.iframeSelector, captchaSelectors, errorSelectors, step.timeout || 15000);
          await getLocator(step.selector, step.iframeSelector).first().click();
          clicked = true;
          if (String(step.selector).includes("validarTicket")) {
            await createRunnerLog(jobId, ticketId, "INFO", "Esperando validación de ticket en portal...");
            const startTime = Date.now();
            let validated = false;
            let finalErrorMsg = "";

            // Wait up to 25 seconds checking every 500ms
            for (let attempt = 0; attempt < 50; attempt++) {
              await page.waitForTimeout(500);

              // 1. Check if Continuar button is enabled (Success!)
              const continuarBtn = page.locator("[id='form:continuar']:visible").first();
              if (await continuarBtn.isVisible().catch(() => false)) {
                const isDisabled = await continuarBtn.evaluate((el: any) => el.classList.contains("ui-state-disabled")).catch(() => true);
                if (!isDisabled) {
                  validated = true;
                  break;
                }
              }

              // 2. Check for new Growl messages
              const growlMsg = page.locator(".ui-growl-message").first();
              if (await growlMsg.isVisible().catch(() => false)) {
                const rawText = await growlMsg.innerText().catch(() => "");
                const text = rawText.toLowerCase();
                console.log(`[validation loop] Growl message detected: "${rawText}"`);
                if (text.includes("valido") && !text.includes("invalido") && !text.includes("inválido")) {
                  validated = true;
                  break;
                } else {
                  finalErrorMsg = rawText.trim();
                  break;
                }
              }

              // 3. Check for general error selectors (like .swal-text, etc.)
              const portalError = await checkPortalError(page, errorSelectors);
              if (portalError) {
                finalErrorMsg = portalError;
                break;
              }

              // 4. Check for PrimeFaces error messages/summaries
              const errorMsgDetail = page.locator(".ui-messages-error-detail, .ui-message-error-detail, .ui-messages-error, .ui-message-error").first();
              if (await errorMsgDetail.isVisible().catch(() => false)) {
                const rawText = await errorMsgDetail.innerText().catch(() => "");
                if (rawText.trim().length > 0) {
                  console.log(`[validation loop] PrimeFaces error detected: "${rawText}"`);
                  finalErrorMsg = rawText.trim();
                  break;
                }
              }
            }

            const elapsed = Date.now() - startTime;
            await createRunnerLog(jobId, ticketId, "INFO", `Tiempo de espera validación: ${elapsed}ms. Validado: ${validated}. Error detectado: ${finalErrorMsg || 'Ninguno'}`);

            if (!validated) {
              if (finalErrorMsg.toLowerCase().includes("pendiente") || finalErrorMsg.toLowerCase().includes("no se encuentra") || finalErrorMsg.toLowerCase().includes("no existe")) {
                throw {
                  code: "TICKET_TOO_NEW",
                  message: `El comercio todavía está validando este ticket: ${finalErrorMsg}`
                };
              }
              if (finalErrorMsg) {
                throw {
                  code: "PORTAL_RETURNED_ERROR",
                  message: `El portal rechazó el ticket: ${finalErrorMsg}`
                };
              }
              const isDisabled = await page.locator("[id='form:continuar']:visible").first().evaluate((el: any) => el.classList.contains("ui-state-disabled")).catch(() => true);
              if (isDisabled) {
                throw {
                  code: "PORTAL_TIMEOUT",
                  message: "Timeout esperando que el portal habilitara el botón de Continuar tras validar."
                };
              }
            }
          }
        } catch (primaryError: any) {
          if (primaryError?.code) throw primaryError;

          // A. Try Semantic Text search
          const semanticText = step.buttonText || step.label || step.text;
          if (semanticText) {
            try {
              await createRunnerLog(jobId, ticketId, "WARNING", "Selector principal no disponible; intentando localización semántica.", {
                stepIndex: i, stepType: step.type, healingAttempt: 2, strategy: "semantic_text"
              });
              const alternative = page.getByRole("button", { name: semanticText, exact: false }).or(page.getByText(semanticText, { exact: false })).first();
              await alternative.waitFor({ state: "visible", timeout: 10000 });
              await alternative.click();
              await createRunnerLog(jobId, ticketId, "INFO", "Paso reparado con localización semántica.", {
                stepIndex: i, stepType: step.type, healingAttempt: 2, strategy: "semantic_text", success: true
              });
              clicked = true;
            } catch {}
          }

          // B. Try AI Self-Healing
          if (!clicked) {
            const healed = await healSelectorWithAi(page, step, step.selector, primaryError.message || String(primaryError)).catch(() => null);
            if (healed?.healedSelector && allowGeminiSelectorExecution) {
              try {
                const aiLocator = page.locator(healed.healedSelector);
                await aiLocator.first().waitFor({ state: "visible", timeout: 10000 });
                await aiLocator.first().click();
                await createRunnerLog(jobId, ticketId, "INFO", `Paso de clic reparado dinámicamente con IA (Self-Healing). Selector elegido: ${healed.healedSelector}. Razón: ${healed.explanation}`, {
                  stepIndex: i, stepType: step.type, healingAttempt: 4, strategy: "ai_self_healing", success: true
                });
                clicked = true;
              } catch (aiErr) {
                console.warn("[SelfHealing] AI healed click selector failed to click:", aiErr);
              }
            } else if (healed?.healedSelector) {
              await createRunnerLog(jobId, ticketId, "WARNING", "Clic sugerido por IA bloqueado; requiere revision humana antes de ejecutarse.", {
                stepIndex: i,
                stepType: step.type,
                strategy: "ai_self_healing",
                proposalStatus: "pending_review",
                proposedSelector: healed.healedSelector,
                explanation: healed.explanation
              });
            }
          }

          if (!clicked) {
            throw primaryError;
          }
        }
      } else if (step.type === "check" || step.type === "radio") {
        await waitForSelectorOrError(page, step.selector, step.iframeSelector, captchaSelectors, errorSelectors, step.timeout || 15000);
        const locator = getLocator(step.selector, step.iframeSelector);
        await locator.first().check();
      } else if (step.type === "waitForSelector") {
        await waitForSelectorOrError(page, step.selector, step.iframeSelector, captchaSelectors, errorSelectors, step.timeout || 15000);
      } else if (step.type === "waitForNavigation") {
        await page.waitForNavigation({ waitUntil: "load", timeout: step.timeout || 20000 }).catch(() => null);
      } else if (step.type === "waitForTimeout") {
        await page.waitForTimeout(step.delay || 2000);
      } else if (step.type === "newTab") {
        const existingPages = context.pages();
        const nextPage = existingPages.length > 1
          ? existingPages[existingPages.length - 1]
          : await context.waitForEvent("page", { timeout: step.timeout || 15000 });
        await nextPage.waitForLoadState("domcontentloaded").catch(() => null);
        page = nextPage;
        page.on("dialog", (dialog: Dialog) => dialog.accept().catch(() => null));
        attachDownloadListener(page);
      } else if (step.type === "acceptModal") {
        const selector = step.selector || "dialog[open], .modal.show, .swal2-popup:visible, [role='dialog']:visible";
        const modal = page.locator(selector).first();
        if (await modal.count().catch(() => 0)) {
          const action = modal.getByRole("button", { name: /aceptar|continuar|cerrar|entendido|ok|×/i }).first();
          if (await action.count().catch(() => 0)) await action.click();
        }
      } else if (step.type === "sniffDownload") {
        const observed = await waitForDocumentSignal(
          downloadedFiles.length,
          networkSniffer.captures.length,
          step.timeout || 15000,
          "la espera de documento configurada en el portal map"
        );
        if (!observed) {
          throw { code: "DOCUMENT_NOT_OBSERVED", message: "El portal no entregÃ³ un documento tras el paso de descarga configurado." };
        }
      } else if (step.type === "assertText") {
        await waitForSelectorOrError(page, step.selector, step.iframeSelector, captchaSelectors, errorSelectors, step.timeout || 15000);
        const locator = getLocator(step.selector, step.iframeSelector);
        const text = await locator.first().innerText();
        const expected = resolveValue(step.value, ticketData, fiscalProfile, connector, portalMap);
        if (!text.includes(expected)) {
          throw new Error(`Assert text fallido: Se esperaba "${expected}" pero se obtuvo "${text}"`);
        }
      } else if (step.type === "extractText") {
        await waitForSelectorOrError(page, step.selector, step.iframeSelector, captchaSelectors, errorSelectors, step.timeout || 15000);
        const locator = getLocator(step.selector, step.iframeSelector);
        const text = await locator.innerText();
        await createRunnerLog(jobId, ticketId, "INFO", `Texto extraído del selector ${step.selector}: ${text}`, { stepIndex: i, stepType: step.type });
      } else if (step.type === "conditional") {
        const locator = page.locator(step.selector);
        const exists = await locator.count().then((c: number) => c > 0).catch(() => false);
        const visible = exists && await locator.first().isVisible().catch(() => false);
        if (visible) {
          await createRunnerLog(jobId, ticketId, "INFO", `Condición cumplida para el selector: ${step.selector}. Ejecutando subpasos.`, { stepIndex: i, stepType: step.type });
          // Execute nested steps
          const nestedSteps = step.steps || [];
          for (const ns of nestedSteps) {
            if (ns.type === "click") {
              await getLocator(ns.selector, ns.iframeSelector).first().click();
            } else if (ns.type === "fill") {
              const val = resolveValue(ns.value, ticketData, fiscalProfile, connector, portalMap, ns.transform);
              await getLocator(ns.selector, ns.iframeSelector).first().fill(val);
            } else if (ns.type === "select") {
              const val = resolveValue(ns.value, ticketData, fiscalProfile, connector, portalMap, ns.transform);
              await getLocator(ns.selector, ns.iframeSelector).first().selectOption(val);
            } else if (ns.type === "waitForSelector") {
              await getLocator(ns.selector, ns.iframeSelector).waitFor({ state: "visible", timeout: ns.timeout || 5000 }).catch(() => null);
            } else if (ns.type === "waitForTimeout") {
              await page.waitForTimeout(ns.delay || 2000);
            }
          }
        } else {
          await createRunnerLog(jobId, ticketId, "INFO", `Condición omitida (selector no visible): ${step.selector}`, { stepIndex: i, stepType: step.type });
        }
      } else if (step.type === "waitForDownload") {
        // downloads are already listened globally and saved to tmp.
        await createRunnerLog(jobId, ticketId, "INFO", "Esperando a que finalice la descarga del archivo...", { stepIndex: i, stepType: step.type });
        
        // Take debug screenshot of download phase
        const dbgPath = path.join(tmpDir, "download_phase.png");
        await page.screenshot({ path: dbgPath }).catch(() => null);
        console.log(`[download] Debug screenshot saved to ${dbgPath}`);
        
        // Wait for PrimeFaces blockUI or loading dialogs to disappear
        console.log("[download] Waiting for active loaders/spinners to disappear...");
        await page.waitForFunction(() => {
          const loaders = Array.from(document.querySelectorAll(".ui-blockui, .ui-dialog-loading, .ui-widget-overlay, .ui-progressbar, [id*='blockui'], [id*='procesando']"));
          const visibleLoaders = loaders.filter(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && (el as any).offsetHeight > 0;
          });
          return visibleLoaders.length === 0;
        }, { timeout: 45000 }).catch(async (error: any) => {
          const portalFailure = await checkPortalError(page, errorSelectors) || await collectVisiblePortalErrors(page, errorSelectors);
          if (portalFailure) throw { code: "PORTAL_RETURNED_ERROR", message: `El portal reportÃ³ un error mientras preparaba la descarga: ${portalFailure}` };
          await createRunnerLog(jobId, ticketId, "WARNING", `El portal no confirmÃ³ que sus cargadores terminaron antes del timeout: ${error?.message || String(error)}`);
        });

        // Check if a portal error message appeared (e.g. growl or general error message)
        const portalError = page.locator(".ui-growl-message:visible, .ui-messages-error:visible, .ui-message-error:visible, .ui-messages-fatal:visible").first();
        if (await portalError.count().catch(() => 0)) {
          const errorText = await portalError.innerText().catch(() => "");
          if (errorText.trim()) {
            console.log(`[download] Portal error detected: ${errorText}`);
            throw new Error(`Error en el portal al generar factura: ${errorText.trim()}`);
          }
        }

        // Take success page debug screenshot
        const successDbgPath = path.join(tmpDir, "success_page.png");
        await page.screenshot({ path: successDbgPath }).catch(() => null);
        console.log(`[download] Success page debug screenshot saved to ${successDbgPath}`);

        // Detect download links using connector strategy if available
        const strategy = getConnectorStrategy(connectorId);
        let clickedXml = false;
        let clickedPdf = false;
        const downloadsBeforeStrategy = downloadedFiles.length;
        const networkBeforeStrategy = networkSniffer.captures.length;
        if (strategy?.detectDownloadLinks) {
          const linksResult = await strategy.detectDownloadLinks(page);
          clickedXml = !!linksResult.clickedXml;
          clickedPdf = !!linksResult.clickedPdf;
          if (clickedXml || clickedPdf) {
            await waitForDocumentSignal(downloadsBeforeStrategy, networkBeforeStrategy, step.timeout || 15000, "el conector de descarga");
          }
        }

        // Generic fallback: look for standard "Descargar PDF / XML" buttons if not clicked by strategy
        if (!clickedPdf) {
          const fallbackPdfBtn = page.locator("div, span, a, button").filter({ hasText: /Descargar PDF|Descargar comprobante/i }).first();
          if (await fallbackPdfBtn.isVisible().catch(() => false)) {
            console.log("[download] Generic PDF download button detected. Clicking...");
            clickedPdf = await clickForDocument(fallbackPdfBtn, "el botÃ³n PDF configurado como fallback", step.timeout || 15000);
          }
        }
        if (!clickedXml) {
          const fallbackXmlBtn = page.locator("div, span, a, button").filter({ hasText: /Descargar XML|Descargar factura/i }).first();
          if (await fallbackXmlBtn.isVisible().catch(() => false)) {
            console.log("[download] Generic XML download button detected. Clicking...");
            clickedXml = await clickForDocument(fallbackXmlBtn, "el botÃ³n XML configurado como fallback", step.timeout || 15000);
          }
        }

        // Fill email and send email on success page
        const clientEmail = fiscalProfile.correoElectronico || fiscalProfile.email;
        if (clientEmail) {
          let emailInput = page.locator("input[id*='email'], input[id*='correo'], input[type='email']").first();
          if (!(await emailInput.isVisible().catch(() => false))) {
            emailInput = page.locator("input[type='text']:visible, input[type='email']:visible").first();
          }

          if (await emailInput.isVisible().catch(() => false)) {
            console.log(`[download] Success page email input found. Filling with: ${clientEmail}`);
            await emailInput.fill(clientEmail).catch(() => null);
            await page.waitForTimeout(1000);

            const sendEmailBtn = page.locator("button, a, div, span").filter({ hasText: /Enviar correo/i }).first();
            if (await sendEmailBtn.isVisible().catch(() => false)) {
              console.log("[download] Success page 'Enviar correo' button found. Clicking...");
              await sendEmailBtn.click().catch(() => null);
              await page.waitForTimeout(3000);
            }
          }
        }

        // Auto-click visible download buttons if no download has started
        if (downloadedFiles.length === 0) {
          const downloadButtons = page.locator("a:visible, button:visible, ion-button:visible, [role='button']:visible");
          const rawCount = await downloadButtons.count().catch(() => 0);
          const filteredButtons = [];

          for (let idx = 0; idx < rawCount; idx++) {
            const btn = downloadButtons.nth(idx);
            const isSidebarOrHeader = await btn.evaluate((el: any) => {
              const str = (el.className || "") + " " + (el.id || "");
              if (/menu|sidebar|header|nav|left|aside|social/i.test(str)) return true;
              let parent = el.parentElement;
              while (parent) {
                const pStr = (parent.className || "") + " " + (parent.id || "");
                if (/menu|sidebar|header|nav|left|aside|social/i.test(pStr)) return true;
                parent = parent.parentElement;
              }
              return false;
            }).catch(() => false);

            if (!isSidebarOrHeader) {
              filteredButtons.push(btn);
            }
          }

          const count = filteredButtons.length;
          if (count > 0) {
            await createRunnerLog(jobId, ticketId, "INFO", `Se encontraron ${count} elementos interactivos en el área principal. Buscando enlaces de XML/PDF.`);
            // Log all buttons
            for (let idx = 0; idx < count; idx++) {
              const btn = filteredButtons[idx];
              const text = (await btn.innerText().catch(() => "")) || (await btn.getAttribute("title").catch(() => "")) || "";
              const tagName = await btn.evaluate((el: any) => el.tagName).catch(() => "");
              const id = await btn.getAttribute("id").catch(() => "");
              const cls = await btn.getAttribute("class").catch(() => "");
              console.log(`[download] Button ${idx}: "${text.trim()}" tagName=${tagName} id=${id} class=${cls}`);
            }
            // First pass: click XML button
            for (let idx = 0; idx < count; idx++) {
              const btn = filteredButtons[idx];
              const text = (await btn.innerText().catch(() => "")) || (await btn.getAttribute("title").catch(() => "")) || "";
              if (/xml/i.test(text) && !/enviar|correo|mail/i.test(text)) {
                await createRunnerLog(jobId, ticketId, "INFO", `Intentando hacer clic en botón de XML: "${text.trim()}"`);
                await clickForDocument(btn, "un botÃ³n XML descubierto fuera del contrato del conector", step.timeout || 15000);
                if (downloadedFiles.length > 0) break;
              }
            }
            // Second pass: click PDF or generic download if XML click didn't start download
            if (downloadedFiles.length === 0) {
              for (let idx = 0; idx < count; idx++) {
                const btn = filteredButtons[idx];
                const text = (await btn.innerText().catch(() => "")) || (await btn.getAttribute("title").catch(() => "")) || "";
                if (/pdf|descargar|bajar|descarga|download/i.test(text) && !/enviar|correo|mail/i.test(text)) {
                  await createRunnerLog(jobId, ticketId, "INFO", `Intentando hacer clic en botón alterno de descarga: "${text.trim()}"`);
                  await clickForDocument(btn, "un botÃ³n de descarga descubierto fuera del contrato del conector", step.timeout || 15000);
                  if (downloadedFiles.length > 0) break;
                }
              }
            }
          }
        }

        if (downloadedFiles.length === 0 && networkSniffer.captures.length === 0) {
          await createRunnerLog(jobId, ticketId, "WARNING", "No hay descarga observada; el runner esperarÃ¡ una seÃ±al documental verificable.");
          const observed = await waitForDocumentSignal(0, 0, step.timeout || 15000, "la postcondiciÃ³n de descarga");
          if (!observed) {
            throw { code: "DOCUMENT_NOT_OBSERVED", message: "El portal no entregÃ³ XML/PDF. Configura un selector de descarga verificable en el portal map o conector." };
          }
        }
      }
    }

    // Post-step error and captcha check
    const finalCaptcha = await checkCaptcha(page, captchaSelectors);
    if (finalCaptcha) {
      await uploadErrorScreenshot("CAPTCHA_DETECTED");
      await createRunnerLog(jobId, ticketId, "WARNING", "CAPTCHA final visible confirmado.", { captchaEvidence: finalCaptcha });
      if (!await waitForHumanCaptcha()) {
        return {
          success: false,
          error: "Se detectó un CAPTCHA final en el portal.",
          errorCode: "CAPTCHA_DETECTED",
          screenshotPath: lastScreenshotPath,
          stepIndex: currentStepIdx,
          maskedReference: maskString(ticketData.folio || ticketData.billingReference || "")
        };
      }
      await page.waitForTimeout(5000);
    }
    let finalError: string | null = await checkPortalError(page, errorSelectors) ||
      await collectVisiblePortalErrors(page, errorSelectors);
    if (finalError) {
      await uploadErrorScreenshot("PORTAL_RETURNED_ERROR");
      let errorMsg = `Error final devuelto por el portal: ${finalError}`;
      let errorCode = "PORTAL_RETURNED_ERROR";
      
      if (finalError === "TICKET_TOO_NEW") {
        errorCode = "TICKET_TOO_NEW";
        const strategy = getConnectorStrategy(connectorId);
        const violation = strategy?.detectBusinessRuleViolation?.(finalError, ticketData.portalFields?.fecha);
        if (violation) {
          errorCode = violation.errorCode;
          errorMsg = violation.errorMsg;
        } else {
          errorMsg = "El ticket es demasiado reciente. El comercio puede tardar hasta 24 horas en sincronizarlo. Reintentaremos automáticamente más tarde.";
        }
      } else {
        const diagnosis = diagnosePortalError(finalError);
        if (diagnosis.category === "ALREADY_INVOICED") {
          await createRunnerLog(jobId, ticketId, "INFO", "El portal indicó que ya estaba facturado; procediendo con la recuperación/creación de comprobante.");
          const recoveryResult = (await recoverExistingInvoiceFromPortal({
            jobId,
            ticketId,
            page,
            ticket: ticketData,
            fiscalProfile,
            portalMap,
            strategy: getConnectorStrategy(connectorId),
            downloadedFiles,
            tmpDir,
            networkSniffer
          }).catch((e) => {
            console.error("Error recovering existing invoice:", e);
            return {
              success: false,
              xmlDownloaded: false,
              pdfDownloaded: false,
              recoveryErrorCode: "TICKET_ALREADY_INVOICED",
              technicalMessage: e.message
            };
          })) as RecoveryResult;

          const norm = normalizeBillingAttemptFields(ticketData);
          return {
            success: false,
            alreadyInvoiced: true,
            recoveryAttempted: true,
            downloadedXmlPath: recoveryResult.xmlPath,
            downloadedPdfPath: recoveryResult.pdfPath,
            wasAlreadyInvoiced: true,
            portalMessage: finalError || "Ticket ya facturado.",
            errorCode: "TICKET_ALREADY_INVOICED",
            error: recoveryResult.success ? "CFDI ya facturado recuperado." : (recoveryResult.technicalMessage || "El ticket ya se encuentra facturado pero no pudimos recuperar el XML original."),
            recoveryPathsTried: recoveryResult.recoveryPathsTried,
            recoveryButtonsClicked: recoveryResult.recoveryButtonsClicked,
            recoveryFormsDetected: recoveryResult.recoveryFormsDetected,
            nextRecommendedAction: recoveryResult.nextRecommendedAction,
            duplicateDetected: true,
            duplicateBasis: "portal_message",
            duplicateReference: norm.folio || ticketData.folio || "S/D",
            duplicatePortalMessage: finalError || "Ticket ya facturado.",
            duplicateIsFiscalProof: false
          };
        }
        const codeByCategory: Record<string, string> = {
          ALREADY_INVOICED: "ALREADY_INVOICED_NO_RECOVERY",
          TICKET_NOT_FOUND: "TICKET_NOT_FOUND",
          INVALID_TOTAL: "INVALID_TOTAL",
          INVALID_DATE: "INVALID_DATE",
          INVALID_RFC: "INVALID_RFC",
          PERIOD_EXPIRED: "PERIOD_EXPIRED",
          FIELD_REQUIRED: "FIELD_REQUIRED",
          SERVICE_DOWN: "SERVICE_DOWN",
          CAPTCHA: "CAPTCHA_DETECTED"
        };
        if (finalError) {
          errorCode = codeByCategory[diagnosis.category] || errorCode;
          errorMsg = diagnosis.userMessage;
        }
      }

      if (finalError) {
        return {
          success: false,
          error: errorMsg,
          errorCode: errorCode,
          screenshotPath: lastScreenshotPath,
          stepIndex: currentStepIdx,
          maskedReference: maskString(ticketData.folio || ticketData.billingReference || "")
        };
      }
    }

    // Process downloaded files and intercepted responses.
    const documents = await collectDocuments(
      page,
      context,
      tmpDir,
      downloadedFiles,
      networkSniffer,
      ticketData.expectedTicketTotal,
      connector.rfc,
      fiscalProfile.rfc
    );

    if (!documents.xmlPath) {
      await uploadErrorScreenshot("XML_NOT_DOWNLOADED");
      return {
        success: false,
        error: "No se localizó la descarga del archivo XML de la factura.",
        errorCode: "XML_NOT_DOWNLOADED",
        screenshotPath: lastScreenshotPath,
        stepIndex: currentStepIdx,
        maskedReference: maskString(ticketData.folio || ticketData.billingReference || "")
      };
    }

    const xmlContent = fs.readFileSync(documents.xmlPath, "utf-8");
    let pdfHtml: string | undefined = undefined;
    if (documents.pdfPath) {
      pdfHtml = `CFDI_PDF_DOCUMENT_BINARY_PLACEHOLDER [Filename: ${path.basename(documents.pdfPath)}]`;
    }

    await createRunnerLog(jobId, ticketId, "INFO", `Navegación completada con éxito. XML extraído mediante ${documents.source || "download"}.`);

    const portalSnapshot = await capturePortalSnapshot(page, lastScreenshotPath);

    retainTrace = false;
    return {
      success: true,
      xmlContent,
      pdfHtml,
      downloadedXmlPath: documents.xmlPath,
      downloadedPdfPath: documents.pdfPath,
      documentSource: documents.source,
      wasAlreadyInvoiced,
      portalSnapshot
    };

  } catch (err: any) {
    console.error("Runner error during execution:", err);

    let detectedMsgObj: DetectedMessage | null = null;
    try {
      detectedMsgObj = await detectPortalErrorMessage(page, errorSelectors, lastPreActionErrorsSnapshot);
    } catch (msgErr) {
      console.warn("Failed to check portal error messages in catch block:", msgErr);
    }

    let code = err.code || (err.message?.includes("timeout") || err.message?.includes("Timeout") ? "PORTAL_TIMEOUT" : "PORTAL_CHANGED");
    let mappedMsg = err.message || "Fallo en la navegación del portal.";
    let rawMsg = detectedMsgObj?.message || err.rawPortalMessage || undefined;

    if (rawMsg) {
      const classification = classifyPortalMessage({
        rawPortalMessage: rawMsg,
        source: detectedMsgObj?.source || err.portalMessageSource || "body_scan",
        selector: detectedMsgObj?.selector || err.portalMessageSelector || err.selector,
        merchant: connector?.nombre,
        currentUrl: page.url(),
        stepIndex: currentStepIdx,
        module: err.module
      });

      code = classification.code;
      mappedMsg = classification.userMessage;
      err.classifiedError = classification;
      err.rawPortalMessage = rawMsg;
      err.portalMessageSource = classification.portalMessageSource;
      err.portalMessageSelector = classification.portalMessageSelector;
      err.classificationConfidence = classification.classificationConfidence;
    }

    if (!ticketData.__alternativeRouteAttempted && ["PORTAL_CHANGED", "TICKET_NOT_FOUND"].includes(code)) {
      const alternative = await tryAlternativeRoute(page, connector);
      if (alternative) {
        const databaseId = "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee";
        const db = getFirestore(getApp(), databaseId);
        const domain = new URL(alternative).hostname.toLowerCase();
        const targetConnectorId = connector.id || portalMap.connectorId;
        const automaticConnectorMutationEnabled = process.env.RUNNER_AUTOMATIC_CONNECTOR_MUTATION_ENABLED === "true";
        if (automaticConnectorMutationEnabled) {
          await db.collection("connectors").doc(targetConnectorId).set({
            portalUrl: alternative,
            lastWorkingRoute: alternative,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          await db.collection("portal_learning_memory").doc(`${domain}-working-route`.replace(/[^a-z0-9_-]/g, "-")).set({
            domain,
            patternType: "working_route",
            pattern: { url: alternative },
            connectorId: targetConnectorId,
            successCount: 1,
            lastSeenAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
          }, { merge: true });
        } else {
          await db.collection("connector_patch_proposals").doc(`${jobId}-alternative-route`.replace(/[^a-zA-Z0-9_-]/g, "-")).set({
            type: "alternative_route",
            status: "pending_review",
            connectorId: targetConnectorId,
            portalMapId: portalMap.id || null,
            proposedChanges: { portalUrl: alternative, lastWorkingRoute: alternative },
            evidence: { domain, ticketId, jobId, errorCode: code },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }
        await createRunnerLog(jobId, ticketId, "WARNING", "Se encontró una ruta alternativa verificable; se reintentará el flujo.", {
          strategy: "alternative_route", alternative
        });
        return executePortalMap(jobId, ticketId, portalMap, { ...connector, portalUrl: alternative }, {
          ...ticketData, __alternativeRouteAttempted: true
        }, fiscalProfile, attemptId);
      }
    }
    await uploadErrorScreenshot(code);
    const portalSnapshot = await capturePortalSnapshot(page, lastScreenshotPath);
    return {
      success: false,
      error: mappedMsg,
      errorCode: code,
      screenshotPath: lastScreenshotPath,
      stepIndex: currentStepIdx,
      maskedReference: maskString(ticketData.folio || ticketData.billingReference || ""),
      rawPortalMessage: rawMsg,
      portalMessageSource: detectedMsgObj?.source || err.portalMessageSource || undefined,
      portalMessageSelector: detectedMsgObj?.selector || err.portalMessageSelector || undefined,
      classificationConfidence: detectedMsgObj?.confidence || err.classificationConfidence || undefined,
      wasAlreadyInvoiced,
      portalSnapshot
    };
  } finally {
    if (traceStarted) {
      try {
        if (retainTrace) {
          await context.tracing.stop({ path: traceFilePath });
          if (fs.existsSync(traceFilePath)) {
            const bucket = getStorage().bucket();
            const tracePath = `users/${userId}/tickets/${ticketId}/runner-traces/${attemptId || jobId}.zip`;
            await bucket.upload(traceFilePath, {
              destination: tracePath,
              metadata: { contentType: "application/zip" }
            });
            if (attemptId) {
              const databaseId = "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee";
              await getFirestore(getApp(), databaseId)
                .collection("invoice_jobs").doc(jobId).collection("attempts").doc(attemptId)
                .set({ tracePath, traceCapturedAt: new Date().toISOString() }, { merge: true });
            }
            await createRunnerLog(jobId, ticketId, "ERROR", `Playwright Trace guardado: ${tracePath}`, { tracePath, attemptId });
          }
        } else {
          await context.tracing.stop();
        }
      } catch (error: any) {
        await createRunnerLog(jobId, ticketId, "WARNING", `No se pudo guardar Playwright Trace: ${error.message || String(error)}`, { attemptId });
      } finally {
        fs.rmSync(traceFilePath, { force: true });
      }
    }
    networkSniffer.dispose();
    await context.close();
    await browser.close();
  }
}
