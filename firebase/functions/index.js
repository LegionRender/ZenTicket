const express = require("express");
const admin = require("firebase-admin");
const axios = require("axios");
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
const stripeSecretKeyParam = defineSecret("STRIPE_SECRET_KEY");
const mercadoPagoAccessTokenParam = defineSecret("MERCADOPAGO_ACCESS_TOKEN");
const paypalClientIdParam = defineSecret("PAYPAL_CLIENT_ID");
const paypalClientSecretParam = defineSecret("PAYPAL_CLIENT_SECRET");
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

const CONSTANCIA_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    rfc: { type: "STRING", description: "RFC del contribuyente tal como aparece. Si no es legible, usa cadena vacia." },
    razonSocial: { type: "STRING", description: "Nombre, denominacion o razon social visible. Si no es legible, usa cadena vacia." },
    regimenFiscal: { type: "STRING", description: "Codigo numerico de 3 digitos del regimen fiscal visible. Si no es legible, usa cadena vacia." },
    codigoPostal: { type: "STRING", description: "Codigo postal fiscal de 5 digitos visible. Si no es legible, usa cadena vacia." }
  },
  required: ["rfc", "razonSocial", "regimenFiscal", "codigoPostal"]
};

const CONSTANCIA_PROMPT = [
  "Analiza esta Constancia de Situacion Fiscal del SAT Mexico.",
  "Extrae solo datos visibles del documento cargado: RFC, razonSocial, regimenFiscal y codigoPostal.",
  "No inventes ni completes datos por contexto, correo, nombre de usuario o ejemplos.",
  "Si el archivo no es una constancia valida o algun dato no es legible, devuelve cadena vacia para ese campo.",
  "Responde solo JSON valido."
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

function secretOrEnv(secretParam, envName) {
  return optionalSecret(secretParam) || (process.env[envName] || "").trim();
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

function normalizeConstanciaData(data) {
  const cleaned = {
    rfc: String(data?.rfc || "").toUpperCase().replace(/[^A-Z0-9&Ñ]/g, "").trim(),
    razonSocial: String(data?.razonSocial || "").toUpperCase().replace(/\s+/g, " ").trim(),
    regimenFiscal: String(data?.regimenFiscal || "").replace(/\D/g, "").slice(0, 3),
    codigoPostal: String(data?.codigoPostal || "").replace(/\D/g, "").slice(0, 5)
  };

  const validRfc = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(cleaned.rfc);
  const validRegimen = /^\d{3}$/.test(cleaned.regimenFiscal);
  const validCp = /^\d{5}$/.test(cleaned.codigoPostal);
  const validName = cleaned.razonSocial.length >= 3;

  if (!validRfc || !validRegimen || !validCp || !validName) {
    return null;
  }
  return cleaned;
}

async function runGeminiConstancia(provider, file, mimeType) {
  const ai = new GoogleGenAI({ apiKey: provider.key });
  let lastError = "";

  for (const model of provider.models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            { inlineData: { mimeType: mimeType || "application/pdf", data: file } },
            { text: CONSTANCIA_PROMPT }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: CONSTANCIA_RESPONSE_SCHEMA
        }
      });

      if (!response.text || !response.text.trim()) {
        throw new Error("Gemini returned an empty constancia response.");
      }

      const parsed = normalizeConstanciaData(JSON.parse(response.text.trim()));
      if (!parsed) {
        throw new Error("Constancia response did not contain all required visible fiscal fields.");
      }

      return { data: parsed, model };
    } catch (err) {
      lastError = err?.message || String(err);
      console.warn(`[CONSTANCIA] ${provider.id}/${model} failed:`, lastError);
    }
  }

  throw new Error(lastError || `${provider.id} failed`);
}

async function runOpenAiConstancia(provider, file, mimeType) {
  const fileUrl = `data:${mimeType || "application/pdf"};base64,${file}`;
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
            { type: "input_text", text: CONSTANCIA_PROMPT },
            { type: "input_image", image_url: fileUrl }
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
    throw new Error("OpenAI returned an empty constancia response.");
  }
  const parsed = normalizeConstanciaData(JSON.parse(text));
  if (!parsed) {
    throw new Error("Constancia response did not contain all required visible fiscal fields.");
  }
  return { data: parsed, model: provider.models[0] };
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

