import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) throw new Error("PROJECT_ID is required for the remote portal-map audit.");

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(scriptDir, "../../firebase-applet-config.json");
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
const databaseId = config.firestoreDatabaseId;
const app = initializeApp({ credential: applicationDefault(), projectId });
const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
const WAIT_TYPES = new Set(["waitfortimeout", "wait_for_timeout"]);

function summarizeStep(step) {
  if (!step || typeof step !== "object") return null;
  return {
    type: String(step.type || step.action || step.step || step.stepType || "").toLowerCase() || null,
    selector: typeof step.selector === "string" ? step.selector : null,
    expectSelector: typeof step.expectSelector === "string" ? step.expectSelector : null,
    expectDownload: step.expectDownload === true,
    hasNestedSteps: Array.isArray(step.steps) && step.steps.length > 0
  };
}

function findArbitraryWaits(value, valuePath = "root", matches = [], context = null) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("[") || trimmed.startsWith("{")) && trimmed.length > 1) {
      try {
        return findArbitraryWaits(JSON.parse(trimmed), valuePath, matches, context);
      } catch {
        // A non-JSON string cannot represent executable steps on its own.
      }
    }
    return matches;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => findArbitraryWaits(item, `${valuePath}[${index}]`, matches, {
      previous: summarizeStep(value[index - 1]),
      next: summarizeStep(value[index + 1])
    }));
    return matches;
  }
  if (!value || typeof value !== "object") return matches;

  const declaredType = String(value.type || value.action || value.step || value.stepType || "").toLowerCase();
  if (WAIT_TYPES.has(declaredType)) {
    matches.push({
      path: valuePath,
      type: declaredType,
      selector: typeof value.selector === "string" ? value.selector : null,
      delay: Number(value.delay ?? value.timeout ?? value.ms ?? 0) || null,
      previous: context?.previous || null,
      next: context?.next || null
    });
  }
  for (const [key, nested] of Object.entries(value)) {
    if (["type", "action", "step", "stepType"].includes(key)) continue;
    findArbitraryWaits(nested, `${valuePath}.${key}`, matches);
  }
  return matches;
}

async function main() {
  const snapshot = await db.collection("portal_maps").get();
  const affectedMaps = snapshot.docs.map((doc) => {
    const data = doc.data();
    const matches = findArbitraryWaits({ stepsJson: data.stepsJson, steps: data.steps, recoveryFlow: data.recoveryFlow });
    if (matches.length === 0) return null;
    return {
      portalMapId: doc.id,
      connectorId: data.connectorId || null,
      status: data.status || null,
      isApproved: data.isApproved === true,
      occurrences: matches
    };
  }).filter(Boolean);

  const report = {
    auditedAt: new Date().toISOString(),
    projectId,
    databaseId: databaseId || "(default)",
    portalMapsScanned: snapshot.size,
    affectedCount: affectedMaps.length,
    affectedMaps
  };
  const outputPath = process.env.AUDIT_OUTPUT || path.resolve(process.cwd(), "portal-map-wait-audit.json");
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    portalMapsScanned: report.portalMapsScanned,
    affectedCount: report.affectedCount,
    affectedMaps: report.affectedMaps
  }));
}

main().catch((error) => {
  console.error("Portal-map wait audit failed:", error.message);
  process.exitCode = 1;
});
