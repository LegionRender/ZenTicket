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
    console.log("| ID | Nombre | RFC | Status | Prod Ready | Runner Avail | Fields Valid | Flow Valid |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");

    snapshot.forEach(doc => {
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

      console.log(`| ${doc.id} | ${data.nombre || "S/N"} | ${data.rfc || "S/D"} | ${data.status || "mock_only"} | ${data.isProductionReady || false} | ${data.runnerAvailable || false} | ${fieldsValid} | ${flowValid} |`);
    });
  } catch (err) {
    console.error("Fallo al auditar conectores:", err.message);
  }
}

auditConnectors();
