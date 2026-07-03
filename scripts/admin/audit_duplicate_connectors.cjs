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

const cleanStr = (s) => 
  (s || "")
   .toLowerCase()
   .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
   .replace(/[^a-z0-9\s]/g, "") // remove punctuation
   .replace(/\b(sa|de|cv|sapi|srl|de|cv|grupo|comercial|cadena|tiendas|sucursal|santa|fe|magna|pemex)\b/g, "")
   .trim();

async function auditDuplicates() {
  console.log("=== AUDITORÍA DE CONECTORES DUPLICADOS Y MOCK EN FIRESTORE ===\n");
  try {
    const snapshot = await db.collection("connectors").get();
    const connectors = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const rfcGroups = {};
    const nameGroups = {};

    connectors.forEach(c => {
      // Group by RFC
      const rfc = (c.rfc || "").toUpperCase().trim();
      if (rfc && rfc !== "RFC_INFERIDO" && rfc !== "S/D") {
        if (!rfcGroups[rfc]) rfcGroups[rfc] = [];
        rfcGroups[rfc].push(c);
      }

      // Group by clean name
      const cleanName = cleanStr(c.nombre);
      if (cleanName) {
        if (!nameGroups[cleanName]) nameGroups[cleanName] = [];
        nameGroups[cleanName].push(c);
      }
    });

    console.log("--- DUPLICADOS POR RFC ---");
    let rfcDupsFound = false;
    for (const [rfc, list] of Object.entries(rfcGroups)) {
      if (list.length > 1) {
        rfcDupsFound = true;
        console.log(`\nRFC: ${rfc} (${list.length} conectores encontrados)`);
        list.forEach(c => {
          const isOfficial = c.userId === "system";
          console.log(`  - ID: ${c.id} | Nombre: ${c.nombre} | Status: ${c.status} | Creador: ${c.userId || "N/A"} [${isOfficial ? "OFICIAL" : "MOCK/USUARIO"}]`);
        });
      }
    }
    if (!rfcDupsFound) console.log("No se encontraron duplicados exactos por RFC.");

    console.log("\n--- DUPLICADOS POR NOMBRE NORMALIZADO ---");
    let nameDupsFound = false;
    for (const [name, list] of Object.entries(nameGroups)) {
      if (list.length > 1) {
        nameDupsFound = true;
        console.log(`\nNombre limpio: "${name}" (${list.length} conectores encontrados)`);
        list.forEach(c => {
          const isOfficial = c.userId === "system";
          console.log(`  - ID: ${c.id} | Nombre: ${c.nombre} | RFC: ${c.rfc || "S/D"} | Status: ${c.status} | Creador: ${c.userId || "N/A"} [${isOfficial ? "OFICIAL" : "MOCK/USUARIO"}]`);
        });
      }
    }
    if (!nameDupsFound) console.log("No se encontraron duplicados por nombre normalizado.");

    console.log("\n--- RECOMENDACIONES DE CONECTOR CANÓNICO ---");
    let recommendationsCount = 0;
    for (const [name, list] of Object.entries(nameGroups)) {
      if (list.length > 1) {
        const official = list.find(c => c.userId === "system");
        if (official) {
          recommendationsCount++;
          console.log(`\nPara el comercio "${list[0].nombre}":`);
          console.log(`  * Conector Oficial (Canónico): ID = ${official.id}`);
          list.forEach(c => {
            if (c.id !== official.id) {
              console.log(`  * Duplicado Mock a Desactivar: ID = ${c.id} (Creador: ${c.userId})`);
              console.log(`    -> Sugerencia de update: status = "disabled", disabledReason = "DUPLICATE_MOCK_CONNECTOR", canonicalConnectorId = "${official.id}"`);
            }
          });
        }
      }
    }
    if (recommendationsCount === 0) console.log("No se detectaron duplicados que compitan con un conector oficial.");

  } catch (err) {
    console.error("Fallo al ejecutar la auditoría de duplicados:", err.message);
  }
}

auditDuplicates();
