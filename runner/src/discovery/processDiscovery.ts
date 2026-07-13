import { getApp, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { Browser, BrowserContext, chromium } from "playwright";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const databaseId = "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee";
if (!getApps().length) {
  initializeApp({ projectId: "factubolt", storageBucket: "factubolt.firebasestorage.app" });
}
const db = getFirestore(getApp(), databaseId);

type ObservedField = {
  tag: "input" | "select" | "textarea";
  id: string;
  name: string;
  type: string;
  label: string;
  placeholder: string;
  required: boolean;
};

function isSafeObservedUrl(value: string, origin: string): string | null {
  try {
    const url = new URL(value, origin);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const source = new URL(origin);
    if (url.hostname !== source.hostname) return null;
    return url.href;
  } catch {
    return null;
  }
}

function classifyDiscoveryFailure(message: string) {
  const normalized = message.toLowerCase();
  if (/captcha|recaptcha|hcaptcha|verify you are human/.test(normalized)) return {
    code: "CAPTCHA_DETECTED", stage: "portal_discovery",
    title: "El portal solicitó una verificación humana",
    description: "La exploración detectó un CAPTCHA antes de poder revisar el formulario de facturación.",
    probableCause: "Protección antibot del portal.",
    recommendedAction: "Pausar el intento y usar el flujo autorizado de intervención humana; no reenviar el ticket."
  };
  if (/timeout|timed out|navigation/.test(normalized)) return {
    code: "PORTAL_NAVIGATION_TIMEOUT", stage: "portal_navigation",
    title: "El portal no terminó de cargar a tiempo",
    description: "No se alcanzó una página estable para observar el formulario de facturación.",
    probableCause: "Carga lenta, redirección o mantenimiento temporal del portal.",
    recommendedAction: "Reintentar de forma controlada y abrir una incidencia del conector si la firma se repite."
  };
  return {
    code: "PORTAL_DISCOVERY_FAILED", stage: "portal_discovery",
    title: "No fue posible terminar la revisión del portal",
    description: "La exploración se detuvo antes de confirmar los campos del portal.",
    probableCause: "El portal cambió o presentó un comportamiento no clasificado todavía.",
    recommendedAction: "Revisar la evidencia del intento y crear una propuesta sin cambiar producción."
  };
}

export async function processConnectorDiscovery(discoveryId: string) {
  const discoveryRef = db.collection("connector_discovery_jobs").doc(discoveryId);
  const proposalRef = db.collection("connector_patch_proposals").doc(`discovery-${discoveryId}`);
  const discovery = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(discoveryRef);
    if (!snapshot.exists) throw new Error("CONNECTOR_DISCOVERY_NOT_FOUND");
    const data = snapshot.data()!;
    // Historical test evidence is retained, but is never eligible for a
    // future JIT/discovery run even if governance is later reopened.
    if (data.archival?.excludedFromJit === true) return null;
    if (["completed", "running"].includes(String(data.status))) return null;
    transaction.update(discoveryRef, {
      status: "running",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return data;
  });
  if (!discovery) return;

  const ticketRef = discovery.ticketId ? db.collection("tickets").doc(discovery.ticketId) : null;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: any = null;
  const attemptId = String(discovery.attemptId || `discovery-${discoveryId}`);
  const traceLocalPath = path.join(os.tmpdir(), `${attemptId}.zip`);

  try {
    const entryUrl = String(discovery.portalUrl || "");
    const entry = new URL(entryUrl);
    browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath() });
    context = await browser.newContext();
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    page = await context.newPage();
    await page.goto(entry.href, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);

    // Navigation is evidence-led and read-only: only follow a real same-origin
    // anchor whose visible label says it is the billing entry point. No click,
    // form fill, selector proposal, or portal submission is executed here.
    const billingLink = await page.locator("a[href]").evaluateAll((anchors: HTMLAnchorElement[]) => anchors
      .map((anchor: HTMLAnchorElement) => ({ href: anchor.href, text: (anchor.textContent || "").trim() }))
      .find((anchor: { href: string; text: string }) => /factur|cfdi|autofactura|obtener factura/i.test(anchor.text)) || null);
    const observedTarget = billingLink?.href ? isSafeObservedUrl(billingLink.href, page.url()) : null;
    if (observedTarget && observedTarget !== page.url()) {
      await page.goto(observedTarget, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
    }

    const finalUrl = page.url();
    const portalSignals = await page.evaluate(() => ({
      captchaDetected: Boolean(document.querySelector("iframe[src*='recaptcha'], .g-recaptcha, [data-sitekey], iframe[src*='hcaptcha'], .h-captcha")),
      loginRequired: Boolean(document.querySelector("input[type='password']")),
      maintenanceDetected: /mantenimiento|maintenance|servicio no disponible|temporalmente fuera/i.test(document.body.innerText || ""),
      modalText: Array.from(document.querySelectorAll("[role='dialog'], .modal, .swal2-container, .overlay"))
        .map(element => (element.textContent || "").trim()).filter(Boolean).slice(0, 3)
    }));
    if (portalSignals.captchaDetected) throw new Error("CAPTCHA_DETECTED");
    if (portalSignals.maintenanceDetected) throw new Error("PORTAL_MAINTENANCE_DETECTED");
    const fields = await page.locator("input:not([type='hidden']), select, textarea").evaluateAll((elements: Element[]) => elements
      .filter((element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      })
      .slice(0, 30)
      .map((element: Element) => {
        const input = element as HTMLInputElement;
        const id = input.id || "";
        const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent || "" : "";
        return {
          tag: element.tagName.toLowerCase(), id, name: input.getAttribute("name") || "",
          type: input.getAttribute("type") || "", label: label.trim() || input.getAttribute("aria-label") || "",
          placeholder: input.getAttribute("placeholder") || "", required: input.required
        };
      })) as ObservedField[];
    const bodyText = (await page.locator("body").innerText()).slice(0, 6000);
    const screenshotPath = `connector-discovery/${discoveryId}/${discovery.attemptId || "attempt"}.png`;
    await getStorage().bucket().file(screenshotPath).save(await page.screenshot({ fullPage: true }), { contentType: "image/png" });

    const evidence = {
      attemptId: discovery.attemptId || null,
      entryUrl,
      finalUrl,
      observedBillingLink: observedTarget || null,
      observedFields: fields,
      portalSignals,
      pageTitle: await page.title(),
      pageTextExcerpt: bodyText,
      screenshotPath,
      tracePath: null as string | null,
      observedAt: new Date().toISOString()
    };
    await proposalRef.set({
      type: "connector_patch_proposal",
      source: "cloud_run_observed_dom",
      trainingId: discoveryId,
      ticketId: discovery.ticketId || null,
      merchantName: discovery.merchantName || "",
      rfcEmisor: discovery.rfcEmisor || "",
      portalUrl: finalUrl,
      portalUrlVerifiedAt: new Date().toISOString(),
      evidence,
      state: "draft",
      status: "pending_review",
      lifecycle: "draft",
      autoApproved: false,
      canModifyProductionConnector: false,
      stepsJson: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
    await context.tracing.stop({ path: traceLocalPath });
    const tracePath = `connector-discovery/${discoveryId}/${attemptId}.zip`;
    await getStorage().bucket().file(tracePath).save(fs.readFileSync(traceLocalPath), { contentType: "application/zip" });
    evidence.tracePath = tracePath;
    await discoveryRef.set({ status: "completed", finalUrl, evidence, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
    if (ticketRef) await ticketRef.set({
      status: "training_pending_review",
      trainingId: discoveryId,
      portalUrl: finalUrl,
      portalUrlVerifiedAt: new Date().toISOString(),
      portalUrlVerification: "verified_observed_dom",
      trainingProposalId: proposalRef.id,
      jitResolution: {
        attemptId,
        stage: "portal_discovery",
        code: "PORTAL_FIELDS_OBSERVED",
        title: "Portal oficial observado",
        description: fields.length > 0 ? `Se observaron ${fields.length} campos visibles en el portal. El conector quedó pendiente de revisión segura.` : "El portal abrió, pero no expuso campos visibles todavía.",
        evidence: { finalUrl, screenshotPath, tracePath, observedFieldsCount: fields.length },
        recommendedAction: "Revisión del conector en sandbox antes de procesar tickets reales.",
        updatedAt: new Date().toISOString()
      },
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    const resolution = classifyDiscoveryFailure(errorMessage);
    let screenshotPath: string | null = null;
    if (page) {
      screenshotPath = `connector-discovery/${discoveryId}/${attemptId}-failed.png`;
      await getStorage().bucket().file(screenshotPath).save(await page.screenshot({ fullPage: true }).catch(() => Buffer.from("")), { contentType: "image/png" }).catch(() => undefined);
    }
    if (context) await context.tracing.stop({ path: traceLocalPath }).catch(() => undefined);
    const tracePath = fs.existsSync(traceLocalPath) ? `connector-discovery/${discoveryId}/${attemptId}.zip` : null;
    if (tracePath) await getStorage().bucket().file(tracePath).save(fs.readFileSync(traceLocalPath), { contentType: "application/zip" }).catch(() => undefined);
    const evidence = { attemptId, entryUrl: discovery.portalUrl || null, finalUrl: page?.url?.() || null, screenshotPath, tracePath, errorMessage, observedAt: new Date().toISOString() };
    await discoveryRef.set({ status: "failed", errorCode: resolution.code, errorMessage, evidence, failedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
    if (ticketRef) await ticketRef.set({
      status: resolution.code === "CAPTCHA_DETECTED" ? "waiting_user_captcha" : "portal_retry_required",
      errorCode: resolution.code,
      reviewReasonCode: resolution.code,
      jitResolution: { ...resolution, attemptId, evidence, updatedAt: new Date().toISOString() },
      diagnosticDescription: resolution.description,
      errorMsg: "Tuvimos una complicación al verificar el portal de facturación. Conservamos la evidencia para revisarlo y no inventaremos datos.",
      updatedAt: new Date().toISOString()
    }, { merge: true });
    throw error;
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
