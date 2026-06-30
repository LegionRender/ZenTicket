import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";
import { pollJobs } from "./jobs/pollJobs";
import { lockJob } from "./jobs/lockJob";
import { executePortalMap } from "./executor/executePortalMap";
import { validateCfdiXml } from "./validators/validateCfdiXml";
import { validateSatStatus } from "./validators/validateSatStatus";
import { createRunnerLog } from "./logging/createRunnerLog";

const workerId = `worker-node-${process.pid}`;
const serviceAccountPath = path.join(__dirname, "../../serviceAccountKey.json");

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  initializeApp({
    credential: cert(serviceAccount)
  });
} else {
  initializeApp({
    projectId: "factubolt"
  });
}

const db = getFirestore();

async function processJob(jobId: string) {
  const lockedJob = await lockJob(jobId, workerId);
  if (!lockedJob) return;

  const ticketId = lockedJob.ticketId;
  const ticketRef = db.collection("tickets").doc(ticketId);
  const jobRef = db.collection("invoice_jobs").doc(jobId);
  let connector: any = null;

  try {
    // 1. Transition job to running and ticket to runner_processing
    await jobRef.update({
      status: "running",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await ticketRef.update({
      status: "runner_processing",
      updatedAt: new Date().toISOString()
    });

    await createRunnerLog(jobId, ticketId, "INFO", "Iniciando procesamiento de ticket.");

    // 2. Fetch connector
    const connDoc = await db.collection("connectors").doc(lockedJob.connectorId).get();
    if (!connDoc.exists) {
      throw { message: "Conector no encontrado.", code: "CONNECTOR_NOT_FOUND" };
    }
    connector = connDoc.data();
    if (!connector) {
      throw { message: "Datos del conector vacíos.", code: "CONNECTOR_NOT_FOUND" };
    }

    // 3. Fetch portalMap
    const portalMapsSnap = await db.collection("portal_maps")
      .where("connectorId", "==", lockedJob.connectorId)
      .get();
    if (portalMapsSnap.empty) {
      throw { message: "Mapa de navegación no encontrado.", code: "PORTAL_MAP_NOT_FOUND" };
    }
    const portalMap = portalMapsSnap.docs[0].data();

    // 4. Run navigation
    const result = await executePortalMap(
      jobId,
      ticketId,
      portalMap,
      connector,
      lockedJob.ticketDataSnapshot,
      lockedJob.fiscalProfileSnapshot
    );

    if (!result.success) {
      throw { message: result.error || "Fallo en la navegación del portal.", code: result.errorCode || "UNKNOWN_RUNNER_ERROR" };
    }

    // 5. XML Validation
    await createRunnerLog(jobId, ticketId, "INFO", "Validando estructura del XML descargado.");
    const xmlResult = validateCfdiXml(
      result.xmlContent || "",
      connector.rfc,
      lockedJob.fiscalProfileSnapshot.rfc,
      lockedJob.ticketDataSnapshot.total
    );

    if (!xmlResult.isValid) {
      throw { message: "XML inválido o discrepancia de datos.", code: xmlResult.error || "XML_STRUCTURE_INVALID" };
    }

    // 6. SAT status check
    await createRunnerLog(jobId, ticketId, "INFO", `Validando estatus del comprobante fiscal (UUID: ${xmlResult.uuid}) ante el SAT.`);
    const satResult = await validateSatStatus(
      xmlResult.rfcEmisor || "",
      xmlResult.rfcReceptor || "",
      xmlResult.total || 0,
      xmlResult.uuid || ""
    );

    if (satResult.status === "unavailable") {
      // Transition to validation pending
      await jobRef.update({
        status: "validating_sat",
        updatedAt: new Date().toISOString()
      });

      await ticketRef.update({
        status: "sat_validation_pending",
        updatedAt: new Date().toISOString()
      });

      await createRunnerLog(jobId, ticketId, "WARNING", "Validación ante el SAT no disponible temporalmente. Job en espera.");
      return;
    }

    if (satResult.status !== "valid") {
      throw {
        message: `El comprobante no es válido ante el SAT. Estatus: ${satResult.status}`,
        code: satResult.status === "cancelled" ? "SAT_STATUS_CANCELLED" : "SAT_STATUS_NOT_FOUND"
      };
    }

    // 7. Succeeded! (Only run if SAT is validated)
    const invRef = db.collection("invoices").doc();
    const invoiceId = xmlResult.uuid || invRef.id;
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
      createdAt: new Date().toISOString()
    });

    await jobRef.update({
      status: "succeeded",
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await ticketRef.update({
      status: "cfdi_validated",
      invoiceId,
      updatedAt: new Date().toISOString()
    });

    await createRunnerLog(jobId, ticketId, "INFO", "Procesamiento y timbrado finalizado exitosamente.");

  } catch (err: any) {
    const errorCode = err.code || "UNKNOWN_RUNNER_ERROR";
    const errorMessage = err.message || "Error interno del runner.";

    await createRunnerLog(jobId, ticketId, "ERROR", `Procesamiento fallido: ${errorMessage} (Código: ${errorCode})`);

    await jobRef.update({
      status: "failed",
      lastError: errorMessage,
      lastErrorTime: new Date().toISOString(),
      attempts: FieldValue.increment(1),
      updatedAt: new Date().toISOString()
    });

    await ticketRef.update({
      status: "requires_manual_review",
      errorMsg: errorMessage,
      reviewError: {
        reviewReasonCode: errorCode,
        reviewReasonMessage: errorMessage,
        lastAutomationStep: "runner_processing",
        connectorAttempted: true,
        connectorId: lockedJob.connectorId,
        connectorName: connector?.nombre || null,
        portalErrorMessage: errorMessage
      },
      updatedAt: new Date().toISOString()
    });
  }
}

async function runWorkerLoop() {
  console.log(`[Worker: ${workerId}] Iniciando ciclo del runner...`);
  try {
    const pendingJobIds = await pollJobs();
    if (pendingJobIds.length > 0) {
      console.log(`[Worker: ${workerId}] Encontrados ${pendingJobIds.length} jobs pendientes.`);
      for (const jobId of pendingJobIds) {
        await processJob(jobId);
      }
    }
  } catch (err: any) {
    console.error("Error in worker loop:", err.message);
  }
  // Run every 5 seconds
  setTimeout(runWorkerLoop, 5000);
}

runWorkerLoop();
