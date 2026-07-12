import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const projectId = process.env.PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) throw new Error("PROJECT_ID is required.");
const configPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../firebase-applet-config.json");
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
const app = initializeApp({ credential: applicationDefault(), projectId });
const db = config.firestoreDatabaseId ? getFirestore(app, config.firestoreDatabaseId) : getFirestore(app);
const targets = ["map-bodega-aurrera", "FdFPRoiOnOLzPDq05neE"];

function selectorsFrom(steps, selectors = []) {
  for (const step of Array.isArray(steps) ? steps : []) {
    if (typeof step?.selector === "string") selectors.push(step.selector);
    selectorsFrom(step?.steps, selectors);
  }
  return [...new Set(selectors)];
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const portalMapId of targets) {
    const snapshot = await db.collection("portal_maps").doc(portalMapId).get();
    if (!snapshot.exists) throw new Error(`PORTAL_MAP_NOT_FOUND:${portalMapId}`);
    const map = snapshot.data();
    const entryUrl = String(map.entryUrl || map.portalUrl || "");
    if (!/^https:\/\//i.test(entryUrl)) throw new Error(`PORTAL_MAP_URL_INVALID:${portalMapId}`);
    const steps = typeof map.stepsJson === "string" ? JSON.parse(map.stepsJson) : map.stepsJson;
    const selectors = selectorsFrom(steps);
    const page = await browser.newPage();
    try {
      await page.goto(entryUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
      const visibleSelectors = [];
      for (const selector of selectors.slice(0, 24)) {
        if (await page.locator(selector).first().isVisible().catch(() => false)) visibleSelectors.push(selector);
      }
      const signals = await page.evaluate(() => ({
        captcha: Boolean(document.querySelector("iframe[src*='recaptcha'], .g-recaptcha, [data-sitekey], iframe[src*='hcaptcha'], .h-captcha")),
        modal: Boolean(document.querySelector("[role='dialog'], .modal, .ui-dialog, .swal2-container")),
        login: Boolean(document.querySelector("input[type='password']"))
      }));
      results.push({ portalMapId, finalUrl: page.url(), visibleSelectors, ...signals });
    } finally {
      await page.close();
    }
  }
  console.log(JSON.stringify({ mode: "read_only_navigation", results }));
} finally {
  await browser.close();
}
