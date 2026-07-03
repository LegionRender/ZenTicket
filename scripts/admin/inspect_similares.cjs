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

async function inspect() {
  console.log("=== INSPECTING FARMACIAS SIMILARES CONNECTORS ===");
  const snapshot = await db.collection("connectors").get();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.nombre && (data.nombre.toLowerCase().includes("similares") || (data.rfc && data.rfc.includes("FSI")))) {
      console.log(`\nConnector ID: ${doc.id}`);
      console.log(`Nombre: ${data.nombre}`);
      console.log(`RFC: ${data.rfc}`);
      console.log(`Status: ${data.status}`);
      console.log(`UserId: ${data.userId}`);
      console.log(`LearnedFrom: ${data.learnedFrom}`);
      console.log(`Created: ${data.createdAt}`);
      console.log(`DisabledReason: ${data.disabledReason}`);
      console.log(`CanonicalConnectorId: ${data.canonicalConnectorId}`);
      console.log(`ExtractionContract:`, JSON.stringify(data.extractionContract, null, 2));

      // Fetch portal map
      const pmSnap = await db.collection("portal_maps").where("connectorId", "==", doc.id).get();
      if (!pmSnap.empty) {
        console.log(`PortalMap ID: ${pmSnap.docs[0].id}`);
        console.log(`PortalMap Approved: ${pmSnap.docs[0].data().isApproved}`);
        console.log(`PortalMap Status: ${pmSnap.docs[0].data().status}`);
        console.log(`PortalMap entryUrl: ${pmSnap.docs[0].data().entryUrl}`);
        console.log(`PortalMap stepsJson:`, pmSnap.docs[0].data().stepsJson);
      } else {
        console.log("PortalMap: NONE");
      }
    }
  }
}

inspect();
