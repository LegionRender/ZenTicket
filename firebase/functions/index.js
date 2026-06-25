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

// Helpers for PayPal Access Token
async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Faltan credenciales PAYPAL_CLIENT_ID o PAYPAL_CLIENT_SECRET.");
  }
  
  const host = process.env.PAYPAL_MODE === "sandbox" || clientId.startsWith("Ad") || clientId.startsWith("AZ") || process.env.NODE_ENV !== "production"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  
  const response = await axios.post(
    `${host}/v1/oauth2/token`,
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
    host
  };
}

// 1. Mercado Pago Checkout (Single Preference)
app.post("/api/billing/checkout/mercadopago", async (req, res) => {
  const { userId, planId } = req.body;
  if (!userId || !planId) {
    res.status(400).json({ error: "Faltan parámetros userId o planId" });
    return;
  }

  let price = 0;
  let title = "";
  if (planId === "brisa") {
    price = 99.00;
    title = "Plan Brisa - ZenTicket";
  } else if (planId === "serenidad") {
    price = 250.00;
    title = "Plan Serenidad - ZenTicket";
  } else if (planId === "nirvana") {
    price = 500.00;
    title = "Plan Nirvana - ZenTicket";
  } else if (planId === "personal") {
    price = 150.00;
    title = "Plan Personal - ZenTicket";
  } else if (planId === "empresa") {
    price = 300.00;
    title = "Plan Empresa - ZenTicket";
  } else {
    res.status(400).json({ error: "Plan inválido para pago" });
    return;
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    res.status(500).json({ error: "Configuración de pasarela incompleta en servidor" });
    return;
  }

  try {
    const response = await axios.post(
      "https://api.mercadopago.com/v1/preferences",
      {
        items: [
          {
            title: title,
            quantity: 1,
            unit_price: price,
            currency_id: "MXN"
          }
        ],
        back_urls: {
          success: process.env.BILLING_SUCCESS_URL || `${process.env.APP_PUBLIC_URL}/workspace?tab=cuenta&status=success`,
          failure: process.env.BILLING_FAILURE_URL || `${process.env.APP_PUBLIC_URL}/workspace?tab=cuenta&status=failure`,
          pending: process.env.BILLING_PENDING_URL || `${process.env.APP_PUBLIC_URL}/workspace?tab=cuenta&status=pending`
        },
        auto_return: "approved",
        notification_url: `${process.env.APP_PUBLIC_URL}/api/billing/webhooks/mercadopago`,
        external_reference: `${userId}:${planId}`
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    const preference = response.data;
    const paymentDocId = `mp_pref_${preference.id}`;
    
    await db.collection("payments").doc(paymentDocId).set({
      userId,
      planId,
      provider: "mercadopago",
      providerPaymentId: preference.id,
      amount: price,
      currency: "MXN",
      status: "pending_payment",
      checkoutUrl: preference.init_point,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    res.json({ checkoutUrl: preference.init_point });
  } catch (error) {
    console.error("Error al crear preferencia en Mercado Pago:", error.response?.data || error.message);
    res.status(500).json({ error: "Error al comunicarse con Mercado Pago" });
  }
});

// 2. Mercado Pago Subscription (Preapproval)
app.post("/api/billing/subscription/mercadopago", async (req, res) => {
  const { userId, planId, payerEmail } = req.body;
  if (!userId || !planId) {
    res.status(400).json({ error: "Faltan parámetros userId o planId" });
    return;
  }

  let price = 0;
  let title = "";
  if (planId === "brisa") {
    price = 99.00;
    title = "Plan Brisa - ZenTicket";
  } else if (planId === "serenidad") {
    price = 250.00;
    title = "Plan Serenidad - ZenTicket";
  } else if (planId === "nirvana") {
    price = 500.00;
    title = "Plan Nirvana - ZenTicket";
  } else if (planId === "personal") {
    price = 150.00;
    title = "Plan Personal - ZenTicket";
  } else if (planId === "empresa") {
    price = 300.00;
    title = "Plan Empresa - ZenTicket";
  } else {
    res.status(400).json({ error: "Plan inválido para suscripción" });
    return;
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    res.status(500).json({ error: "Configuración de pasarela incompleta en servidor" });
    return;
  }

  try {
    const response = await axios.post(
      "https://api.mercadopago.com/preapprovals",
      {
        back_url: process.env.BILLING_SUCCESS_URL || `${process.env.APP_PUBLIC_URL}/workspace?tab=cuenta&status=success`,
        reason: title,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: price,
          currency_id: "MXN"
        },
        payer_email: payerEmail || "payer@zenticket.mx",
        external_reference: `${userId}:${planId}`
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    const preapproval = response.data;
    const paymentDocId = `mp_sub_${preapproval.id}`;
    
    await db.collection("payments").doc(paymentDocId).set({
      userId,
      planId,
      provider: "mercadopago",
      providerPaymentId: preapproval.id,
      amount: price,
      currency: "MXN",
      status: "pending_payment",
      checkoutUrl: preapproval.init_point,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    res.json({ checkoutUrl: preapproval.init_point });
  } catch (error) {
    console.error("Error al crear suscripción en Mercado Pago:", error.response?.data || error.message);
    res.status(500).json({ error: "Error al crear suscripción en Mercado Pago" });
  }
});

// 3. PayPal Checkout (Single Order)
app.post("/api/billing/checkout/paypal", async (req, res) => {
  const { userId, planId } = req.body;
  if (!userId || !planId) {
    res.status(400).json({ error: "Faltan parámetros userId o planId" });
    return;
  }

  let price = 0;
  let title = "";
  if (planId === "brisa") {
    price = 99.00;
    title = "Plan Brisa - ZenTicket";
  } else if (planId === "serenidad") {
    price = 250.00;
    title = "Plan Serenidad - ZenTicket";
  } else if (planId === "nirvana") {
    price = 500.00;
    title = "Plan Nirvana - ZenTicket";
  } else if (planId === "personal") {
    price = 150.00;
    title = "Plan Personal - ZenTicket";
  } else if (planId === "empresa") {
    price = 300.00;
    title = "Plan Empresa - ZenTicket";
  } else {
    res.status(400).json({ error: "Plan inválido para pago" });
    return;
  }

  try {
    const { accessToken, host } = await getPayPalAccessToken();
    const response = await axios.post(
      `${host}/v2/checkout/orders`,
      {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: `${userId}:${planId}`,
            amount: {
              currency_code: "MXN",
              value: price.toFixed(2)
            },
            description: title
          }
        ],
        application_context: {
          return_url: process.env.BILLING_SUCCESS_URL || `${process.env.APP_PUBLIC_URL}/workspace?tab=cuenta&status=success`,
          cancel_url: process.env.BILLING_FAILURE_URL || `${process.env.APP_PUBLIC_URL}/workspace?tab=cuenta&status=failure`
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    const order = response.data;
    const approvalUrl = order.links.find(l => l.rel === "approve")?.href;
    const paymentDocId = `pp_pref_${order.id}`;

    await db.collection("payments").doc(paymentDocId).set({
      userId,
      planId,
      provider: "paypal",
      providerPaymentId: order.id,
      amount: price,
      currency: "MXN",
      status: "pending_payment",
      checkoutUrl: approvalUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    res.json({ checkoutUrl: approvalUrl, orderId: order.id });
  } catch (error) {
    console.error("Error al crear orden en PayPal:", error.response?.data || error.message);
    res.status(500).json({ error: "Error al comunicarse con PayPal" });
  }
});

// 4. Mercado Pago Webhook
app.post("/api/billing/webhooks/mercadopago", async (req, res) => {
  const paymentId = req.query.id || req.body?.data?.id || req.body?.id;
  const topic = req.query.topic || req.body?.type || req.body?.action;

  console.log(`[Mercado Pago Webhook] Recibido event: ${topic} con ID: ${paymentId}`);

  if (paymentId) {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      res.status(500).send("Webhook config error: missing token");
      return;
    }

    try {
      await db.collection("billingEvents").add({
        provider: "mercadopago",
        eventType: topic || "unknown",
        providerEventId: paymentId.toString(),
        processed: true,
        receivedAt: new Date().toISOString()
      });

      if (topic === "payment" || topic === "payment.created" || topic === "payment.updated") {
        const response = await axios.get(
          `https://api.mercadopago.com/v1/payments/${paymentId}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );

        const paymentData = response.data;
        const status = paymentData.status;
        const externalReference = paymentData.external_reference; // "userId:planId"

        if (externalReference) {
          const [userId, planId] = externalReference.split(":");
          
          let localStatus = "pending_payment";
          if (status === "approved") localStatus = "paid";
          else if (status === "in_process" || status === "pending") localStatus = "payment_processing";
          else if (status === "rejected") localStatus = "payment_rejected";
          else if (status === "cancelled" || status === "refunded") localStatus = "payment_failed";

          const paymentDocId = `mp_payment_${paymentId}`;
          await db.collection("payments").doc(paymentDocId).set({
            userId,
            planId,
            provider: "mercadopago",
            providerPaymentId: paymentId.toString(),
            amount: paymentData.transaction_amount,
            currency: paymentData.currency_id || "MXN",
            status: localStatus,
            paidAt: status === "approved" ? new Date().toISOString() : null,
            createdAt: new Date(paymentData.date_created).toISOString(),
            updatedAt: new Date().toISOString()
          }, { merge: true });

          if (status === "approved") {
            let limit = 5;
            if (planId === "brisa") limit = 10;
            else if (planId === "serenidad") limit = 30;
            else if (planId === "nirvana") limit = 100;

            await db.collection("subscriptions").doc(userId).set({
              userId,
              planId,
              planName: `Plan ${planId.charAt(0).toUpperCase() + planId.slice(1)}`,
              status: "subscription_active",
              provider: "mercadopago",
              providerSubscriptionId: paymentId.toString(),
              currentPeriodStart: new Date().toISOString(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              invoicesLimit: limit,
              invoicesUsed: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });

            await db.collection("fiscalProfiles").doc(userId).set({
              plan: planId,
              planStartDate: new Date().toISOString(),
              paymentStatus: "paid",
              autoRenew: true
            }, { merge: true });
          }
        }
      } else if (topic === "preapproval" || topic === "subscription") {
        const response = await axios.get(
          `https://api.mercadopago.com/preapprovals/${paymentId}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );

        const subData = response.data;
        const status = subData.status;
        const externalReference = subData.external_reference;

        if (externalReference) {
          const [userId, planId] = externalReference.split(":");
          
          if (status === "authorized") {
            let limit = 5;
            if (planId === "brisa") limit = 10;
            else if (planId === "serenidad") limit = 30;
            else if (planId === "nirvana") limit = 100;

            await db.collection("subscriptions").doc(userId).set({
              userId,
              planId,
              planName: `Plan ${planId.charAt(0).toUpperCase() + planId.slice(1)}`,
              status: "subscription_active",
              provider: "mercadopago",
              providerSubscriptionId: subData.id.toString(),
              currentPeriodStart: new Date().toISOString(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              invoicesLimit: limit,
              invoicesUsed: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });

            await db.collection("fiscalProfiles").doc(userId).set({
              plan: planId,
              planStartDate: new Date().toISOString(),
              paymentStatus: "subscription_active",
              autoRenew: true
            }, { merge: true });
          } else if (status === "cancelled") {
            await db.collection("subscriptions").doc(userId).set({
              status: "subscription_cancelled",
              updatedAt: new Date().toISOString()
            }, { merge: true });

            await db.collection("fiscalProfiles").doc(userId).set({
              plan: "gratuito",
              paymentStatus: "subscription_cancelled",
              autoRenew: false
            }, { merge: true });
          }
        }
      }

      res.status(200).send("OK");
      return;
    } catch (error) {
      console.error("Error al procesar webhook de Mercado Pago:", error.response?.data || error.message);
      res.status(500).send("Webhook processing error");
      return;
    }
  }

  res.status(200).send("Ignored");
});

// 5. PayPal Webhook
app.post("/api/billing/webhooks/paypal", async (req, res) => {
  const event = req.body;
  console.log(`[PayPal Webhook] Recibido event: ${event?.event_type}`);

  try {
    await db.collection("billingEvents").add({
      provider: "paypal",
      eventType: event.event_type || "unknown",
      providerEventId: event.id || "unknown",
      processed: true,
      receivedAt: new Date().toISOString()
    });

    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED" || event.event_type === "CHECKOUT.ORDER.APPROVED") {
      const capture = event.resource;
      const orderId = capture.custom_id || event.resource.supplementary_data?.related_ids?.order_id || capture.id;

      const { accessToken, host } = await getPayPalAccessToken();
      const orderResponse = await axios.get(
        `${host}/v2/checkout/orders/${orderId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      const orderData = orderResponse.data;
      const purchaseUnit = orderData.purchase_units?.[0];
      const externalReference = purchaseUnit?.reference_id; // "userId:planId"

      if (externalReference) {
        const [userId, planId] = externalReference.split(":");
        const amount = parseFloat(purchaseUnit.amount.value);

        const paymentDocId = `pp_payment_${capture.id}`;
        await db.collection("payments").doc(paymentDocId).set({
          userId,
          planId,
          provider: "paypal",
          providerPaymentId: capture.id,
          amount: amount,
          currency: purchaseUnit.amount.currency_code || "MXN",
          status: "paid",
          paidAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }, { merge: true });

        let limit = 5;
        if (planId === "brisa") limit = 10;
        else if (planId === "serenidad") limit = 30;
        else if (planId === "nirvana") limit = 100;

        await db.collection("subscriptions").doc(userId).set({
          userId,
          planId,
          planName: `Plan ${planId.charAt(0).toUpperCase() + planId.slice(1)}`,
          status: "subscription_active",
          provider: "paypal",
          providerSubscriptionId: orderId,
          currentPeriodStart: new Date().toISOString(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          invoicesLimit: limit,
          invoicesUsed: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        await db.collection("fiscalProfiles").doc(userId).set({
          plan: planId,
          planStartDate: new Date().toISOString(),
          paymentStatus: "paid",
          autoRenew: true
        }, { merge: true });
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Error al procesar webhook de PayPal:", error.message);
    res.status(500).send("Error de procesamiento");
  }
});

// 6. Get Billing Status
app.get("/api/billing/status/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const docSnap = await db.collection("subscriptions").doc(userId).get();
    if (!docSnap.exists) {
      res.json({
        userId,
        planId: "gratuito",
        planName: "Plan Gratuito",
        status: "free",
        provider: "none",
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        invoicesLimit: 5,
        invoicesUsed: 0
      });
      return;
    }
    res.json(docSnap.data());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get PayPal Client ID safely for frontend SDK
app.get("/api/config/paypal-client-id", (req, res) => {
  res.json({ clientId: process.env.PAYPAL_CLIENT_ID || "" });
});

// 7. Cancel Subscription
app.post("/api/billing/cancel-subscription", async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    res.status(400).json({ error: "Falta userId" });
    return;
  }
  try {
    await db.collection("subscriptions").doc(userId).set({
      status: "subscription_cancelled",
      updatedAt: new Date().toISOString()
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
