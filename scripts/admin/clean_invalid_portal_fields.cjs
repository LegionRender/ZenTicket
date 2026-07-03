const admin = require("firebase-admin");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

const serviceAccountPath = path.join(__dirname, "../../serviceAccountKey.json");

if (fs.existsSync(serviceAccountPath)) {
  initializeApp({
    credential: cert(serviceAccountPath)
  });
} else {
  initializeApp({
    projectId: "factubolt"
  });
}

let databaseId = undefined;
const firebaseConfigPath = path.join(__dirname, "../../firebase-applet-config.json");
if (fs.existsSync(firebaseConfigPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
    databaseId = config.firestoreDatabaseId;
  } catch (err) {
    console.warn("Failed to parse firebase-applet-config.json:", err.message);
  }
}

const db = getFirestore(undefined, databaseId);

async function cleanInvalidTicketsAndJobs() {
  console.log("=================================================================");
  console.log("  DATABASE CLEANER: Sanitización de Referencias de Facturación");
  console.log("  Database ID:", databaseId || "default");
  console.log("=================================================================\n");

  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const internalPrefixRegex = /^ticket_|^job_|^OFFLINE-|^worker-/i;

  // 1. Limpiar tickets
  console.log("🔍 Escaneando la colección 'tickets'...");
  const ticketsSnap = await db.collection("tickets").get();
  let cleanedTicketsCount = 0;

  for (const doc of ticketsSnap.docs) {
    const ticket = doc.data();
    const status = ticket.status;

    if (status === "invoice_obtained" || status === "cfdi_validated" || status === "completed") {
      continue;
    }

    const pFields = ticket.portalFields || {};
    const billingRef = pFields.billingReference || "";

    const isUuid = uuidRegex.test(billingRef);
    const hasInternalPrefix = internalPrefixRegex.test(billingRef);

    if (isUuid || hasInternalPrefix) {
      console.log(`🧹 Limpiando ticket #${doc.id.slice(-8).toUpperCase()} (${doc.id}):`);
      console.log(`   - Referencia inválida detectada: "${billingRef}"`);

      const updatedPortalFields = {
        ...pFields,
        billingReference: "",
        ticketNumber: ""
      };

      const missingFields = ticket.missingFields || [];
      if (!missingFields.includes("portalFields.billingReference")) {
        missingFields.push("portalFields.billingReference");
      }

      await doc.ref.update({
        portalFields: updatedPortalFields,
        status: "missing_required_fields",
        reviewReasonCode: "MISSING_REQUIRED_FIELDS",
        errorMsg: "Necesitamos la referencia de facturación impresa en tu ticket para solicitar la factura.",
        missingFields,
        reviewError: {
          reason: "INVALID_UUID_BILLING_REFERENCE_CLEANED",
          message: "UUID/ID interno de facturación purgado."
        },
        updatedAt: new Date().toISOString()
      });

      console.log(`   - Estatus actualizado a 'missing_required_fields'`);
      console.log("-----------------------------------------------------------------");
      cleanedTicketsCount++;
    }
  }

  // 2. Limpiar/Detener invoice_jobs
  console.log("\n🔍 Escaneando la colección 'invoice_jobs'...");
  const jobsSnap = await db.collection("invoice_jobs").get();
  let cleanedJobsCount = 0;

  for (const doc of jobsSnap.docs) {
    const job = doc.data();
    const status = job.status;

    if (status === "succeeded" || status === "completed") {
      continue;
    }

    const tSnapshot = job.ticketDataSnapshot || {};
    const jobBillingRef = tSnapshot.billingReference || "";

    const isUuid = uuidRegex.test(jobBillingRef);
    const hasInternalPrefix = internalPrefixRegex.test(jobBillingRef);

    if (isUuid || hasInternalPrefix) {
      console.log(`🛑 Cancelando y marcando job contaminado (${doc.id}):`);
      console.log(`   - Referencia en snapshot: "${jobBillingRef}"`);

      await doc.ref.update({
        status: "failed",
        lastErrorCode: "INVALID_UUID_BILLING_REFERENCE_CLEANED",
        lastError: "Se canceló el job porque contenía una referencia inválida (UUID).",
        updatedAt: new Date().toISOString()
      });

      console.log(`   - Job marcado como 'failed'`);
      console.log("-----------------------------------------------------------------");
      cleanedJobsCount++;
    }
  }

  console.log(`\nProceso completado.`);
  console.log(`- Se limpiaron ${cleanedTicketsCount} tickets contaminados.`);
  console.log(`- Se purgaron/cancelaron ${cleanedJobsCount} jobs contaminados.`);
}

cleanInvalidTicketsAndJobs().catch(console.error);
