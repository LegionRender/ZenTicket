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

async function cleanInvalidTickets() {
  console.log("=================================================================");
  console.log("  DATABASE CLEANER: Sanitización de Referencias de Facturación");
  console.log("  Database ID:", databaseId || "default");
  console.log("=================================================================\n");

  const ticketsSnap = await db.collection("tickets").get();
  let cleanedCount = 0;

  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const internalPrefixRegex = /^ticket_|^job_|^OFFLINE-|^worker-/i;

  for (const doc of ticketsSnap.docs) {
    const ticket = doc.data();
    const status = ticket.status;

    // Do not touch finalized or successful tickets
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
        errorMsg: "La referencia de facturación es inválida (ej. UUID/ID interno). Por favor captura el dato del ticket impreso.",
        missingFields,
        updatedAt: new Date().toISOString()
      });

      console.log(`   - Estatus actualizado a 'missing_required_fields'`);
      console.log("-----------------------------------------------------------------");
      cleanedCount++;
    }
  }

  console.log(`\nProceso completado. Se limpiaron ${cleanedCount} tickets contaminados.`);
}

cleanInvalidTickets().catch(console.error);
