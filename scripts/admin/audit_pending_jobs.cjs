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

async function run() {
  console.log("=================================================================");
  console.log("  WATCHDOG: Auditoría de Jobs Estancados o Pendientes en ZenTicket");
  console.log("  Database ID:", databaseId || "default");
  console.log("=================================================================\n");

  const jobsSnap = await db.collection("invoice_jobs").get();
  let issueCount = 0;

  const now = Date.now();

  for (const doc of jobsSnap.docs) {
    const job = doc.data();
    const jobId = doc.id;
    const ticketId = job.ticketId;
    const status = job.status;
    const connectorId = job.connectorId;
    const updatedAtStr = job.updatedAt || job.createdAt;
    const ageMinutes = updatedAtStr ? (now - new Date(updatedAtStr).getTime()) / 60000 : 0;

    // Check 1: Pending for more than 3 minutes
    if (status === "pending" && ageMinutes > 3) {
      issueCount++;
      console.log(`⚠️ ALERTA: Job #${jobId.slice(-6).toUpperCase()} está PENDING por ${ageMinutes.toFixed(1)} minutos.`);
      console.log(`   - Ticket ID: ${ticketId}`);
      console.log(`   - Conector ID: ${connectorId}`);
      console.log(`   - Última Actualización: ${updatedAtStr}`);
      console.log(`   - Acción Recomendada: El runner local está apagado o no puede leer la base. Verifica el status en PM2 (pm2 status) o enciéndelo.`);
      console.log("-----------------------------------------------------------------");
    }

    // Check 2: Locked/Running for more than 5 minutes
    if ((status === "locked" || status === "running") && ageMinutes > 5) {
      issueCount++;
      console.log(`🚨 ALERTA CRÍTICA: Job #${jobId.slice(-6).toUpperCase()} está colgado en '${status.toUpperCase()}' por ${ageMinutes.toFixed(1)} minutos.`);
      console.log(`   - Ticket ID: ${ticketId}`);
      console.log(`   - Locked By: ${job.lockedBy || "Desconocido"}`);
      console.log(`   - Última Actualización: ${updatedAtStr}`);
      console.log(`   - Acción Recomendada: El runner se quedó colgado o murió durante la navegación. El watchdog automático aplicará timeout en el próximo ciclo del runner.`);
      console.log("-----------------------------------------------------------------");
    }
  }

  if (issueCount === 0) {
    console.log("✅ TODO EN ORDEN: No se detectaron jobs estancados o huérfanos en la cola de procesamiento.");
  } else {
    console.log(`Total de alertas encontradas: ${issueCount}`);
  }
}

run().catch(console.error);