app.post("/api/fiscal/parse-constancia", async (req, res) => {
  const { file, mimeType } = req.body || {};

  if (!file) {
    res.status(400).json({ error: "Falta el archivo base64 de la constancia fiscal" });
    return;
  }

  const providers = buildProviderPlan(req);
  if (providers.length === 0) {
    res.status(503).json({
      error: "No hay proveedor OCR configurado para leer la constancia. Ingresa los datos manualmente.",
      ocrFailed: true
    });
    return;
  }

  const attempts = [];
  for (const provider of providers) {
    const startedAt = Date.now();
    try {
      const result = provider.provider === "gemini"
        ? await runGeminiConstancia(provider, file, mimeType)
        : await runOpenAiConstancia(provider, file, mimeType);

      res.json({
        ...result.data,
        ocrFailed: false,
        ocrProvider: provider.id,
        ocrModel: result.model
      });
      return;
    } catch (err) {
      const message = err?.message || String(err);
      attempts.push({
        provider: provider.id,
        status: "failed",
        error: message.slice(0, 700),
        durationMs: Date.now() - startedAt
      });
      console.warn(`[CONSTANCIA] ${provider.id} failed:`, message);
    }
  }

  await createAlert({
    type: "constancia_ocr_failure",
    severity: "warning",
    provider: "all",
    code: "constancia_parse_failed",
    message: "No se pudo extraer la constancia fiscal sin inventar datos."
  });

  res.status(422).json({
    error: "No se pudieron leer todos los datos fiscales requeridos en la constancia. Ingresa los datos manualmente.",
    ocrFailed: true,
    attempts
  });
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

// Helpers for PayPal Access Token
async function getPayPalAccessToken() {
  const clientId = secretOrEnv(paypalClientIdParam, "PAYPAL_CLIENT_ID");
  const clientSecret = secretOrEnv(paypalClientSecretParam, "PAYPAL_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Faltan credenciales PAYPAL_CLIENT_ID o PAYPAL_CLIENT_SECRET.");
  }
  
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  
  // 1. Try Live first
  try {
    const response = await axios.post(
      "https://api-m.paypal.com/v1/oauth2/token",
      "grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );
    return {
      accessToken: response.data.access_token,
      host: "https://api-m.paypal.com"
    };
  } catch (error) {
    const errData = error.response?.data;
    if (errData && errData.error === "invalid_client") {
      // 2. Try Sandbox fallback
      try {
        const response = await axios.post(
          "https://api-m.sandbox.paypal.com/v1/oauth2/token",
          "grant_type=client_credentials",
          {
            headers: {
              Authorization: `Basic ${auth}`,
              "Content-Type": "application/x-www-form-urlencoded"
            }
          }
        );
        console.log("PayPal auto-detected Sandbox credentials; running in Sandbox mode.");
        return {
          accessToken: response.data.access_token,
          host: "https://api-m.sandbox.paypal.com"
        };
      } catch (sandboxErr) {
        throw new Error("Las credenciales de PayPal son inválidas tanto para producción como para sandbox.");
      }
    }
    throw new Error("Error de comunicación o autenticación con PayPal: " + (errData?.error_description || error.message));
  }
}

const getSafeBaseUrl = (req) => {
  let proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  if (Array.isArray(proto)) {
    proto = proto[0];
  }
  if (typeof proto === "string" && proto.includes(",")) {
    proto = proto.split(",")[0].trim();
  }
  const host = req.get("host") || "localhost:3000";
  return `${proto}://${host}`;
};

// ==================== MIDDLEWARE & HELPERS ====================

const authenticateFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    if (process.env.NODE_ENV !== "production" && process.env.DEV_BILLING_AUTH_BYPASS === "true") {
      const mockUid = req.headers["x-mock-user-id"];
      const mockEmail = req.headers["x-mock-user-email"];
      if (mockUid) {
        req.user = { 
          uid: mockUid, 
          email: mockEmail || "mock@example.com",
          email_verified: true 
        };
        next();
        return;
      }
    }
    res.status(401).json({ error: "Falta el token de autorización o es inválido" });
    return;
  }

  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = { 
      uid: decodedToken.uid, 
      email: decodedToken.email || "",
      email_verified: decodedToken.email_verified === true 
    };
    next();
  } catch (error) {
    console.error("Error al verificar token de Firebase:", error.message);
    res.status(401).json({ error: "Token de Firebase inválido o expirado" });
  }
};

