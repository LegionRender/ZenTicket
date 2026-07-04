const express = require("express");
const admin = require("firebase-admin");
const axios = require("axios");
const {
  parseSatQrUrl,
  validateXmlStructure,
  parseCfdiInfo,
  verifyCfdiWithSat
} = require("./fiscalUtils");
const { GoogleGenAI } = require("@google/genai");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret, defineString } = require("firebase-functions/params");

admin.initializeApp();

const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore(undefined, "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee");
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
    referenciaFacturacion: { type: "STRING", description: "Referencia de facturación, código de facturación o código largo impreso en el ticket (ej: ITU de 15-20 dígitos, o 12 dígitos numéricos para Farmacias Similares)." },
    codigoBarras: { type: "STRING", description: "Código de barras numérico impreso en el ticket (número largo generalmente de 12 a 13 dígitos)." },
    rawOcrText: { type: "STRING", description: "El texto completo e integro extraido del ticket de forma literal, linea por linea." },
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
  required: ["rfcEmisor", "nombreEmisor", "fechaCompra", "folio", "total", "rawOcrText", "items"]
};

const OCR_PROMPT = [
  "Analiza esta fotografia de un ticket de compra mexicano y extrae solo datos visibles.",
  "No inventes comercios, RFC, folios, fechas, importes ni conceptos.",
  "Si un dato no es legible, devuelve cadena vacia; para total no legible devuelve 0.",
  "No uses ejemplos populares como OXXO, Walmart o Starbucks salvo que el ticket lo muestre explicitamente.",
  "Si encuentras un código de barras largo o número largo de referencia para facturar (como ITU de 15-20 dígitos, o número largo de 12 dígitos de Farmacias Similares/Confianza), por favor extráelos de manera muy precisa en los campos referenciaFacturacion y codigoBarras respectivamente.",
  "Devuelve un JSON estructurado con rfcEmisor, nombreEmisor, fechaCompra, folio, total, sucursal, referenciaFacturacion, codigoBarras e items."
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
    rawOcrText: "",
    cost: 0,
    rawCost: 0,
    extractionState: "manual_input_required",
    portalFieldsConfidence: { billingReference: 0.0, total: 0.0 },
    extractionDiagnostics: { reasonForManualInput: "PROVIDER_ERROR_FALLBACK" }
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

async function analyzeTicketImageQuality(ai, imagePart) {
  const schema = {
    type: "OBJECT",
    properties: {
      isBlurry: { type: "BOOLEAN", description: "Verdadero si la imagen está borrosa o movida." },
      isCropped: { type: "BOOLEAN", description: "Verdadero si el ticket está cortado en partes esenciales." },
      isLowLighting: { type: "BOOLEAN", description: "Verdadero si la iluminación es demasiado baja o hay sombras críticas." },
      isLegible: { type: "BOOLEAN", description: "Verdadero si el texto del ticket se puede leer con facilidad." },
      isIncomplete: { type: "BOOLEAN", description: "Verdadero si faltan partes importantes del ticket." },
      reason: { type: "STRING", description: "Breve descripción en español del problema si se detectó alguno." }
    },
    required: ["isBlurry", "isCropped", "isLowLighting", "isLegible", "isIncomplete", "reason"]
  };
  const prompt = "Analiza detalladamente la calidad visual de esta fotografía de un ticket de compra. Determina si la imagen está borrosa, cortada, con mala iluminación, ilegible o incompleta. Si todo está perfecto y legible, pon 'reason' como 'OK'.";
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [imagePart, { text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });
    if (response.text) {
      return JSON.parse(response.text.trim());
    }
  } catch (e) {
    console.warn("Quality analysis model call failed:", e);
  }
  return { isBlurry: false, isCropped: false, isLowLighting: false, isLegible: true, isIncomplete: false, reason: "No se pudo analizar" };
}

async function runSecondaryExtraction(ai, imagePart, rawOcrText, connector, missingFieldKey) {
  if (!connector || !connector.extractionContract) return null;
  const contract = connector.extractionContract;
  if (!contract.requiredPortalFields) return null;
  const field = contract.requiredPortalFields.find(f => f.canonicalKey === missingFieldKey);
  if (!field) return null;

  const hints = field.fieldExtractionHints || {};
  const schema = {
    type: "OBJECT",
    properties: {
      extractedValue: { type: "STRING", description: `El valor extraído para ${field.label}. Si no lo encuentras literalmente, devuelve null.` }
    },
    required: ["extractedValue"]
  };

  let prompt = `Este ticket pertenece a ${connector.nombre}.\n`;
  prompt += `Busca en la imagen y el texto OCR la referencia de facturación: ${field.label}.\n`;
  prompt += `Pistas de la zona: ${hints.likelyZones ? hints.likelyZones.join(", ") : "Cualquier parte del ticket"}.\n`;
  prompt += `Palabras cercanas asociadas: ${hints.nearbyWords ? hints.nearbyWords.join(", ") : ""}.\n`;
  prompt += `Reglas de filtrado: No debe ser un UUID, folio fiscal, ticketId, doc.id ni ningún identificador interno del sistema.\n`;
  if (field.validationPattern) {
    prompt += `Patrón requerido (Regex): ${field.validationPattern}.\n`;
  }
  prompt += `Instrucción detallada: "Busca únicamente este dato en la imagen. Si no aparece claramente, devuelve null. No inventes. No uses UUID, folio fiscal, ticketId, doc.id ni identificadores internos."\n`;
  prompt += `Texto OCR de referencia:\n${rawOcrText}\n`;

  try {
    console.log(`[OCR Secondary] Attempting secondary extraction for field ${missingFieldKey}`);
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [imagePart, { text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });
    if (response.text) {
      const parsed = JSON.parse(response.text.trim());
      return parsed.extractedValue || null;
    }
  } catch (e) {
    console.warn(`[OCR Secondary Error] failed for ${missingFieldKey}:`, e);
  }
  return null;
}

function calculateGeminiRawCost(response) {
  const promptTokens = response.usageMetadata?.promptTokenCount || 0;
  const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;
  const exchangeRate = 18.5;
  return (((promptTokens * 0.075) + (outputTokens * 0.30)) / 1000000) * exchangeRate;
}

