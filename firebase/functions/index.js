const express = require("express");
const admin = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret, defineString } = require("firebase-functions/params");

admin.initializeApp();

const db = admin.firestore();
const app = express();

const geminiApiKey = defineSecret("GEMINI_API_KEY");
const geminiPrimaryKey = defineSecret("GEMINI_API_KEY_PRIMARY");
const geminiSecondaryKey = defineSecret("GEMINI_API_KEY_SECONDARY");
const openAiApiKey = defineSecret("OPENAI_API_KEY");
const openAiModel = defineString("OPENAI_VISION_MODEL", { default: "gpt-4o-mini" });

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Middleware de CORS para permitir solicitudes desde dominios autorizados (Vercel, Firebase, Local)
app.use((req, res, next) => {
  const allowedOrigins = [
    "https://zenticket.mx",
    "https://www.zenticket.mx",
    "https://factubolt.web.app",
    "https://factubolt.firebaseapp.com",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080"
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-gemini-api-key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  next();
});

const OCR_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    rfcEmisor: { type: "STRING", description: "RFC del emisor. Si no es legible, usa cadena vacia." },
    nombreEmisor: { type: "STRING", description: "Nombre comercial o razon social exactamente como aparece." },
    fechaCompra: { type: "STRING", description: "Fecha de compra YYYY-MM-DD. Si no es legible, usa cadena vacia." },
    folio: { type: "STRING", description: "Folio, ticket, transaccion o codigo de facturacion. Si no es legible, usa cadena vacia." },
    total: { type: "NUMBER", description: "Total pagado en MXN. Si no es legible, usa 0." },
    sucursal: { type: "STRING", description: "Sucursal o ubicacion si aparece. Si no es legible, usa cadena vacia." },
    items: {
      type: "ARRAY",
      description: "Conceptos claramente legibles en el ticket.",
      items: {
        type: "OBJECT",
        properties: {
          description: { type: "STRING" },
          amount: { type: "NUMBER" }
        },
        required: ["description", "amount"]
      }
    }
  },
  required: ["rfcEmisor", "nombreEmisor", "fechaCompra", "folio", "total", "items"]
};

const OCR_PROMPT = [
  "Analiza esta fotografia de un ticket de compra mexicano y extrae solo datos visibles.",
  "No inventes comercios, RFC, folios, fechas, importes ni conceptos.",
  "Si un dato no es legible, devuelve cadena vacia; para total no legible devuelve 0.",
  "No uses ejemplos populares como OXXO, Walmart o Starbucks salvo que el ticket lo muestre explicitamente.",
  "Devuelve un JSON con rfcEmisor, nombreEmisor, fechaCompra, folio, total, sucursal e items."
].join(" ");

function now() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function emptyOcrDraft(message = "El OCR no pudo procesar la imagen. Completa los campos manualmente.") {
  return {
    rfcEmisor: "",
    nombreEmisor: "",
    fechaCompra: "",
    folio: "",
    total: 0,
    sucursal: "",
    ocrFailed: true,
    ocrError: message,
    items: [],
    cost: 0,
    rawCost: 0
  };
}

function optionalSecret(secretParam) {
  try {
    return (secretParam.value() || "").trim();
  } catch (_err) {
    return "";
  }
}

function hasUsableKey(value) {
  const key = (value || "").trim();
  return !!key &&
    key.length >= 20 &&
    !key.toLowerCase().includes("your_") &&
    !key.toLowerCase().includes("todo") &&
    !key.toLowerCase().includes("placeholder") &&
    !key.toLowerCase().includes("clave");
}

