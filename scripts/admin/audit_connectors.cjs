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

const db = getFirestore();

async function auditConnectors() {
  console.log("Iniciando auditoría de la Biblioteca de Conectores...");
  try {
    const snapshot = await db.collection("connectors").get();
    if (snapshot.empty) {
      console.log("No se encontraron conectores en Firestore.");
      return;
    }

    console.log(`\nConectores encontrados: ${snapshot.size}\n`);
    console.log("| ID | Nombre | RFC | Status | Prod Ready | Runner Avail | Fields Valid | Flow Valid | Last Pilot Run | Last Pilot Result | Last Valid XML | Last SAT Status | Eligible For Production |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");

    for (const doc of snapshot.docs) {
      const data = doc.data();
      let fieldsValid = "No";
      try {
        if (data.fieldsJson) {
          const parsed = JSON.parse(data.fieldsJson);
          if (parsed.length > 0) fieldsValid = "Sí";
        }
      } catch (e) {}

      let flowValid = "No";
      try {
        if (data.flowJson) {
          const parsed = JSON.parse(data.flowJson);
          if (parsed.length > 0) flowValid = "Sí";
        }
      } catch (e) {}

      // 1. Fetch portalMap
      const pmSnap = await db.collection("portal_maps").where("connectorId", "==", doc.id).get();
      const portalMapApproved = !pmSnap.empty && pmSnap.docs[0].data().isApproved === true;

      // 2. Fetch pilot jobs and sort in memory
      const jobsSnap = await db.collection("invoice_jobs")
        .where("connectorId", "==", doc.id)
        .where("pilotMode", "==", true)
        .get();

      let latestPilotJob = null;
      if (!jobsSnap.empty) {
        const jobs = [];
        jobsSnap.forEach(jobDoc => {
          jobs.push({ id: jobDoc.id, ...jobDoc.data() });
        });
        jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        latestPilotJob = jobs[0];
      }

      // 3. Map pilot values
      const lastPilotRun = latestPilotJob ? new Date(latestPilotJob.createdAt).toLocaleString("es-MX") : "N/A";
      const lastPilotResult = latestPilotJob ? latestPilotJob.status : "N/A";
      const lastValidXml = (latestPilotJob && latestPilotJob.result) ? (latestPilotJob.result.uuid || "N/A") : "N/A";
      const lastSatStatus = (latestPilotJob && latestPilotJob.result) ? (latestPilotJob.result.satStatus || "N/A") : "N/A";

      // 4. Calculate Eligibility
      const eligibleForProd = portalMapApproved && latestPilotJob && latestPilotJob.status === "succeeded" && latestPilotJob.result && latestPilotJob.result.satStatus === "valid" ? "Sí" : "No";

      console.log(`| ${doc.id} | ${data.nombre || "S/N"} | ${data.rfc || "S/D"} | ${data.status || "mock_only"} | ${data.isProductionReady || false} | ${data.runnerAvailable || false} | ${fieldsValid} | ${flowValid} | ${lastPilotRun} | ${lastPilotResult} | ${lastValidXml} | ${lastSatStatus} | ${eligibleForProd} |`);
    }
  } catch (err) {
    console.error("Fallo al auditar conectores:", err.message);
  }
}

auditConnectors();
