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
    console.log("| ID | Nombre | RFC | Status | Source | Created By | Canonical ID | Duplicate Of | Disabled Reason | Mock | Runner Available | Production Ready | Has Extraction Contract | Has Portal Map | Has stepsJson | Entry URL Verified | Reason Not Runnable | Last Real Run | Last Result | Last XML Result | Eligible For Production |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");

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
      let reasonNotRunnable = "Ninguna (Listo)";
      let entryUrlVerified = "No";

      if (!pmSnap.empty) {
        const pmData = pmSnap.docs[0].data();
        portalMapApproved = pmData.isApproved === true || pmData.status === "approved";
        if (pmData.entryUrl && pmData.entryUrl.startsWith("http")) {
          entryUrlVerified = "Sí";
        }
        try {
          if (pmData.stepsJson) {
            const parsedSteps = JSON.parse(pmData.stepsJson);
            if (parsedSteps.length > 0) hasSteps = "Sí";
          }
        } catch (e) {}
      }

      // Calculate Reason Not Runnable
      if (!data.extractionContract) {
        reasonNotRunnable = "Sin extractionContract";
      } else if (pmSnap.empty) {
        reasonNotRunnable = "Sin portalMap";
      } else {
        const pmData = pmSnap.docs[0].data();
        if (pmData.isApproved !== true && pmData.status !== "approved") {
          reasonNotRunnable = "PortalMap no aprobado";
        } else if (!pmData.stepsJson || pmData.stepsJson === "[]") {
          reasonNotRunnable = "Sin stepsJson";
        } else {
          try {
            const parsedSteps = JSON.parse(pmData.stepsJson);
            const hasFillTransaction = parsedSteps.some(step => step.type === "fill" && (step.value.includes("billingReference") || step.value.includes("folio")));
            if (!hasFillTransaction && data.nombre.toLowerCase().includes("walmart")) {
              reasonNotRunnable = "stepsJson incompleto/legacy (Falta TR/folio)";
            } else if (pmData.entryUrl && pmData.entryUrl.startsWith("http")) {
              if (data.runnerAvailable === false) {
                reasonNotRunnable = "Runner no disponible (desactivado manual)";
              }
            } else {
              reasonNotRunnable = "Entry URL no verificada";
            }
          } catch (e) {
            reasonNotRunnable = "stepsJson inválido";
          }
        }
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

      let lastRealRun = "Ninguna";
      let lastResult = "N/A";
      let lastXmlResult = "N/A";

      if (latestRealJob) {
        lastRealRun = latestRealJob.createdAt.split("T")[0];
        lastResult = latestRealJob.status;
        lastXmlResult = (latestRealJob.result && latestRealJob.result.xmlStoragePath) ? "Descargado" : "Pendiente";
      }

      // Calculate Eligibility based on navigation success and local structural validation
      const eligibleForProd = portalMapApproved && latestRealJob && latestRealJob.status === "succeeded" && latestRealJob.result && latestRealJob.result.xmlStoragePath ? "Sí" : "No";

      const source = data.learnedFrom || "system";
      const createdBy = data.userId || "system";
      const canonicalId = data.canonicalConnectorId || "";
      const duplicateOf = data.canonicalConnectorId ? "Sí" : "No";
      const disabledReason = data.disabledReason || "";
      const isMock = (data.isMock === true || data.status === "mock_only") ? "Sí" : "No";

      console.log(`| ${doc.id} | ${data.nombre || "S/N"} | ${data.rfc || "S/D"} | ${data.status || "mock_only"} | ${source} | ${createdBy} | ${canonicalId} | ${duplicateOf} | ${disabledReason} | ${isMock} | ${data.runnerAvailable || false} | ${data.isProductionReady || false} | ${hasContract} | ${hasPortalMap} | ${hasSteps} | ${entryUrlVerified} | ${reasonNotRunnable} | ${lastRealRun} | ${lastResult} | ${lastXmlResult} | ${eligibleForProd} |`);
    }
  } catch (err) {
    console.error("Fallo al auditar conectores:", err.message);
  }
}

auditConnectors();
