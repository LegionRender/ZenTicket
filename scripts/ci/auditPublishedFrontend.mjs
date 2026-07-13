import { chromium } from "playwright";
import fs from "fs";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, isMobile: true });
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText || "failed" }));
const response = await page.goto("https://zenticket.mx", { waitUntil: "networkidle", timeout: 30_000 });
await page.screenshot({ path: "published-mobile.png", fullPage: true });
const bodyText = await page.locator("body").innerText().catch(() => "");
const report = { status: response?.status() || null, url: page.url(), bodyLength: bodyText.trim().length, consoleErrors, pageErrors, failedRequests };
fs.writeFileSync("published-frontend-audit.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await browser.close();
if (pageErrors.length || consoleErrors.length || report.bodyLength === 0) process.exitCode = 1;