async function resolveStripeCustomerId(uid, email, emailVerified) {
  const billingRef = db.collection("billingProfiles").doc(uid);
  const billingSnap = await billingRef.get();
  
  if (billingSnap.exists) {
    const data = billingSnap.data();
    if (data?.stripeCustomerId) {
      return data.stripeCustomerId;
    }
  }

  const fiscalRef = db.collection("fiscalProfiles").doc(uid);
  const fiscalSnap = await fiscalRef.get();
  if (fiscalSnap.exists) {
    const historicalCustomerId = fiscalSnap.data()?.stripeCustomerId;
    if (historicalCustomerId) {
      const stripeSecretKey = secretOrEnv(stripeSecretKeyParam, "STRIPE_SECRET_KEY");
      if (stripeSecretKey) {
        try {
          const res = await axios.get(
            `https://api.stripe.com/v1/customers/${historicalCustomerId}`,
            { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
          );
          const customer = res.data;
          if (email && emailVerified && customer.email && customer.email.toLowerCase() === email.toLowerCase()) {
            console.log(`[Migration] Migrando stripeCustomerId ${historicalCustomerId} desde fiscalProfiles a billingProfiles para ${uid}`);
            await billingRef.set({ stripeCustomerId: historicalCustomerId }, { merge: true });
            return historicalCustomerId;
          } else {
            console.warn(`[Migration warning] Email mismatch for historical stripeCustomerId ${historicalCustomerId}. Token email: ${email}, Customer email: ${customer.email}. No se migró.`);
          }
        } catch (err) {
          console.error(`[Migration error] Error al validar customer histórico ${historicalCustomerId}:`, err.message);
        }
      }
    }
  }

  if (email && emailVerified) {
    const stripeSecretKey = secretOrEnv(stripeSecretKeyParam, "STRIPE_SECRET_KEY");
    if (stripeSecretKey) {
      try {
        const response = await axios.get(
          `https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}`,
          { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
        );
        const customers = response.data?.data || [];
        if (customers.length === 1) {
          const matchedCustomerId = customers[0].id;
          console.log(`[Migration] Vinculando stripeCustomerId ${matchedCustomerId} de Stripe por correo verificado ${email} para ${uid}`);
          await billingRef.set({ stripeCustomerId: matchedCustomerId }, { merge: true });
          return matchedCustomerId;
        } else if (customers.length > 1) {
          console.warn(`[Migration warning] Múltiples clientes encontrados para ${email}. Se requiere resolución manual.`);
        }
      } catch (err) {
        console.error(`[Migration error] Error al buscar customer por correo:`, err.message);
      }
    }
  }

  if (email) {
    const stripeSecretKey = secretOrEnv(stripeSecretKeyParam, "STRIPE_SECRET_KEY");
    if (stripeSecretKey) {
      try {
        const customerParams = new URLSearchParams({
          email: email,
          name: email.split("@")[0],
          "metadata[userId]": uid
        });
        const customerResponse = await axios.post(
          "https://api.stripe.com/v1/customers",
          customerParams.toString(),
          {
            headers: {
              Authorization: `Bearer ${stripeSecretKey}`,
              "Content-Type": "application/x-www-form-urlencoded"
            }
          }
        );
        const stripeCustomerId = customerResponse.data.id;
        console.log(`[Stripe Auto-Creation] Creado cliente ${stripeCustomerId} para ${uid}`);
        await billingRef.set({ stripeCustomerId }, { merge: true });
        return stripeCustomerId;
      } catch (err) {
        console.error(`[Stripe Auto-Creation error] Error al crear cliente para ${uid}:`, err.message);
      }
    }
  }
  return null;
}

function verifyStripeSignature(rawBody, signatureHeader, webhookSecret) {
  if (!signatureHeader || !webhookSecret) return false;
  
  const parts = signatureHeader.split(",");
  let timestamp = "";
  const signatures = [];
  
  for (const part of parts) {
    const [key, val] = part.split("=");
    if (key === "t") timestamp = val;
    if (key === "v1") signatures.push(val);
  }
  
  if (!timestamp || signatures.length === 0) return false;
  
  const signatureAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (signatureAge > 300) {
    return false;
  }
  
  const signedPayload = `${timestamp}.${rawBody}`;
  const crypto = require("crypto");
  const computedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload)
    .digest("hex");
    
  for (const signature of signatures) {
    try {
      if (crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(computedSignature, "hex"))) {
        return true;
      }
    } catch (err) {
      // Ignore length mismatches
    }
  }
  return false;
}

