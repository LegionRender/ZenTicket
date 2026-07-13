import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) throw new Error("PROJECT_ID is required.");

const configPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../firebase-applet-config.json");
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
const app = initializeApp({ credential: applicationDefault(), projectId });
const db = config.firestoreDatabaseId ? getFirestore(app, config.firestoreDatabaseId) : getFirestore(app);

const collections = [
  "automation_trainings",
  "connector_discovery_jobs",
  "connector_discovery_outbox",
  "connector_patch_proposals"
];
const archivedAt = new Date().toISOString();
const summary = { archivedAt, archiveCategory: "phase1_test_evidence", collections: {}, totalArchived: 0, totalAlreadyArchived: 0 };

for (const name of collections) {
  const snapshot = await db.collection(name).get();
  const batch = db.batch();
  let archived = 0;
  let alreadyArchived = 0;
  for (const doc of snapshot.docs) {
    const archival = doc.data().archival;
    if (archival?.excludedFromJit === true) {
      alreadyArchived += 1;
      continue;
    }
    batch.set(doc.ref, {
      archival: {
        category: "phase1_test_evidence",
        excludedFromJit: true,
        archivedAt,
        archivedBy: "phase6_governance"
      }
    }, { merge: true });
    archived += 1;
  }
  if (archived > 0) await batch.commit();
  summary.collections[name] = { archived, alreadyArchived };
  summary.totalArchived += archived;
  summary.totalAlreadyArchived += alreadyArchived;
}

fs.writeFileSync("phase1-jit-evidence-archive.json", `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary));
