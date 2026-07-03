import { initializeApp, cert, getApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as fs from "fs";
import * as path from "path";
import { pollJobs } from "./jobs/pollJobs";
import { lockJob } from "./jobs/lockJob";
import { executePortalMap } from "./executor/executePortalMap";
import { validateCfdiXml, XmlValidationResult } from "./validators/validateCfdiXml";
import { createRunnerLog, setActiveJobContext } from "./logging/createRunnerLog";
import { validateJobContract } from "./validators/validateJobContract";
import { verifySatCfdi } from "./validators/verifySatCfdi";

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

async function processJob(jobId: string) {
  const lockedJob = await lockJob(jobId, workerId);
  if (!lockedJob) return;

  const ticketId = lockedJob.ticketId;
  const ticketRef = db.collection("tickets").doc(ticketId);
  const jobRef = db.collection("invoice_jobs").doc(jobId);
  const bucket = getStorage().bucket();

  setActiveJobContext(jobId, ticketId, lockedJob.connectorId, lockedJob.environment || null);

  let connector: any = null;

  try {
    // 2. Fetch connector
    const connDoc = await db.collection("connectors").doc(lockedJob.connectorId).get();
    if (!connDoc.exists) {
      throw { message: "Conector no encontrado.", code: "CONNECTOR_NOT_FOUND" };
    }
    connector = connDoc.data();
    if (!connector) {
      throw { message: "Datos del conector vacíos.", code: "CONNECTOR_NOT_FOUND" };
    }
    const contractMissingFields = validateJobContract(connector, lockedJob.ticketDataSnapshot);
    if (contractMissingFields.length > 0) {
      throw {
        message: `Faltan campos requeridos por el contrato: ${contractMissingFields.join(", ")}`,
        code: "MISSING_REQUIRED_FIELDS",
        missingFields: contractMissingFields
      };
    }

    // ----------------------------------------------------
    // FLOW A: Safe migration / retry for validating_sat
    // ----------------------------------------------------
    if (lockedJob.status === "validating_sat") {
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
      const invoiceId = xmlResult.uuid || db.collection("users").doc(lockedJob.userId).collection("invoices").doc().id;
      const invRef = db.collection("users").doc(lockedJob.userId).collection("invoices").doc(invoiceId);
      await invRef.set({
        userId: lockedJob.userId,
        ticketId,
        xmlContent,
        pdfHtml: lockedJob.pdfHtml || null,
        folioFiscal: xmlResult.uuid,
        rfcEmisor: xmlResult.rfcEmisor,
        nombreEmisor: connector.nombre,
        rfcReceptor: xmlResult.rfcReceptor,
        nombreReceptor: lockedJob.fiscalProfileSnapshot.razonSocial,
        total: xmlResult.total,
        createdAt: new Date().toISOString()
      });

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

      let finalStatus = "invoice_obtained";
      try {
        const isSatValid = await verifySatCfdi(
          xmlResult.rfcEmisor || "",
          xmlResult.rfcReceptor || "",
          xmlResult.total ?? 0,
          xmlResult.uuid || ""
        );
        if (isSatValid) {
          finalStatus = "cfdi_validated";
        }
      } catch (satErr: any) {
        console.warn(`[Runner] Error validating CFDI with SAT in Flow A, falling back to invoice_obtained: ${satErr.message}`);
      }

      await ticketRef.update({
        status: finalStatus,
        invoiceId,
        updatedAt: new Date().toISOString()
      });

      await createRunnerLog(jobId, ticketId, "INFO", "Validación local y migración completada con éxito. Factura obtenida.");
      setActiveJobContext(null, null, null, null);
      return;
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
    if (!lockedJob.portalMapId) {
      throw { message: "Mapa de navegación no encontrado.", code: "PORTAL_MAP_NOT_FOUND" };
    }
    const portalMapDoc = await db.collection("portal_maps").doc(lockedJob.portalMapId).get();
    if (!portalMapDoc.exists) throw { message: "Mapa de navegación no encontrado.", code: "PORTAL_MAP_NOT_FOUND" };
    const portalMap = portalMapDoc.data();
    if (!portalMap || portalMap.connectorId !== lockedJob.connectorId) {
      throw { message: "El mapa no pertenece al conector del job.", code: "CONNECTOR_SCHEMA_INVALID" };
    }
    if (portalMap.isApproved !== true && portalMap.status !== "approved") {
      throw { message: "El mapa de navegación no está aprobado.", code: "PORTAL_MAP_NOT_APPROVED" };
    }

    // 4. Run navigation
    const result = await executePortalMap(
      jobId,
      ticketId,
      portalMap,
      connector,
      lockedJob.ticketDataSnapshot,
      lockedJob.fiscalProfileSnapshot
    );

    if (result.paused) {
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
      throw {
        message: result.error || "Fallo en la navegación del portal.",
        code: result.errorCode || "UNKNOWN_RUNNER_ERROR",
        screenshotPath: result.screenshotPath,
        stepIndex: result.stepIndex,
        maskedReference: result.maskedReference
      };
    }

    // 5. XML Structural validation
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
      const tmpDir = path.join(__dirname, `../../tmp/${jobId}`);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}

    // Succeeded!
    const invoiceId = xmlResult.uuid || db.collection("users").doc(lockedJob.userId).collection("invoices").doc().id;
    const invRef = db.collection("users").doc(lockedJob.userId).collection("invoices").doc(invoiceId);
    await invRef.set({
      userId: lockedJob.userId,
      ticketId,
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
      createdAt: new Date().toISOString()
    });

    await jobRef.update({
      status: "succeeded",
      result: {
        xmlStoragePath: xmlDest,
        pdfStoragePath: pdfDest,
        uuid: xmlResult.uuid
      },
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    let finalStatus = "invoice_obtained";
    try {
      const isSatValid = await verifySatCfdi(
        xmlResult.rfcEmisor || "",
        xmlResult.rfcReceptor || "",
        xmlResult.total ?? 0,
        xmlResult.uuid || ""
      );
      if (isSatValid) {
        finalStatus = "cfdi_validated";
      }
    } catch (satErr: any) {
      console.warn(`[Runner] Error validating CFDI with SAT in Flow B, falling back to invoice_obtained: ${satErr.message}`);
    }

    await ticketRef.update({
      status: finalStatus,
      invoiceId,
      updatedAt: new Date().toISOString()
    });

    await createRunnerLog(jobId, ticketId, "INFO", "Procesamiento finalizado exitosamente. Factura obtenida.");
    setActiveJobContext(null, null, null, null);
  } catch (err: any) {
    const errorCode = err.code || "UNKNOWN_RUNNER_ERROR";
    const errorMessage = err.message || "Error interno del runner.";

    await createRunnerLog(jobId, ticketId, "ERROR", `Procesamiento fallido: ${errorMessage} (Código: ${errorCode})`);
    setActiveJobContext(null, null, null, null);

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
        reviewError: {
          reviewReasonCode: "MISSING_REQUIRED_FIELDS",
          reviewReasonMessage: "Necesitamos la referencia de facturación impresa en tu ticket para solicitar la factura.",
          lastAutomationStep: "runner_processing",
          connectorAttempted: true,
          connectorId: lockedJob.connectorId,
          portalErrorMessage: errorMessage
        },
        updatedAt: new Date().toISOString()
      });
      return;
    }

    const isRejected = errorCode === "PORTAL_RETURNED_ERROR";
    const finalJobStatus = isRejected ? "manual_review" : "failed";
    const finalReviewReasonCode = isRejected ? "PORTAL_REJECTED_TICKET_DATA" : errorCode;

    await jobRef.update({
      status: finalJobStatus,
      lastError: errorMessage,
      lastErrorTime: new Date().toISOString(),
      attempts: FieldValue.increment(1),
      updatedAt: new Date().toISOString(),
      ...(err.screenshotPath && { screenshotPath: err.screenshotPath }),
      ...(err.stepIndex !== undefined && { stepIndex: err.stepIndex }),
      ...(err.maskedReference && { maskedReference: err.maskedReference })
    });

    await ticketRef.update({
      status: "requires_manual_review",
      errorMsg: errorMessage,
      reviewReasonCode: finalReviewReasonCode,
      reviewError: {
        reviewReasonCode: finalReviewReasonCode,
        reviewReasonMessage: errorMessage,
        lastAutomationStep: "runner_processing",
        connectorAttempted: true,
        connectorId: lockedJob.connectorId,
        portalErrorMessage: errorMessage,
        ...(err.screenshotPath && { screenshotPath: err.screenshotPath }),
        ...(err.stepIndex !== undefined && { stepIndex: err.stepIndex }),
        ...(err.maskedReference && { maskedReference: err.maskedReference })
      },
      updatedAt: new Date().toISOString()
    });
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
            reviewReasonMessage: "El proceso automático tardó más de lo esperado.",
            lastAutomationStep: "runner_processing",
            connectorAttempted: true,
            connectorId: jd.connectorId,
            portalErrorMessage: "El proceso automático tardó más de lo esperado."
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

runWorkerLoop();
