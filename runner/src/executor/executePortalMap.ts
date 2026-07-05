import { chromium, Dialog, Page } from "playwright";
import { getStorage } from "firebase-admin/storage";
import { getApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { randomUUID } from "crypto";
import { resolveValue } from "./resolveValue";
import { normalizePortalSteps } from "./normalizePortalSteps";
import { createRunnerLog } from "../logging/createRunnerLog";
import { collectDocuments, setupNetworkSniffer } from "./documentSniffer";
import { collectVisiblePortalErrors, diagnosePortalError } from "./portalDoctor";

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
      const count = await page.locator(selector).count();
      if (count > 0) {
        const visible = await page.locator(selector).first().isVisible();
        if (visible) {
          const text = await page.locator(selector).first().innerText();
          if (text && text.trim().length > 0) return text.trim();
        }
      }
    } catch (e) {}
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
  const modal = page.locator("dialog[open], .modal.show, .swal2-popup:visible, [role='dialog']:visible").first();
  if (!await modal.count().catch(() => 0) || !await modal.isVisible().catch(() => false)) return false;
  const button = modal.getByRole("button", { name: /aceptar|continuar|cerrar|entendido|ok|×/i }).first();
  if (await button.count().catch(() => 0)) {
    await button.click().catch(() => null);
    return true;
  }
  return false;
}

