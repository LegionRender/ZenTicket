import { Page } from "playwright";
import * as fs from "fs";
import { collectDocuments } from "../../executor/documentSniffer";

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
}

type RecoveryFailure = { code: string; message: string };

function fail(code: string, message: string): never {
  throw { code, message } satisfies RecoveryFailure;
}

function recoveryError(error: unknown, fallbackCode: string): RecoveryFailure {
  const candidate = error as Partial<RecoveryFailure> | undefined;
  return {
    code: candidate?.code || fallbackCode,
    message: candidate?.message || String(error || "Unknown recovery error.")
  };
}

function readStepValue(step: any, ticket: any, fiscalProfile: any): string {
  if (step.value !== undefined && step.value !== null) return String(step.value);
  const source = String(step.source || "");
  const [root, group, field] = source.split(".");
  if (root === "ticket" && group === "portalFields" && field) return String(ticket?.portalFields?.[field] ?? "");
  if (root === "ticket" && group) return String(ticket?.[group] ?? "");
  if (root === "fiscalProfile" && group) return String(fiscalProfile?.[group] ?? "");
  fail("RECOVERY_FLOW_INVALID", "A fill step must declare value or a valid ticket/fiscalProfile source.");
}

function absoluteHttpsUrl(value: unknown): string {
  const url = String(value || "").trim();
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") fail("RECOVERY_FLOW_INVALID", "Recovery only permits explicit HTTPS URLs.");
    return parsed.toString();
  } catch (error) {
    if ((error as Partial<RecoveryFailure>)?.code) throw error;
    fail("RECOVERY_FLOW_INVALID", "A goto step must declare an absolute HTTPS URL.");
  }
}

async function waitForDocumentSignal(params: {
  downloadedFiles: Array<{ filename: string; path: string }>;
  networkSniffer: any;
  previousDownloads: number;
  previousCaptures: number;
  timeoutMs: number;
  action: string;
}): Promise<void> {
  const { downloadedFiles, networkSniffer, previousDownloads, previousCaptures, timeoutMs, action } = params;
  const hasDocumentSignal = () => downloadedFiles.length > previousDownloads || (networkSniffer?.captures?.length || 0) > previousCaptures;
  if (hasDocumentSignal()) return;
  await new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      if (hasDocumentSignal()) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(interval);
        reject({ code: "DOCUMENT_NOT_OBSERVED", message: `No document signal was observed after ${action}.` } satisfies RecoveryFailure);
      }
    }, 100);
  });
}

