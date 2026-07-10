import { initializeApp, cert, getApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as fs from "fs";
import * as path from "path";
import { pollJobs } from "./jobs/pollJobs";
import { lockJob } from "./jobs/lockJob";
import { executePortalMap } from "./executor/executePortalMap";
import { validateCfdiXml, XmlValidationResult } from "./validators/validateCfdiXml";
import { createRunnerLog, setActiveJobContext, setActiveStage } from "./logging/createRunnerLog";
import { validateJobContract } from "./validators/validateJobContract";
import { verifySatCfdi, SatVerificationResult } from "./validators/verifySatCfdi";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { saveExecutionMemory } from "./memory/executionMemory";
import { mapToRunnerError, ERROR_CATALOG, RunnerStage, mapErrorCodeToStage, createDiagnosticSnapshot, getFriendlyMessage, classifyAutomationError } from "./errors/errors";
import { normalizeBillingAttemptFields } from "./utils/normalizeFields";
import { DiagnosticStageTracker } from "./diagnostics/diagnosticStageTracker";
import { createDiagnosticEvent } from "./diagnostics/createDiagnosticEvent";
import { buildDiagnosticSummary } from "./diagnostics/createDiagnosticSummary";
import { persistDiagnosticSummary } from "./diagnostics/persistDiagnosticSummary";
import { capturePortalSnapshot } from "./diagnostics/capturePortalSnapshot";

function getSafeReviewError(
  errorCode: string,
  friendlyMessage: string,
  stage: string,
  retryable: boolean,
  requiresManualReview: boolean
) {
  return {
    errorCode,
    friendlyMessage,
    stage,
    retryable,
    requiresManualReview,
    updatedAt: new Date().toISOString()
  };
}


import * as dotenv from "dotenv";
dotenv.config({ path: path.join(__dirname, "../../.env") });

const MAX_AUTO_RETRIES = 2;
const AUTO_RECOVERABLE_CODES = new Set([
  "PORTAL_TIMEOUT", "RUNNER_TIMEOUT", "PORTAL_CHANGED", "SERVICE_DOWN",
  "XML_NOT_DOWNLOADED"
]);

export function shouldAutoRetry(errorCode: string, retryCount: number): boolean {
  const classification = classifyAutomationError(errorCode, { attemptNumber: retryCount });
  return classification.retryable && retryCount < MAX_AUTO_RETRIES;
}

export interface BlockerClassification {
  isHumanNeeded: boolean;
  userMessage: string;
  technicalCode: string;
  severity: "info" | "warning" | "critical";
  probableCause?: string;
  recommendedAction?: string;
}

export function classifyBlocker(errorCode: string, _errorMessage = "", retryCount = 0): BlockerClassification {
  const mapped = mapToRunnerError({ code: errorCode, message: _errorMessage });
  return {
    isHumanNeeded: true,
    userMessage: mapped.userMessage,
    technicalCode: mapped.code,
    severity: mapped.severity,
    probableCause: mapped.probableCause,
    recommendedAction: mapped.recommendedAction
  };
}

const workerId = `worker-node-${process.pid}`;
const serviceAccountPath = path.join(__dirname, "../../serviceAccountKey.json");

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  initializeApp({
    credential: cert(serviceAccount),
    storageBucket: "factubolt.firebasestorage.app"
  });
} else {
  initializeApp({
    projectId: "factubolt",
    storageBucket: "factubolt.firebasestorage.app"
  });
}

const databaseId = "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee";
const db = getFirestore(getApp(), databaseId);

console.log("=========================================");
console.log("[Runner] Iniciado correctamente");
console.log("[Runner] Project: factubolt");
console.log(`[Runner] Database: ${databaseId}`);
console.log(`[Runner] Modo de ejecución: ${fs.existsSync(serviceAccountPath) ? "Service Account Key" : "Application Default Credentials"}`);
console.log("[Runner] Buscando invoice_jobs pending...");
console.log("=========================================");