async function syncCustomerPaymentMethods(stripeCustomerId, stripeSecretKey, dbRef) {
  if (!stripeCustomerId) return;
  try {
    let docRef = null;

    const billingSnapshot = await dbRef.collection("billingProfiles")
      .where("stripeCustomerId", "==", stripeCustomerId)
      .limit(1)
      .get();
      
    if (!billingSnapshot.empty) {
      docRef = billingSnapshot.docs[0].ref;
    } else {
      const fiscalSnapshot = await dbRef.collection("fiscalProfiles")
        .where("stripeCustomerId", "==", stripeCustomerId)
        .limit(1)
        .get();
      if (!fiscalSnapshot.empty) {
        docRef = fiscalSnapshot.docs[0].ref;
      }
    }

    if (!docRef) {
      console.log(`[Stripe Webhook] No user profile found with customer ID: ${stripeCustomerId}`);
      return;
    }

    const customerRes = await axios.get(
      `https://api.stripe.com/v1/customers/${stripeCustomerId}`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );
    const defaultPaymentMethodId = customerRes.data?.invoice_settings?.default_payment_method;

    const pmRes = await axios.get(
      `https://api.stripe.com/v1/payment_methods?customer=${stripeCustomerId}&type=card`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );

    const paymentMethods = pmRes.data?.data || [];
    const pms = paymentMethods.map(pm => {
      const card = pm.card;
      const formattedBrand = String(card.brand || "VISA").toUpperCase();
      return {
        id: pm.id,
        brand: formattedBrand,
        last4: card.last4,
        expiry: `${String(card.exp_month).padStart(2, "0")}/${String(card.exp_year).slice(-2)}`,
        holderName: pm.billing_details?.name || "Titular",
        bankName: formattedBrand === "VISA" ? "Tarjeta Visa" : formattedBrand === "MASTERCARD" ? "Mastercard" : formattedBrand,
        isDefault: pm.id === defaultPaymentMethodId,
        stripePaymentMethodId: pm.id
      };
    });

    if (pms.length > 0 && !defaultPaymentMethodId) {
      pms[0].isDefault = true;
      const fallbackId = pms[0].id;
      try {
        await axios.post(
          `https://api.stripe.com/v1/customers/${stripeCustomerId}`,
          `invoice_settings[default_payment_method]=${fallbackId}`,
          {
            headers: {
              Authorization: `Bearer ${stripeSecretKey}`,
              "Content-Type": "application/x-www-form-urlencoded"
            }
          }
        );
      } catch (err) {
        console.warn("Could not set default in webhook fallback:", err.message);
      }
    }

    await docRef.set({ paymentCards: pms }, { merge: true });
    console.log(`[Stripe Webhook] Sincronizados ${pms.length} métodos de pago para el cliente ${stripeCustomerId}`);
  } catch (error) {
    console.error(`[Stripe Webhook] Error al sincronizar métodos de pago para ${stripeCustomerId}:`, error.message);
  }
}

// ==================== BILLING ENDPOINTS ====================

