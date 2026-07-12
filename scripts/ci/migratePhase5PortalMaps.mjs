import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const configPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../firebase-applet-config.json");
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
const app = initializeApp({ credential: applicationDefault(), projectId });
const db = config.firestoreDatabaseId ? getFirestore(app, config.firestoreDatabaseId) : getFirestore(app);
const now = new Date().toISOString();

const replacements = {
  "map-bodega-aurrera": [
    { path: [7], step: { type: "waitForSelector", selector: "#ctl00_ContentPlaceHolder1_ddlregimenFiscal", timeout: 15000 } },
    { path: [8, "steps", 1], step: { type: "waitForSelector", selector: "#ctl00_ContentPlaceHolder1_ddlusoCFDI", timeout: 15000 } },
    { path: [8, "steps", 4], step: { type: "waitForSelector", selector: "#ctl00_btnContinuar", timeout: 15000 } },
    { path: [8, "steps", 6], step: { type: "waitForNavigation", timeout: 20000 } },
    { path: [9, "steps", 2], step: { type: "waitForNavigation", timeout: 20000 } }
  ],
  "FdFPRoiOnOLzPDq05neE": [
    { path: [1], step: { type: "waitForSelector", selector: "[id='form:folio']", timeout: 15000 } },
    { path: [8], step: { type: "waitForSelector", selector: "[id='form:continuar']:not(.ui-state-disabled)", timeout: 15000 } }
  ]
};

function atPath(steps, pathParts) {
  return pathParts.reduce((value, key) => value?.[key], steps);
}

for (const [portalMapId, edits] of Object.entries(replacements)) {
  const ref = db.collection("portal_maps").doc(portalMapId);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new Error(`PORTAL_MAP_NOT_FOUND:${portalMapId}`);
    const map = snapshot.data();
    const steps = JSON.parse(map.stepsJson);
    for (const edit of edits) {
      const current = atPath(steps, edit.path);
      if (!current || !["waitForTimeout", "wait_for_timeout", "waitfortimeout"].includes(String(current.type || ""))) {
        throw new Error(`EXPECTED_WAIT_NOT_FOUND:${portalMapId}:${edit.path.join(".")}`);
      }
      const parent = atPath(steps, edit.path.slice(0, -1));
      parent[edit.path.at(-1)] = edit.step;
    }
    tx.set(db.collection("portal_map_migrations").doc(`${portalMapId}-phase5-${Date.now()}`), {
      portalMapId, originalStepsJson: map.stepsJson, migration: "phase5-observable-postconditions", createdAt: now
    });
    tx.update(ref, { stepsJson: JSON.stringify(steps), phase5MigratedAt: now, phase5Migration: "observable-postconditions", updatedAt: now });
  });
}
console.log(JSON.stringify({ migratedPortalMaps: Object.keys(replacements) }));