export async function processJob(jobId: string) {
  const isLocalDev = process.env.NODE_ENV !== "production" && !process.env.K_SERVICE;
  const isE2EMode = process.env.LOCAL_E2E_MODE === "true" || isLocalDev;
  if (isE2EMode) {
    const allowedJobsEnv = process.env.LOCAL_E2E_ALLOWED_JOB_IDS;
    const allowedTicketsEnv = process.env.LOCAL_E2E_ALLOWED_TICKET_IDS;

    if (!allowedJobsEnv || !allowedTicketsEnv) {
      console.error("\n[SECURITY BLOCKED] RUNNER LOCAL DETENIDO POR FALTA DE CONFIGURACIÓN DE WHITELIST.");
      console.error("Define LOCAL_E2E_ALLOWED_JOB_IDS y LOCAL_E2E_ALLOWED_TICKET_IDS en tu archivo .env.\n");
      return;
    }

    const allowedJobs = allowedJobsEnv.split(",").map(s => s.trim()).filter(Boolean);
    const allowedTickets = allowedTicketsEnv.split(",").map(s => s.trim()).filter(Boolean);

    const matchJob = allowedJobs.includes(jobId);
    
    const jobSnap = await db.collection("invoice_jobs").doc(jobId).get();
    const jobData = jobSnap.data();
    const ticketId = jobData?.ticketId || "";
    const matchTicket = allowedTickets.includes(ticketId);

    if (!matchJob && !matchTicket) {
      console.error(`[SECURITY BLOCKED] Intento de procesar Job ${jobId} / Ticket ${ticketId} fuera de la whitelist local.`);
      return;
    }
  }

  const lockedJob = await lockJob(jobId, workerId);
  if (!lockedJob) return;

  const ticketId = lockedJob.ticketId;
  const ticketRef = db.collection("tickets").doc(ticketId);
  const jobRef = db.collection("invoice_jobs").doc(jobId);
  const bucket = getStorage().bucket();

  setActiveJobContext(jobId, ticketId, lockedJob.connectorId, lockedJob.environment || null, lockedJob.userId, lockedJob.connectorId);

  const normFields = normalizeBillingAttemptFields(lockedJob.ticketDataSnapshot, null, lockedJob.fiscalProfileSnapshot);
  const tracker = new DiagnosticStageTracker(
    ticketId,
    jobId,
    lockedJob.userId || "unknown",
    lockedJob.connectorId,
    lockedJob.connectorId.split("_")[0] || "unknown",
    lockedJob.ticketDataSnapshot?.reference || "unknown",
    normFields
  );
  
  tracker.trackStage("ticket_created", "success");
  await createDiagnosticEvent(tracker.getEvents()[0]);

  let currentStage: RunnerStage = "job_lock";
  setActiveStage(currentStage);

  let currentModule = "runner";
  let connector: any = null;

  try {
    currentStage = "connector_load";
    setActiveStage(currentStage);
    currentModule = "contract_validator";
    
    // Check if ticket is already validated or has an invoice in Firestore
    const ticketSnap = await ticketRef.get();
    if (ticketSnap.exists) {
      const ticketData = ticketSnap.data();
      if (ticketData && (ticketData.status === "cfdi_validated" || ticketData.isCfdiValidated)) {
        await jobRef.update({
          status: "succeeded",
          lastError: null,
          lastErrorCode: null,
          attempts: FieldValue.increment(1),
          updatedAt: new Date().toISOString()
        });
        await createRunnerLog(jobId, ticketId, "INFO", `El ticket ya se encontraba facturado y validado ante el SAT (Estado: ${ticketData.status}). El job se marca como completado.`);
        setActiveJobContext(null, null, null, null);
        return;
      }
      if (ticketData && (ticketData.status === "sat_validation_pending" || ticketData.status === "invoice_obtained") && lockedJob.originalStatus !== "validating_sat") {
        throw {
          code: "DUPLICATE_PROCESSING_BLOCKED",
          message: "El ticket ya tiene una factura en proceso de validación ante el SAT o descargada."
        };
      }
    }

    // 2. Fetch connector
    const connDoc = await db.collection("connectors").doc(lockedJob.connectorId).get();
    if (!connDoc.exists) {
      tracker.trackStage("connector_missing", "failed", { errorCode: "CONNECTOR_NOT_FOUND" });
      await createDiagnosticEvent(tracker.getEvents()[tracker.getEvents().length - 1]);
      throw { message: "Conector no encontrado.", code: "CONNECTOR_NOT_FOUND" };
    }
    connector = connDoc.data();
    if (!connector) {
      tracker.trackStage("connector_missing", "failed", { errorCode: "CONNECTOR_NOT_FOUND" });
      await createDiagnosticEvent(tracker.getEvents()[tracker.getEvents().length - 1]);
      throw { message: "Datos del conector vacíos.", code: "CONNECTOR_NOT_FOUND" };
    }
    tracker.trackStage("connector_found", "success");
    await createDiagnosticEvent(tracker.getEvents()[tracker.getEvents().length - 1]);
    currentStage = "portal_map_load";
    setActiveStage(currentStage);
    const contractMissingFields = validateJobContract(connector, lockedJob.ticketDataSnapshot);
    if (contractMissingFields.length > 0) {
      throw {
        message: `Faltan campos requeridos por el contrato: ${contractMissingFields.join(", ")}`,
        code: "MISSING_REQUIRED_FIELDS",
        missingFields: contractMissingFields
      };
    }

    // Validate recipient fiscal profile
    const profile = lockedJob.fiscalProfileSnapshot || {};
    const rfc = String(profile.rfc || "").trim();
    const razon = String(profile.razonSocial || profile.businessName || "").trim();
    const cp = String(profile.codigoPostal || profile.postalCode || "").trim();
    const regimen = String(profile.regimenFiscal || profile.taxRegime || "").trim();
    const cfdi = String(profile.usoCFDI || profile.cfdiUse || "").trim();

    if (!rfc || !razon || !cp || !regimen || !cfdi) {
      const missingProfileFields = [];
      if (!rfc) missingProfileFields.push("RFC");
      if (!razon) missingProfileFields.push("Razón Social / Nombre");
      if (!cp) missingProfileFields.push("Código Postal");
      if (!regimen) missingProfileFields.push("Régimen Fiscal");
      if (!cfdi) missingProfileFields.push("Uso de CFDI");
      throw {
        code: "MISSING_FISCAL_PROFILE_DATA",
        message: `Faltan datos requeridos en el perfil fiscal del receptor: ${missingProfileFields.join(", ")}.`
      };
    }

    const rfcRegex = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;
    const cpRegex = /^\d{5}$/;

    if (!rfcRegex.test(rfc)) {
      throw {
        code: "INVALID_FISCAL_PROFILE_DATA",
        message: `El RFC '${rfc}' del perfil fiscal tiene un formato inválido.`
      };
    }

    if (!cpRegex.test(cp)) {
      throw {
        code: "INVALID_FISCAL_PROFILE_DATA",
        message: `El Código Postal '${cp}' del perfil fiscal tiene un formato inválido (deben ser 5 dígitos).`
      };
    }

    // ----------------------------------------------------
    // FLOW A: Safe migration / retry for validating_sat
    // ----------------------------------------------------
    if (lockedJob.originalStatus === "validating_sat") {
      if (!lockedJob.nextSatValidationAt) {
        throw { message: "El job está en estado validating_sat pero carece de la fecha programada nextSatValidationAt.", code: "CFDI_VALIDATION_FAILED" };
      }

      currentStage = "xml_download";
      setActiveStage(currentStage);
      currentModule = "downloader";
      await jobRef.update({
        status: "running",
        updatedAt: new Date().toISOString()
      });
      await createRunnerLog(jobId, ticketId, "INFO", "Reintentando validación local para XML ya descargado (migración de estado SAT).");

      const xmlDest = `users/${lockedJob.userId}/tickets/${ticketId}/cfdi.xml`;
      const xmlFileRef = bucket.file(xmlDest);
      const exists = await xmlFileRef.exists().then(r => r[0]);
      if (!exists) {
        throw { message: "El XML de la factura no se localizó en Storage para reintentar la validación.", code: "XML_NOT_DOWNLOADED" };
      }

      const [xmlBuffer] = await xmlFileRef.download();
      const xmlContent = xmlBuffer.toString("utf-8");

      currentStage = "cfdi_validation";
      setActiveStage(currentStage);
      const xmlResult = validateCfdiXml(
        xmlContent,
        connector.rfc,
        lockedJob.fiscalProfileSnapshot.rfc,
        lockedJob.ticketDataSnapshot.expectedTicketTotal
      );

      if (!xmlResult.isValid) {
        throw { message: "El XML almacenado en Storage no pasó las pruebas estructurales locales.", code: xmlResult.error || "XML_STRUCTURE_INVALID" };
      }

      // Succeeded!
      const invoiceId = xmlResult.uuid || lockedJob.invoiceId;
      if (!invoiceId) {
        throw { message: "No se encontró el ID de la factura (invoiceId) para reintentar la validación.", code: "CFDI_VALIDATION_FAILED" };
      }
      const invRef = db.collection("users").doc(lockedJob.userId).collection("invoices").doc(invoiceId);
      const invSnap = await invRef.get();
      if (!invSnap.exists) {
        throw { message: "El documento de la factura (invoice) no existe en la base de datos.", code: "CFDI_VALIDATION_FAILED" };
      }

      currentStage = "sat_verification";
      setActiveStage(currentStage);
      let isSatValid = false;
      let satResult: SatVerificationResult = { isValid: false, status: "Unknown" };
      try {
        currentModule = "sat_verifier";
        satResult = await verifySatCfdi(
          xmlResult.rfcEmisor || "",
          xmlResult.rfcReceptor || "",
          xmlResult.total ?? 0,
          xmlResult.uuid || ""
        );
        isSatValid = satResult.isValid;
      } catch (satErr: any) {
        console.warn(`[Runner] Error validating CFDI with SAT in Flow A: ${satErr.message}`);
        satResult = { isValid: false, status: "Error", error: satErr.message };
      }

      if (isSatValid) {
        await jobRef.update({
          status: "succeeded",
          result: {
            xmlStoragePath: xmlDest,
            pdfStoragePath: lockedJob.pdfHtml ? `users/${lockedJob.userId}/tickets/${ticketId}/cfdi.pdf` : null,
            uuid: xmlResult.uuid
          },
          finishedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        await invRef.update({
          status: "cfdi_validated",
          validationStatus: "validated",
          isCfdiValidated: true,
          updatedAt: new Date().toISOString()
        });

        await ticketRef.update({
          status: "cfdi_validated",
          invoiceId,
          updatedAt: new Date().toISOString()
        });

        await createRunnerLog(jobId, ticketId, "INFO", "Validación local y SAT completada con éxito (Vigente). Factura obtenida.");
        printE2EResult(true, ticketId, jobId, connector, xmlResult, satResult, "succeeded", "cfdi_validated", "cfdi_validated", true, true, true, { xml: xmlDest, pdf: lockedJob.pdfHtml ? `users/${lockedJob.userId}/tickets/${ticketId}/cfdi.pdf` : null });
        setActiveJobContext(null, null, null, null);
        return;
      } else {
        if (satResult.status === "Cancelado") {
          await jobRef.update({
            status: "failed",
            lastError: "La factura aparece como Cancelada en los controles del SAT.",
            lastErrorTime: new Date().toISOString(),
            attempts: FieldValue.increment(1),
            updatedAt: new Date().toISOString()
          });

          await invRef.update({
            status: "sat_validation_failed",
            validationStatus: "cancelled",
            isCfdiValidated: false,
            updatedAt: new Date().toISOString()
          });

          const errorCode = "CFDI_CANCELLED_IN_SAT";
          const blocker = ERROR_CATALOG[errorCode];

          await ticketRef.update({
            status: "requires_manual_review",
            invoiceId,
            errorMsg: blocker.userMessage,
            reviewReasonCode: errorCode,
            reviewError: getSafeReviewError(
              errorCode,
              blocker.userMessage,
              currentStage,
              blocker.retryable !== undefined ? blocker.retryable : false,
              blocker.requiresHumanReview !== undefined ? blocker.requiresHumanReview : true
            ),
            updatedAt: new Date().toISOString()
          });

          await createRunnerLog(jobId, ticketId, "ERROR", `Factura cancelada ante el SAT en reintento. (Código: ${errorCode})`);
          setActiveJobContext(null, null, null, null);
          return;
        } else if (satResult.status === "Unknown" || satResult.status === "Error") {
          await jobRef.update({
            status: "failed",
            lastError: satResult.error || `Fallo de validación SAT con estado: ${satResult.status}`,
            lastErrorTime: new Date().toISOString(),
            attempts: FieldValue.increment(1),
            updatedAt: new Date().toISOString()
          });

          await invRef.update({
            status: "sat_validation_failed",
            validationStatus: "failed",
            isCfdiValidated: false,
            updatedAt: new Date().toISOString()
          });

          const errorCode = "CFDI_VALIDATION_FAILED";
          const blocker = ERROR_CATALOG[errorCode];

          await ticketRef.update({
            status: "requires_manual_review",
            invoiceId,
            errorMsg: blocker.userMessage,
            reviewReasonCode: errorCode,
            reviewError: getSafeReviewError(
              errorCode,
              blocker.userMessage,
              currentStage,
              blocker.retryable !== undefined ? blocker.retryable : false,
              blocker.requiresHumanReview !== undefined ? blocker.requiresHumanReview : true
            ),
            updatedAt: new Date().toISOString()
          });

          await createRunnerLog(jobId, ticketId, "ERROR", `Procesamiento fallido por validación SAT en reintento: ${blocker.userMessage} (Código: ${errorCode})`);
          setActiveJobContext(null, null, null, null);
          return;
        } else {
          const previousAttemptCount = Number(lockedJob.satAttemptCount || 0);
          const currentAttemptCount = previousAttemptCount + 1;

          if (currentAttemptCount < 3) {
            const delayHours = currentAttemptCount === 1 ? 2 : 6;
            const nextSatValidationAt = Timestamp.fromDate(new Date(Date.now() + delayHours * 60 * 60 * 1000));

            await jobRef.update({
              status: "validating_sat",
              satAttemptCount: currentAttemptCount,
              nextSatValidationAt,
              satValidationStatus: "pending",
              lastSatStatus: satResult.status,
              lockedBy: null,
              lockedAt: null,
              updatedAt: new Date().toISOString()
            });

            await ticketRef.update({
              status: "sat_validation_pending",
              invoiceId,
              errorMsg: "La factura fue generada por el portal, pero todavía no aparece como CFDI válido en el SAT.",
              updatedAt: new Date().toISOString()
            });

            await invRef.update({
              status: "sat_validation_pending",
              validationStatus: "pending",
              isCfdiValidated: false,
              updatedAt: new Date().toISOString()
            });

             await createRunnerLog(jobId, ticketId, "WARNING", `Validación SAT pendiente en reintento. Estado SAT: ${satResult.status}. Intento ${currentAttemptCount}/3 completado.`);
             printE2EResult(true, ticketId, jobId, connector, xmlResult, satResult, "validating_sat", "sat_validation_pending", "sat_validation_pending", false, true, true, { xml: xmlDest, pdf: lockedJob.pdfHtml ? `users/${lockedJob.userId}/tickets/${ticketId}/cfdi.pdf` : null });
             setActiveJobContext(null, null, null, null);
             return;
          } else {
            const errorCode = satResult.status === "No Encontrado" ? "CFDI_NOT_FOUND_IN_SAT" : "SAT_VALIDATION_TIMEOUT";
            const blocker = ERROR_CATALOG[errorCode];

            await jobRef.update({
              status: "failed",
              satAttemptCount: currentAttemptCount,
              lastError: satResult.status === "No Encontrado" ? "CFDI no localizado en los controles del SAT" : "La consulta al SAT excedió el tiempo de espera.",
              lastErrorTime: new Date().toISOString(),
              attempts: FieldValue.increment(1),
              updatedAt: new Date().toISOString()
            });

            await invRef.update({
              status: "sat_validation_failed",
              validationStatus: "failed",
              isCfdiValidated: false,
              updatedAt: new Date().toISOString()
            });

            await ticketRef.update({
              status: "requires_manual_review",
              invoiceId,
              errorMsg: blocker.userMessage,
              reviewReasonCode: errorCode,
              reviewError: getSafeReviewError(
                errorCode,
                blocker.userMessage,
                currentStage,
                blocker.retryable !== undefined ? blocker.retryable : true,
                blocker.requiresHumanReview !== undefined ? blocker.requiresHumanReview : true
              ),
              updatedAt: new Date().toISOString()
            });

            await createRunnerLog(jobId, ticketId, "ERROR", `Procesamiento fallido por validación SAT en reintento: ${blocker.userMessage} (Código: ${errorCode}). Total intentos: ${currentAttemptCount}.`);
            printE2EResult(false, ticketId, jobId, connector, xmlResult, satResult, "failed", "requires_manual_review", "sat_validation_failed", false, true, true, { xml: xmlDest, pdf: lockedJob.pdfHtml ? `users/${lockedJob.userId}/tickets/${ticketId}/cfdi.pdf` : null }, { code: errorCode, message: blocker.userMessage });
            setActiveJobContext(null, null, null, null);
            return;
          }
        }
      }
    }

    // ----------------------------------------------------
    // FLOW B: Standard execution mapping (first time download)
    // ----------------------------------------------------
    await jobRef.update({
      status: "running",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await ticketRef.update({
      status: "runner_processing",
      updatedAt: new Date().toISOString()
    });

    await createRunnerLog(jobId, ticketId, "INFO", "Iniciando descarga y navegación en el portal.");

    // 3. Fetch portalMap
    currentModule = "connector_loader";
    if (!lockedJob.portalMapId) {
      throw { message: "Mapa de navegación no encontrado.", code: "PORTAL_MAP_NOT_FOUND" };
    }
    const portalMapDoc = await db.collection("portal_maps").doc(lockedJob.portalMapId).get();
    if (!portalMapDoc.exists) throw { message: "Mapa de navegación no encontrado.", code: "PORTAL_MAP_NOT_FOUND" };
    const portalMap = portalMapDoc.data();
    if (!portalMap || portalMap.connectorId !== lockedJob.connectorId) {
      throw { message: "El mapa no pertenece al conector del job.", code: "CONNECTOR_SCHEMA_INVALID" };
    }

    // Uniaxially normalize ticket dates and inputs
    const normalized = normalizeBillingAttemptFields(lockedJob.ticketDataSnapshot, null, lockedJob.fiscalProfileSnapshot, portalMap);
    if (!lockedJob.ticketDataSnapshot.portalFields) {
      lockedJob.ticketDataSnapshot.portalFields = {};
    }
    if (normalized.fechaCompra) {
      lockedJob.ticketDataSnapshot.portalFields.fecha = normalized.fechaCompra;
    }
    if (normalized.folio) {
      lockedJob.ticketDataSnapshot.portalFields.billingReference = normalized.folio;
    }
    if (normalized.itu) {
      lockedJob.ticketDataSnapshot.portalFields.venta = normalized.itu;
    }
    if (normalized.total) {
      lockedJob.ticketDataSnapshot.portalFields.total = normalized.total;
    }
    const isApproved = portalMap.isApproved === true || portalMap.status === "approved";
    if (!isApproved) {
      // Whitelist override: check if the job is explicitly whitelisted for E2E testing
      const isAllowedE2E = process.env.LOCAL_E2E_MODE === "true" && 
        (String(process.env.LOCAL_E2E_ALLOWED_JOB_IDS).split(",").map(s => s.trim()).includes(jobId) ||
         String(process.env.LOCAL_E2E_ALLOWED_TICKET_IDS).split(",").map(s => s.trim()).includes(ticketId));

      const requiredFields = portalMap.requiredFields || [];
      const ticketFields = lockedJob.ticketDataSnapshot?.portalFields || {};
      const fiscalProfile = lockedJob.fiscalProfileSnapshot || {};
      
      const missingFields: string[] = [];

      for (const field of requiredFields) {
        const key = typeof field === "string" ? field : (field.key || "");
        if (!key) continue;

        const isFiscal = key.startsWith("fiscalProfile.");
        const cleanKey = key.replace(/^(portalFields\.|fiscalProfile\.)/, "");

        const value = isFiscal ? fiscalProfile[cleanKey] : ticketFields[cleanKey];

        const empty = value === undefined || value === null || String(value).trim() === "";
        if (empty) {
          missingFields.push(key);
        }
      }

      if (missingFields.length > 0) {
        throw {
          code: "JIT_FIELD_CONTRACT_MISMATCH",
          message: `El mapa JIT requiere los campos: ${missingFields.join(", ")}, pero no están presentes en el ticket/perfil fiscal.`
        };
      }

      // Check if the portal map is generated from a generic template or has unverified structure
      if (portalMap.isGenericTemplate === true || !portalMap.steps || portalMap.steps.length === 0) {
        throw {
          code: "JIT_FIELD_CONTRACT_MISMATCH",
          message: "El mapa JIT está basado en una plantilla genérica no aprobada o carece de pasos de navegación válidos."
        };
      }

      // Check JIT confidence (if stored in metadata)
      if (portalMap.metadata?.confidence !== undefined && portalMap.metadata.confidence < 0.8) {
        throw {
          code: "JIT_FIELD_CONTRACT_MISMATCH",
          message: `El motor JIT tiene baja confianza en el mapeo de campos (${portalMap.metadata.confidence * 100}%).`
        };
      }

      // If all JIT contract checks pass, but it is NOT whitelisted and NOT approved: fail closed!
      if (!isAllowedE2E) {
        throw { message: "El mapa de navegación no está aprobado.", code: "PORTAL_MAP_NOT_APPROVED" };
      }
    }

    // 4. Run navigation
    tracker.trackStage("portal_map_loaded", "success");
    await createDiagnosticEvent(tracker.getEvents()[tracker.getEvents().length - 1]);
    currentStage = "browser_launch";
    setActiveStage(currentStage);
    currentStage = "portal_navigation";
    setActiveStage(currentStage);
    currentModule = "navigator";
    const result = await executePortalMap(
      jobId,
      ticketId,
      portalMap,
      connector,
      lockedJob.ticketDataSnapshot,
      lockedJob.fiscalProfileSnapshot
    );

    if (result.paused) {
      tracker.trackStage("captcha_waiting_user", "warning");
      await createDiagnosticEvent(tracker.getEvents()[tracker.getEvents().length - 1]);
      const summary = buildDiagnosticSummary(ticketId, jobId, tracker.getEvents());
      await persistDiagnosticSummary(ticketId, summary);

      // Pause the execution!
      await jobRef.update({
        status: "waiting_user_input",
        currentStepIndex: result.stepIndex,
        waitingForFields: result.waitingForFields || [],
        canResume: true,
        lockedBy: null,
        lockedAt: null,
        updatedAt: new Date().toISOString()
      });

      await ticketRef.update({
        status: "waiting_fiscal_profile",
        reviewReasonCode: "MISSING_FISCAL_PROFILE",
        errorMsg: "El portal necesita tus datos fiscales para continuar con la factura.",
        missingFields: result.waitingForFields || [],
        updatedAt: new Date().toISOString()
      });

      await createRunnerLog(jobId, ticketId, "INFO", `Ejecución pausada esperando datos del usuario: ${result.waitingForFields?.join(", ")}`);
      setActiveJobContext(null, null, null, null);
      return;
    }

    if (!result.success) {
      if (result.alreadyInvoiced && result.downloadedXmlPath && fs.existsSync(result.downloadedXmlPath)) {
        console.log("[Runner] Special Branch: Already Invoiced XML successfully recovered. Proceeding to validate...");
        result.xmlContent = fs.readFileSync(result.downloadedXmlPath, "utf-8");
      } else {
        const errObj: any = {
          message: result.error || "Fallo en la navegación del portal.",
          code: result.errorCode || "UNKNOWN_RUNNER_ERROR",
          screenshotPath: result.screenshotPath,
          stepIndex: result.stepIndex,
          maskedReference: result.maskedReference,
          rawPortalMessage: result.rawPortalMessage,
          portalMessageSource: result.portalMessageSource,
          portalMessageSelector: result.portalMessageSelector,
          classificationConfidence: result.classificationConfidence,
          alreadyInvoiced: result.alreadyInvoiced,
          recoveryAttempted: result.recoveryAttempted,
          downloadedXmlPath: result.downloadedXmlPath,
          downloadedPdfPath: result.downloadedPdfPath,
          portalMessage: result.portalMessage,
          wasAlreadyInvoiced: result.wasAlreadyInvoiced
        };
        if (result.errorCode === "PERIOD_EXPIRED") {
          errObj.module = "verifier";
        }
        throw errObj;
      }
    }

    // 5. XML Structural validation
    currentStage = "cfdi_validation";
    setActiveStage(currentStage);
    currentModule = "downloader";
    await createRunnerLog(jobId, ticketId, "INFO", "Revisión estructural del XML descargado.");
    const xmlResult = validateCfdiXml(
      result.xmlContent || "",
      connector.rfc,
      lockedJob.fiscalProfileSnapshot.rfc,
      lockedJob.ticketDataSnapshot.expectedTicketTotal
    );

    if (!xmlResult.isValid) {
      throw { message: "El XML descargado no pasó las pruebas estructurales locales.", code: xmlResult.error || "XML_STRUCTURE_INVALID" };
    }

    // 6. Upload XML/PDF to Storage
    currentStage = "storage_upload";
    setActiveStage(currentStage);
    const xmlDest = `users/${lockedJob.userId}/tickets/${ticketId}/cfdi.xml`;
    const tempXmlPath = result.downloadedXmlPath || "";
    await bucket.upload(tempXmlPath, {
      destination: xmlDest,
      metadata: { contentType: "text/xml" }
    });
    await createRunnerLog(jobId, ticketId, "INFO", `XML subido de forma segura a Storage: ${xmlDest}`);

    let pdfDest: string | null = null;
    const tempPdfPath = result.downloadedPdfPath || "";
    if (tempPdfPath && fs.existsSync(tempPdfPath)) {
      pdfDest = `users/${lockedJob.userId}/tickets/${ticketId}/cfdi.pdf`;
      await bucket.upload(tempPdfPath, {
        destination: pdfDest,
        metadata: { contentType: "application/pdf" }
      });
      await createRunnerLog(jobId, ticketId, "INFO", `PDF subido de forma segura a Storage: ${pdfDest}`);
    }

    // Clean up temporary local directory
    try {
      const tmpDir = path.join(require("os").tmpdir(), "zenticket-runner", jobId);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}

    // Succeeded!
    // Succeeded!
    currentStage = "firestore_update";
    setActiveStage(currentStage);
    const invoiceId = xmlResult.uuid || db.collection("users").doc(lockedJob.userId).collection("invoices").doc().id;
    const invRef = db.collection("users").doc(lockedJob.userId).collection("invoices").doc(invoiceId);
    
    let ticketData: any = {};
    try {
      const ticketSnap = await ticketRef.get();
      if (ticketSnap.exists) {
        ticketData = ticketSnap.data() || {};
      }
    } catch (e) {
      console.warn(`[Runner] Error fetching ticket for invoice sync: ${e instanceof Error ? e.message : String(e)}`);
    }

    const invoicePayload: any = {
      userId: lockedJob.userId,
      ticketId,
      sourceTicketId: ticketId,
      xmlContent: result.xmlContent,
      pdfHtml: result.pdfHtml || null,
      folioFiscal: xmlResult.uuid,
      rfcEmisor: xmlResult.rfcEmisor,
      nombreEmisor: connector.nombre,
      rfcReceptor: xmlResult.rfcReceptor,
      nombreReceptor: lockedJob.fiscalProfileSnapshot.razonSocial,
      total: xmlResult.total,
      regimenFiscalEmisor: xmlResult.regimenFiscalEmisor || null,
      regimenFiscalReceptor: xmlResult.regimenFiscalReceptor || null,
      usoCfdiReceptor: xmlResult.usoCfdiReceptor || null,
      lugarExpedicion: xmlResult.lugarExpedicion || null,
      formaPago: xmlResult.formaPago || null,
      noCertificadoSAT: xmlResult.noCertificadoSAT || null,
      createdAt: new Date().toISOString(),
      status: "sat_validation_pending",
      validationStatus: "pending",
      isCfdiValidated: false,
      // Synchronized fields from related ticket
      wasAlreadyInvoiced: !!result.wasAlreadyInvoiced || !!ticketData.wasAlreadyInvoiced,
      reviewReasonCode: ticketData.reviewReasonCode || null,
      reviewError: ticketData.reviewError || null,
      errorCode: ticketData.errorCode || null,
      expectedTicketTotal: ticketData.expectedTicketTotal || ticketData.total || 0
    };

    if (ticketData.status === "failed_blocking" || ticketData.status === "requires_manual_review") {
      invoicePayload.status = "requires_manual_review";
      invoicePayload.validationStatus = "invalid";
      invoicePayload.isCfdiValidated = false;
    }

    await invRef.set(invoicePayload);

    currentStage = "sat_verification";
    setActiveStage(currentStage);
    let isSatValid = false;
    let satResult: SatVerificationResult = { isValid: false, status: "Unknown" };
    try {
      satResult = await verifySatCfdi(
        xmlResult.rfcEmisor || "",
        xmlResult.rfcReceptor || "",
        xmlResult.total ?? 0,
        xmlResult.uuid || ""
      );
      isSatValid = satResult.isValid;
    } catch (satErr: any) {
      console.warn(`[Runner] Error validating CFDI with SAT in Flow B: ${satErr.message}`);
      satResult = { isValid: false, status: "Error", error: satErr.message };
    }

    if (isSatValid) {
      await jobRef.update({
        status: "succeeded",
        result: {
          xmlStoragePath: xmlDest,
          pdfStoragePath: pdfDest,
          uuid: xmlResult.uuid
        },
        wasAlreadyInvoiced: !!result.wasAlreadyInvoiced,
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      await invRef.update({
        status: "cfdi_validated",
        isCfdiValidated: true,
        cfdiValidated: true,
        satValidated: true,
        satStatus: "vigente",
        estadoCfdi: "Vigente",
        validationStatus: "sat_validated",
        synthetic: false,
        jobId: jobId,
        xmlStoragePath: xmlDest || null,
        pdfStoragePath: pdfDest || null,
        wasAlreadyInvoiced: !!result.wasAlreadyInvoiced,
        updatedAt: new Date().toISOString()
      });

      const ticketUpdates: any = {
        status: "cfdi_validated",
        isCfdiValidated: true,
        cfdiValidated: true,
        satValidated: true,
        validationStatus: "sat_validated",
        invoiceId,
        wasAlreadyInvoiced: !!result.wasAlreadyInvoiced,
        reviewReasonCode: null,
        updatedAt: new Date().toISOString()
      };

      if (ticketData.reviewError) {
        ticketUpdates.previousReviewError = ticketData.reviewError;
        ticketUpdates.reviewError = null;
      }

      await ticketRef.update(ticketUpdates);

      await db.collection("connectors").doc(lockedJob.connectorId).set({
        totalExecutions: FieldValue.increment(1),
        successCount: FieldValue.increment(1),
        lastSuccessAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      await saveExecutionMemory(db, { ...connector, id: lockedJob.connectorId }, portalMap, result);

      tracker.trackStage("ticket_completed", "success");
      await createDiagnosticEvent(tracker.getEvents()[tracker.getEvents().length - 1]);
      const summary = buildDiagnosticSummary(ticketId, jobId, tracker.getEvents());
      await persistDiagnosticSummary(ticketId, summary);

      await createRunnerLog(jobId, ticketId, "INFO", "Procesamiento finalizado exitosamente. Factura obtenida y validada ante el SAT (Vigente).");
      printE2EResult(true, ticketId, jobId, connector, xmlResult, satResult, "succeeded", "cfdi_validated", "cfdi_validated", true, true, true, { xml: xmlDest, pdf: pdfDest });
      setActiveJobContext(null, null, null, null);
    } else {
      if (satResult.status === "Cancelado") {
        await jobRef.update({
          status: "failed",
          lastError: "La factura aparece como Cancelada en los controles del SAT.",
          lastErrorTime: new Date().toISOString(),
          attempts: FieldValue.increment(1),
          updatedAt: new Date().toISOString()
        });

        await invRef.update({
          status: "sat_validation_failed",
          validationStatus: "cancelled",
          isCfdiValidated: false,
          updatedAt: new Date().toISOString()
        });

        const errorCode = "CFDI_CANCELLED_IN_SAT";
        const blocker = ERROR_CATALOG[errorCode];

        await ticketRef.update({
          status: "requires_manual_review",
          invoiceId,
          errorMsg: blocker.userMessage,
          reviewReasonCode: errorCode,
          reviewError: getSafeReviewError(
            errorCode,
            blocker.userMessage,
            currentStage,
            blocker.retryable !== undefined ? blocker.retryable : false,
            blocker.requiresHumanReview !== undefined ? blocker.requiresHumanReview : true
          ),
          updatedAt: new Date().toISOString()
        });

        tracker.trackStage("sat_validation_failed", "failed", { errorCode: "CFDI_CANCELLED_IN_SAT" });
        await createDiagnosticEvent(tracker.getEvents()[tracker.getEvents().length - 1]);
        const summary = buildDiagnosticSummary(ticketId, jobId, tracker.getEvents());
        await persistDiagnosticSummary(ticketId, summary);

        await createRunnerLog(jobId, ticketId, "ERROR", `Factura cancelada ante el SAT. (Código: ${errorCode})`);
        setActiveJobContext(null, null, null, null);
      } else if (satResult.status === "Unknown" || satResult.status === "Error") {
        await jobRef.update({
          status: "failed",
          lastError: satResult.error || `Fallo de validación SAT con estado: ${satResult.status}`,
          lastErrorTime: new Date().toISOString(),
          attempts: FieldValue.increment(1),
          updatedAt: new Date().toISOString()
        });

        await invRef.update({
          status: "sat_validation_failed",
          validationStatus: "failed",
          isCfdiValidated: false,
          updatedAt: new Date().toISOString()
        });

        const errorCode = "CFDI_VALIDATION_FAILED";
        const blocker = ERROR_CATALOG[errorCode];

        await ticketRef.update({
          status: "requires_manual_review",
          invoiceId,
          errorMsg: blocker.userMessage,
          reviewReasonCode: errorCode,
          reviewError: getSafeReviewError(
            errorCode,
            blocker.userMessage,
            currentStage,
            blocker.retryable !== undefined ? blocker.retryable : false,
            blocker.requiresHumanReview !== undefined ? blocker.requiresHumanReview : true
          ),
          updatedAt: new Date().toISOString()
        });

        tracker.trackStage("sat_validation_failed", "failed", { errorCode: "CFDI_VALIDATION_FAILED" });
        await createDiagnosticEvent(tracker.getEvents()[tracker.getEvents().length - 1]);
        const summary = buildDiagnosticSummary(ticketId, jobId, tracker.getEvents());
        await persistDiagnosticSummary(ticketId, summary);

        await createRunnerLog(jobId, ticketId, "ERROR", `Procesamiento fallido por validación SAT: ${blocker.userMessage} (Código: ${errorCode})`);
        setActiveJobContext(null, null, null, null);
      } else {
        const previousAttemptCount = Number(lockedJob.satAttemptCount || 0);
        const currentAttemptCount = previousAttemptCount + 1;

        if (currentAttemptCount < 3) {
          const delayHours = currentAttemptCount === 1 ? 2 : 6;
          const nextSatValidationAt = Timestamp.fromDate(new Date(Date.now() + delayHours * 60 * 60 * 1000));

          await jobRef.update({
            status: "validating_sat",
            satAttemptCount: currentAttemptCount,
            nextSatValidationAt,
            satValidationStatus: "pending",
            lastSatStatus: satResult.status,
            lockedBy: null,
            lockedAt: null,
            updatedAt: new Date().toISOString()
          });

          await ticketRef.update({
            status: "sat_validation_pending",
            invoiceId,
            errorMsg: "La factura fue generada por el portal, pero todavía no aparece como CFDI válido en el SAT.",
            updatedAt: new Date().toISOString()
          });

          await invRef.update({
            status: "sat_validation_pending",
            validationStatus: "pending",
            isCfdiValidated: false,
            updatedAt: new Date().toISOString()
          });

          tracker.trackStage("sat_validation_started", "warning", { errorCode: "SAT_VALIDATION_PENDING" });
          await createDiagnosticEvent(tracker.getEvents()[tracker.getEvents().length - 1]);
          const summary = buildDiagnosticSummary(ticketId, jobId, tracker.getEvents());
          await persistDiagnosticSummary(ticketId, summary);

          await createRunnerLog(jobId, ticketId, "WARNING", `Validación SAT pendiente. Estado SAT: ${satResult.status}. Intento ${currentAttemptCount}/3 completado.`);
          printE2EResult(true, ticketId, jobId, connector, xmlResult, satResult, "validating_sat", "sat_validation_pending", "sat_validation_pending", false, true, true, { xml: xmlDest, pdf: pdfDest });
          setActiveJobContext(null, null, null, null);
        } else {
          const errorCode = satResult.status === "No Encontrado" ? "CFDI_NOT_FOUND_IN_SAT" : "SAT_VALIDATION_TIMEOUT";
          const blocker = ERROR_CATALOG[errorCode];

          await jobRef.update({
            status: "failed",
            satAttemptCount: currentAttemptCount,
            lastError: satResult.status === "No Encontrado" ? "CFDI no localizado en los controles del SAT" : "La consulta al SAT excedió el tiempo de espera.",
            lastErrorTime: new Date().toISOString(),
            attempts: FieldValue.increment(1),
            updatedAt: new Date().toISOString()
          });

          await invRef.update({
            status: "sat_validation_failed",
            validationStatus: "failed",
            isCfdiValidated: false,
            updatedAt: new Date().toISOString()
          });

          await ticketRef.update({
            status: "requires_manual_review",
            invoiceId,
            errorMsg: blocker.userMessage,
            reviewReasonCode: errorCode,
            reviewError: getSafeReviewError(
              errorCode,
              blocker.userMessage,
              currentStage,
              blocker.retryable !== undefined ? blocker.retryable : true,
              blocker.requiresHumanReview !== undefined ? blocker.requiresHumanReview : true
            ),
            updatedAt: new Date().toISOString()
          });

          tracker.trackStage("sat_validation_failed", "failed", { errorCode });
          await createDiagnosticEvent(tracker.getEvents()[tracker.getEvents().length - 1]);
          const summary = buildDiagnosticSummary(ticketId, jobId, tracker.getEvents());
          await persistDiagnosticSummary(ticketId, summary);

          await createRunnerLog(jobId, ticketId, "ERROR", `Procesamiento fallido por validación SAT: ${blocker.userMessage} (Código: ${errorCode}). Total intentos: ${currentAttemptCount}.`);
          printE2EResult(false, ticketId, jobId, connector, xmlResult, satResult, "failed", "requires_manual_review", "sat_validation_failed", false, true, true, { xml: xmlDest, pdf: pdfDest }, { code: errorCode, message: blocker.userMessage });
          setActiveJobContext(null, null, null, null);
        }
      }
    }
  } catch (err: any) {
    console.error("[processJob Catch] Raw error:", err);
    if (err && typeof err === "object" && !err.module) {
      err.module = currentModule;
    }
    const mappedError = mapToRunnerError(err);
    currentStage = mapErrorCodeToStage(mappedError.code, currentStage);
    setActiveStage(currentStage);
    console.log("[processJob Catch] Mapped error:", { code: mappedError.code, message: mappedError.message });
    const errorCode = mappedError.code;
    const errorMessage = mappedError.message;
    const retryCount = Number(lockedJob.retryCount || 0);

    const wasAlreadyInvoiced = !!err.wasAlreadyInvoiced || errorCode === "TICKET_ALREADY_INVOICED" || !!err.alreadyInvoiced;
    const captchaDetected = errorCode === "CAPTCHA_DETECTED" || errorCode === "CAPTCHA_REQUIRED";

    const diagnostic = createDiagnosticSnapshot({
      userId: lockedJob.userId,
      ticketId,
      jobId,
      connectorId: lockedJob.connectorId,
      portalMapId: lockedJob.portalMapId || lockedJob.connectorId,
      stage: currentStage,
      errorCode,
      friendlyMessage: getFriendlyMessage(errorCode),
      technicalMessage: mappedError.technicalMessage || errorMessage,
      rawMessage: mappedError.rawPortalMessage || errorMessage,
      retryable: mappedError.retryable ?? false,
      blocking: mappedError.severity === "critical",
      shouldAutoRetry: shouldAutoRetry(errorCode, retryCount),
      attemptNumber: retryCount + 1,
      satAttemptCount: lockedJob.satAttemptCount || 0,
      wasAlreadyInvoiced,
      captchaDetected,
      xmlDownloaded: currentStage === "completed" || currentStage === "sat_verification" || currentStage === "storage_upload" || currentStage === "firestore_update",
      pdfDownloaded: (currentStage === "completed" || currentStage === "sat_verification" || currentStage === "storage_upload" || currentStage === "firestore_update") && !!lockedJob.pdfHtml,
      cfdiValidated: currentStage === "completed" || currentStage === "sat_verification" || currentStage === "storage_upload" || currentStage === "firestore_update",
      satValidated: currentStage === "completed",
      sourceFile: mappedError.module || "runner",
      functionName: mappedError.name || "processJob"
    });

    await createRunnerLog(jobId, ticketId, "ERROR", `Procesamiento fallido: ${errorMessage} (Código: ${errorCode})`, diagnostic);
    setActiveJobContext(null, null, null, null);
    printE2EResult(false, ticketId, jobId, connector, null, null, "failed", "requires_manual_review", "failed", false, false, false, { xml: "", pdf: null }, err);

    if (errorCode === "MISSING_FISCAL_PROFILE_DATA" || errorCode === "INVALID_FISCAL_PROFILE_DATA") {
      await jobRef.update({
        status: "failed",
        lastError: errorMessage,
        lastErrorTime: new Date().toISOString(),
        attempts: FieldValue.increment(1),
        updatedAt: new Date().toISOString()
      });

      await ticketRef.update({
        status: "waiting_fiscal_profile",
        errorMsg: errorMessage,
        reviewReasonCode: errorCode,
        updatedAt: new Date().toISOString()
      });
      return;
    }

    if (errorCode === "TICKET_TOO_NEW") {
      const merchantSyncMessage = "El comercio todavía está validando este ticket. Podrás reintentarlo más tarde.";
      await jobRef.update({
        status: "waiting_merchant_sync",
        lastError: merchantSyncMessage,
        lastErrorTime: new Date().toISOString(),
        lockedBy: null,
        lockedAt: null,
        updatedAt: new Date().toISOString()
      });
      await ticketRef.update({
        status: "waiting_merchant_sync",
        errorMsg: merchantSyncMessage,
        reviewReasonCode: "TICKET_TOO_NEW",
        updatedAt: new Date().toISOString()
      });
      return;
    }

    if (wasAlreadyInvoiced) {
      const recoveryAttemptCount = Number(lockedJob.recoveryAttemptCount || 0) + 1;
      const maxRecoveryAttempts = Number(lockedJob.maxRecoveryAttempts || 3);
      const portalMessage = err.portalMessage || err.message || errorMessage;

      const recoveryPathsTried = err.recoveryPathsTried || null;
      const recoveryButtonsClicked = err.recoveryButtonsClicked || null;
      const recoveryFormsDetected = err.recoveryFormsDetected || null;
      const nextRecommendedAction = err.nextRecommendedAction || "El portal indica que ya existe una factura, pero no se encontró ruta de descarga XML. Reintentar recuperación o revisar manualmente.";

      const normFields = normalizeBillingAttemptFields(lockedJob.ticketDataSnapshot, null, lockedJob.fiscalProfileSnapshot);
      const duplicateReference = normFields.folio || lockedJob.ticketDataSnapshot.folio || "S/D";

      if (recoveryAttemptCount < maxRecoveryAttempts) {
        // Schedule next retry!
        const delayMinutes = 15 * recoveryAttemptCount; // 15m, 30m, 45m
        const nextRecoveryAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();

        await jobRef.update({
          status: "invoice_recovery_pending",
          retryCount: retryCount + 1,
          recoveryAttemptCount,
          maxRecoveryAttempts,
          nextRecoveryAt,
          lastRecoveryAt: new Date().toISOString(),
          lastRecoveryError: errorMessage,
          wasAlreadyInvoiced: true,
          portalMessage,
          recoveryPathsTried,
          recoveryButtonsClicked,
          recoveryFormsDetected,
          nextRecommendedAction,
          duplicateDetected: true,
          duplicateBasis: "portal_message",
          duplicateReference,
          duplicatePortalMessage: portalMessage,
          duplicateIsFiscalProof: false,
          lockedBy: null,
          lockedAt: null,
          updatedAt: new Date().toISOString()
        });

        await ticketRef.update({
          status: "invoice_recovery_pending",
          errorMsg: `El portal indica que este ticket ya fue facturado. ZenTicket está intentando recuperar el XML/PDF. (Intento ${recoveryAttemptCount}/${maxRecoveryAttempts})`,
          reviewReasonCode: "TICKET_ALREADY_INVOICED",
          errorCode: "TICKET_ALREADY_INVOICED",
          recoveryAttemptCount,
          maxRecoveryAttempts,
          nextRecoveryAt,
          lastRecoveryAt: new Date().toISOString(),
          lastRecoveryError: errorMessage,
          portalMessage,
          wasAlreadyInvoiced: true,
          recoveryPathsTried,
          recoveryButtonsClicked,
          recoveryFormsDetected,
          nextRecommendedAction,
          duplicateDetected: true,
          duplicateBasis: "portal_message",
          duplicateReference,
          duplicatePortalMessage: portalMessage,
          duplicateIsFiscalProof: false,
          updatedAt: new Date().toISOString()
        });

        await createRunnerLog(jobId, ticketId, "WARNING", `Reintento de recuperación programado para ${nextRecoveryAt}. Intento ${recoveryAttemptCount}/${maxRecoveryAttempts}.`, {
          recoveryAttemptCount,
          errorCode
        });
        return;
      } else {
        // Attempts exhausted!
        await jobRef.update({
          status: "failed",
          recoveryAttemptCount,
          maxRecoveryAttempts,
          lastRecoveryAt: new Date().toISOString(),
          lastRecoveryError: errorMessage,
          wasAlreadyInvoiced: true,
          portalMessage,
          recoveryPathsTried,
          recoveryButtonsClicked,
          recoveryFormsDetected,
          nextRecommendedAction,
          duplicateDetected: true,
          duplicateBasis: "portal_message",
          duplicateReference,
          duplicatePortalMessage: portalMessage,
          duplicateIsFiscalProof: false,
          updatedAt: new Date().toISOString()
        });

        await ticketRef.update({
          status: "already_invoiced_unverified",
          errorMsg: "El portal indica que este ticket ya fue facturado, pero ZenTicket no pudo recuperar ni validar el XML fiscal.",
          reviewReasonCode: "ALREADY_INVOICED_XML_NOT_RECOVERED",
          reviewError: getSafeReviewError(
            "ALREADY_INVOICED_XML_NOT_RECOVERED",
            "El portal indica que este ticket ya fue facturado, pero ZenTicket no pudo recuperar ni validar el XML fiscal.",
            currentStage,
            false,
            true
          ),
          recoveryAttemptCount,
          maxRecoveryAttempts,
          lastRecoveryAt: new Date().toISOString(),
          lastRecoveryError: errorMessage,
          portalMessage,
          wasAlreadyInvoiced: true,
          errorCode: "ALREADY_INVOICED_XML_NOT_RECOVERED",
          recoveryPathsTried,
          recoveryButtonsClicked,
          recoveryFormsDetected,
          nextRecommendedAction,
          duplicateDetected: true,
          duplicateBasis: "portal_message",
          duplicateReference,
          duplicatePortalMessage: portalMessage,
          duplicateIsFiscalProof: false,
          updatedAt: new Date().toISOString()
        });

        await createRunnerLog(jobId, ticketId, "ERROR", `Intentos de recuperación agotados (${recoveryAttemptCount}/${maxRecoveryAttempts}). El ticket requiere revisión manual.`);
        return;
      }
    }

    if (shouldAutoRetry(errorCode, retryCount)) {
      await jobRef.update({
        status: "pending",
        retryCount: retryCount + 1,
        lastRetryReason: errorCode,
        lastError: errorMessage,
        lockedBy: null,
        lockedAt: null,
        updatedAt: new Date().toISOString()
      });
      await ticketRef.update({
        status: "queued_for_runner",
        errorMsg: "El portal no respondió como esperábamos. Reintentaremos automáticamente.",
        updatedAt: new Date().toISOString()
      });
      await createRunnerLog(jobId, ticketId, "WARNING", `Reintento automático ${retryCount + 1}/${MAX_AUTO_RETRIES} programado.`, {
        retryCount: retryCount + 1,
        errorCode
      });
      return;
    }

    if (errorCode === "INVALID_PORTAL_FIELD_VALUE") {
      await jobRef.update({
        status: "failed",
        lastError: errorMessage,
        lastErrorTime: new Date().toISOString(),
        attempts: FieldValue.increment(1),
        updatedAt: new Date().toISOString()
      });

      await ticketRef.update({
        status: "missing_required_fields",
        errorMsg: "Necesitamos la referencia de facturación impresa en tu ticket para solicitar la factura.",
        reviewReasonCode: "MISSING_REQUIRED_FIELDS",
        missingFields: ["portalFields.billingReference"],
        reviewError: getSafeReviewError(
          "MISSING_REQUIRED_FIELDS",
          "Necesitamos la referencia de facturación impresa en tu ticket para solicitar la factura.",
          currentStage,
          mappedError.retryable !== undefined ? mappedError.retryable : false,
          mappedError.requiresHumanReview !== undefined ? mappedError.requiresHumanReview : true
        ),
        updatedAt: new Date().toISOString()
      });
      return;
    }

    if (errorCode === "CAPTCHA_DETECTED") {
      await jobRef.update({
        status: "waiting_user_action",
        lastError: errorMessage,
        lastErrorTime: new Date().toISOString(),
        lockedBy: null,
        lockedAt: null,
        updatedAt: new Date().toISOString(),
        ...(err.screenshotPath && { screenshotPath: err.screenshotPath }),
        ...(err.stepIndex !== undefined && { stepIndex: err.stepIndex })
      });
      await ticketRef.update({
        status: "waiting_user_captcha",
        errorMsg: "El portal mostró una verificación humana. Abre el portal oficial para continuar de forma segura.",
        reviewReasonCode: "CAPTCHA_DETECTED",
        reviewError: getSafeReviewError(
          "CAPTCHA_DETECTED",
          "El portal mostró una verificación humana.",
          currentStage,
          mappedError.retryable !== undefined ? mappedError.retryable : true,
          mappedError.requiresHumanReview !== undefined ? mappedError.requiresHumanReview : true
        ),
        updatedAt: new Date().toISOString()
      });
      return;
    }

    const blocker = classifyBlocker(errorCode, errorMessage, retryCount);
    const isRejected = errorCode === "PORTAL_RETURNED_ERROR" || blocker.technicalCode === "TICKET_ALREADY_INVOICED" || blocker.technicalCode === "SAT_RFC_NOT_FOUND";
    const finalJobStatus = isRejected ? "manual_review" : "failed";
    const finalReviewReasonCode = errorCode === "TICKET_ALREADY_INVOICED" || blocker.technicalCode === "TICKET_ALREADY_INVOICED"
      ? "TICKET_ALREADY_INVOICED"
      : isRejected ? "PORTAL_REJECTED_TICKET_DATA" : blocker.technicalCode;

    await jobRef.update({
      status: finalJobStatus,
      lastError: blocker.userMessage,
      lastErrorCode: blocker.technicalCode,
      lastErrorDetails: {
        code: blocker.technicalCode,
        userMessage: blocker.userMessage,
        probableCause: blocker.probableCause || "",
        severity: blocker.severity,
        recommendedAction: blocker.recommendedAction || ""
      },
      lastErrorTime: new Date().toISOString(),
      attempts: FieldValue.increment(1),
      wasAlreadyInvoiced: wasAlreadyInvoiced,
      updatedAt: new Date().toISOString(),
      ...(err.screenshotPath && { screenshotPath: err.screenshotPath }),
      ...(err.stepIndex !== undefined && { stepIndex: err.stepIndex }),
      ...(err.maskedReference && { maskedReference: err.maskedReference })
    });

    await ticketRef.update({
      status: "requires_manual_review",
      errorMsg: blocker.userMessage,
      reviewReasonCode: finalReviewReasonCode,
      reviewError: getSafeReviewError(
        finalReviewReasonCode,
        blocker.userMessage,
        currentStage,
        errorCode === "TICKET_ALREADY_INVOICED" ? false : (mappedError.retryable !== undefined ? mappedError.retryable : true),
        mappedError.requiresHumanReview !== undefined ? mappedError.requiresHumanReview : true
      ),
      wasAlreadyInvoiced: wasAlreadyInvoiced,
      errorCode: finalReviewReasonCode,
      updatedAt: new Date().toISOString()
    });
    await db.collection("connectors").doc(lockedJob.connectorId).set({
      totalExecutions: FieldValue.increment(1),
      failureCount: FieldValue.increment(1),
      updatedAt: new Date().toISOString()
    }, { merge: true });

    tracker.trackStage(
      currentStage as any || "failed_blocking",
      "failed",
      {
        errorCode,
        technicalMessage: mappedError.technicalMessage || errorMessage,
        portalMessage: err.portalMessage || err.rawPortalMessage || null,
        requiresManualReview: true
      }
    );
    await createDiagnosticEvent(tracker.getEvents()[tracker.getEvents().length - 1]);
    const summary = buildDiagnosticSummary(ticketId, jobId, tracker.getEvents());
    await persistDiagnosticSummary(ticketId, summary);
  }
}

async function runWorkerLoop() {
  console.log(`[Runner] Polling invoice_jobs...`);
  try {
    // Stale jobs timeout check (more than 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const staleJobsSnap = await db.collection("invoice_jobs")
      .where("status", "in", ["locked", "running"])
      .get();

    for (const jobDoc of staleJobsSnap.docs) {
      const jd = jobDoc.data();
      const timeField = jd.lockedAt || jd.updatedAt || jd.createdAt;
      if (timeField && timeField < fiveMinutesAgo) {
        console.log(`[Worker: ${workerId}] Encontrado job estancado: ${jobDoc.id}. Aplicando timeout...`);
        const ticketId = jd.ticketId;
        
        await jobDoc.ref.update({
          status: "failed",
          lastErrorCode: "RUNNER_TIMEOUT",
          lastError: "El proceso automático tardó más de lo esperado.",
          lockedBy: null,
          lockedAt: null,
          updatedAt: new Date().toISOString()
        });
        
        await db.collection("tickets").doc(ticketId).update({
          status: "requires_manual_review",
          reviewReasonCode: "RUNNER_TIMEOUT",
          errorMsg: "El proceso automático tardó más de lo esperado.",
          reviewError: {
            reviewReasonCode: "RUNNER_TIMEOUT",
            runnerErrorCode: "RUNNER_TIMEOUT",
            reviewReasonMessage: "El proceso automático tardó más de lo esperado.",
            lastAutomationStep: "runner_processing",
            connectorAttempted: true,
            connectorId: jd.connectorId,
            portalErrorMessage: "El proceso automático tardó más de lo esperado.",

            module: "runner",
            stepIndex: null,
            technicalMessage: "Timeout anti-bloqueo disparado (más de 5 minutos en estado activo).",
            naturalMessage: "El proceso automático tardó más de lo esperado.",
            probableCause: "El servidor del comercio está saturado o la ejecución del robot se detuvo de forma inesperada.",
            recommendedAction: "Reintentar la ejecución. Si el error persiste, revisar el conector.",
            severity: "critical",
            retryable: true,
            requiresHumanReview: true,
            rawPortalMessage: null,
            screenshotPath: null,
            selector: null,
            currentUrl: null,
            timestamp: new Date().toISOString()
          },
          updatedAt: new Date().toISOString()
        });
        
        await createRunnerLog(jobDoc.id, ticketId, "ERROR", "Timeout anti-bloqueo disparado (más de 5 minutos en estado activo).");
      }
    }

    const pendingJobIds = await pollJobs();
    if (pendingJobIds.length > 0) {
      console.log(`[Runner] Pending jobs encontrados: ${pendingJobIds.length}`);
      for (const jobId of pendingJobIds) {
        await processJob(jobId);
      }
    } else {
      console.log(`[Runner] Sin jobs pendientes. Esperando...`);
    }
  } catch (err: any) {
    console.error(`[Runner] Error en loop: ${err.message}`);
  }
  // Run every 5 seconds
  setTimeout(runWorkerLoop, 5000);
}

export const processInvoiceJob = onDocumentCreated(
  {
    document: "invoice_jobs/{jobId}",
    database: databaseId,
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "2GiB",
    retry: false
  },
  async (event: any) => {
    const job = event.data?.data();
    if (!event.params.jobId || job?.status !== "pending") return;
    await processJob(event.params.jobId);
  }
);

export const retryInvoiceJob = onDocumentUpdated(
  {
    document: "invoice_jobs/{jobId}",
    database: databaseId,
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "2GiB",
    retry: false
  },
  async (event: any) => {
    const beforeStatus = event.data?.before?.data()?.status;
    const after = event.data?.after?.data();
    if (!event.params.jobId || after?.status !== "pending" || beforeStatus === "pending") return;
    await processJob(event.params.jobId);
  }
);

function printE2EResult(
  success: boolean,
  ticketId: string,
  jobId: string,
  connector: any,
  xmlResult: any,
  satResult: any,
  finalJobStatus: string,
  finalTicketStatus: string,
  finalInvoiceStatus: string,
  isCfdiValidated: boolean,
  pdfDownloaded: boolean,
  xmlDownloaded: boolean,
  storagePaths: { xml: string; pdf: string | null },
  err?: any
) {
  if (success) {
    const checklist = {
      ticketId,
      invoiceJobId: jobId,
      merchant: connector?.nombre || connector?.name || "",
      portalUrl: connector?.portalUrl || "",
      expectedTicketTotal: String(xmlResult?.expectedTotal || xmlResult?.total || ""),
      ocrTotal: String(xmlResult?.ocrTotal || xmlResult?.total || ""),
      xmlTotal: String(xmlResult?.xmlTotal || xmlResult?.total || ""),
      uuid: xmlResult?.uuid || "",
      rfcEmisor: xmlResult?.rfcEmisor || "",
      rfcReceptor: xmlResult?.rfcReceptor || "",
      xmlHasTimbreFiscalDigital: !!(xmlResult?.hasTimbre || xmlResult?.uuid),
      satStatus: satResult?.status || "Vigente",
      finalJobStatus,
      finalTicketStatus,
      finalInvoiceStatus,
      isCfdiValidated,
      pdfDownloaded,
      xmlDownloaded,
      storagePaths,
      reviewError: null
    };
    console.log("\n=================== E2E SUCCESS CHECKLIST ===================");
    console.log(JSON.stringify(checklist, null, 2));
    console.log("=============================================================\n");
  } else {
    const mapped = err ? mapToRunnerError(err) : null;
    const failureList = {
      ticketId,
      invoiceJobId: jobId,
      failedStep: err?.lastAutomationStep || err?.module || "runner",
      errorCode: err?.code || "UNKNOWN_ERROR",
      rawPortalMessage: err?.rawPortalMessage || err?.message || String(err),
      reviewError: {
        code: err?.code || "UNKNOWN_ERROR",
        module: err?.module || "runner",
        technicalMessage: err?.technicalMessage || err?.message || String(err),
        naturalMessage: mapped?.userMessage || err?.message || String(err),
        probableCause: err?.probableCause || mapped?.probableCause || "",
        recommendedAction: err?.recommendedAction || mapped?.recommendedAction || ""
      }
    };
    console.log("\n=================== E2E FAILURE CHECKLIST ===================");
    console.log(JSON.stringify(failureList, null, 2));
    console.log("=============================================================\n");
  }
}

if (require.main === module) {
  runWorkerLoop();
}
