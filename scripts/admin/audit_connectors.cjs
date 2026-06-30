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
    console.log("| ID | Nombre | RFC | Status | Runner Available | Production Ready | Fields Valid | Flow Valid | Last Real Run | Last Result | Last Valid XML | Last SAT Status | Eligible For Production |");
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

      // 2. Fetch real jobs and sort in memory
      const jobsSnap = await db.collection("invoice_jobs")
        .where("connectorId", "==", doc.id)
        .get();

      let latestRealJob = null;
      if (!jobsSnap.empty) {
        const jobs = [];
        jobsSnap.forEach(jobDoc => {
          const jobData = jobDoc.data();
          if (!jobData.pilotMode) { // Exclude legacy pilot runs to report only real production/validation runs
            jobs.push({ id: jobDoc.id, ...jobData });
          }
        });
        jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        latestRealJob = jobs[0];
      }

      // 3. Map real values
      const lastRealRun = latestRealJob ? new Date(latestRealJob.createdAt).toLocaleString("es-MX") : "N/A";
      const lastResult = latestRealJob ? latestRealJob.status : "N/A";
      const lastValidXml = (latestRealJob && latestRealJob.result) ? (latestRealJob.result.uuid || "N/A") : "N/A";
      const lastSatStatus = (latestRealJob && latestRealJob.result) ? (latestRealJob.result.satStatus || "N/A") : "N/A";

      // 4. Calculate Eligibility
      const eligibleForProd = portalMapApproved && latestRealJob && latestRealJob.status === "succeeded" && latestRealJob.result && latestRealJob.result.satStatus === "valid" ? "Sí" : "No";

      console.log(`| ${doc.id} | ${data.nombre || "S/N"} | ${data.rfc || "S/D"} | ${data.status || "mock_only"} | ${data.runnerAvailable || false} | ${data.isProductionReady || false} | ${fieldsValid} | ${flowValid} | ${lastRealRun} | ${lastResult} | ${lastValidXml} | ${lastSatStatus} | ${eligibleForProd} |`);
    }
  } catch (err) {
    console.error("Fallo al auditar conectores:", err.message);
  }
}

auditConnectors();