async function tryRecoverExistingInvoice(page: Page): Promise<boolean> {
  const recovery = page.getByRole("button", { name: /consultar factura|descargar|reenviar|ver factura|recuperar|historial|reimprimir|obtener xml/i })
    .or(page.getByRole("link", { name: /consultar factura|descargar|reenviar|ver factura|recuperar|historial|reimprimir|obtener xml/i }))
    .first();
  if (!await recovery.count().catch(() => 0) || !await recovery.isVisible().catch(() => false)) return false;
  await recovery.click().catch(() => null);
  await page.waitForTimeout(3000);
  return true;
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
  fiscalProfile: any
): Promise<ExecutionResult> {
  const userId = fiscalProfile.userId;
  const captchaSelectors = JSON.parse(portalMap.captchaSelectorsJson || portalMap.captchaSelectors || "[]");
  const errorSelectors = JSON.parse(portalMap.errorSelectorsJson || portalMap.errorSelectors || "[]");
  const rawSteps = JSON.parse(portalMap.stepsJson || portalMap.steps || "[]");
  const steps = normalizePortalSteps(rawSteps, connector);
  const tmpDir = path.join(os.tmpdir(), "zenticket-runner", jobId);
  fs.mkdirSync(tmpDir, { recursive: true });

  await createRunnerLog(jobId, ticketId, "INFO", `Iniciando navegador headless para: ${connector.nombre}`);

  const isServerless = Boolean(process.env.K_SERVICE || process.env.FUNCTION_TARGET);
  const browserRuntime = isServerless ? require("playwright-core").chromium : chromium;
  const launchOptions: any = { headless: true };
  if (isServerless) {
    const serverlessChromium = require("@sparticuz/chromium");
    launchOptions.executablePath = await serverlessChromium.executablePath();
    launchOptions.args = serverlessChromium.args;
  }
  const browser = await browserRuntime.launch(launchOptions);

  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 800 }
  });

  let page = await context.newPage();
  const downloadedFiles: { filename: string; path: string }[] = [];
  const networkSniffer = setupNetworkSniffer(page);
  page.on("dialog", (dialog: Dialog) => dialog.accept().catch(() => null));

  const attachDownloadListener = (targetPage: Page) => targetPage.on("download", async (download: any) => {
      const filename = download.suggestedFilename();
      const savePath = path.join(tmpDir, filename);
      await download.saveAs(savePath);
      downloadedFiles.push({ filename, path: savePath });
      await createRunnerLog(jobId, ticketId, "INFO", `Archivo descargado capturado: ${filename}`);
    });
  attachDownloadListener(page);

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

  const waitForHumanCaptcha = async (): Promise<boolean> => {
    const databaseId = "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee";
    const db = getFirestore(getApp(), databaseId);
    const jobRef = db.collection("invoice_jobs").doc(jobId);
    const ticketRef = db.collection("tickets").doc(ticketId);
    const deleteCaptchaScreenshot = async () => {
      if (!lastScreenshotPath) return;
      await getStorage().bucket().file(lastScreenshotPath).delete({ ignoreNotFound: true }).catch(() => undefined);
    };
    const message = "El portal solicita el código de verificación mostrado. Captúralo para continuar.";
    await jobRef.set({
      status: "waiting_user_action",
      waitingAction: "captcha",
      captchaScreenshotPath: lastScreenshotPath,
      captchaScreenshotUrl: lastScreenshotUrl,
      captchaRequestedAt: new Date().toISOString(),
      lockedBy: null,
      lockedAt: null,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    await ticketRef.set({
      status: "waiting_user_captcha",
      jobId,
      errorMsg: message,
      reviewReasonCode: "CAPTCHA_DETECTED",
      captchaScreenshotUrl: lastScreenshotUrl,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    for (let waited = 0; waited < 240000; waited += 2000) {
      await page.waitForTimeout(2000);
      const latest = (await jobRef.get()).data() || {};
      const solution = String(latest.captchaSolution || "").trim();
      if (!solution) continue;
      const captchaInput = page.locator("input[name*='captcha' i], input[id*='captcha' i]").first();
      if (!await captchaInput.isVisible().catch(() => false)) return false;
      await smartTypeIntoField(page, captchaInput, solution);
      const submit = page.getByRole("button", { name: /^facturar$/i })
        .or(page.locator("button:has-text('FACTURAR'), ion-button:has-text('FACTURAR')")).first();
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
      await jobRef.set({
        status: "running",
        waitingAction: FieldValue.delete(),
        captchaSolution: FieldValue.delete(),
        captchaScreenshotUrl: FieldValue.delete(),
        lockedBy: "captcha-session",
        updatedAt: new Date().toISOString()
      }, { merge: true });
      await ticketRef.set({
        status: "runner_processing",
        captchaScreenshotUrl: FieldValue.delete(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      await deleteCaptchaScreenshot();
      await page.waitForTimeout(5000);
      return true;
    }
    await deleteCaptchaScreenshot();
    return false;
  };

  try {
    for (let i = 0; i < steps.length; i++) {
      currentStepIdx = i;
      const step = steps[i];
      await createRunnerLog(jobId, ticketId, "INFO", `Ejecutando paso ${i + 1}/${steps.length}: [${step.type}]`, { stepIndex: i, stepType: step.type });
      if (await dismissBlockingModal(page)) {
        await createRunnerLog(jobId, ticketId, "INFO", "Modal bloqueante cerrado automáticamente.", {
          stepIndex: i, stepType: step.type, healingAttempt: 1, strategy: "dismiss_modal", success: true
        });
      }

      // Check if step requires missing fields
      if (step.type === "fill" || step.type === "select" || step.type === "assertText" || step.type === "evaluate") {
        const template = step.value || "";
        const matches = [...template.matchAll(/\{\{([^}]+)\}\}/g)];
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
            const val = pFields[key] || ticketData[key];
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
          errorMsg = "OXXO puede tardar hasta 24 horas en sincronizar tickets nuevos. Reintentaremos automáticamente más tarde.";
          if (ticketData.portalFields?.fecha) {
            errorMsg = `El ticket es reciente (${ticketData.portalFields.fecha}). OXXO puede tardar hasta 24 horas en sincronizar. Reintentaremos automáticamente más tarde.`;
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
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: step.timeout || 30000 });
      } else if (step.type === "fill") {
        const value = resolveValue(step.value, ticketData, fiscalProfile, connector, portalMap, step.transform);
        let locator: any;
        try {
          await waitForSelectorOrError(page, step.selector, step.iframeSelector, captchaSelectors, errorSelectors, step.timeout || 15000);
          locator = getLocator(step.selector, step.iframeSelector);
        } catch (primaryError) {
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
          if (locator) {
            // Continue with the iframe locator.
          } else {
          const semantic = step.label || step.placeholder;
          if (!semantic) throw primaryError;
          locator = page.getByLabel(semantic, { exact: false }).or(page.getByPlaceholder(semantic, { exact: false }));
          await locator.first().waitFor({ state: "visible", timeout: 10000 });
          await createRunnerLog(jobId, ticketId, "INFO", "Campo reparado con búsqueda semántica.", {
            stepIndex: i, stepType: step.type, healingAttempt: 2, strategy: "label_or_placeholder", success: true
          });
          }
        }
        const target = locator.first();
        const fieldState = await target.evaluate((element: HTMLInputElement | HTMLTextAreaElement) => ({
          disabled: element.disabled,
          readOnly: element.readOnly,
          value: element.value || element.getAttribute("value") || ""
        }));
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
          else await smartTypeIntoField(page, locator, value);
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
        await waitForSelectorOrError(page, step.selector, step.iframeSelector, captchaSelectors, errorSelectors, step.timeout || 15000);
        const locator = getLocator(step.selector, step.iframeSelector);
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

        await locator.first().evaluate((targetNode: any, val: string) => {
          const selectEl = targetNode.tagName === "SELECT" ? targetNode : targetNode.querySelector("select");
          if (!selectEl) return;

          // 1. Try to find option by exact value matching (standard)
          let opt = Array.from(selectEl.options).find((o: any) => o.value === val);
          if (opt) {
            selectEl.value = val;
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            selectEl.dispatchEvent(new Event('blur', { bubbles: true }));
            return;
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
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            selectEl.dispatchEvent(new Event('blur', { bubbles: true }));

            // 3. If PrimeFaces is active, find and click the corresponding custom list item to sync UI visuals
            const container = selectEl.closest(".ui-selectonemenu");
            const id = container ? container.id : selectEl.id.replace(/_input$/, "");
            const panel = document.getElementById(id + "_panel");
            if (panel) {
              const items = Array.from(panel.querySelectorAll("li.ui-selectonemenu-item"));
              const targetItem: any = items.find((item: any) => norm(item.textContent || "").includes(targetNorm));
              if (targetItem) {
                targetItem.click();
              }
            }
          }
        }, value);
      } else if (step.type === "click") {
        try {
          await waitForSelectorOrError(page, step.selector, step.iframeSelector, captchaSelectors, errorSelectors, step.timeout || 15000);
          await getLocator(step.selector, step.iframeSelector).first().click();
          if (String(step.selector).includes("validarTicket")) {
            await page.waitForTimeout(1200);
            const pending = page.getByText("Ticket pendiente por validar", { exact: false }).first();
            if (await pending.isVisible().catch(() => false)) {
              throw {
                code: "TICKET_TOO_NEW",
                message: "El comercio todavía está validando este ticket. Podrás reintentarlo más tarde."
              };
            }
          }
        } catch (primaryError) {
          const semanticText = step.buttonText || step.label || step.text;
          if (!semanticText) throw primaryError;
          await createRunnerLog(jobId, ticketId, "WARNING", "Selector principal no disponible; intentando localización semántica.", {
            stepIndex: i, stepType: step.type, healingAttempt: 2, strategy: "semantic_text"
          });
          const alternative = page.getByRole("button", { name: semanticText, exact: false }).or(page.getByText(semanticText, { exact: false })).first();
          await alternative.waitFor({ state: "visible", timeout: 10000 });
          await alternative.click();
          await createRunnerLog(jobId, ticketId, "INFO", "Paso reparado con localización semántica.", {
            stepIndex: i, stepType: step.type, healingAttempt: 2, strategy: "semantic_text", success: true
          });
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
        await page.waitForTimeout(step.timeout || 3000);
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
        // We wait up to 15 seconds to see if any download was completed.
        await createRunnerLog(jobId, ticketId, "INFO", "Esperando a que finalice la descarga del archivo...", { stepIndex: i, stepType: step.type });
        let waited = 0;
        while (downloadedFiles.length === 0 && waited < 15000) {
          await page.waitForTimeout(500);
          waited += 500;
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
        errorMsg = "OXXO puede tardar hasta 24 horas en sincronizar tickets nuevos. Reintentaremos automáticamente más tarde.";
        if (ticketData.portalFields?.fecha) {
          errorMsg = `El ticket es reciente (${ticketData.portalFields.fecha}). OXXO puede tardar hasta 24 horas en sincronizar. Reintentaremos automáticamente más tarde.`;
        }
      } else {
        const diagnosis = diagnosePortalError(finalError);
        if (diagnosis.category === "ALREADY_INVOICED" && await tryRecoverExistingInvoice(page)) {
          await createRunnerLog(jobId, ticketId, "INFO", "El portal indicó que ya estaba facturado; se activó la recuperación de archivos.");
          finalError = null;
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
    const documents = await collectDocuments(page, context, tmpDir, downloadedFiles, networkSniffer);

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

    return {
      success: true,
      xmlContent,
      pdfHtml,
      downloadedXmlPath: documents.xmlPath,
      downloadedPdfPath: documents.pdfPath,
      documentSource: documents.source
    };

  } catch (err: any) {
    console.error("Runner error during execution:", err);
    const code = err.code || (err.message?.includes("timeout") || err.message?.includes("Timeout") ? "PORTAL_TIMEOUT" : "PORTAL_CHANGED");
    if (!ticketData.__alternativeRouteAttempted && ["PORTAL_CHANGED", "TICKET_NOT_FOUND"].includes(code)) {
      const alternative = await tryAlternativeRoute(page, connector);
      if (alternative) {
        const databaseId = "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee";
        const db = getFirestore(getApp(), databaseId);
        await db.collection("connectors").doc(connector.id || portalMap.connectorId).set({
          portalUrl: alternative,
          lastWorkingRoute: alternative,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        const domain = new URL(alternative).hostname.toLowerCase();
        await db.collection("portal_learning_memory").doc(`${domain}-working-route`.replace(/[^a-z0-9_-]/g, "-")).set({
          domain,
          patternType: "working_route",
          pattern: { url: alternative },
          connectorId: connector.id || portalMap.connectorId,
          successCount: 1,
          lastSeenAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        }, { merge: true });
        await createRunnerLog(jobId, ticketId, "WARNING", "Se encontró una ruta alternativa verificable; se reintentará el flujo.", {
          strategy: "alternative_route", alternative
        });
        return executePortalMap(jobId, ticketId, portalMap, { ...connector, portalUrl: alternative }, {
          ...ticketData, __alternativeRouteAttempted: true
        }, fiscalProfile);
      }
    }
    await uploadErrorScreenshot(code);
    return {
      success: false,
      error: err.message || "Fallo en la navegación del portal.",
      errorCode: code,
      screenshotPath: lastScreenshotPath,
      stepIndex: currentStepIdx,
      maskedReference: maskString(ticketData.folio || ticketData.billingReference || "")
    };
  } finally {
    networkSniffer.dispose();
    await context.close();
    await browser.close();
  }
}