app.post("/api/billing/setup/stripe", authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const email = req.user.email;
  const emailVerified = req.user.email_verified;
  const { payerEmail, holderName, bankName } = req.body;

  const stripeSecretKey = secretOrEnv(stripeSecretKeyParam, "STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuración de Stripe incompleta" });
    return;
  }
  try {
    const stripeCustomerId = await resolveStripeCustomerId(userId, email, emailVerified);
    if (!stripeCustomerId) {
      res.status(400).json({ error: "El usuario no tiene un cliente de Stripe creado." });
      return;
    }

    const sessionParams = new URLSearchParams({
      mode: "setup",
      customer: stripeCustomerId,
      success_url: `${getSafeBaseUrl(req)}/billing-setup-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getSafeBaseUrl(req)}/billing-failure.html`,
      "payment_method_types[0]": "card"
    });

    const sessionResponse = await axios.post(
      "https://api.stripe.com/v1/checkout/sessions",
      sessionParams.toString(),
      {
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    res.json({ checkoutUrl: sessionResponse.data.url });
  } catch (error) {
    console.error("Error al iniciar setup session en Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/billing/checkout/stripe", authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const email = req.user.email;
  const emailVerified = req.user.email_verified;
  const { planId, payerEmail } = req.body;

  if (!planId) {
    res.status(400).json({ error: "Faltan parámetros planId" });
    return;
  }

  let priceId = "";
  let mode = "subscription";

  if (planId === "brisa") {
    priceId = "price_1TmLKzIMU9aoBatu12345678"; 
    mode = "payment";
  } else if (planId === "serenidad") {
    priceId = "price_1TmLKzIMU9aoBatul698yQv7"; 
  } else if (planId === "nirvana") {
    priceId = "price_1TmLM1IMU9aoBatuZ3kI1O2z";
  }

  const stripeSecretKey = secretOrEnv(stripeSecretKeyParam, "STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuración de Stripe incompleta" });
    return;
  }

  try {
    const stripeCustomerId = await resolveStripeCustomerId(userId, email, emailVerified);
    if (!stripeCustomerId) {
      res.status(400).json({ error: "El usuario no tiene un cliente de Stripe creado." });
      return;
    }

    const sessionParams = new URLSearchParams();
    sessionParams.append("success_url", `${getSafeBaseUrl(req)}/billing-success.html?session_id={CHECKOUT_SESSION_ID}`);
    sessionParams.append("cancel_url", `${getSafeBaseUrl(req)}/billing-failure.html`);
    sessionParams.append("customer", stripeCustomerId);

    if (mode === "subscription") {
      sessionParams.append("mode", "subscription");
      sessionParams.append("line_items[0][price]", priceId);
      sessionParams.append("line_items[0][quantity]", "1");
      sessionParams.append("subscription_data[metadata][userId]", userId);
      sessionParams.append("subscription_data[metadata][planId]", planId);
    } else {
      sessionParams.append("mode", "payment");
      sessionParams.append("line_items[0][price]", priceId);
      sessionParams.append("line_items[0][quantity]", "1");
      sessionParams.append("payment_intent_data[setup_future_usage]", "off_session");
      sessionParams.append("payment_intent_data[metadata][userId]", userId);
      sessionParams.append("payment_intent_data[metadata][planId]", planId);
      sessionParams.append("metadata[userId]", userId);
      sessionParams.append("metadata[planId]", planId);
    }

    const sessionResponse = await axios.post(
      "https://api.stripe.com/v1/checkout/sessions",
      sessionParams.toString(),
      {
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    res.json({ checkoutUrl: sessionResponse.data.url });
  } catch (error) {
    console.error("Error al crear sesión en Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/billing/checkout/stripe/confirm", authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const email = req.user.email;
  const emailVerified = req.user.email_verified;
  const { sessionId } = req.body;

  if (!sessionId) {
    res.status(400).json({ error: "Falta el parámetro sessionId" });
    return;
  }

  const stripeSecretKey = secretOrEnv(stripeSecretKeyParam, "STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuración de Stripe incompleta" });
    return;
  }

  try {
    const sessionResponse = await axios.get(
      `https://api.stripe.com/v1/checkout/sessions/${sessionId}?expand[]=subscription&expand[]=subscription.default_payment_method&expand[]=payment_intent&expand[]=payment_intent.payment_method`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );
    const session = sessionResponse.data;

    const stripeCustomerId = await resolveStripeCustomerId(userId, email, emailVerified);
    if (session.customer !== stripeCustomerId) {
      res.status(403).json({ error: "No tienes permisos para acceder a esta sesión." });
      return;
    }

    let planId = "gratuito";
    let status = "inactive";
    let currentPeriodEnd = null;

    if (session.mode === "subscription") {
      const subscription = session.subscription;
      if (subscription) {
        status = subscription.status;
        planId = subscription.metadata?.planId || "gratuito";
        currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();
      }
    } else if (session.mode === "payment") {
      status = session.payment_status === "paid" ? "active" : "inactive";
      planId = session.metadata?.planId || "gratuito";
      currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    }

    await syncCustomerPaymentMethods(stripeCustomerId, stripeSecretKey, db);

    await db.collection("subscriptions").doc(userId).set({
      userId,
      planId,
      status,
      stripeCustomerId,
      stripeSubscriptionId: session.subscription?.id || null,
      currentPeriodEnd,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    await db.collection("billingProfiles").doc(userId).set({
      planId,
      subscriptionStatus: status,
      currentPeriodEnd,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    await db.collection("fiscalProfiles").doc(userId).set({
      plan: planId,
      paymentStatus: status,
      autoRenew: session.mode === "subscription"
    }, { merge: true });

    const billingRef = db.collection("billingProfiles").doc(userId);
    const billingSnap = await billingRef.get();
    const paymentCards = billingSnap.data()?.paymentCards || [];

    res.json({
      success: true,
      planId,
      status,
      paymentCards
    });
  } catch (error) {
    console.error("Error al confirmar pago en Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/billing/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  const stripeSecretKey = secretOrEnv(stripeSecretKeyParam, "STRIPE_SECRET_KEY");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "whsec_mock_key";
  const signatureHeader = req.headers["stripe-signature"];

  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuración de Stripe incompleta" });
    return;
  }

  const rawBody = req.body ? req.body.toString("utf8") : "";
  const isSignatureValid = verifyStripeSignature(rawBody, signatureHeader, webhookSecret);
  
  if (!isSignatureValid && process.env.NODE_ENV === "production") {
    res.status(400).json({ error: "Firma de webhook inválida" });
    return;
  }

  try {
    const event = JSON.parse(rawBody);
    console.log(`[Stripe Webhook] Evento recibido: ${event.type}`);

    if (event.type.startsWith("customer.payment_method.")) {
      const paymentMethod = event.data.object;
      const stripeCustomerId = paymentMethod.customer;
      await syncCustomerPaymentMethods(stripeCustomerId, stripeSecretKey, db);
    } else if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const stripeCustomerId = session.customer;
      
      let userId = session.client_reference_id || session.metadata?.userId;
      if (!userId && session.subscription) {
        const subRes = await axios.get(
          `https://api.stripe.com/v1/subscriptions/${session.subscription}`,
          { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
        );
        userId = subRes.data?.metadata?.userId;
      }

      if (userId) {
        const planId = session.metadata?.planId || session.subscription_data?.metadata?.planId || "gratuito";
        const status = session.payment_status === "paid" ? "active" : "inactive";
        const currentPeriodEnd = session.mode === "subscription" 
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        await db.collection("subscriptions").doc(userId).set({
          userId,
          planId,
          status,
          stripeCustomerId,
          stripeSubscriptionId: session.subscription || null,
          currentPeriodEnd,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        await db.collection("billingProfiles").doc(userId).set({
          planId,
          subscriptionStatus: status,
          currentPeriodEnd,
          stripeCustomerId,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        await db.collection("fiscalProfiles").doc(userId).set({
          plan: planId,
          paymentStatus: status,
          autoRenew: session.mode === "subscription"
        }, { merge: true });
      }

      await syncCustomerPaymentMethods(stripeCustomerId, stripeSecretKey, db);
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Error en webhook de Stripe:", error.message);
    res.status(400).json({ error: `Error de webhook: ${error.message}` });
  }
});

app.post("/api/billing/sync-customer", authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const email = req.user.email;
  const emailVerified = req.user.email_verified;
  const { name } = req.body;

  if (!email) {
    res.status(400).json({ error: "Falta el email del usuario autenticado" });
    return;
  }
  const stripeSecretKey = secretOrEnv(stripeSecretKeyParam, "STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuración de Stripe incompleta" });
    return;
  }
  try {
    let stripeCustomerId = await resolveStripeCustomerId(userId, email, emailVerified);
    if (!stripeCustomerId) {
      const customerParams = new URLSearchParams({
        email: email,
        name: name || "",
        "metadata[userId]": userId
      });
      const customerResponse = await axios.post(
        "https://api.stripe.com/v1/customers",
        customerParams.toString(),
        {
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      );
      stripeCustomerId = customerResponse.data.id;
      
      const billingRef = db.collection("billingProfiles").doc(userId);
      await billingRef.set({ stripeCustomerId }, { merge: true });
    }
    res.json({ stripeCustomerId });
  } catch (error) {
    console.error("Error al sincronizar cliente en Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/billing/payment-methods", authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const userEmail = req.user.email;
  const emailVerified = req.user.email_verified;
  
  const stripeSecretKey = secretOrEnv(stripeSecretKeyParam, "STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuración de Stripe incompleta" });
    return;
  }
  try {
    const stripeCustomerId = await resolveStripeCustomerId(userId, userEmail, emailVerified);
    if (!stripeCustomerId) {
      res.json([]);
      return;
    }

    const customerRes = await axios.get(
      `https://api.stripe.com/v1/customers/${stripeCustomerId}`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );
    let defaultPaymentMethodId = customerRes.data?.invoice_settings?.default_payment_method;

    const pmRes = await axios.get(
      `https://api.stripe.com/v1/payment_methods?customer=${stripeCustomerId}&type=card`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );

    const paymentMethods = pmRes.data?.data || [];
    let pms = paymentMethods.map(pm => {
      const card = pm.card;
      const formattedBrand = String(card.brand || "VISA").toUpperCase();
      return {
        id: pm.id,
        brand: formattedBrand,
        last4: card.last4,
        expiry: `${String(card.exp_month).padStart(2, "0")}/${String(card.exp_year).slice(-2)}`,
        holderName: pm.billing_details?.name || "Titular",
        bankName: formattedBrand === "VISA" ? "Tarjeta Visa" : formattedBrand === "MASTERCARD" ? "Mastercard" : formattedBrand,
        isDefault: pm.id === defaultPaymentMethodId,
        stripePaymentMethodId: pm.id
      };
    });

    if (pms.length > 0 && !defaultPaymentMethodId) {
      const fallbackDefaultId = pms[0].id;
      pms[0].isDefault = true;
      try {
        await axios.post(
          `https://api.stripe.com/v1/customers/${stripeCustomerId}`,
          `invoice_settings[default_payment_method]=${fallbackDefaultId}`,
          {
            headers: {
              Authorization: `Bearer ${stripeSecretKey}`,
              "Content-Type": "application/x-www-form-urlencoded"
            }
          }
        );
      } catch (err) {
        console.warn("Could not set fallback default payment method in Stripe:", err.message);
      }
    }

    const billingRef = db.collection("billingProfiles").doc(userId);
    await billingRef.set({ paymentCards: pms, stripeCustomerId }, { merge: true });

    res.json(pms);
  } catch (error) {
    console.error("Error al obtener métodos de pago de Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/billing/payment-methods/set-default", authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const email = req.user.email;
  const emailVerified = req.user.email_verified;
  const { paymentMethodId } = req.body;
  if (!paymentMethodId) {
    res.status(400).json({ error: "Falta el parámetro paymentMethodId" });
    return;
  }
  const stripeSecretKey = secretOrEnv(stripeSecretKeyParam, "STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuración de Stripe incompleta" });
    return;
  }
  try {
    const stripeCustomerId = await resolveStripeCustomerId(userId, email, emailVerified);
    if (!stripeCustomerId) {
      res.status(400).json({ error: "El usuario no tiene un cliente de Stripe creado." });
      return;
    }

    await axios.post(
      `https://api.stripe.com/v1/customers/${stripeCustomerId}`,
      `invoice_settings[default_payment_method]=${paymentMethodId}`,
      {
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const billingRef = db.collection("billingProfiles").doc(userId);
    const billingSnapshot = await billingRef.get();
    const existingCards = Array.isArray(billingSnapshot.data()?.paymentCards)
      ? billingSnapshot.data().paymentCards
      : [];
    const updatedCards = existingCards.map(c => ({
      ...c,
      isDefault: c.id === paymentMethodId
    }));
    await billingRef.set({ paymentCards: updatedCards }, { merge: true });

    res.json({ success: true, paymentCards: updatedCards });
  } catch (error) {
    console.error("Error al establecer tarjeta predeterminada en Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/billing/payment-methods/delete", authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const email = req.user.email;
  const emailVerified = req.user.email_verified;
  const { paymentMethodId } = req.body;
  if (!paymentMethodId) {
    res.status(400).json({ error: "Falta el parámetro paymentMethodId" });
    return;
  }
  const stripeSecretKey = secretOrEnv(stripeSecretKeyParam, "STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuración de Stripe incompleta" });
    return;
  }
  try {
    const stripeCustomerId = await resolveStripeCustomerId(userId, email, emailVerified);
    if (!stripeCustomerId) {
      res.status(400).json({ error: "El usuario no tiene un cliente de Stripe creado." });
      return;
    }

    await axios.post(
      `https://api.stripe.com/v1/payment_methods/${paymentMethodId}/detach`,
      "",
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );

    const billingRef = db.collection("billingProfiles").doc(userId);
    const billingSnapshot = await billingRef.get();
    const existingCards = Array.isArray(billingSnapshot.data()?.paymentCards)
      ? billingSnapshot.data().paymentCards
      : [];
    const deletedCard = existingCards.find(c => c.id === paymentMethodId);
    let updatedCards = existingCards.filter(c => c.id !== paymentMethodId);

    if (deletedCard?.isDefault && updatedCards.length > 0 && stripeCustomerId) {
      const newDefaultId = updatedCards[0].id;
      updatedCards[0].isDefault = true;
      try {
        await axios.post(
          `https://api.stripe.com/v1/customers/${stripeCustomerId}`,
          `invoice_settings[default_payment_method]=${newDefaultId}`,
          {
            headers: {
              Authorization: `Bearer ${stripeSecretKey}`,
              "Content-Type": "application/x-www-form-urlencoded"
            }
          }
        );
      } catch (err) {
        console.warn("Could not set new default payment method in Stripe during delete:", err.message);
      }
    }

    await billingRef.set({ paymentCards: updatedCards }, { merge: true });
    res.json({ success: true, paymentCards: updatedCards });
  } catch (error) {
    console.error("Error al eliminar tarjeta en Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/billing/payment-methods/attach", authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const email = req.user.email;
  const emailVerified = req.user.email_verified;
  const { paymentMethodId, isDefault } = req.body;

  console.log(`[Attach PM] Inicio. userId: ${userId}, email: ${email}, verified: ${emailVerified}, pmId: ${paymentMethodId}, isDefault: ${isDefault}`);

  if (!paymentMethodId) {
    console.warn("[Attach PM] Error: Falta el parámetro paymentMethodId");
    res.status(400).json({ error: "Faltan parámetros paymentMethodId" });
    return;
  }
  const stripeSecretKey = secretOrEnv(stripeSecretKeyParam, "STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    console.error("[Attach PM] Error: STRIPE_SECRET_KEY no está configurado");
    res.status(500).json({ error: "Configuración de Stripe incompleta" });
    return;
  }
  try {
    console.log("[Attach PM] Resolviendo stripeCustomerId...");
    const stripeCustomerId = await resolveStripeCustomerId(userId, email, emailVerified);
    console.log(`[Attach PM] stripeCustomerId resuelto: ${stripeCustomerId}`);
    if (!stripeCustomerId) {
      console.warn("[Attach PM] Error: No se pudo resolver stripeCustomerId");
      res.status(400).json({ error: "El usuario no tiene un cliente de Stripe creado." });
      return;
    }

    console.log(`[Attach PM] Obteniendo detalles de PaymentMethod ${paymentMethodId} desde Stripe...`);
    const pmDetailsRes = await axios.get(
      `https://api.stripe.com/v1/payment_methods/${paymentMethodId}`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );
    const pmDetails = pmDetailsRes.data;
    console.log(`[Attach PM] Detalles obtenidos. Cliente actual del PM en Stripe: ${pmDetails.customer}`);

    if (pmDetails.customer && pmDetails.customer !== stripeCustomerId) {
      console.warn(`[Attach PM] Error de permisos: PM pertenece a otro cliente (${pmDetails.customer})`);
      res.status(403).json({ error: "No tienes permisos para asociar este método de pago." });
      return;
    }

    if (pmDetails.customer !== stripeCustomerId) {
      console.log(`[Attach PM] Vinculando PM ${paymentMethodId} al cliente ${stripeCustomerId}...`);
      const attachRes = await axios.post(
        `https://api.stripe.com/v1/payment_methods/${paymentMethodId}/attach`,
        `customer=${stripeCustomerId}`,
        {
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      );
      console.log(`[Attach PM] Vinculado con éxito. Cliente reportado por attach: ${attachRes.data.customer}`);
      if (attachRes.data.customer !== stripeCustomerId) {
        console.error("[Attach PM] Error: Operación de vinculación inválida");
        res.status(403).json({ error: "Operación de vinculación inválida." });
        return;
      }
    }

    console.log("[Attach PM] Obteniendo perfil de facturación actual de Firestore...");
    const billingRef = db.collection("billingProfiles").doc(userId);
    const billingSnapshot = await billingRef.get();
    const existingCards = Array.isArray(billingSnapshot.data()?.paymentCards)
      ? billingSnapshot.data().paymentCards
      : [];
    console.log(`[Attach PM] Tarjetas existentes en Firestore: ${existingCards.length}`);
    
    const setAsDefault = isDefault || existingCards.length === 0;
    if (setAsDefault) {
      console.log(`[Attach PM] Configurando PM ${paymentMethodId} como predeterminado en Stripe...`);
      await axios.post(
        `https://api.stripe.com/v1/customers/${stripeCustomerId}`,
        `invoice_settings[default_payment_method]=${paymentMethodId}`,
        {
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      );
      console.log("[Attach PM] Predeterminado configurado con éxito en Stripe.");
    }

    console.log("[Attach PM] Sincronizando métodos de pago de Stripe a Firestore...");
    await syncCustomerPaymentMethods(stripeCustomerId, stripeSecretKey, db);
    console.log("[Attach PM] Sincronización completada.");
    
    const updatedSnapshot = await billingRef.get();
    const updatedCards = updatedSnapshot.data()?.paymentCards || [];
    console.log(`[Attach PM] Retornando ${updatedCards.length} tarjetas actualizadas.`);

    res.json({ success: true, paymentCards: updatedCards });
  } catch (error) {
    console.error("[Attach PM] EXCEPCIÓN DETECTADA:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/billing/cancel-subscription", authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  try {
    await db.collection("subscriptions").doc(userId).set({
      status: "subscription_cancelled",
      updatedAt: new Date().toISOString()
    }, { merge: true });

    await db.collection("billingProfiles").doc(userId).set({
      subscriptionStatus: "subscription_cancelled",
      planId: "gratuito"
    }, { merge: true });

    await db.collection("fiscalProfiles").doc(userId).set({
      plan: "gratuito",
      paymentStatus: "subscription_cancelled",
      autoRenew: false
    }, { merge: true });

    res.json({ success: true, message: "Suscripción cancelada exitosamente." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
exports.api = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "512MiB",
    secrets: [
      geminiApiKey,
      geminiPrimaryKey,
      geminiSecondaryKey,
      openAiApiKey,
      stripeSecretKeyParam,
      mercadoPagoAccessTokenParam,
      paypalClientIdParam,
      paypalClientSecretParam
    ]
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