function buildProviderPlan(req) {
  const userKey = (req.headers["x-gemini-api-key"] || "").toString().trim();
  const legacyGeminiKey = optionalSecret(geminiApiKey);
  const primaryGemini = optionalSecret(geminiPrimaryKey) || legacyGeminiKey;
  const secondaryGemini = optionalSecret(geminiSecondaryKey);
  const openAiKey = optionalSecret(openAiApiKey);

  const providers = [];
  if (hasUsableKey(userKey)) {
    providers.push({ id: "gemini-user", provider: "gemini", key: userKey, models: ["gemini-2.5-flash", "gemini-2.0-flash"] });
  }
  if (hasUsableKey(primaryGemini)) {
    providers.push({ id: "gemini-primary", provider: "gemini", key: primaryGemini, models: ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"] });
  }
  if (hasUsableKey(secondaryGemini) && secondaryGemini !== primaryGemini) {
    providers.push({ id: "gemini-secondary", provider: "gemini", key: secondaryGemini, models: ["gemini-2.0-flash", "gemini-flash-latest"] });
  }
  if (hasUsableKey(openAiKey)) {
    providers.push({ id: "openai-secondary", provider: "openai", key: openAiKey, models: [openAiModel.value()] });
  }
  return providers;
}

function classifyError(errorText) {
  const text = (errorText || "").toLowerCase();
  if (text.includes("resource_exhausted") || text.includes("prepayment credits are depleted") || text.includes("quota") || text.includes("429")) {
    return {
      code: "quota_exhausted",
      severity: "critical",
      userMessage: "El OCR real no esta disponible porque los creditos o la cuota del proveedor estan agotados. El ticket quedo en cola de reintento."
    };
  }
  if (text.includes("api key") || text.includes("permission") || text.includes("unauthorized") || text.includes("forbidden") || text.includes("401") || text.includes("403")) {
    return {
      code: "auth_error",
      severity: "critical",
      userMessage: "El OCR real no esta disponible porque una clave de proveedor no es valida o no tiene permisos."
    };
  }
  return {
    code: "ocr_provider_error",
    severity: "warning",
    userMessage: "El OCR no pudo procesar la imagen. El ticket quedo en cola de reintento."
  };
}

function calculateGeminiRawCost(response) {
  const promptTokens = response.usageMetadata?.promptTokenCount || 0;
  const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;
  const exchangeRate = 18.5;
  return (((promptTokens * 0.075) + (outputTokens * 0.30)) / 1000000) * exchangeRate;
}

async function runGeminiOcr(provider, image, mimeType) {
  const ai = new GoogleGenAI({ apiKey: provider.key });
  let lastError = "";

  for (const model of provider.models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            { inlineData: { mimeType: mimeType || "image/jpeg", data: image } },
            { text: OCR_PROMPT }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: OCR_RESPONSE_SCHEMA
        }
      });

      if (!response.text || !response.text.trim()) {
        throw new Error("Gemini returned an empty OCR response.");
      }

      return {
        data: JSON.parse(response.text.trim()),
        model,
        rawCost: Number(calculateGeminiRawCost(response).toFixed(6))
      };
    } catch (err) {
      lastError = err?.message || String(err);
      console.warn(`[OCR] ${provider.id}/${model} failed:`, lastError);
    }
  }

  throw new Error(lastError || `${provider.id} failed`);
}

