import { chromium, Page } from "playwright";
import { getStorage } from "firebase-admin/storage";
import * as path from "path";
import * as fs from "fs";
import { resolveValue } from "./resolveValue";
import { createRunnerLog } from "../logging/createRunnerLog";

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
}

function maskString(str: string): string {
  if (!str) return "";
  if (str.length <= 6) return "***";
  return str.substring(0, 3) + "*".repeat(str.length - 6) + str.substring(str.length - 3);
}

async function checkCaptcha(page: Page, captchaSelectors: string[]): Promise<boolean> {
  const defaultSelectors = [
    "iframe[src*='recaptcha']",
    "iframe[src*='captcha']",
    ".g-recaptcha",
    "input[name*='captcha']",
    "input[id*='captcha']",
    "img[src*='captcha']"
  ];
  const allSelectors = [...new Set([...defaultSelectors, ...captchaSelectors])];

  for (const selector of allSelectors) {
    try {
      const count = await page.locator(selector).count();
      if (count > 0) {
        const visible = await page.locator(selector).first().isVisible();
        if (visible) return true;
      }
    } catch (e) {}
  }

  // Text-based checks
  try {
    const bodyText = await page.innerText("body");
    if (bodyText.includes("No soy un robot") || bodyText.includes("Introduce el captcha")) {
      return true;
    }
  } catch (e) {}

  return false;
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

    if (await checkCaptcha(page, captchaSelectors)) {
      throw { message: "Se detectó un CAPTCHA en el portal del comercio.", code: "CAPTCHA_DETECTED" };
    }

    const portalError = await checkPortalError(page, errorSelectors);
    if (portalError) {
      throw { message: `Error devuelto por el portal: ${portalError}`, code: "PORTAL_RETURNED_ERROR" };
    }

    await page.waitForTimeout(400);
  }

  throw new Error(`Timeout de ${timeoutMs}ms excedido esperando al selector: ${selector}`);
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
  const tmpDir = path.join(__dirname, `../../tmp/${jobId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  await createRunnerLog(jobId, ticketId, "INFO", `Iniciando navegador headless para: ${connector.nombre}`);

  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();
  const downloadedFiles: { filename: string; path: string }[] = [];

  page.on("download", async (download) => {
    const filename = download.suggestedFilename();
    const savePath = path.join(tmpDir, filename);
    await download.saveAs(savePath);
    downloadedFiles.push({ filename, path: savePath });
    await createRunnerLog(jobId, ticketId, "INFO", `Archivo descargado capturado: ${filename}`);
  });

  const captchaSelectors = JSON.parse(portalMap.captchaSelectorsJson || portalMap.captchaSelectors || "[]");
  const errorSelectors = JSON.parse(portalMap.errorSelectorsJson || portalMap.errorSelectors || "[]");
  const steps = JSON.parse(portalMap.stepsJson || portalMap.steps || "[]");

  const getLocator = (selector: string, iframeSelector?: string) => {
    if (iframeSelector) {
      return page.frameLocator(iframeSelector).locator(selector);
    }
    return page.locator(selector);
  };

  let lastScreenshotPath = "";
  let currentStepIdx = 0;

  const uploadErrorScreenshot = async (reason: string) => {
    try {
      const screenshotPath = path.join(tmpDir, `error_${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      const bucket = getStorage().bucket();
      const destPath = `users/${userId}/tickets/${ticketId}/runner-errors/${Date.now()}.png`;
      await bucket.upload(screenshotPath, {
        destination: destPath,
        metadata: { contentType: "image/png" }
      });
      lastScreenshotPath = destPath;
      await createRunnerLog(jobId, ticketId, "ERROR", `Captura de error guardada en Storage: ${destPath}`, { screenshotPath: destPath });
    } catch (e: any) {
      await createRunnerLog(jobId, ticketId, "WARNING", `Fallo al capturar/guardar captura de pantalla de error: ${e.message}`);
    }
  };

  try {
    for (let i = 0; i < steps.length; i++) {
      currentStepIdx = i;
      const step = steps[i];
      await createRunnerLog(jobId, ticketId, "INFO", `Ejecutando paso ${i + 1}/${steps.length}: [${step.type}]`, { stepIndex: i, stepType: step.type });

      // Check if step requires missing fields
      if (step.type === "fill" || step.type === "select" || step.type === "assertText") {
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
      if (await checkCaptcha(page, captchaSelectors)) {
        await uploadErrorScreenshot("CAPTCHA_DETECTED");
        return {
          success: false,
          error: "Se detectó un CAPTCHA en el portal del comercio.",
          errorCode: "CAPTCHA_DETECTED",
          screenshotPath: lastScreenshotPath,
          stepIndex: currentStepIdx,
          maskedReference: maskString(ticketData.folio || ticketData.billingReference || "")
        };
      }
      const portalError = await checkPortalError(page, errorSelectors);
      if (portalError) {
        await uploadErrorScreenshot("PORTAL_RETURNED_ERROR");
        return {
          success: false,
          error: `Error devuelto por el portal: ${portalError}`,
          errorCode: "PORTAL_RETURNED_ERROR",
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
        await waitForSelectorOrError(page, step.selector, step.iframeSelector, captchaSelectors, errorSelectors, step.timeout || 15000);
        const locator = getLocator(step.selector, step.iframeSelector);
        await locator.fill(value);
      } else if (step.type === "select") {
        const value = resolveValue(step.value, ticketData, fiscalProfile, connector, portalMap, step.transform);
        await waitForSelectorOrError(page, step.selector, step.iframeSelector, captchaSelectors, errorSelectors, step.timeout || 15000);
        const locator = getLocator(step.selector, step.iframeSelector);
        await locator.selectOption(value);
      } else if (step.type === "click") {
        await waitForSelectorOrError(page, step.selector, step.iframeSelector, captchaSelectors, errorSelectors, step.timeout || 15000);
        const locator = getLocator(step.selector, step.iframeSelector);
        await locator.click();
      } else if (step.type === "check" || step.type === "radio") {
        await waitForSelectorOrError(page, step.selector, step.iframeSelector, captchaSelectors, errorSelectors, step.timeout || 15000);
        const locator = getLocator(step.selector, step.iframeSelector);
        await locator.check();
      } else if (step.type === "waitForSelector") {
        await waitForSelectorOrError(page, step.selector, step.iframeSelector, captchaSelectors, errorSelectors, step.timeout || 15000);
      } else if (step.type === "waitForNavigation") {
        await page.waitForNavigation({ waitUntil: "load", timeout: step.timeout || 20000 }).catch(() => null);
      } else if (step.type === "waitForTimeout") {
        await page.waitForTimeout(step.delay || 2000);
      } else if (step.type === "assertText") {
        await waitForSelectorOrError(page, step.selector, step.iframeSelector, captchaSelectors, errorSelectors, step.timeout || 15000);
        const locator = getLocator(step.selector, step.iframeSelector);
        const text = await locator.innerText();
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
        const exists = await locator.count().then(c => c > 0).catch(() => false);
        const visible = exists && await locator.first().isVisible().catch(() => false);
        if (visible) {
          await createRunnerLog(jobId, ticketId, "INFO", `Condición cumplida para el selector: ${step.selector}. Ejecutando subpasos.`, { stepIndex: i, stepType: step.type });
          // Execute nested steps
          const nestedSteps = step.steps || [];
          for (const ns of nestedSteps) {
            if (ns.type === "click") {
              await getLocator(ns.selector, ns.iframeSelector).click();
            } else if (ns.type === "fill") {
              const val = resolveValue(ns.value, ticketData, fiscalProfile, connector, portalMap, ns.transform);
              await getLocator(ns.selector, ns.iframeSelector).fill(val);
            } else if (ns.type === "select") {
              const val = resolveValue(ns.value, ticketData, fiscalProfile, connector, portalMap, ns.transform);
              await getLocator(ns.selector, ns.iframeSelector).selectOption(val);
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
    if (await checkCaptcha(page, captchaSelectors)) {
      await uploadErrorScreenshot("CAPTCHA_DETECTED");
      return {
        success: false,
        error: "Se detectó un CAPTCHA final en el portal.",
        errorCode: "CAPTCHA_DETECTED",
        screenshotPath: lastScreenshotPath,
        stepIndex: currentStepIdx,
        maskedReference: maskString(ticketData.folio || ticketData.billingReference || "")
      };
    }
    const finalError = await checkPortalError(page, errorSelectors);
    if (finalError) {
      await uploadErrorScreenshot("PORTAL_RETURNED_ERROR");
      return {
        success: false,
        error: `Error final devuelto por el portal: ${finalError}`,
        errorCode: "PORTAL_RETURNED_ERROR",
        screenshotPath: lastScreenshotPath,
        stepIndex: currentStepIdx,
        maskedReference: maskString(ticketData.folio || ticketData.billingReference || "")
      };
    }

    // Process downloaded files
    const xmlFile = downloadedFiles.find(f => f.filename.toLowerCase().endsWith(".xml"));
    const pdfFile = downloadedFiles.find(f => f.filename.toLowerCase().endsWith(".pdf"));

    if (!xmlFile) {
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

    const xmlContent = fs.readFileSync(xmlFile.path, "utf-8");
    let pdfHtml: string | undefined = undefined;
    if (pdfFile) {
      pdfHtml = `CFDI_PDF_DOCUMENT_BINARY_PLACEHOLDER [Filename: ${pdfFile.filename}]`;
    }

    await createRunnerLog(jobId, ticketId, "INFO", `Navegación completada con éxito. XML extraído: ${xmlFile.filename}`);

    return {
      success: true,
      xmlContent,
      pdfHtml,
      downloadedXmlPath: xmlFile.path,
      downloadedPdfPath: pdfFile ? pdfFile.path : undefined
    };

  } catch (err: any) {
    console.error("Runner error during execution:", err);
    const code = err.code || (err.message?.includes("timeout") || err.message?.includes("Timeout") ? "PORTAL_TIMEOUT" : "PORTAL_CHANGED");
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
    await context.close();
    await browser.close();
  }
}
