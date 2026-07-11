import { Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { collectDocuments } from "../../executor/documentSniffer";
import { getApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let dbInstance: any = null;
function getDb() {
  if (getApps().length === 0) {
    return null;
  }
  if (!dbInstance) {
    const databaseId = "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee";
    dbInstance = getFirestore(getApp(), databaseId);
  }
  return dbInstance;
}

export interface RecoveryResult {
  success: boolean;
  xmlDownloaded: boolean;
  pdfDownloaded: boolean;
  xmlPath?: string;
  pdfPath?: string;
  recoveryErrorCode?: string;
  technicalMessage?: string;
  wasAlreadyInvoiced?: boolean;
  recoveryPathsTried?: string[];
  recoveryButtonsClicked?: string[];
  recoveryFormsDetected?: string[];
  lastRecoveryError?: string;
  nextRecommendedAction?: string;
  learnedRecoveryFlow?: any;
}

/**
 * Modular function to attempt recovery of an already invoiced ticket.
 * Tries declarative recoveryFlow, strategy detectDownloadLinks, or JIT Recovery Learn.
 */
export async function recoverExistingInvoiceFromPortal(params: {
  jobId?: string;
  ticketId?: string;
  page: Page;
  ticket: any;
  fiscalProfile: any;
  portalMap: any;
  strategy?: any;
  downloadedFiles: Array<{ filename: string; path: string }>;
  tmpDir: string;
  networkSniffer: any;
}): Promise<RecoveryResult> {
  const { page, ticket, fiscalProfile, portalMap, strategy, downloadedFiles, tmpDir, networkSniffer } = params;
  const jobId = params.jobId || String(ticket?.jobId || "unknown-job");
  const ticketId = params.ticketId || String(ticket?.id || ticket?.ticketId || "unknown-ticket");

  console.log("[recovery] Starting recoverExistingInvoiceFromPortal flow...");
  // Diagnostic tracing: starting recovery flow for already invoiced ticket

  const pathsTried: string[] = [];
  const buttonsClicked: string[] = [];
  const formsDetected: string[] = [];
  const learnedSteps: any[] = [];

  let clickedXml = false;
  let clickedPdf = false;

  // 1. Try strategy recovery/downloads hook if defined
  if (strategy?.detectDownloadLinks) {
    console.log("[recovery] Strategy detectDownloadLinks hook found. Invoking...");
    pathsTried.push("strategy");
    const strategyResult = await strategy.detectDownloadLinks(page).catch((e: any) => {
      console.warn("[recovery] Strategy detectDownloadLinks failed:", e);
      return {};
    });
    clickedXml = !!strategyResult?.clickedXml;
    clickedPdf = !!strategyResult?.clickedPdf;
  }

  // 2. Try declarative recoveryFlow if configured
  const recoveryFlow = portalMap?.recoveryFlow;
  if (recoveryFlow && Array.isArray(recoveryFlow.steps) && recoveryFlow.steps.length > 0) {
    console.log("[recovery] Declarative recoveryFlow configured. Executing...");
    pathsTried.push("declarative_recovery_flow");

    for (let index = 0; index < recoveryFlow.steps.length; index++) {
      const step = recoveryFlow.steps[index];
      const stepType = String(step.type || step.step || "").toLowerCase();
      console.log(`[recovery] Executing step ${index + 1}/${recoveryFlow.steps.length}: [${stepType}]`);

      try {
        if (stepType === "goto") {
          const url = step.url || "http://localhost:8899/";
          console.log(`[recovery] Navigating to: ${url}`);
          await page.goto(url);
          await page.waitForTimeout(2000);
        } else if (stepType === "click") {
          if (step.selector) {
            const el = page.locator(step.selector).first();
            const textVal = await el.innerText().catch(() => "");
            buttonsClicked.push(textVal || step.selector);
            await el.click();
          } else if (step.text) {
            const btn = page.locator("button, a, div, span, input").filter({ hasText: new RegExp(step.text, "i") }).first();
            const textVal = await btn.innerText().catch(() => "");
            buttonsClicked.push(textVal || step.text);
            await btn.click();
          }
          await page.waitForTimeout(2500);
        } else if (stepType === "fill") {
          let val = "";
          if (step.source) {
            if (step.source.startsWith("ticket.portalFields.")) {
              const k = step.source.replace("ticket.portalFields.", "");
              val = ticket.portalFields?.[k] || "";
            } else if (step.source.startsWith("fiscalProfile.")) {
              const k = step.source.replace("fiscalProfile.", "");
              val = fiscalProfile?.[k] || "";
            } else if (step.source.startsWith("ticket.")) {
              const k = step.source.replace("ticket.", "");
              val = ticket?.[k] || "";
            }
          } else if (step.value) {
            val = step.value;
          }

          if (step.selector) {
            await page.locator(step.selector).first().fill(val);
          } else if (step.field) {
            formsDetected.push(step.field);
            let input = page.locator(`input[id*='${step.field}' i], input[name*='${step.field}' i], input[placeholder*='${step.field}' i]`).first();
            if (!(await input.isVisible().catch(() => false))) {
              input = page.locator("input[type='text'], input[type='number']").nth(0);
            }
            await input.fill(val);
          }
          await page.waitForTimeout(1000);
        } else if (stepType === "download") {
          console.log("[recovery] Download step triggered, waiting for file downloads...");
          await page.waitForTimeout(3000);
        }
      } catch (stepErr: any) {
        console.warn(`[recovery] Step ${index + 1} execution failed:`, stepErr.message);
      }
    }
  } else {
    // 3. Fallback: JIT Recovery Learn Mode + Semantic Recovery
    console.log("[recovery] No recoveryFlow configured. Activating JIT Recovery Learn & semantic recovery...");
    pathsTried.push("jit_recovery_learn");

    try {
      const startUrl = page.url();
      learnedSteps.push({ type: "goto", url: startUrl });

      // Click "Reimprimir", "Consultar factura", etc.
      const consultKeywords = /consultar factura|descargar|reenviar|ver factura|recuperar|historial|reimprimir|obtener xml/i;
      const genericButtons = page.locator("button, a, div, span").filter({ hasText: consultKeywords });
      const count = await genericButtons.count().catch(() => 0);
      let clickedRecovery = false;

      for (let i = 0; i < count; i++) {
        const btn = genericButtons.nth(i);
        if (await btn.isVisible().catch(() => false)) {
          const textVal = (await btn.innerText().catch(() => "")).trim();
          console.log(`[recovery] JIT Learn: Clicking candidate recovery button: "${textVal}"`);
          buttonsClicked.push(textVal);
          learnedSteps.push({ type: "click", text: textVal });
          await btn.click().catch(() => null);
          await page.waitForTimeout(3000);
          clickedRecovery = true;
          break;
        }
      }

      // Identify and fill form fields
      const inputs = page.locator("input[type='text']:visible, input[type='number']:visible, input[type='email']:visible");
      const inputCount = await inputs.count().catch(() => 0);
      for (let i = 0; i < inputCount; i++) {
        const input = inputs.nth(i);
        const id = await input.getAttribute("id").catch(() => "");
        const name = await input.getAttribute("name").catch(() => "");
        const placeholder = await input.getAttribute("placeholder").catch(() => "");
        const label = (id + " " + name + " " + placeholder).toLowerCase();

        let val = "";
        let fieldKey = "";
        let sourceKey = "";

        if (/folio|referencia|ticket|venta/i.test(label)) {
          val = ticket.portalFields?.billingReference || ticket.reference || "";
          fieldKey = "folio";
          sourceKey = "ticket.portalFields.billingReference";
        } else if (/rfc/i.test(label)) {
          val = fiscalProfile.rfc || "";
          fieldKey = "rfc";
          sourceKey = "fiscalProfile.rfc";
        } else if (/fecha/i.test(label)) {
          val = ticket.portalFields?.fecha || "";
          fieldKey = "fecha";
          sourceKey = "ticket.portalFields.fecha";
        } else if (/total|monto/i.test(label)) {
          val = String(ticket.expectedTicketTotal || ticket.total || "");
          fieldKey = "total";
          sourceKey = "ticket.expectedTicketTotal";
        } else if (/email|correo/i.test(label)) {
          val = fiscalProfile.correoElectronico || fiscalProfile.email || "";
          fieldKey = "email";
          sourceKey = "fiscalProfile.email";
        }

        if (val && fieldKey) {
          console.log(`[recovery] JIT Learn: Filling input field [${fieldKey}] with [${val}]`);
          formsDetected.push(fieldKey);
          learnedSteps.push({ type: "fill", field: fieldKey, source: sourceKey });
          await input.fill(val).catch(() => null);
          await page.waitForTimeout(1000);
        }
      }

      // Click search/submit button
      const searchKeywords = /buscar|consultar|aceptar|enviar|filtrar/i;
      const searchButtons = page.locator("button, a, div, span").filter({ hasText: searchKeywords });
      const searchCount = await searchButtons.count().catch(() => 0);
      for (let i = 0; i < searchCount; i++) {
        const btn = searchButtons.nth(i);
        if (await btn.isVisible().catch(() => false)) {
          const textVal = (await btn.innerText().catch(() => "")).trim();
          console.log(`[recovery] JIT Learn: Clicking search button: "${textVal}"`);
          buttonsClicked.push(textVal);
          learnedSteps.push({ type: "click", text: textVal });
          await btn.click().catch(() => null);
          await page.waitForTimeout(4000);
          break;
        }
      }

      // Try fallback semantic click download buttons
      if (!clickedPdf) {
        const fallbackPdfBtn = page.locator("div, span, a, button").filter({ hasText: /Descargar PDF|Descargar comprobante|Reimprimir|Ver PDF/i }).first();
        if (await fallbackPdfBtn.isVisible().catch(() => false)) {
          console.log("[recovery] Clicking fallback PDF button...");
          await fallbackPdfBtn.click().catch(() => null);
          await page.waitForTimeout(3000);
        }
      }
      if (!clickedXml) {
        const fallbackXmlBtn = page.locator("div, span, a, button").filter({ hasText: /Descargar XML|Descargar factura|Obtener XML/i }).first();
        if (await fallbackXmlBtn.isVisible().catch(() => false)) {
          console.log("[recovery] Clicking fallback XML button...");
          await fallbackXmlBtn.click().catch(() => null);
          await page.waitForTimeout(3000);
        }
      }

      // Try email option if visible
      const clientEmail = fiscalProfile.correoElectronico || fiscalProfile.email;
      if (clientEmail) {
        let emailInput = page.locator("input[id*='email'], input[id*='correo'], input[type='email']").first();
        if (!(await emailInput.isVisible().catch(() => false))) {
          emailInput = page.locator("input[type='text']:visible, input[type='email']:visible").first();
        }
        if (await emailInput.isVisible().catch(() => false)) {
          console.log(`[recovery] Recovery screen email input found. Filling with: ${clientEmail}`);
          await emailInput.fill(clientEmail).catch(() => null);
          await page.waitForTimeout(1000);

          const sendEmailBtn = page.locator("button, a, div, span").filter({ hasText: /Enviar correo|Reenviar/i }).first();
          if (await sendEmailBtn.isVisible().catch(() => false)) {
            console.log("[recovery] Clicking send email button...");
            await sendEmailBtn.click().catch(() => null);
            await page.waitForTimeout(3000);
          }
        }
      }
    } catch (learnErr: any) {
      console.warn("[recovery] JIT Recovery Learn execution encountered error:", learnErr.message);
    }
  }

  await page.waitForTimeout(3000);

  const expectedTotal = ticket.expectedTicketTotal || ticket.total || 0;
  const emisorRfc = portalMap.rfc || "";
  const receptorRfc = fiscalProfile.rfc || "";

  // Sniff or collect any files downloaded
  const docs = await collectDocuments(
    page,
    page.context(),
    tmpDir,
    downloadedFiles,
    networkSniffer || { captures: [], dispose: () => {} },
    expectedTotal,
    emisorRfc,
    receptorRfc
  );

  const xmlDownloaded = !!docs.xmlPath && fs.existsSync(docs.xmlPath);
  const pdfDownloaded = !!docs.pdfPath && fs.existsSync(docs.pdfPath);

  if (xmlDownloaded) {
    console.log(`[recovery] Success! XML recovered at ${docs.xmlPath}`);

    // If JIT learned steps successfully recovered the XML, save the learned flow
    if (learnedSteps.length > 1) {
      console.log(`[recovery] JIT Learning: Recovery flow successfully learned! Saving...`);
      try {
        const learnedRecoveryFlow = {
          steps: learnedSteps,
          learnedAt: new Date().toISOString(),
          status: "learned_recovery_flow"
        };
        const mapId = portalMap.id || ticket.portalMapId || "oxxo";
        const db = getDb();
        if (db) {
          if (process.env.RUNNER_AUTOMATIC_CONNECTOR_MUTATION_ENABLED === "true") {
            await db.collection("portal_maps").doc(mapId).update({
              learnedRecoveryFlow,
              learnedRecoveryStatus: "pending_review"
            }).catch((e: any) => console.error("[recovery] Error updating portal_maps:", e));

            if (ticket.connectorId) {
              await db.collection("connectors").doc(ticket.connectorId).set({
                learnedRecoveryFlow,
                learnedRecoveryStatus: "learned_recovery_flow"
              }, { merge: true }).catch((e: any) => console.error("[recovery] Error updating connectors:", e));
            }
          } else {
            await db.collection("connector_patch_proposals").doc(`${jobId}-recovery-flow`.replace(/[^a-zA-Z0-9_-]/g, "-")).set({
              type: "recovery_flow",
              status: "pending_review",
              connectorId: ticket.connectorId || null,
              portalMapId: mapId,
              proposedChanges: { recoveryFlow: learnedRecoveryFlow },
              evidence: { jobId, ticketId },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }, { merge: true });
          }
        } else {
          console.log("[recovery] JIT Learning: Database not initialized. Skipping save.");
        }
      } catch (saveErr) {
        console.error("[recovery] JIT Learn save error:", saveErr);
      }
    }

    return {
      success: true,
      xmlDownloaded,
      pdfDownloaded,
      xmlPath: docs.xmlPath,
      pdfPath: docs.pdfPath,
      wasAlreadyInvoiced: true,
      recoveryPathsTried: pathsTried,
      recoveryButtonsClicked: buttonsClicked,
      recoveryFormsDetected: formsDetected
    };
  } else {
    console.warn("[recovery] XML not found or recovered.");
    return {
      success: false,
      xmlDownloaded: false,
      pdfDownloaded: false,
      recoveryErrorCode: "TICKET_ALREADY_INVOICED",
      technicalMessage: "El portal indicó que el ticket ya fue facturado, pero no se pudo descargar ni recuperar el archivo XML.",
      wasAlreadyInvoiced: true,
      recoveryPathsTried: pathsTried,
      recoveryButtonsClicked: buttonsClicked,
      recoveryFormsDetected: formsDetected,
      lastRecoveryError: "XML not found or recovered on screen.",
      nextRecommendedAction: "El portal indica que ya existe una factura, pero no se encontró ruta de descarga XML. Reintentar recuperación o revisar manualmente."
    };
  }
}
