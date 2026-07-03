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

async function auditConnectors() {
  console.log("Iniciando auditoría Connector-Driven de la Biblioteca de Conectores...");
  try {
    const snapshot = await db.collection("connectors").get();
    if (snapshot.empty) {
      console.log("No se encontraron conectores en Firestore.");
      return;
    }

    console.log(`\nConectores encontrados: ${snapshot.size}\n`);
    console.log("| ID | Nombre | RFC | Has Contract | Required Portal Fields | Fiscal Fields | Has Portal Map | Has stepsJson | Status | Runner Available | Production Ready | Eligible For Production |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");

    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      const hasContract = data.extractionContract ? "Sí" : "No";
      
      let reqPortalFields = "N/A";
      let fiscalFieldsStr = "N/A";
      
      if (data.extractionContract) {
        const contract = data.extractionContract;
        if (contract.requiredPortalFields && contract.requiredPortalFields.length > 0) {
          reqPortalFields = contract.requiredPortalFields.map(f => f.canonicalKey || f.key.split(".").pop()).join(", ");
        }
        if (contract.fiscalFields && contract.fiscalFields.length > 0) {
          fiscalFieldsStr = contract.fiscalFields.map(f => f.key.split(".").pop()).join(", ");
        }
      }

      // Fetch portalMap
      const pmSnap = await db.collection("portal_maps").where("connectorId", "==", doc.id).get();
      const hasPortalMap = !pmSnap.empty ? "Sí" : "No";
      
      let hasSteps = "No";
      let portalMapApproved = false;
      
      if (!pmSnap.empty) {
        const pmData = pmSnap.docs[0].data();
        portalMapApproved = pmData.isApproved === true || pmData.status === "approved";
        try {
          if (pmData.stepsJson) {
            const parsedSteps = JSON.parse(pmData.stepsJson);
            if (parsedSteps.length > 0) hasSteps = "Sí";
          }
        } catch (e) {}
      }

      // Fetch real jobs to check successful runs
      const jobsSnap = await db.collection("invoice_jobs")
        .where("connectorId", "==", doc.id)
        .get();

      let latestRealJob = null;
      if (!jobsSnap.empty) {
        const jobs = [];
        jobsSnap.forEach(jobDoc => {
          const jobData = jobDoc.data();
          if (!jobData.pilotMode) {
            jobs.push({ id: jobDoc.id, ...jobData });
          }
        });
        jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        latestRealJob = jobs[0];
      }

      // Calculate Eligibility based on navigation success and local structural validation
      const eligibleForProd = portalMapApproved && latestRealJob && latestRealJob.status === "succeeded" && latestRealJob.result && latestRealJob.result.xmlStoragePath ? "Sí" : "No";

      console.log(`| ${doc.id} | ${data.nombre || "S/N"} | ${data.rfc || "S/D"} | ${hasContract} | ${reqPortalFields} | ${fiscalFieldsStr} | ${hasPortalMap} | ${hasSteps} | ${data.status || "mock_only"} | ${data.runnerAvailable || false} | ${data.isProductionReady || false} | ${eligibleForProd} |`);
    }
  } catch (err) {
    console.error("Fallo al auditar conectores:", err.message);
  }
}

auditConnectors();