/**
 * Recovers an existing invoice only through an explicit strategy or verified
 * declarative flow. Semantic/JIT exploration is frozen and cannot mutate maps.
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
  const pathsTried: string[] = [];
  const buttonsClicked: string[] = [];
  const formsDetected: string[] = [];
  let failure: RecoveryFailure | undefined;
  let clickedXml = false;
  let clickedPdf = false;

  console.log("[recovery] Starting verified invoice recovery flow...");

  if (strategy?.detectDownloadLinks) {
    pathsTried.push("strategy");
    const previousDownloads = downloadedFiles.length;
    const previousCaptures = networkSniffer?.captures?.length || 0;
    try {
      const strategyResult = await strategy.detectDownloadLinks(page);
      clickedXml = !!strategyResult?.clickedXml;
      clickedPdf = !!strategyResult?.clickedPdf;
      if (clickedXml || clickedPdf) {
        await waitForDocumentSignal({ downloadedFiles, networkSniffer, previousDownloads, previousCaptures, timeoutMs: 15000, action: "the recovery strategy" });
      }
    } catch (error) {
      failure = recoveryError(error, "RECOVERY_STRATEGY_FAILED");
      console.warn("[recovery] Strategy recovery failed:", failure.message);
    }
  }

  const recoveryFlow = portalMap?.recoveryFlow;
  if (!failure && recoveryFlow && Array.isArray(recoveryFlow.steps) && recoveryFlow.steps.length > 0) {
    pathsTried.push("declarative_recovery_flow");
    const timeoutMs = Math.min(Math.max(Number(recoveryFlow.documentTimeoutMs) || 15000, 1000), 30000);
    try {
      for (let index = 0; index < recoveryFlow.steps.length; index++) {
        const step = recoveryFlow.steps[index];
        const stepType = String(step?.type || step?.step || "").trim().toLowerCase();
        const stepLabel = `step ${index + 1} (${stepType || "missing type"})`;
        if (stepType === "goto") {
          await page.goto(absoluteHttpsUrl(step.url), { waitUntil: "domcontentloaded" });
          continue;
        }
        if (stepType === "fill") {
          if (!step.selector) fail("RECOVERY_FLOW_INVALID", `${stepLabel} requires selector.`);
          const value = readStepValue(step, ticket, fiscalProfile);
          const input = page.locator(step.selector).first();
          await input.fill(value);
          if ((await input.inputValue()) !== value) fail("RECOVERY_FIELD_POSTCONDITION_FAILED", `${stepLabel} did not retain the captured value.`);
          formsDetected.push(step.selector);
          continue;
        }
        if (stepType === "click") {
          if (!step.selector) fail("RECOVERY_FLOW_INVALID", `${stepLabel} requires selector.`);
          if (!step.expectSelector && !step.expectDownload) fail("RECOVERY_STEP_POSTCONDITION_REQUIRED", `${stepLabel} requires expectSelector or expectDownload.`);
          const target = page.locator(step.selector).first();
          const label = (await target.innerText().catch(() => "")).trim();
          buttonsClicked.push(label || step.selector);
          const previousDownloads = downloadedFiles.length;
          const previousCaptures = networkSniffer?.captures?.length || 0;
          await target.click();
          if (step.expectSelector) await page.locator(step.expectSelector).first().waitFor({ state: step.expectState || "visible" });
          if (step.expectDownload) await waitForDocumentSignal({ downloadedFiles, networkSniffer, previousDownloads, previousCaptures, timeoutMs, action: stepLabel });
          continue;
        }
        if (stepType === "download") {
          await waitForDocumentSignal({
            downloadedFiles,
            networkSniffer,
            previousDownloads: Number(step.previousDownloads ?? 0),
            previousCaptures: Number(step.previousCaptures ?? 0),
            timeoutMs,
            action: stepLabel
          });
          continue;
        }
        fail("RECOVERY_FLOW_INVALID", `${stepLabel} uses an unsupported action.`);
      }
    } catch (error) {
      failure = recoveryError(error, "RECOVERY_STEP_FAILED");
      console.warn("[recovery] Declarative recovery failed:", failure.message);
    }
  } else if (!failure && !strategy?.detectDownloadLinks) {
    pathsTried.push("recovery_flow_not_configured");
    failure = { code: "RECOVERY_FLOW_NOT_CONFIGURED", message: "Connector has no approved strategy or declarative recoveryFlow." };
  }

  const docs = await collectDocuments(
    page,
    page.context(),
    tmpDir,
    downloadedFiles,
    networkSniffer || { captures: [], dispose: () => {} },
    ticket.expectedTicketTotal || ticket.total || 0,
    portalMap.rfc || "",
    fiscalProfile.rfc || ""
  );
  const xmlDownloaded = !!docs.xmlPath && fs.existsSync(docs.xmlPath);
  const pdfDownloaded = !!docs.pdfPath && fs.existsSync(docs.pdfPath);

  if (xmlDownloaded) {
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
  }

  return {
    success: false,
    xmlDownloaded: false,
    pdfDownloaded: false,
    recoveryErrorCode: failure?.code || "TICKET_ALREADY_INVOICED",
    technicalMessage: "The portal indicated the ticket was already invoiced, but XML could not be recovered through a verified path.",
    wasAlreadyInvoiced: true,
    recoveryPathsTried: pathsTried,
    recoveryButtonsClicked: buttonsClicked,
    recoveryFormsDetected: formsDetected,
    lastRecoveryError: failure?.message || "XML not found or recovered on screen.",
    nextRecommendedAction: "Configure or repair an approved strategy or declarative recoveryFlow before retrying."
  };
}