async function runOpenAiOcr(provider, image, mimeType) {
  const imageUrl = `data:${mimeType || "image/jpeg"};base64,${image}`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.key}`
    },
    body: JSON.stringify({
      model: provider.models[0],
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: `${OCR_PROMPT} Responde solo JSON valido sin markdown.` },
            { type: "input_image", image_url: imageUrl }
          ]
        }
      ],
      text: { format: { type: "json_object" } }
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(JSON.stringify(body));
  }

  const text = body.output_text ||
    body.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;

  if (!text) {
    throw new Error("OpenAI returned an empty OCR response.");
  }

  return {
    data: JSON.parse(text),
    model: provider.models[0],
    rawCost: 0
  };
}

async function runProviderOcr(provider, image, mimeType) {
  if (provider.provider === "gemini") {
    return runGeminiOcr(provider, image, mimeType);
  }
  if (provider.provider === "openai") {
    return runOpenAiOcr(provider, image, mimeType);
  }
  throw new Error(`Unsupported OCR provider: ${provider.provider}`);
}

async function createAlert(payload) {
  await db.collection("ocr_alerts").add({
    ...payload,
    read: false,
    createdAt: now()
  });
}

async function enqueueRetry({ image, mimeType, userId, attempts, errorInfo, jobId }) {
  const imageFitsFirestore = typeof image === "string" && image.length < 700000;
  const nextRunAt = admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000);

  await db.collection("ocr_retry_queue").add({
    userId: userId || "guest",
    jobId,
    status: imageFitsFirestore ? "pending" : "needs_reupload",
    attempts,
    maxAttempts: 3,
    providerErrorCode: errorInfo.code,
    lastError: errorInfo.userMessage,
    mimeType: mimeType || "image/jpeg",
    imageBase64: imageFitsFirestore ? image : null,
    nextRunAt,
    createdAt: now(),
    updatedAt: now()
  });
}

async function recordJobStart({ userId, mimeType }) {
  const ref = await db.collection("ocr_jobs").add({
    userId: userId || "guest",
    mimeType: mimeType || "image/jpeg",
    status: "processing",
    providerAttempts: [],
    createdAt: now(),
    updatedAt: now()
  });
  return ref;
}

async function processOcrRequest({ req, image, mimeType, userId, retryJobId = null }) {
  const providers = buildProviderPlan(req);
  const jobRef = retryJobId ? db.collection("ocr_jobs").doc(retryJobId) : await recordJobStart({ userId, mimeType });
  const providerAttempts = [];
  let lastError = "";

  if (providers.length === 0) {
    lastError = "No OCR providers configured.";
  }

  for (const provider of providers) {
    const startedAt = Date.now();
    try {
      const result = await runProviderOcr(provider, image, mimeType);
      const attempt = {
        provider: provider.id,
        model: result.model,
        status: "success",
        durationMs: Date.now() - startedAt
      };
      providerAttempts.push(attempt);

      await jobRef.set({
        status: "succeeded",
        provider: provider.id,
        model: result.model,
        providerAttempts,
        rawCost: result.rawCost,
        updatedAt: now()
      }, { merge: true });

      return {
        ...result.data,
        ocrFailed: false,
        ocrProvider: provider.id,
        ocrModel: result.model,
        ocrJobId: jobRef.id,
        cost: provider.provider === "openai" ? 0.75 : 0.5,
        rawCost: result.rawCost
      };
    } catch (err) {
      lastError = err?.message || String(err);
      const errorInfo = classifyError(lastError);
      providerAttempts.push({
        provider: provider.id,
        status: "failed",
        code: errorInfo.code,
        error: lastError.slice(0, 900),
        durationMs: Date.now() - startedAt
      });

      if (errorInfo.severity === "critical") {
        await createAlert({
          type: "ocr_provider_failure",
          severity: errorInfo.severity,
          provider: provider.id,
          code: errorInfo.code,
          message: errorInfo.userMessage
        });
      }
    }
  }

  const errorInfo = classifyError(lastError);
  await jobRef.set({
    status: "queued",
    providerAttempts,
    providerErrorCode: errorInfo.code,
    lastError: errorInfo.userMessage,
    updatedAt: now()
  }, { merge: true });

  await enqueueRetry({
    image,
    mimeType,
    userId,
    attempts: providerAttempts.length,
    errorInfo,
    jobId: jobRef.id
  });

  return {
    ...emptyOcrDraft(errorInfo.userMessage),
    ocrJobId: jobRef.id,
    retryQueued: true
  };
}

app.post("/api/tickets/analyze", async (req, res) => {
  const { image, mimeType, userId } = req.body || {};

  if (!image) {
    res.status(400).json({ error: "Missing base64 ticket image" });
    return;
  }

  try {
    const result = await processOcrRequest({ req, image, mimeType, userId });
    res.json(result);
  } catch (err) {
    console.error("[OCR] Critical failure:", err);
    res.json(emptyOcrDraft("El OCR no pudo procesar la imagen por un error interno. El equipo tecnico debe revisar la consola."));
  }
});

app.post("/api/ocr/retry-pending", async (req, res) => {
  const snapshot = await db.collection("ocr_retry_queue")
    .where("status", "==", "pending")
    .where("nextRunAt", "<=", admin.firestore.Timestamp.now())
    .limit(10)
    .get();

  let retried = 0;
  for (const doc of snapshot.docs) {
    const item = doc.data();
    if (!item.imageBase64) {
      await doc.ref.set({ status: "needs_reupload", updatedAt: now() }, { merge: true });
      continue;
    }

    await doc.ref.set({ status: "processing", updatedAt: now() }, { merge: true });
    const result = await processOcrRequest({
      req,
      image: item.imageBase64,
      mimeType: item.mimeType,
      userId: item.userId,
      retryJobId: item.jobId
    });

    retried += 1;
    await doc.ref.set({
      status: result.ocrFailed ? "pending" : "succeeded",
      attempts: admin.firestore.FieldValue.increment(1),
      nextRunAt: admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 60 * 1000),
      updatedAt: now()
    }, { merge: true });
  }

  res.json({ ok: true, retried });
});

exports.api = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "512MiB",
    secrets: [geminiApiKey, geminiPrimaryKey, geminiSecondaryKey, openAiApiKey]
  },
  app
);

exports.retryOcrQueue = onSchedule(
  {
    schedule: "every 10 minutes",
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "512MiB",
    secrets: [geminiApiKey, geminiPrimaryKey, geminiSecondaryKey, openAiApiKey]
  },
  async () => {
    const fakeReq = { headers: {} };
    const snapshot = await db.collection("ocr_retry_queue")
      .where("status", "==", "pending")
      .where("nextRunAt", "<=", admin.firestore.Timestamp.now())
      .limit(10)
      .get();

    for (const doc of snapshot.docs) {
      const item = doc.data();
      if (!item.imageBase64 || (item.attempts || 0) >= (item.maxAttempts || 3)) {
        await doc.ref.set({ status: "needs_manual_review", updatedAt: now() }, { merge: true });
        continue;
      }

      await doc.ref.set({ status: "processing", updatedAt: now() }, { merge: true });
      const result = await processOcrRequest({
        req: fakeReq,
        image: item.imageBase64,
        mimeType: item.mimeType,
        userId: item.userId,
        retryJobId: item.jobId
      });

      await doc.ref.set({
        status: result.ocrFailed ? "pending" : "succeeded",
        attempts: admin.firestore.FieldValue.increment(1),
        nextRunAt: admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 60 * 1000),
        updatedAt: now()
      }, { merge: true });
    }
  }
);
