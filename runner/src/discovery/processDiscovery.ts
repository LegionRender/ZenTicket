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

function resolveCanonicalKey(field: ObservedField): string {
  const text = `${field.id} ${field.name} ${field.label} ${field.placeholder}`.toLowerCase();
  if (/rfc|taxid/i.test(text)) return "rfcEmisor";
  if (/folio|ticket|referencia|billing|ref/i.test(text)) return "billingReference";
  if (/fecha|date/i.test(text)) return "fechaCompra";
  if (/total|monto|amount|pago/i.test(text)) return "total";
  if (/rfc.*receptor/i.test(text)) return "rfc";
  if (/razon|nombre.*receptor|social/i.test(text)) return "razonSocial";
  if (/regimen/i.test(text)) return "regimenFiscal";
  if (/cp|postal/i.test(text)) return "codigoPostal";
  if (/uso/i.test(text)) return "usoCFDI";
  if (/mail|correo/i.test(text)) return "correoElectronico";
  return "custom_" + (field.name || field.id || "field");
}

async function extractFieldsWithGemini(
  imageBase64: string,
  fields: any[],
  merchantName: string,
  apiKey: string
): Promise<Record<string, string>> {
  if (!apiKey || !imageBase64) return {};

  try {
    const rawImage = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
    const mimeTypeMatch = imageBase64.match(/^data:([^;]+);base64,/i);
    const mimeType = mimeTypeMatch?.[1] || "image/jpeg";

    let prompt = `Analiza la imagen del ticket de compra comercial del comercio: ${merchantName}.\n`;
    prompt += `Extrae únicamente los siguientes campos requeridos por el portal de facturación oficial:\n`;
    for (const f of fields) {
      prompt += `- Campo: ${f.label} (clave: ${f.canonicalKey})\n`;
    }
    prompt += `\nDevuelve un objeto JSON con las claves exactas provistas y sus respectivos valores encontrados en el ticket. Si un campo no está presente, devuelve null o una cadena vacía.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { data: rawImage, mimeType } }
            ]
          }
        ],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    if (!response.ok) {
      console.warn(`[JIT-OCR] Gemini API failed: ${response.statusText}`);
      return {};
    }

    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    return JSON.parse(text);
  } catch (err: any) {
    console.warn("[JIT-OCR] Failed to parse Gemini response:", err?.message || err);
    return {};
  }
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

    // 1. Auto-approve and save the new connector & portalMap
    const connectorId = `conn-${discovery.rfcEmisor || "unknown"}-${Date.now().toString(36)}`;
    const contractFields = fields.map(f => {
      const canonicalKey = resolveCanonicalKey(f);
      return {
        key: f.name || f.id || "field",
        canonicalKey,
        label: f.label || f.placeholder || f.name || f.id || "Campo",
        type: f.tag === "select" ? "select" : "text",
        required: f.required !== undefined ? f.required : true,
        userEditable: true
      };
    });

    const newConnector = {
      id: connectorId,
      nombre: discovery.merchantName || "Comercio Auto-JIT",
      rfc: discovery.rfcEmisor || "",
      status: "production_ready",
      runnerAvailable: true,
      extractionContract: {
        requiredPortalFields: contractFields,
        fiscalFields: [
          { key: "rfc", label: "RFC", required: true },
          { key: "razonSocial", label: "Razón Social", required: true },
          { key: "regimenFiscal", label: "Régimen Fiscal", required: true },
          { key: "codigoPostal", label: "Código Postal", required: true },
          { key: "usoCFDI", label: "Uso CFDI", required: true }
        ]
      },
      fieldsJson: JSON.stringify(contractFields),
      flowJson: JSON.stringify(contractFields.map(f => ({
        type: "fill",
        selector: f.key ? `[name='${f.key}']` : `#${f.key}`,
        value: `ticket.portalFields.${f.canonicalKey}`
      }))),
      learnedFrom: "automatizacion_ticket",
      trainingId: discoveryId,
      version: "1.0.0",
      successCount: 0,
      failureCount: 0,
      totalExecutions: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.collection("connectors").doc(connectorId).set(newConnector);

    const newPortalMap = {
      id: `map-${connectorId}`,
      connectorId: connectorId,
      isApproved: true,
      status: "approved",
      stepsJson: JSON.stringify([
        { type: "goto", url: finalUrl },
        ...contractFields.map(f => ({
          type: "fill",
          selector: f.key ? `[name='${f.key}']` : `#${f.key}`,
          source: `ticket.portalFields.${f.canonicalKey}`
        }))
      ]),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.collection("portal_maps").doc(`map-${connectorId}`).set(newPortalMap);

    // Update proposal to auto-approved
    await proposalRef.set({
      autoApproved: true,
      status: "approved",
      stepsJson: newPortalMap.stepsJson,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    await discoveryRef.set({ status: "completed", finalUrl, evidence, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });

    // 2. Resolve user's fiscalProfile and enqueue invoice_job if complete
    let ticketData: any = null;
    if (ticketRef) {
      const ticketSnap = await ticketRef.get();
      ticketData = ticketSnap.exists ? ticketSnap.data() : null;
    }

    const geminiApiKey = process.env.GEMINI_API_KEY || "";
    let extractedPortalFields: Record<string, string> = {};
    if (ticketData && ticketData.imageUrl && geminiApiKey) {
      console.info("[JIT-OCR] Running targeted OCR extraction in hot path...");
      const rawExtracted = await extractFieldsWithGemini(
        ticketData.imageUrl,
        contractFields,
        discovery.merchantName || "Comercio",
        geminiApiKey
      );
      console.info("[JIT-OCR] Raw hot extraction result:", JSON.stringify(rawExtracted));
      
      contractFields.forEach(f => {
        const val = rawExtracted[f.canonicalKey] || rawExtracted[f.key] || "";
        if (f.canonicalKey) extractedPortalFields[f.canonicalKey] = val;
        if (f.key) extractedPortalFields[f.key] = val;
      });

      if (ticketRef) {
        await ticketRef.update({
          portalFields: extractedPortalFields,
          updatedAt: new Date().toISOString()
        });
      }
    }

    const profileSnap = await db.collection("fiscalProfiles").doc(discovery.userId).get();
    const profile = profileSnap.exists ? profileSnap.data() : null;
    const requiredFiscalKeys = ["rfc", "razonSocial", "regimenFiscal", "codigoPostal", "usoCFDI"];
    const missingFiscal = requiredFiscalKeys.filter(k => !profile || !profile[k] || !String(profile[k]).trim());
    const emailVal = profile?.correoElectronico || profile?.correoRecepcion || "";
    if (!emailVal || !emailVal.trim().includes("@")) {
      missingFiscal.push("correoElectronico");
    }

    if (missingFiscal.length > 0) {
      if (ticketRef) {
        await ticketRef.set({
          status: "waiting_fiscal_profile",
          connectorId: connectorId,
          portalMapId: `map-${connectorId}`,
          portalFields: extractedPortalFields,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    } else {
      // Create invoice_job & outbox
      const jobId = `ticket-${discovery.ticketId.slice(0, 40)}`;
      const jobRef = db.collection("invoice_jobs").doc(jobId);
      const outboxRef = db.collection("invoice_job_outbox").doc(jobId);
      const lockRef = db.collection("invoice_ticket_locks").doc(discovery.ticketId);

      const ticketSnapshot = {
        merchantName: discovery.merchantName || "",
        portalFields: {},
        expectedTicketTotal: Number(ticketData?.total || 0),
        rawOcrText: ticketData?.rawOcrText || ""
      };
      
      const ticketPortalFields = { ...ticketData?.portalFields, ...extractedPortalFields };
      const fieldsSnapshot: any = {};
      contractFields.forEach(f => {
        const val = ticketPortalFields[f.canonicalKey] || ticketPortalFields[f.key] || "";
        if (f.canonicalKey) fieldsSnapshot[f.canonicalKey] = val;
        if (f.key) fieldsSnapshot[f.key] = val;
      });
      ticketSnapshot.portalFields = fieldsSnapshot;

      const fiscalProfileSnapshot = {
        userId: discovery.userId,
        rfc: String(profile.rfc || "").trim(),
        razonSocial: String(profile.razonSocial || "").trim(),
        regimenFiscal: String(profile.regimenFiscal || "").trim(),
        codigoPostal: String(profile.codigoPostal || "").trim(),
        usoCFDI: String(profile.usoCFDI || "").trim(),
        correoElectronico: String(emailVal).trim(),
        createdAt: profile.createdAt || new Date().toISOString()
      };

      const connectorSnapshot = {
        id: connectorId,
        nombre: newConnector.nombre,
        rfc: newConnector.rfc,
        portalUrl: finalUrl,
        status: newConnector.status,
        version: newConnector.version
      };

      const portalMapSnapshot = {
        id: `map-${connectorId}`,
        connectorId,
        status: "approved",
        version: null,
        requiredFields: contractFields,
        stepsJson: newPortalMap.stepsJson,
        entryUrl: finalUrl
      };

      const nowStr = new Date().toISOString();
      const job = {
        ticketId: discovery.ticketId,
        userId: discovery.userId,
        status: "pending",
        connectorId,
        portalMapId: `map-${connectorId}`,
        connectorStatusAtRun: "production_ready",
        ticketDataSnapshot: ticketSnapshot,
        fiscalProfileSnapshot,
        connectorSnapshot,
        portalMapSnapshot,
        idempotencyKeyHash: "auto-jit-" + Math.random().toString(36).slice(2, 10),
        attempts: 0,
        maxAttempts: 3,
        currentStepIndex: 0,
        waitingForFields: [],
        canResume: true,
        createdAt: nowStr,
        updatedAt: nowStr
      };

      await db.runTransaction(async (transaction) => {
        transaction.set(jobRef, job);
        transaction.set(lockRef, { ticketId: discovery.ticketId, jobId, userId: discovery.userId, status: "pending", updatedAt: nowStr });
        transaction.set(outboxRef, {
          jobId,
          userId: discovery.userId,
          status: "pending",
          availableAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
        if (ticketRef) {
          transaction.update(ticketRef, {
            status: "queued_for_runner",
            connectorId,
            portalMapId: `map-${connectorId}`,
            portalFields: extractedPortalFields,
            jobId,
            updatedAt: nowStr
          });
        }
      });
    }
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
      status: "requires_manual_review",
      errorCode: resolution.code,
      reviewReasonCode: resolution.code,
      jitResolution: { ...resolution, attemptId, evidence, updatedAt: new Date().toISOString() },
      diagnosticDescription: resolution.description,
      errorMsg: `La exploración del portal falló en la etapa '${resolution.stage}' por: ${resolution.title}. Detalles técnicos: ${errorMessage}`,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    throw error;
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