async function runGeminiOcr(provider, image, mimeType, matchedConnector = null) {
  const ai = new GoogleGenAI({ apiKey: provider.key });
  let lastError = "";

  // Prepare custom schema/prompt if connector matched
  let targetedPromptText = OCR_PROMPT;
  let targetedSchema = OCR_RESPONSE_SCHEMA;

  if (matchedConnector && matchedConnector.extractionContract) {
    const contract = matchedConnector.extractionContract;
    targetedPromptText = `Analiza la imagen del ticket de compra comercial del comercio: ${matchedConnector.nombre} (también conocido como: ${matchedConnector.aliases ? matchedConnector.aliases.join(", ") : "n/a"}).\n`;
    targetedPromptText += `Extrae únicamente los campos requeridos por el portal de facturación oficial:\n`;
    for (const f of contract.requiredPortalFields) {
      const hints = f.fieldExtractionHints || {};
      targetedPromptText += `- Campo: ${f.label} (clave: ${f.canonicalKey})\n`;
      if (f.hints && Array.isArray(f.hints)) {
        targetedPromptText += `  * Pistas: ${f.hints.join(". ")}\n`;
      }
      if (hints.likelyZones) targetedPromptText += `  * Zonas probables: ${hints.likelyZones.join(", ")}\n`;
      if (hints.nearbyWords) targetedPromptText += `  * Palabras clave cercanas: ${hints.nearbyWords.join(", ")}\n`;
      if (f.validationPattern) targetedPromptText += `  * Formato esperado (Regex): ${f.validationPattern}\n`;
      if (f.forbiddenPatterns) targetedPromptText += `  * Patrones prohibidos: ${f.forbiddenPatterns.join(", ")}\n`;
    }
    targetedPromptText += `\nINSTRUCCIÓN CRÍTICA DE SEGURIDAD: Queda estrictamente prohibido extraer, inferir o inventar cualquier valor de tipo UUID (como xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx), ticketId, doc.id, jobId, folio fiscal SAT, o identificador interno de ZenTicket o del sistema. Si detectas tales valores, ignóralos y no los uses para el campo billingReference.\n`;
    targetedPromptText += `Si un campo requerido no aparece físicamente o de forma legible en el ticket, debes devolver obligatoriamente null o una cadena vacía. No inventes datos.\n`;
    targetedPromptText += `También extrae la fecha de compra (fechaCompra) en formato YYYY-MM-DD, la sucursal (sucursal) y la lista de artículos comprados (items).`;

    const customProperties = {
      rfcEmisor: { type: "STRING" },
      nombreEmisor: { type: "STRING" },
      fechaCompra: { type: "STRING", description: "Fecha de compra en formato YYYY-MM-DD. Si no la encuentras, devuelve null." },
      sucursal: { type: "STRING" },
      rawOcrText: { type: "STRING", description: "El texto completo e íntegro extraído del ticket de forma literal, línea por línea." },
      portalFieldsConfidence: {
        type: "OBJECT",
        properties: {}
      },
      items: {
        type: "ARRAY",
        description: "Lista de conceptos comprados descritos en el ticket",
        items: {
          type: "OBJECT",
          properties: {
            description: { type: "STRING" },
            amount: { type: "NUMBER" }
          },
          required: ["description", "amount"]
        }
      }
    };

    const confidenceRequired = [];
    for (const f of contract.requiredPortalFields) {
      const fieldKey = String(f.canonicalKey || f.key || "").replace(/^portalFields\./, "");
      if (!fieldKey) continue;
      const fieldType = ["number", "currency", "decimal"].includes(String(f.type || "").toLowerCase())
        ? "NUMBER"
        : "STRING";
      customProperties[fieldKey] = {
        type: fieldType,
        description: `${f.label || fieldKey}. Devuelve solamente el valor literal del ticket; si no aparece, devuelve ${fieldType === "NUMBER" ? "0" : "una cadena vacía"}.`
      };
      customProperties.portalFieldsConfidence.properties[fieldKey] = {
        type: "NUMBER",
        description: `Confianza de 0.0 a 1.0 para ${f.label || fieldKey}; devuelve 0.0 si no aparece.`
      };
      confidenceRequired.push(fieldKey);
    }
    if (confidenceRequired.length > 0) {
      customProperties.portalFieldsConfidence.required = confidenceRequired;
    }

    targetedSchema = {
      type: "OBJECT",
      properties: customProperties,
      required: ["rfcEmisor", "nombreEmisor", "rawOcrText", "items", "portalFieldsConfidence"]
    };
  }

  for (const model of provider.models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            { inlineData: { mimeType: mimeType || "image/jpeg", data: image } },
            { text: targetedPromptText }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: targetedSchema
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

async function runProviderOcr(provider, image, mimeType, matchedConnector = null) {
  if (provider.provider === "gemini") {
    return runGeminiOcr(provider, image, mimeType, matchedConnector);
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

function sanitizeBillingReferenceForConnector(value, rawOcrText, connector, fieldContract) {
  if (!value) return "";

  let cleanValue = String(value).trim();

  // 1. General forbidden checks (UUIDs, internal IDs)
  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(cleanValue);
  const hasInternalPrefix = /^ticket_|^job_|^OFFLINE-|^worker-/i.test(cleanValue);
  if (isUuid || hasInternalPrefix) {
    let contractField = fieldContract;
    if (!contractField && connector && connector.extractionContract) {
      contractField = connector.extractionContract.requiredPortalFields?.find(
        (f) => f.canonicalKey === "billingReference" || f.key === "portalFields.billingReference"
      );
    }
    let allowsUuid = false;
    if (contractField && contractField.validationPattern) {
      try {
        const regex = new RegExp(contractField.validationPattern, "i");
        allowsUuid = regex.test(cleanValue);
      } catch (e) {}
    }
    if (!allowsUuid) {
      console.log(`[Sanitizer] Blocked UUID or internal prefix: "${cleanValue}"`);
      return "";
    }
  }

  // 2. Length check: if value is > 20 characters and does not match the expected pattern, block it.
  if (cleanValue.length > 20) {
    let patternPassed = false;
    let contractField = fieldContract;
    if (!contractField && connector && connector.extractionContract) {
      contractField = connector.extractionContract.requiredPortalFields?.find(
        (f) => f.canonicalKey === "billingReference" || f.key === "portalFields.billingReference"
      );
    }
    if (contractField && contractField.validationPattern) {
      try {
        const regex = new RegExp(contractField.validationPattern, "i");
        patternPassed = regex.test(cleanValue);
      } catch (e) {}
    }
    if (!patternPassed) {
      console.log(`[Sanitizer] Blocked too long value (>20 chars) without matching pattern: "${cleanValue}"`);
      return "";
    }
  }

  // 3. Extraction contract field-specific checks
  let contractField = fieldContract;
  if (!contractField && connector && connector.extractionContract) {
    contractField = connector.extractionContract.requiredPortalFields?.find(
      (f) => f.canonicalKey === "billingReference" || f.key === "portalFields.billingReference"
    );
  }

  if (contractField) {
    // validationPattern check
    if (contractField.validationPattern) {
      try {
        const regex = new RegExp(contractField.validationPattern, "i");
        if (!regex.test(cleanValue)) {
          console.log(`[Sanitizer] Blocked by validationPattern "${contractField.validationPattern}": "${cleanValue}"`);
          return "";
        }
      } catch (e) {}
    }

    // forbiddenPatterns check
    if (contractField.forbiddenPatterns && contractField.forbiddenPatterns.length > 0) {
      for (const pattern of contractField.forbiddenPatterns) {
        try {
          const regex = new RegExp(pattern, "i");
          if (regex.test(cleanValue)) {
            console.log(`[Sanitizer] Blocked by forbiddenPattern "${pattern}": "${cleanValue}"`);
            return "";
          }
        } catch (e) {}
      }
    }

    // requireLiteralMatch check
    if (contractField.requireLiteralMatch === true && rawOcrText) {
      if (!rawOcrText.includes(cleanValue)) {
        console.log(`[Sanitizer] Blocked: value "${cleanValue}" is not present in rawOcrText`);
        return "";
      }
    }
  }

  return cleanValue;
}

async function processOcrRequest({ req, image, mimeType, userId, retryJobId = null, forceTargetedRetry = false, connectorId = null }) {
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
      const ai = new GoogleGenAI({ apiKey: provider.key });
      
      // Load connectors list
      let connectorsList = [];
      try {
        const snap = await db.collection("connectors").get();
        connectorsList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) {
        console.warn("Could not retrieve connectors list from DB:", e.message);
      }

      let matchedConnector = null;
      let brandAliases = [];
      let billingUrl = "";
      let evidence = "";
      let confidence = 0.0;
      let detectedName = "";
      let detectedRfc = "";

      if (forceTargetedRetry && connectorId) {
        matchedConnector = connectorsList.find(c => c.id === connectorId) || null;
        console.log(`[OCR Force Retry Cloud] Forced connector: ${matchedConnector?.nombre}`);
        if (matchedConnector) {
          detectedName = matchedConnector.nombre;
          detectedRfc = matchedConnector.rfc;
        }
      } else {
        // STAGE 1: Identify Merchant
        let successId = false;

        const idSchema = {
          type: "OBJECT",
          properties: {
            merchantName: { type: "STRING", description: "Nombre comercial o razón social de la tienda en mayúsculas." },
            emitterRfc: { type: "STRING", description: "RFC del emisor de la tienda. Si no viene o no es legible, coloca 'XAXX010101000'." },
            brandAliases: { type: "ARRAY", items: { type: "STRING" }, description: "Lista de posibles marcas o nombres alternos por los que se conoce al comercio." },
            billingUrl: { type: "STRING", description: "URL del portal de facturación visible en el ticket, si existe." },
            evidence: { type: "STRING", description: "Evidencia textual o fragmento literal extraído del ticket que demuestre el nombre del comercio." },
            confidence: { type: "NUMBER", description: "Estimación de confianza en la identificación del comercio, de 0.0 a 1.0." }
          },
          required: ["merchantName", "emitterRfc", "confidence"]
        };

        const idPrompt = {
          text: "Analiza la imagen de este ticket de compra. Identifica únicamente el comercio emisor, extrayendo su nombre comercial (merchantName), RFC (emitterRfc - si no viene usa XAXX010101000), nombres alternos o alias (brandAliases), la URL del portal de facturación oficial si viene impresa en el ticket (billingUrl), un fragmento literal del ticket que evidencie estos datos (evidence), y tu estimación de confianza en la identificación (confidence, de 0.0 a 1.0)."
        };

        const imagePart = {
          inlineData: {
            mimeType: mimeType || "image/jpeg",
            data: image,
          },
        };

        for (const model of provider.models) {
          if (successId) break;
          try {
            console.log(`[OCR Stage 1 Cloud] Identifying merchant with model ${model}`);
            const response = await ai.models.generateContent({
              model,
              contents: { parts: [imagePart, idPrompt] },
              config: {
                responseMimeType: "application/json",
                responseSchema: idSchema
              }
            });
            if (response.text && response.text.trim()) {
              const parsed = JSON.parse(response.text.trim());
              detectedName = parsed.merchantName || parsed.nombreEmisor || "";
              detectedRfc = parsed.emitterRfc || parsed.rfcEmisor || "";
              brandAliases = parsed.brandAliases || [];
              billingUrl = parsed.billingUrl || "";
              evidence = parsed.evidence || "";
              confidence = parsed.confidence || 0.5;
              successId = true;
              console.log(`[OCR Stage 1 Cloud] Identified: ${detectedName} (RFC: ${detectedRfc})`);
            }
          } catch (err) {
            console.warn(`[OCR Stage 1 Cloud Warning] Model ${model} failed:`, err?.message || err);
          }
        }

        // Match locally
        const cleanStr = (s) => 
          (s || "")
            .toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9\s]/g, "")
            .replace(/\b(sa|de|cv|sapi|srl|grupo|comercial|cadena|tiendas|sucursal)\b/g, "")
            .trim();

        const tRfc = (detectedRfc || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const tNombre = cleanStr(detectedName || "");

        const candidates = connectorsList.filter((c) => {
          if (c.status === "disabled" || c.disabledReason === "DUPLICATE_MOCK_CONNECTOR") return false;

          const cRfc = (c.rfc || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (tRfc && cRfc && tRfc === cRfc) return true;

          const cNombre = cleanStr(c.nombre || "");
          if (tNombre && cNombre && (tNombre.includes(cNombre) || cNombre.includes(tNombre))) return true;

          if (c.aliases && Array.isArray(c.aliases)) {
            const matchingAlias = c.aliases.find((alias) => {
              const cleanAlias = cleanStr(alias);
              return tNombre && cleanAlias && (tNombre.includes(cleanAlias) || cleanAlias.includes(tNombre));
            });
            if (matchingAlias) return true;
          }
          return false;
        });

        if (candidates.length > 0) {
          candidates.sort((a, b) => {
            const aProd = a.status === "production_ready" ? 1 : 0;
            const bProd = b.status === "production_ready" ? 1 : 0;
            if (aProd !== bProd) return bProd - aProd;

            const aAvail = (a.status === "automation_available" || a.status === "real_validation") ? 1 : 0;
            const bAvail = (b.status === "automation_available" || b.status === "real_validation") ? 1 : 0;
            if (aAvail !== bAvail) return bAvail - aAvail;

            const aSys = a.userId === "system" ? 1 : 0;
            const bSys = b.userId === "system" ? 1 : 0;
            if (aSys !== bSys) return bSys - aSys;

            const aMock = (a.status === "mock_only" || a.isMock === true) ? 1 : 0;
            const bMock = (b.status === "mock_only" || b.isMock === true) ? 1 : 0;
            if (aMock !== bMock) return aMock - bMock;

            const aContract = (a.extractionContract && a.extractionContract.requiredPortalFields && a.extractionContract.requiredPortalFields.length > 0) ? 1 : 0;
            const bContract = (b.extractionContract && b.extractionContract.requiredPortalFields && b.extractionContract.requiredPortalFields.length > 0) ? 1 : 0;
            if (aContract !== bContract) return bContract - aContract;

            return 0;
          });
          matchedConnector = candidates[0];
        }
      }

      // Check conector readiness
      if (!matchedConnector) {
        console.log(`[OCR Pipeline Cloud] No connector matched for ${detectedName} (${detectedRfc}). Creating candidate.`);
        try {
          const candidateRef = db.collection("connector_candidates").doc();
          await candidateRef.set({
            nombre: detectedName || "Comercio por identificar",
            rfc: detectedRfc || "XAXX010101000",
            aliases: brandAliases || [],
            portalUrl: billingUrl || "",
            status: "pending_setup",
            createdAt: new Date().toISOString()
          });

          const reqRef = db.collection("training_requests").doc();
          await reqRef.set({
            storeName: detectedName || "Comercio por identificar",
            rfc: detectedRfc || "XAXX010101000",
            officialBillingUrl: billingUrl || "",
            status: "pending_training",
            evidence: evidence || "",
            createdAt: new Date().toISOString()
          });
        } catch (e) {
          console.warn("Could not save connector candidate/training request to Firestore:", e.message);
        }

        return {
          ocrFailed: false,
          status: "training_required",
          nombreEmisor: detectedName || "Comercio por identificar",
          rfcEmisor: detectedRfc || "XAXX010101000",
          items: [],
          rawOcrText: "",
          portalFields: {},
          portalFieldsConfidence: {}
        };
      }

      if (matchedConnector.status !== "production_ready" || matchedConnector.runnerAvailable !== true) {
        console.log(`[OCR Pipeline Cloud] Connector matched (${matchedConnector.nombre}) but not ready. Creating training request.`);
        try {
          const existingSnap = await db.collection("training_requests")
            .where("rfc", "==", matchedConnector.rfc || detectedRfc)
            .limit(1)
            .get();
          if (existingSnap.empty) {
            const reqRef = db.collection("training_requests").doc();
            await reqRef.set({
              storeName: matchedConnector.nombre || detectedName,
              rfc: matchedConnector.rfc || detectedRfc,
              officialBillingUrl: matchedConnector.portalUrl || billingUrl || "",
              status: "pending_training",
              evidence: evidence || "Existente pero no listo",
              createdAt: new Date().toISOString()
            });
          }
        } catch (e) {
          console.warn("Could not save training request to Firestore:", e.message);
        }

        return {
          ocrFailed: false,
          status: "connector_not_ready",
          nombreEmisor: matchedConnector.nombre || detectedName,
          rfcEmisor: matchedConnector.rfc || detectedRfc,
          connectorId: matchedConnector.id,
          items: [],
          rawOcrText: "",
          portalFields: {},
          portalFieldsConfidence: {}
        };
      }

      // STAGE 2: Targeted OCR
      const result = await runProviderOcr(provider, image, mimeType, matchedConnector);
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

      const extractedData = result.data || {};
      const pipelineLogs = [];
      pipelineLogs.push("Etapa 1: Recibida imagen del ticket y decodificada.");

      let qrDetected = false;
      let qrValue = "";
      let qrParsed = parseSatQrUrl(image) || (extractedData && (parseSatQrUrl(extractedData.folio) || parseSatQrUrl(extractedData.sucursal)));
      if (qrParsed) {
        qrDetected = true;
        qrValue = `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${qrParsed.uuid}&re=${qrParsed.rfcEmisor}&rr=${qrParsed.rfcReceptor}&tt=${qrParsed.total}`;
        pipelineLogs.push("Etapa 2: Código QR SAT detectado en la imagen. Priorizando datos del QR sobre OCR.");
      } else {
        pipelineLogs.push("Etapa 2: Escaneando códigos de barras y QR... No se localizaron códigos legibles.");
      }

      pipelineLogs.push("Etapa 3: Analizando datos con motor OCR de IA.");

      const rawNombre = extractedData.nombreEmisor || "";
      const rawRfc = extractedData.rfcEmisor || "";
      let detectedProfileKey = "";
      let detectedProfile = null;

      if (matchedConnector) {
        detectedProfileKey = matchedConnector.id;
        let reqFields = ["rfcEmisor", "folio", "total", "fecha"];
        if (matchedConnector.fieldsJson) {
          try {
            const parsedFields = JSON.parse(matchedConnector.fieldsJson);
            reqFields = parsedFields.filter((f) => f.required !== false).map((f) => f.key);
          } catch (_) {}
        }
        detectedProfile = {
          name: matchedConnector.nombre,
          rfc: matchedConnector.rfc,
          portalUrl: matchedConnector.portalUrl,
          requiredFields: reqFields,
          folioPattern: /.*/,
          dateFormat: "YYYY-MM-DD",
          minConfidence: 0.70
        };
      }

      if (detectedProfile) {
        pipelineLogs.push(`Etapa 4: Comercio identificado: ${detectedProfile.name} (${detectedProfile.rfc}).`);
      } else {
        pipelineLogs.push("Etapa 4: Comercio identificado como comercio local/general.");
      }

      // Phased Extraction Metrics
      let extractionAttemptsCount = 1;
      let secondaryOcrExecuted = false;
      const secondaryOcrFieldsList = [];
      const rejectedValuesList = [];
      let manualInputReason = "";
      let qualityResult = null;

      let billingReference = extractedData.billingReference || extractedData.referenciaFacturacion || "";
      
      // Sanitise immediately
      const sanitized = sanitizeBillingReferenceForConnector(billingReference, extractedData.rawOcrText || "", matchedConnector);
      if (billingReference && billingReference !== sanitized) {
        rejectedValuesList.push(billingReference);
        billingReference = "";
      } else {
        billingReference = sanitized;
      }

      const contractFields = matchedConnector?.extractionContract?.requiredPortalFields || [];
      const dynamicPortalFields = {};
      const portalFieldsConfidence = {};
      const forbiddenInternalValue = /^(ticket_|job_|worker-|pilot-|offline-|mock_|test_)|^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      for (const field of contractFields) {
        const key = String(field.canonicalKey || field.key || "").replace(/^portalFields\./, "");
        if (!key) continue;
        let value = key === "billingReference" ? billingReference : extractedData[key];
        if (typeof value === "string") value = value.trim();
        if (typeof value === "string" && forbiddenInternalValue.test(value)) {
          rejectedValuesList.push(value);
          value = "";
        }
        if (value !== "" && value !== null && value !== undefined && field.validationPattern) {
          try {
            if (!new RegExp(field.validationPattern).test(String(value))) {
              rejectedValuesList.push(String(value));
              value = "";
            }
          } catch {
            value = "";
          }
        }
        dynamicPortalFields[key] = value ?? "";
        portalFieldsConfidence[key] = parseFloat(String(extractedData.portalFieldsConfidence?.[key] || (value !== "" ? 0.9 : 0)));
      }

      const imagePart = {
        inlineData: {
          mimeType: mimeType || "image/jpeg",
          data: image,
        },
      };

      // Phased validation checks
      const requiredFieldsNeedingRetry = contractFields.filter((field) => {
        if (field.required === false) return false;
        const key = String(field.canonicalKey || field.key || "").replace(/^portalFields\./, "");
        const value = dynamicPortalFields[key];
        return value === "" || value === null || value === undefined || (portalFieldsConfidence[key] || 0) < 0.5;
      });
      const isTextTooShort = !extractedData.rawOcrText || extractedData.rawOcrText.length < 50;

      if (requiredFieldsNeedingRetry.length > 0 || isTextTooShort) {
        console.log("[OCR Phased Cloud] Required field is missing/low confidence or text too short. Running quality analysis...");
        qualityResult = await analyzeTicketImageQuality(ai, imagePart);
        
        const isBadQuality = qualityResult.isBlurry || qualityResult.isCropped || qualityResult.isLowLighting || !qualityResult.isLegible || qualityResult.isIncomplete;

        if (isBadQuality) {
          manualInputReason = "IMAGE_QUALITY_ISSUE";
          console.log(`[OCR Phased Cloud] Bad quality detected: ${qualityResult.reason}. Skipping secondary extraction.`);
        } else {
          // Legible ticket: retry every missing contract field, not only billingReference.
          for (const field of requiredFieldsNeedingRetry) {
            const key = String(field.canonicalKey || field.key || "").replace(/^portalFields\./, "");
            if (!key || field.fieldExtractionHints?.allowSecondaryOcr === false) continue;
            secondaryOcrExecuted = true;
            secondaryOcrFieldsList.push(key);
            extractionAttemptsCount++;

            const secondaryValue = await runSecondaryExtraction(
              ai,
              imagePart,
              extractedData.rawOcrText || "",
              matchedConnector,
              key
            );
            if (!secondaryValue) continue;

            let normalizedValue = secondaryValue.trim();
            if (key === "billingReference") {
              normalizedValue = sanitizeBillingReferenceForConnector(
                normalizedValue,
                extractedData.rawOcrText || "",
                matchedConnector
              );
            }
            if (!normalizedValue || forbiddenInternalValue.test(String(normalizedValue))) {
              rejectedValuesList.push(secondaryValue);
              continue;
            }
            if (["number", "currency", "decimal"].includes(String(field.type || "").toLowerCase())) {
              const parsedNumber = Number.parseFloat(String(normalizedValue).replace(/[$,\s]/g, ""));
              if (!Number.isFinite(parsedNumber)) continue;
              normalizedValue = parsedNumber;
            }
            if (field.validationPattern) {
              try {
                if (!new RegExp(field.validationPattern).test(String(normalizedValue))) {
                  rejectedValuesList.push(secondaryValue);
                  continue;
                }
              } catch {
                continue;
              }
            }
            dynamicPortalFields[key] = normalizedValue;
            portalFieldsConfidence[key] = 0.9;
            if (key === "billingReference") billingReference = String(normalizedValue);
            console.log(`[OCR Phased Cloud] Secondary extraction found ${key}.`);
          }
        }
      }

      // Determine extraction state
      let extractionState = "extraction_found";
      const missingFieldsList = [];
      const lowConfidenceFieldsList = [];

      for (const field of contractFields) {
        if (field.required === false) continue;
        const key = String(field.canonicalKey || field.key || "").replace(/^portalFields\./, "");
        if (!key) continue;
        const value = dynamicPortalFields[key];
        const isEmpty = value === "" || value === null || value === undefined ||
          (typeof value === "number" && !Number.isFinite(value));
        if (isEmpty) {
          missingFieldsList.push(`portalFields.${key}`);
        } else if ((portalFieldsConfidence[key] || 0) < 0.8) {
          lowConfidenceFieldsList.push(`portalFields.${key}`);
        }
      }

      if (missingFieldsList.length > 0) {
        extractionState = "manual_input_required";
        if (!manualInputReason) {
          manualInputReason = "EXTRACTION_FAILED_TICKET_LEGIBLE";
        }
      } else if (lowConfidenceFieldsList.length > 0) {
        extractionState = "extraction_low_confidence";
      } else {
        extractionState = "extraction_found";
      }

      const extractionDiagnostics = {
        connectorDetected: !!matchedConnector,
        connectorId: matchedConnector ? matchedConnector.id : null,
        contractUsed: matchedConnector ? matchedConnector.extractionContract : null,
        imageQuality: qualityResult || { isBlurry: false, isCropped: false, isLowLighting: false, isLegible: true, isIncomplete: false, reason: "OK" },
        extractionAttempts: extractionAttemptsCount,
        secondaryOcrUsed: secondaryOcrExecuted,
        secondaryOcrFields: secondaryOcrFieldsList,
        missingFields: missingFieldsList,
        lowConfidenceFields: lowConfidenceFieldsList,
        rejectedValues: rejectedValuesList,
        reasonForManualInput: manualInputReason || null,
        rawOcrTextAvailable: !!(extractedData && extractedData.rawOcrText)
      };

      const fields = {
        comercio: {
          value: detectedProfile ? detectedProfile.name : (rawNombre || "Comercio General"),
          confidence: detectedProfile ? 0.98 : 0.85,
          source: "ocr",
          rawText: rawNombre,
          normalizedValue: detectedProfile ? detectedProfile.name : (rawNombre || "Comercio General")
        },
        rfcEmisor: {
          value: qrParsed ? qrParsed.rfcEmisor : (rawRfc.toUpperCase().replace(/[^A-Z0-9]/g, "") || "XAXX010101000"),
          confidence: qrParsed ? 1.0 : (rawRfc && rawRfc.length >= 12 ? 0.97 : 0.50),
          source: qrParsed ? "qr" : "ocr",
          rawText: rawRfc,
          normalizedValue: qrParsed ? qrParsed.rfcEmisor : (rawRfc.toUpperCase().replace(/[^A-Z0-9]/g, "") || "XAXX010101000")
        },
        fecha: {
          value: extractedData.fechaCompra || "",
          confidence: extractedData.fechaCompra ? 0.95 : 0.50,
          source: "ocr",
          rawText: extractedData.fechaCompra || "",
          normalizedValue: extractedData.fechaCompra || ""
        },
        hora: {
          value: extractedData.hora || "12:00:00",
          confidence: extractedData.hora ? 0.88 : 0.60,
          source: "ocr",
          rawText: extractedData.hora || "",
          normalizedValue: extractedData.hora || "12:00:00"
        },
        total: {
          value: qrParsed ? qrParsed.total : (parseFloat(String(extractedData.total)) || 0),
          confidence: qrParsed ? 1.0 : (extractedData.total ? 0.96 : 0.40),
          source: qrParsed ? "qr" : "ocr",
          rawText: String(extractedData.total || ""),
          normalizedValue: qrParsed ? String(qrParsed.total) : String(extractedData.total || 0)
        },
        folio: {
          value: extractedData.folio || billingReference || "",
          confidence: (extractedData.folio || billingReference) ? 0.93 : 0.0,
          source: "ocr",
          rawText: extractedData.folio || billingReference || "",
          normalizedValue: extractedData.folio || billingReference || ""
        },
        referenciaFacturacion: {
          value: billingReference,
          confidence: portalFieldsConfidence.billingReference || 0.0,
          source: "ocr",
          rawText: billingReference,
          normalizedValue: billingReference
        },
        codigoBarras: {
          value: extractedData.codigoBarras || "",
          confidence: extractedData.codigoBarras ? 0.95 : 0.0,
          source: "ocr",
          rawText: extractedData.codigoBarras || "",
          normalizedValue: extractedData.codigoBarras || ""
        },
        sucursal: {
          value: extractedData.sucursal || "Matriz",
          confidence: extractedData.sucursal ? 0.88 : 0.50,
          source: "ocr",
          rawText: extractedData.sucursal || "",
          normalizedValue: extractedData.sucursal || "Matriz"
        },
        terminal: {
          value: extractedData.terminal || "Caja 1",
          confidence: extractedData.terminal ? 0.80 : 0.50,
          source: "ocr",
          rawText: extractedData.terminal || "",
          normalizedValue: extractedData.terminal || "Caja 1"
        },
        barcode: {
          value: qrValue,
          confidence: qrDetected ? 1.0 : 0.0,
          source: qrDetected ? "qr" : "none",
          rawText: qrValue,
          normalizedValue: qrValue
        }
      };

      pipelineLogs.push("Etapa 5: Ejecutando normalización de campos (limpieza de RFC, formato de fechas y totales).");

      const portalFields = matchedConnector ? dynamicPortalFields : {};

      const avgConfidence = Object.values(fields).reduce((sum, f) => sum + f.confidence, 0) / Object.keys(fields).length;

      return {
        ...extractedData,
        rfcEmisor: fields.rfcEmisor.value,
        nombreEmisor: fields.comercio.value,
        fechaCompra: fields.fecha.value,
        folio: fields.folio.value,
        total: fields.total.value,
        sucursal: fields.sucursal.value,
        billingReference: fields.referenciaFacturacion.value,
        codigoBarras: fields.codigoBarras.value,
        portalFields,
        ocrFailed: extractionState === "manual_input_required",
        ocrError: (extractionState === "manual_input_required") ? "Requiere revisión del usuario por campo faltante o ilegible." : null,
        confidenceScore: parseFloat(avgConfidence.toFixed(4)),
        extractedFields: fields,
        pipelineLogs,
        ocrProvider: provider.id,
        ocrModel: result.model,
        ocrJobId: jobRef.id,
        qrCfdiUuid: qrParsed ? qrParsed.uuid : null,
        matchedConnector: matchedConnector ? {
          id: matchedConnector.id,
          nombre: matchedConnector.nombre,
          rfc: matchedConnector.rfc,
          portalUrl: matchedConnector.portalUrl,
          fieldsJson: matchedConnector.fieldsJson,
          flowJson: matchedConnector.flowJson,
          extractionContract: matchedConnector.extractionContract,
          status: matchedConnector.status
        } : null,
        cost: provider.provider === "openai" ? 0.75 : 0.5,
        rawCost: result.rawCost,
        extractionState,
        portalFieldsConfidence,
        extractionDiagnostics
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
    retryQueued: true,
    extractionState: "manual_input_required",
    portalFieldsConfidence: { billingReference: 0, total: 0 },
    extractionDiagnostics: { reasonForManualInput: "RETRY_QUEUED_INTERNAL_ERROR" }
  };
}

app.post("/api/automation/run", async (req, res) => {
  const { ticket, profile, connector } = req.body || {};

  if (!ticket || !profile || !connector) {
    res.status(400).json({ error: "Missing ticket, profile, or connector data for automation" });
    return;
  }

  // Under strict production rules, ZenTicket does not generate simulated invoices.
  // Since there is no live portal robot connected in the backend environment, we fail closed
  // and return the required error message.
  res.status(502).json({
    error: "No fue posible completar la solicitud en el portal del comercio. Revisa los datos del ticket o solicita revisión manual."
  });
});

app.post("/api/tickets/analyze", async (req, res) => {
  const { image, mimeType, userId, forceTargetedRetry, connectorId } = req.body || {};

  if (!image) {
    res.status(400).json({ error: "Missing base64 ticket image" });
    return;
  }  try {
    const result = await processOcrRequest({ req, image, mimeType, userId, forceTargetedRetry, connectorId });
    res.json(result);
  } catch (err) {
    console.error("[OCR] Critical failure:", err);
    res.json(emptyOcrDraft("El OCR no pudo procesar la imagen por un error interno. El equipo tecnico debe revisar la consola."));
  }
});

app.post("/api/tickets/train-jit", async (req, res) => {
  const { ticketId, nombreEmisor: bodyNombre, rfcEmisor: bodyRfc } = req.body || {};
  const customKey = req.headers["x-gemini-api-key"];

  if (!ticketId) {
    res.status(400).json({ error: "Falta el ticketId" });
    return;
  }

  // Helper to update progress in automation_trainings
  const updateProgress = async (progress, step, state = "in_progress") => {
    try {
      if (db && typeof db.collection === "function") {
        await db.collection("automation_trainings").doc(ticketId).set({
          progress,
          step,
          status: step,
          state,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    } catch (e) {
      console.warn("Could not update training progress in Firestore:", e.message);
    }
  };

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Debes iniciar sesión para entrenar un conector." });
      return;
    }
    const decodedToken = await admin.auth().verifyIdToken(authHeader.slice(7));

    // 1. Load the ticket from Firestore
    if (!db || typeof db.collection !== "function") {
      throw new Error("Firestore SDK no inicializado");
    }
    const ticketDoc = await db.collection("tickets").doc(ticketId).get();
    if (!ticketDoc.exists) {
      throw new Error(`Ticket no encontrado (ID: ${ticketId}) en la base de datos Firestore: ${db._databaseId || db.databaseId || 'unknown'}`);
    }
    const ticketData = ticketDoc.data();
    if (ticketData.userId !== decodedToken.uid) {
      res.status(403).json({ error: "No tienes permiso para entrenar este ticket." });
      return;
    }
    // Use body values as primary source (fresher), fall back to stored data
    const nombreEmisor = bodyNombre || ticketData.nombreEmisor || "Comercio por identificar";
    const rfcEmisor = bodyRfc || ticketData.rfcEmisor || "XAXX010101000";
    const imageBase64 = ticketData.imageUrl || "";

    // 2. Search for the portal URL via Search Grounding
    await updateProgress(15, "Buscando portal de facturación en base a DNS y Búsqueda de Google...");
    
    let portalUrl = "";
    try {
      const keyToUse = customKey || optionalSecret(geminiPrimaryKey) || optionalSecret(geminiApiKey) || "";
      const ai = new GoogleGenAI({ apiKey: keyToUse });
      const searchPrompt = `Encuentra la URL exacta del portal oficial de autofacturación para clientes de la empresa mexicana '${nombreEmisor}' (RFC: ${rfcEmisor}). 
      Busca el sitio web donde los compradores pueden solicitar su factura electrónica CFDI ingresando su ticket de compra.
      Responde SOLO con la URL directa al portal de facturación, sin explicaciones adicionales. Ejemplo de respuesta: https://facturacion.empresa.com.mx/`;
      
      // Step A: Google Search Grounding to get the URL (plain text - no JSON schema with grounding)
      const searchResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: searchPrompt,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });
      const searchText = searchResponse.text || "";
      
      // Step B: Extract URL from the plain text response using regex
      const urlMatch = searchText.match(/https?:\/\/[^\s"'<>()]+/i);
      if (urlMatch) {
        portalUrl = urlMatch[0].replace(/[.,;:!?]+$/, ""); // Remove trailing punctuation
      }
      
      // Step C: If regex didn't find a URL, use a second AI call to extract it cleanly
      if (!portalUrl && searchText.length > 10) {
        const extractResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `Del siguiente texto, extrae ÚNICAMENTE la URL del portal de facturación mencionado. Responde solo con la URL:\n${searchText}`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: { portalUrl: { type: "STRING" } },
              required: ["portalUrl"]
            }
          }
        });
        const parsed = JSON.parse(extractResponse.text || "{}");
        portalUrl = parsed.portalUrl || "";
      }
    } catch (err) {
      console.warn("Google Search Grounding failed, using keyword fallback:", err.message);
    }
    
    // Never fabricate a billing URL: a guessed domain creates an unusable connector.
    if (!portalUrl) {
      throw new Error("No se pudo verificar un portal oficial de autofacturación para este comercio.");
    }

    // 3. Portal Structure Discovery — Gemini-first, Playwright as refinement
    await updateProgress(45, "Analizando el portal de facturación con IA para identificar los campos...");
    let discoverResult = null;
    
    // Primary: Gemini-only discovery (reliable, no browser dependency)
    try {
      const keyToUse = customKey || optionalSecret(geminiPrimaryKey) || optionalSecret(geminiApiKey) || "";
      const ai = new GoogleGenAI({ apiKey: keyToUse });
      const discoveryPrompt = `Eres un experto en portales de facturación electrónica CFDI de México.
      
      Necesito crear un conector automatizado para el comercio: '${nombreEmisor}' (RFC: ${rfcEmisor}).
      Portal de facturación detectado: ${portalUrl}
      
      Basándote en tu conocimiento de portales de facturación mexicanos similares a este comercio, genera:
      
      1. requiredPortalFields: Los campos que el portal pide para BUSCAR el ticket (normalmente: número de ticket/folio, fecha, sucursal, total). SOLO los campos del formulario de búsqueda inicial.
      2. fiscalFields: Los campos fiscales que pide después (RFC, Razón Social, CP, Régimen Fiscal, Uso CFDI, Email).
      3. stepsJson: Pasos de automatización con selectores CSS genéricos pero funcionales para este tipo de portal.
      4. portalUrl: La URL más probable del portal de facturación (corrige si el detectado parece incorrecto).
      
      IMPORTANTE: Los portales mexicanos de facturación típicamente tienen:
      - Campo "Folio" o "No. de ticket" para buscar el comprobante
      - Campo "Fecha" en formato DD/MM/YYYY o selector de fecha
      - Campo "Total" o "Importe" del ticket
      - Después solicitan datos fiscales del cliente
      
      Genera selectores específicos para ${nombreEmisor} si los conoces, o selectores genéricos funcionales.`;
      
      const discoveryResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: discoveryPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              requiredPortalFields: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    key: { type: "STRING" },
                    canonicalKey: { type: "STRING" },
                    label: { type: "STRING" },
                    type: { type: "STRING" },
                    required: { type: "BOOLEAN" },
                    userEditable: { type: "BOOLEAN" }
                  },
                  required: ["key", "canonicalKey", "label", "type", "required"]
                }
              },
              fiscalFields: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    key: { type: "STRING" },
                    label: { type: "STRING" },
                    required: { type: "BOOLEAN" }
                  }
                }
              },
              stepsJson: { type: "STRING" },
              portalUrl: { type: "STRING" },
              warnings: { type: "ARRAY", items: { type: "STRING" } }
            },
            required: ["requiredPortalFields", "fiscalFields", "stepsJson", "warnings"]
          }
        }
      });
      discoverResult = JSON.parse(discoveryResponse.text || "{}");
      if (discoverResult.portalUrl && discoverResult.portalUrl.startsWith("http")) {
        portalUrl = discoverResult.portalUrl;
      }
      
      // Secondary: Try Playwright to refine selectors (optional, non-blocking)
      await updateProgress(60, "Verificando estructura del portal con navegador automatizado...");
      let browser = null;
      try {
        const { chromium } = require("playwright-core");
        const serverlessChromium = require("@sparticuz/chromium");
        browser = await chromium.launch({
          executablePath: await serverlessChromium.executablePath(),
          headless: true,
          args: serverlessChromium.args
        });
        const page = await browser.newPage();
        await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 12000 });
        await page.waitForTimeout(1500);
        const portalDom = (await page.content()).substring(0, 50000);
        const portalScreenshot = (await page.screenshot({ fullPage: true })).toString("base64");

        const discoveredInputs = await page.evaluate(() => {
          return Array.from(document.querySelectorAll("input, select, textarea")).slice(0, 20).map(el => ({
            id: el.id || "",
            name: el.name || "",
            type: el.getAttribute("type") || "",
            placeholder: el.getAttribute("placeholder") || "",
            labelText: (() => {
              if (el.id) {
                const lbl = document.querySelector(`label[for="${el.id}"]`);
                if (lbl) return lbl.textContent?.trim() || "";
              }
              const parentLbl = el.closest("label");
              return parentLbl?.textContent?.trim() || el.getAttribute("aria-label") || "";
            })()
          }));
        });
        await browser.close();
        browser = null;

        if (discoveredInputs.length > 0) {
          const ai2 = new GoogleGenAI({ apiKey: keyToUse });
          const refineResponse = await ai2.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
              { inlineData: { data: portalScreenshot, mimeType: "image/png" } },
              { text: `Refina los selectores CSS del conector para '${nombreEmisor}' basándote en el DOM, la captura y los inputs reales encontrados en el portal.

              Conector base generado:
              ${JSON.stringify(discoverResult, null, 2)}

              Inputs reales del portal:
              ${JSON.stringify(discoveredInputs, null, 2)}

              DOM real del portal:
              ${portalDom}

              Actualiza SOLO los stepsJson con selectores más precisos basados en los inputs reales. Mantén el resto igual.` }
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  stepsJson: { type: "STRING" }
                },
                required: ["stepsJson"]
              }
            }
          });
          const refined = JSON.parse(refineResponse.text || "{}");
          if (refined.stepsJson) {
            discoverResult.stepsJson = refined.stepsJson;
            discoverResult.warnings = [...(discoverResult.warnings || []), "Selectores refinados con datos reales de Playwright"];
          }
        } else {
          throw new Error("El portal no expuso campos de facturación analizables.");
        }
      } catch (playwrightErr) {
        if (browser) { try { await browser.close(); } catch(_e) {} }
        throw new Error(`Playwright no pudo verificar el portal: ${playwrightErr.message}`);
      }
    } catch (discoveryErr) {
      throw new Error(`No fue posible construir un conector verificable: ${discoveryErr.message}`);
      discoverResult = {
        requiredPortalFields: [
          { key: "portalFields.billingReference", canonicalKey: "portalFields.billingReference", label: "Folio / No. de Ticket", type: "text", required: true, userEditable: true },
          { key: "portalFields.fechaCompra", canonicalKey: "portalFields.fechaCompra", label: "Fecha de Compra", type: "date", required: false, userEditable: true },
          { key: "portalFields.total", canonicalKey: "portalFields.total", label: "Total de la Compra ($)", type: "number", required: false, userEditable: true }
        ],
        fiscalFields: [
          { key: "fiscalProfile.rfc", label: "RFC", required: true },
          { key: "fiscalProfile.razonSocial", label: "Razón Social", required: true },
          { key: "fiscalProfile.codigoPostal", label: "Código Postal", required: true },
          { key: "fiscalProfile.regimenFiscal", label: "Régimen Fiscal", required: true },
          { key: "fiscalProfile.usoCFDI", label: "Uso CFDI", required: true },
          { key: "fiscalProfile.email", label: "Correo Electrónico", required: true }
        ],
        stepsJson: JSON.stringify([
          { type: "goto", url: portalUrl },
          { type: "fill", selector: "input[name*='folio'],input[id*='folio'],input[placeholder*='ticket'],input[placeholder*='folio'],input[name*='ticket']", value: "{{portalFields.billingReference}}" },
          { type: "fill", selector: "input[name*='rfc'],input[id*='rfc'],input[placeholder*='RFC']", value: "{{fiscalProfile.rfc}}" },
          { type: "click", selector: "button[type='submit'],input[type='submit']" }
        ]),
        warnings: ["Usando plantilla genérica por fallo en discovery: " + discoveryErr.message]
      };
    }

    const supportedStepTypes = new Set(["goto", "fill", "evaluate", "select", "click", "check", "radio", "waitForSelector", "waitForNavigation", "waitForTimeout", "assertText", "extractText", "conditional", "waitForDownload"]);
    let parsedSteps;
    try {
      const rawSteps = typeof discoverResult.stepsJson === "string"
        ? JSON.parse(discoverResult.stepsJson)
        : discoverResult.stepsJson;
      if (!Array.isArray(rawSteps) || rawSteps.length === 0) throw new Error("stepsJson vacío");
      parsedSteps = rawSteps.map(raw => {
        const type = raw.type || raw.action;
        return { ...raw, type: type === "navigate" ? "goto" : type };
      });
      if (!parsedSteps.some(step => step.type === "goto")) {
        parsedSteps.unshift({ type: "goto", url: portalUrl });
      }
      for (const step of parsedSteps) {
        if (!supportedStepTypes.has(step.type)) throw new Error(`tipo de paso no soportado: ${step.type || "vacío"}`);
        if (["fill", "evaluate", "select", "click", "check", "radio", "waitForSelector", "assertText", "extractText"].includes(step.type) && !step.selector) {
          throw new Error(`el paso ${step.type} no contiene selector`);
        }
        if (["fill", "evaluate", "select", "assertText"].includes(step.type) && typeof step.value !== "string") {
          throw new Error(`el paso ${step.type} no contiene value`);
        }
      }
      discoverResult.stepsJson = JSON.stringify(parsedSteps);
    } catch (stepError) {
      throw new Error(`Gemini generó un mapa de navegación inválido: ${stepError.message}`);
    }

    // 4. Save Connector to Firestore
    await updateProgress(70, "Guardando conector y mapa de navegación en base de datos...");
    const connectorId = nombreEmisor.toLowerCase().replace(/[^a-z0-9]/g, "-") || "gen-" + Date.now();
    const contract = {
      requiredPortalFields: discoverResult.requiredPortalFields,
      fiscalFields: discoverResult.fiscalFields,
      screenOrder: [
        { screenIndex: 1, description: "Búsqueda de ticket", requiredFields: discoverResult.requiredPortalFields.map(f => f.key) },
        { screenIndex: 2, description: "Datos fiscales", requiredFields: discoverResult.fiscalFields.map(f => f.key) }
      ]
    };
    const fields = discoverResult.requiredPortalFields.map(f => ({
      key: f.canonicalKey,
      name: f.label,
      selector: "input",
      type: f.type === "number" ? "number" : "text",
      required: f.required !== false,
      source: "ticket"
    }));

    const newConnector = {
      id: connectorId,
      nombre: nombreEmisor,
      rfc: rfcEmisor,
      aliases: [nombreEmisor],
      portalUrl: portalUrl,
      status: "real_validation",
      runnerAvailable: true,
      extractionContract: contract,
      fieldsJson: JSON.stringify(fields),
      flowJson: discoverResult.stepsJson,
      userId: decodedToken.uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.collection("connectors").doc(connectorId).set(newConnector);

    // Save Portal Map
    const reqFieldsList = discoverResult.requiredPortalFields.map(f => ({
      key: f.key,
      label: f.label,
      source: "portalFields",
      required: f.required !== false,
      userEditable: true
    }));
    const fiscalKeys = ["rfc", "businessName", "postalCode", "taxRegime", "cfdiUse", "email"];
    fiscalKeys.forEach(k => {
      const matched = discoverResult.fiscalFields?.find(f => f.key.endsWith("." + k));
      reqFieldsList.push({
        key: matched?.key || `fiscalProfile.${k}`,
        label: matched?.label || k,
        source: "fiscalProfile",
        required: true,
        userEditable: true
      });
    });

    const portalMapData = {
      connectorId: connectorId,
      userId: decodedToken.uid,
      entryUrl: portalUrl,
      url: portalUrl,
      requiredFields: reqFieldsList,
      fiscalFields: ["fiscalProfile.rfc", "fiscalProfile.businessName", "fiscalProfile.postalCode", "fiscalProfile.taxRegime", "fiscalProfile.cfdiUse", "fiscalProfile.email"],
      captchaSelectorsJson: JSON.stringify(["iframe[src*='recaptcha']", ".g-recaptcha", "#captcha"]),
      errorSelectorsJson: JSON.stringify([".swal-text", ".alert-danger", "#error-msg", ".text-danger"]),
      successSelectorsJson: JSON.stringify([".success-msg", "#download-area"]),
      downloadRulesJson: JSON.stringify({ xmlRequired: true, pdfRequired: false }),
      stepsJson: discoverResult.stepsJson,
      isApproved: true,
      status: "approved",
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    await db.collection("portal_maps").doc(`map-${connectorId}`).set(portalMapData);

    // 5. Re-run OCR Stage 2
    await updateProgress(85, "Re-analizando el ticket para extraer los campos del portal...");
    
    let ocrResultData = {};
    try {
      const keyToUse = customKey || optionalSecret(geminiPrimaryKey) || optionalSecret(geminiApiKey) || "";
      const ai = new GoogleGenAI({ apiKey: keyToUse });
      const rawImage = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
      const mime = imageBase64.includes("image/png") ? "image/png" : "image/jpeg";

      const targetedPromptText = `Analiza la imagen del ticket de compra de la tienda: ${nombreEmisor}.
      Extrae únicamente los campos requeridos por el portal de facturación oficial:
      ${discoverResult.requiredPortalFields.map(f => `- Campo: ${f.label} (clave: ${f.key.replace(/^portalFields\./, "")})`).join("\n")}
      También extrae el total de la compra (total) con decimales, la fecha de compra (fechaCompra) en formato YYYY-MM-DD, y el folio de venta (folio).`;

      const customProperties = {
        rfcEmisor: { type: "STRING" },
        nombreEmisor: { type: "STRING" },
        fechaCompra: { type: "STRING" },
        total: { type: "NUMBER" },
        folio: { type: "STRING" },
        rawOcrText: { type: "STRING" },
        portalFieldsConfidence: { type: "OBJECT", properties: {} },
        items: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: { description: { type: "STRING" }, amount: { type: "NUMBER" } }
          }
        }
      };
      discoverResult.requiredPortalFields.forEach(f => {
        const fieldKey = f.key.replace(/^portalFields\./, "");
        customProperties[fieldKey] = { type: f.type === "number" ? "NUMBER" : "STRING" };
        customProperties.portalFieldsConfidence.properties[fieldKey] = { type: "NUMBER" };
      });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          { inlineData: { data: rawImage, mimeType: mime } },
          { text: targetedPromptText }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: customProperties,
            required: ["rfcEmisor", "nombreEmisor", "rawOcrText", "items", "portalFieldsConfidence"]
          }
        }
      });
      ocrResultData = JSON.parse(response.text || "{}");
    } catch (ocrErr) {
      console.warn("JIT OCR Stage 2 failed, using basic fields:", ocrErr.message);
      ocrResultData = {
        rfcEmisor: rfcEmisor,
        nombreEmisor: nombreEmisor,
        total: ticketData.total || 0,
        fechaCompra: ticketData.fechaCompra || "",
        folio: ticketData.folio || "",
        rawOcrText: ticketData.rawOcrText || "",
        portalFieldsConfidence: {}
      };
    }

    // 6. Update Ticket in Firestore
    await updateProgress(95, "Auto-entrenamiento completado con éxito. Encolando facturación...");

    const portalFields = {};
    discoverResult.requiredPortalFields.forEach(f => {
      const fieldKey = f.key.replace(/^portalFields\./, "");
      portalFields[fieldKey] = ocrResultData[fieldKey] || "";
    });
    portalFields.total = ocrResultData.total || ticketData.total || 0;
    if (!portalFields.billingReference) {
      portalFields.billingReference = ocrResultData.billingReference || ocrResultData.folio || ticketData.folio || "";
    }

    const updatedFields = {
      status: "extracted",
      nombreEmisor: ocrResultData.nombreEmisor || nombreEmisor,
      rfcEmisor: ocrResultData.rfcEmisor || rfcEmisor,
      total: ocrResultData.total || ticketData.total || 0,
      folio: ocrResultData.folio || ticketData.folio || "",
      fechaCompra: ocrResultData.fechaCompra || ticketData.fechaCompra || "",
      billingReference: ocrResultData.folio || ticketData.folio || "",
      portalFields: portalFields,
      connectorId: connectorId,
      updatedAt: new Date().toISOString()
    };
    await db.collection("tickets").doc(ticketId).update(updatedFields);

    await updateProgress(100, "¡Configuración completada con éxito! Iniciando solicitud en el portal...", "completed");

    res.json({
      success: true,
      connector: newConnector,
      ocrResult: {
        ...ocrResultData,
        portalFields
      }
    });

  } catch (err) {
    console.error("JIT training failed:", err);
    await updateProgress(100, "Fallo durante el auto-entrenamiento: " + err.message, "failed");
    res.status(500).json({ error: "Fallo durante el auto-entrenamiento: " + err.message });
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
  const referer = req.headers.referer;
  if (referer) {
    try {
      const parsed = new URL(referer);
      return parsed.origin;
    } catch (e) {
      // Ignorar error de parsing
    }
  }
  const origin = req.headers.origin;
  if (origin) {
    return origin;
  }
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
      "payment_method_types[0]": "card",
      "wallet_options[link][display]": "never"
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
  const { planId } = req.body;

  if (!planId) {
    res.status(400).json({ error: "Faltan parámetros planId" });
    return;
  }

  let price = 0;
  let title = "";
  if (planId === "brisa") {
    price = 15.00;
    title = "Plan Brisa (Prueba Stripe Mínima $15) - ZenTicket";
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
      "payment_method_types[0]": "card",
      "line_items[0][price_data][currency]": "mxn",
      "line_items[0][price_data][product_data][name]": title,
      "line_items[0][price_data][unit_amount]": Math.round(price * 100).toString(),
      "line_items[0][quantity]": "1",
      mode: "payment",
      success_url: `${getSafeBaseUrl(req)}/billing-success.html?status=success&plan=${planId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getSafeBaseUrl(req)}/billing-failure.html?status=failure`,
      client_reference_id: `${userId}:${planId}`,
      "payment_intent_data[setup_future_usage]": "off_session",
      customer: stripeCustomerId
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
    console.error("Error al crear sesión en Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/billing/checkout/stripe/confirm", authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
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
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription&expand[]=subscription.default_payment_method&expand[]=payment_intent&expand[]=payment_intent.payment_method`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );
    const session = sessionResponse.data;
    const [sessionUserId, planId] = String(session.client_reference_id || "").split(":");
    if (sessionUserId !== userId || !planId) {
      res.status(403).json({ error: "La sesión de Stripe no pertenece a este usuario." });
      return;
    }
    if (session.status !== "complete" || session.payment_status !== "paid") {
      res.status(409).json({ error: "Stripe todavía no confirma el pago." });
      return;
    }

    const limits = { brisa: 10, personal: 20, serenidad: 30, empresa: 60, nirvana: 100 };
    const invoicesLimit = limits[planId] || 5;
    const planName = planId === "personal"
      ? "Plan Personal"
      : planId === "empresa"
        ? "Plan Empresa"
        : `Plan ${planId.charAt(0).toUpperCase() + planId.slice(1)}`;
    const isSubscription = session.mode === "subscription";
    const stripeSubscriptionId = typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
    const paymentMethod = session.subscription?.default_payment_method ||
      session.payment_intent?.payment_method;
    const nowIso = new Date().toISOString();
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await db.collection("payments").doc(`stripe_payment_${session.id}`).set({
      userId,
      planId,
      provider: "stripe",
      providerPaymentId: session.id,
      amount: session.amount_total ? session.amount_total / 100 : 0,
      currency: session.currency?.toUpperCase() || "MXN",
      status: "paid",
      paidAt: nowIso,
      updatedAt: nowIso
    }, { merge: true });

    await db.collection("subscriptions").doc(userId).set({
      userId,
      planId,
      planName,
      status: isSubscription ? "subscription_active" : "paid",
      provider: "stripe",
      providerSubscriptionId: stripeSubscriptionId || session.id,
      stripeCustomerId: session.customer || null,
      currentPeriodStart: nowIso,
      currentPeriodEnd: periodEnd,
      invoicesLimit,
      invoicesUsed: 0,
      updatedAt: nowIso
    }, { merge: true });

    const billingRef = db.collection("billingProfiles").doc(userId);
    await billingRef.set({
      stripeCustomerId: session.customer || null,
      subscriptionId: stripeSubscriptionId || null,
      planId,
      subscriptionStatus: isSubscription ? "subscription_active" : "paid",
      defaultPaymentMethodId: paymentMethod?.id || null,
      updatedAt: nowIso
    }, { merge: true });

    await db.collection("fiscalProfiles").doc(userId).set({
      plan: planId,
      planStartDate: nowIso,
      paymentStatus: isSubscription ? "subscription_active" : "paid",
      autoRenew: isSubscription,
      stripeCustomerId: session.customer || null,
      invoicesLimit
    }, { merge: true });

    if (paymentMethod?.id && paymentMethod.card) {
      const billingSnapshot = await billingRef.get();
      const existingCards = Array.isArray(billingSnapshot.data()?.paymentCards)
        ? billingSnapshot.data().paymentCards
        : [];
      const formattedBrand = String(paymentMethod.card.brand || "VISA").toUpperCase();
      const stripeCard = {
        id: paymentMethod.id,
        stripePaymentMethodId: paymentMethod.id,
        brand: formattedBrand,
        last4: paymentMethod.card.last4,
        expiry: `${String(paymentMethod.card.exp_month).padStart(2, "0")}/${String(paymentMethod.card.exp_year).slice(-2)}`,
        holderName: paymentMethod.billing_details?.name || session.customer_details?.name || "Titular",
        bankName: formattedBrand === "VISA" ? "Tarjeta Visa" : formattedBrand === "MASTERCARD" ? "Mastercard" : formattedBrand,
        isDefault: true
      };
      const paymentCards = [
        stripeCard,
        ...existingCards
          .filter((card) => card.id !== paymentMethod.id)
          .map((card) => ({ ...card, isDefault: false }))
      ];
      await billingRef.set({ paymentCards }, { merge: true });
    }

    const billingSnap = await billingRef.get();
    const finalPaymentCards = billingSnap.data()?.paymentCards || [];

    res.json({
      success: true,
      planId,
      planName,
      invoicesLimit,
      paymentCards: finalPaymentCards
    });
  } catch (error) {
    console.error("Error al confirmar pago de Stripe:", error.response?.data || error.message);
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
      
      const externalReference = session.client_reference_id || session.metadata?.userId;
      if (externalReference && session.payment_status === "paid") {
        let userId = externalReference;
        let planId = session.metadata?.planId || session.subscription_data?.metadata?.planId || "gratuito";
        
        if (externalReference.includes(":")) {
          const parts = externalReference.split(":");
          userId = parts[0];
          planId = parts[1];
        }

        const limits = { brisa: 10, personal: 20, serenidad: 30, empresa: 60, nirvana: 100 };
        const invoicesLimit = limits[planId] || 5;
        const planName = planId === "personal"
          ? "Plan Personal"
          : planId === "empresa"
            ? "Plan Empresa"
            : `Plan ${planId.charAt(0).toUpperCase() + planId.slice(1)}`;
        const isSubscription = session.mode === "subscription";
        const stripeSubscriptionId = typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
        const nowIso = new Date().toISOString();
        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        await db.collection("payments").doc(`stripe_payment_${session.id}`).set({
          userId,
          planId,
          provider: "stripe",
          providerPaymentId: session.id,
          amount: session.amount_total ? session.amount_total / 100 : 0,
          currency: session.currency?.toUpperCase() || "MXN",
          status: "paid",
          paidAt: nowIso,
          updatedAt: nowIso
        }, { merge: true });

        await db.collection("subscriptions").doc(userId).set({
          userId,
          planId,
          planName,
          status: isSubscription ? "subscription_active" : "paid",
          provider: "stripe",
          providerSubscriptionId: stripeSubscriptionId || session.id,
          stripeCustomerId: session.customer || null,
          currentPeriodStart: nowIso,
          currentPeriodEnd: periodEnd,
          invoicesLimit,
          invoicesUsed: 0,
          updatedAt: nowIso
        }, { merge: true });

        await db.collection("billingProfiles").doc(userId).set({
          stripeCustomerId: session.customer || null,
          subscriptionId: stripeSubscriptionId || null,
          planId,
          subscriptionStatus: isSubscription ? "subscription_active" : "paid",
          updatedAt: nowIso
        }, { merge: true });

        await db.collection("fiscalProfiles").doc(userId).set({
          plan: planId,
          planStartDate: nowIso,
          paymentStatus: isSubscription ? "subscription_active" : "paid",
          autoRenew: isSubscription,
          stripeCustomerId: session.customer || null,
          invoicesLimit
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

app.post("/api/billing/sync-subscription", authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const email = req.user.email;
  const emailVerified = req.user.email_verified;

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

    const subsResponse = await axios.get(
      `https://api.stripe.com/v1/subscriptions?customer=${stripeCustomerId}&status=active&limit=1`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );
    const subscriptions = subsResponse.data.data;

    if (subscriptions.length > 0) {
      const sub = subscriptions[0];
      const planId = sub.metadata?.planId || "gratuito";
      const limits = { brisa: 10, personal: 20, serenidad: 30, empresa: 60, nirvana: 100 };
      const invoicesLimit = limits[planId] || 5;
      const planName = planId === "personal" ? "Plan Personal" : planId === "empresa" ? "Plan Empresa" : `Plan ${planId.charAt(0).toUpperCase() + planId.slice(1)}`;
      const nowIso = new Date().toISOString();
      const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

      await db.collection("subscriptions").doc(userId).set({
        userId,
        planId,
        planName,
        status: "subscription_active",
        provider: "stripe",
        providerSubscriptionId: sub.id,
        stripeCustomerId,
        currentPeriodStart: new Date(sub.current_period_start * 1000).toISOString(),
        currentPeriodEnd: periodEnd,
        invoicesLimit,
        invoicesUsed: 0,
        updatedAt: nowIso
      }, { merge: true });

      await db.collection("billingProfiles").doc(userId).set({
        stripeCustomerId,
        subscriptionId: sub.id,
        planId,
        subscriptionStatus: "subscription_active",
        updatedAt: nowIso
      }, { merge: true });

      await db.collection("fiscalProfiles").doc(userId).set({
        plan: planId,
        planStartDate: new Date(sub.current_period_start * 1000).toISOString(),
        paymentStatus: "subscription_active",
        autoRenew: true,
        stripeCustomerId,
        invoicesLimit
      }, { merge: true });

      res.json({ success: true, planId, status: "subscription_active", source: "stripe_subscription" });
      return;
    }

    const sessionsResponse = await axios.get(
      `https://api.stripe.com/v1/checkout/sessions?customer=${stripeCustomerId}&limit=5`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );
    const sessions = sessionsResponse.data.data;
    const paidSession = sessions.find(s => s.payment_status === "paid");

    if (paidSession) {
      const planId = paidSession.metadata?.planId || "gratuito";
      const limits = { brisa: 10, personal: 20, serenidad: 30, empresa: 60, nirvana: 100 };
      const invoicesLimit = limits[planId] || 5;
      const planName = planId === "personal" ? "Plan Personal" : planId === "empresa" ? "Plan Empresa" : `Plan ${planId.charAt(0).toUpperCase() + planId.slice(1)}`;
      const nowIso = new Date().toISOString();
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      await db.collection("subscriptions").doc(userId).set({
        userId,
        planId,
        planName,
        status: "paid",
        provider: "stripe",
        providerSubscriptionId: paidSession.id,
        stripeCustomerId,
        currentPeriodStart: nowIso,
        currentPeriodEnd: periodEnd,
        invoicesLimit,
        invoicesUsed: 0,
        updatedAt: nowIso
      }, { merge: true });

      await db.collection("billingProfiles").doc(userId).set({
        stripeCustomerId,
        subscriptionId: null,
        planId,
        subscriptionStatus: "paid",
        updatedAt: nowIso
      }, { merge: true });

      await db.collection("fiscalProfiles").doc(userId).set({
        plan: planId,
        planStartDate: nowIso,
        paymentStatus: "paid",
        autoRenew: false,
        stripeCustomerId,
        invoicesLimit
      }, { merge: true });

      res.json({ success: true, planId, status: "paid", source: "stripe_payment" });
      return;
    }

    res.json({ success: true, planId: "gratuito", status: "inactive", source: "none" });
  } catch (error) {
    console.error("Error al sincronizar suscripción de Stripe:", error.message);
    res.status(500).json({ error: error.message });
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

app.post("/api/cfdi/verify-sat", async (req, res) => {
  const { xmlContent } = req.body;
  if (!xmlContent) {
    res.status(400).json({ error: "Missing xmlContent in request body" });
    return;
  }

  const isStructuralValid = validateXmlStructure(xmlContent);
  if (!isStructuralValid) {
    res.json({
      status: "invalid_structure",
      satStatus: "Estructura inválida",
      error: "El XML no contiene la estructura básica obligatoria o le faltan nodos requeridos (Comprobante, Emisor, Receptor o TimbreFiscalDigital)."
    });
    return;
  }

  const info = parseCfdiInfo(xmlContent);
  if (!info.uuid || !info.rfcEmisor || !info.rfcReceptor || !info.total) {
    res.json({
      status: "invalid_xml",
      satStatus: "XML incompleto",
      error: "El XML no contiene toda la información fiscal obligatoria (UUID, RFC Emisor, RFC Receptor o Total)."
    });
    return;
  }

  const verification = await verifyCfdiWithSat(info.rfcEmisor, info.rfcReceptor, info.total, info.uuid);
  res.json({
    status: verification.status,
    satStatus: verification.satStatus,
    detail: verification.detail,
    info
  });
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
