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

const audit = {
  auditedAt: new Date().toISOString(),
  mode: "read_only",
  collections: {}
};

for (const name of collections) {
  const snapshot = await db.collection(name).select("status", "state", "mode", "type").get();
  const byStatus = {};
  const byMode = {};
  const byType = {};
  for (const doc of snapshot.docs) {
    const value = doc.data();
    const status = String(value.status || value.state || "unspecified");
    const mode = String(value.mode || "unspecified");
    const type = String(value.type || "unspecified");
    byStatus[status] = (byStatus[status] || 0) + 1;
    byMode[mode] = (byMode[mode] || 0) + 1;
    byType[type] = (byType[type] || 0) + 1;
  }
  audit.collections[name] = { total: snapshot.size, byStatus, byMode, byType };
}

fs.writeFileSync("phase6-governance-audit.json", `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit));
