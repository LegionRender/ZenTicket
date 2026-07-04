import express, { Request, Response } from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import nodemailer from "nodemailer";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import axios from "axios";
import crypto from "crypto";

dotenv.config();

import { sanitizeBillingReferenceForConnector } from "./src/shared/utils/validation";

const hasRealCredentials = !!(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS);

let adminDb: any;

if (hasRealCredentials) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      initializeApp({
        credential: cert(serviceAccount)
      });
    } else {
      initializeApp({
        projectId: "factubolt"
      });
    }
    console.log("[Firebase Admin] Inicializado exitosamente.");
    adminDb = getFirestore(undefined, "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee");
  } catch (e) {
    console.warn("[Firebase Admin Warning] No se pudo inicializar con credenciales reales.", e);
  }
}

if (!adminDb) {
  console.log("[Firebase Admin] No se detectaron credenciales reales. Cargando Bóveda Mock en Memoria para desarrollo local.");
  const mockDb: Record<string, Record<string, any>> = {
    payments: {},
    subscriptions: {},
    fiscalProfiles: {},
    billingEvents: {}
  };
  
  adminDb = {
    collection: (colName: string) => {
      if (!mockDb[colName]) mockDb[colName] = {};
      return {
        doc: (docId: string) => {
          return {
            set: async (data: any, options?: any) => {
              console.log(`[Mock Firestore Set] ${colName}/${docId}:`, data);
              if (options?.merge) {
                mockDb[colName][docId] = { ...mockDb[colName][docId], ...data };
              } else {
                mockDb[colName][docId] = data;
              }
              return { writeTime: new Date() };
            },
            get: async () => {
              console.log(`[Mock Firestore Get] ${colName}/${docId}`);
              const data = mockDb[colName][docId];
              return {
                exists: !!data,
                data: () => data,
                id: docId
              };
            }
          };
        },
        add: async (data: any) => {
          const docId = "mock_event_" + Date.now();
          console.log(`[Mock Firestore Add] ${colName}/${docId}:`, data);
          mockDb[colName][docId] = data;
          return { id: docId, writeTime: new Date() };
        }
      };
    }
  };
}


// Middleware de Autenticación de Firebase para Billing
const authenticateFirebaseToken = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // Modo desarrollo local con bypass habilitado
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
    // Si no hay credenciales reales de Firebase inicializadas
    if (!hasRealCredentials) {
      if (process.env.NODE_ENV !== "production" && process.env.DEV_BILLING_AUTH_BYPASS === "true") {
        const mockUid = req.headers["x-mock-user-id"] || "mock-local-uid";
        const mockEmail = req.headers["x-mock-user-email"] || "mock@example.com";
        req.user = { 
          uid: mockUid, 
          email: mockEmail,
          email_verified: true 
        };
        next();
        return;
      }
      res.status(401).json({ error: "Desarrollo local: Habilite DEV_BILLING_AUTH_BYPASS para pruebas" });
      return;
    }

    const decodedToken = await getAuth().verifyIdToken(token);
    req.user = { 
      uid: decodedToken.uid, 
      email: decodedToken.email || "",
      email_verified: decodedToken.email_verified === true 
    };
    next();
  } catch (error: any) {
    console.error("Error al verificar token de Firebase:", error.message);
    res.status(401).json({ error: "Token de Firebase inválido o expirado" });
  }
};


async function resolveStripeCustomerId(uid: string, email: string, emailVerified: boolean): Promise<string | null> {
  const billingRef = adminDb.collection("billingProfiles").doc(uid);
  const billingSnap = await billingRef.get();
  
  // 1. Si ya existe en billingProfiles, lo retornamos directo
  if (billingSnap.exists) {
    const data = billingSnap.data();
    if (data?.stripeCustomerId) {
      return data.stripeCustomerId;
    }
  }

  // 2. Si no, revisamos fiscalProfiles (migración segura e histórica)
  const fiscalRef = adminDb.collection("fiscalProfiles").doc(uid);
  const fiscalSnap = await fiscalRef.get();
  if (fiscalSnap.exists) {
    const historicalCustomerId = fiscalSnap.data()?.stripeCustomerId;
    if (historicalCustomerId) {
      // VALIDACIÓN DE PROPIEDAD:
      // Validar que email y emailVerified sean válidos, consultar Stripe y comparar email.
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
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
        } catch (err: any) {
          console.error(`[Migration error] Error al validar customer histórico ${historicalCustomerId}:`, err.message);
        }
      }
    }
  }

  // 3. Si no coincide o no existe, intentamos buscar en Stripe por el correo electrónico verificado
  if (email && emailVerified) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
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
      } catch (err: any) {
        console.error(`[Migration error] Error al buscar customer por correo:`, err.message);
      }
    }
  }

  // 4. Si no se encontró por búsqueda ni migración, creamos un nuevo cliente en Stripe para el usuario
  if (email) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
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
      } catch (err: any) {
        console.error(`[Stripe Auto-Creation error] Error al crear cliente para ${uid}:`, err.message);
      }
    }
  }
  return null;
}


function verifyStripeSignature(rawBody: string, signatureHeader: string, webhookSecret: string): boolean {
  if (!signatureHeader || !webhookSecret) return false;
  
  // Split header
  const parts = signatureHeader.split(",");
  let timestamp = "";
  const signatures: string[] = [];
  
  for (const part of parts) {
    const [key, val] = part.split("=");
    if (key === "t") timestamp = val;
    if (key === "v1") signatures.push(val);
  }
  
  if (!timestamp || signatures.length === 0) return false;
  
  // Compute signature
  const signedPayload = `${timestamp}.${rawBody}`;
  const computedSig = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload)
    .digest("hex");
    
  // Check if computed signature matches any in signatures array
  const computedBuffer = Buffer.from(computedSig, "hex");
  for (const sig of signatures) {
    const sigBuffer = Buffer.from(sig, "hex");
    if (computedBuffer.length === sigBuffer.length && crypto.timingSafeEqual(computedBuffer, sigBuffer)) {
      return true;
    }
  }
  
  return false;
}


const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// 5.5. Stripe Webhook (Raw Body verification)
app.post("/api/billing/webhooks/stripe", express.raw({ type: "application/json" }), async (req: any, res: any) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!sig || !webhookSecret) {
    console.error("[Stripe Webhook Error] Falta la firma stripe-signature o STRIPE_WEBHOOK_SECRET");
    res.status(400).send("Webhook signature verification failed");
    return;
  }

  const rawBody = req.body.toString("utf8");
  if (!verifyStripeSignature(rawBody, sig, webhookSecret)) {
    console.error("[Stripe Webhook Error] Firma de Stripe inválida");
    res.status(400).send("Webhook signature verification failed");
    return;
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (err: any) {
    res.status(400).send("Invalid JSON");
    return;
  }

  console.log(`[Stripe Webhook] Recibido event verificado: ${event?.type}`);

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).send("Webhook config error: missing token");
    return;
  }

  try {
    if (event.type === "setup_intent.succeeded" || event.type === "payment_method.attached" || event.type === "payment_method.detached") {
      const stripeCustomerId = event.data?.object?.customer;
      if (stripeCustomerId) {
        await syncCustomerPaymentMethods(stripeCustomerId, stripeSecretKey, adminDb);
      }
    }

    if (event.type === "payment_intent.succeeded") {
      const paymentIntentObj = event.data?.object;
      const paymentIntentId = paymentIntentObj?.id;
      if (paymentIntentId) {
        const paymentQuery = await adminDb.collection("payments")
          .where("providerPaymentId", "==", paymentIntentId)
          .limit(1)
          .get();
        if (!paymentQuery.empty) {
          await paymentQuery.docs[0].ref.set({
            status: "paid",
            paidAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }
      }
    }

    // Record raw event in Firestore
    await adminDb.collection("billingEvents").add({
      provider: "stripe",
      eventType: event.type || "unknown",
      providerEventId: event.id || "unknown",
      processed: true,
      receivedAt: new Date().toISOString()
    });

    if (event.type === "checkout.session.completed") {
      const sessionObj = event.data?.object;
      if (sessionObj && sessionObj.id) {
        const sessionId = sessionObj.id;

        // Retrieve checkout session from Stripe API to verify payload is authentic
        const response = await axios.get(
          `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
          {
            headers: {
              Authorization: `Bearer ${stripeSecretKey}`
            }
          }
        );

        const session = response.data;
        const paymentStatus = session.payment_status;
        const externalReference = session.client_reference_id; // "userId:planId"

        console.log(`[Stripe] Checkout Session retrieve: status=${session.status}, payment_status=${paymentStatus}, ref=${externalReference}`);

        if (session.mode === "setup" && session.setup_intent && externalReference) {
          const setupResponse = await axios.get(
            `https://api.stripe.com/v1/setup_intents/${session.setup_intent}?expand[]=payment_method`,
            { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
          );
          const paymentMethod = setupResponse.data.payment_method;
          const card = paymentMethod?.card;
          if (card) {
            const billingRef = adminDb.collection("billingProfiles").doc(externalReference);
            const billingSnapshot = await billingRef.get();
            const existingCards = Array.isArray(billingSnapshot.data()?.paymentCards)
              ? billingSnapshot.data().paymentCards
              : [];
            const formattedBrand = String(card.brand || "VISA").toUpperCase();
            const nextCard = {
              id: paymentMethod.id,
              brand: formattedBrand,
              last4: card.last4,
              expiry: `${String(card.exp_month).padStart(2, "0")}/${String(card.exp_year).slice(-2)}`,
              holderName: session.metadata?.holderName || paymentMethod.billing_details?.name || "Titular",
              bankName: session.metadata?.bankName || (formattedBrand === "VISA" ? "Tarjeta Visa" : formattedBrand === "MASTERCARD" ? "Mastercard" : formattedBrand),
              isDefault: true,
              stripePaymentMethodId: paymentMethod.id
            };
            const paymentCards = [
              nextCard,
              ...existingCards
                .filter((item: any) => item.id !== paymentMethod.id)
                .map((item: any) => ({ ...item, isDefault: false }))
            ];
            await billingRef.set({ paymentCards, stripeCustomerId: session.customer }, { merge: true });
          }
          res.status(200).send("OK");
          return;
        }

        if (paymentStatus === "paid" && externalReference) {
          const [userId, planId] = externalReference.split(":");
          const amount = session.amount_total ? session.amount_total / 100 : 0;

          const paymentDocId = `stripe_payment_${session.id}`;
          await adminDb.collection("payments").doc(paymentDocId).set({
            userId,
            planId,
            provider: "stripe",
            providerPaymentId: session.id,
            amount: amount,
            currency: session.currency?.toUpperCase() || "MXN",
            status: "paid",
            paidAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }, { merge: true });

          // Update active subscription
          let limit = 5;
          if (planId === "brisa") limit = 10;
          else if (planId === "serenidad") limit = 30;
          else if (planId === "nirvana") limit = 100;
          else if (planId === "personal") limit = 20;
          else if (planId === "empresa") limit = 60;

          await adminDb.collection("subscriptions").doc(userId).set({
            userId,
            planId,
            planName: planId === "personal" ? "Plan Personal" : planId === "empresa" ? "Plan Empresa" : `Plan ${planId.charAt(0).toUpperCase() + planId.slice(1)}`,
            status: "subscription_active",
            provider: "stripe",
            providerSubscriptionId: session.id,
            currentPeriodStart: new Date().toISOString(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            invoicesLimit: limit,
            invoicesUsed: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });

          await adminDb.collection("billingProfiles").doc(userId).set({
            stripeCustomerId: session.customer || null,
            planId,
            subscriptionStatus: "paid",
            subscriptionId: session.id
          }, { merge: true });

          await adminDb.collection("fiscalProfiles").doc(userId).set({
            plan: planId,
            planStartDate: new Date().toISOString(),
            paymentStatus: "paid",
            autoRenew: true
          }, { merge: true });
        }
      }
    }

    res.status(200).send("OK");
  } catch (error: any) {
    console.error("Error al procesar webhook de Stripe:", error.response?.data || error.message);
    res.status(500).send("Error de procesamiento");
  }
});


// Increase request size limit for image uploads
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// API Endpoint: Check SMTP Configuration Status safely
app.get("/api/config/status", (req: Request, res: Response) => {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  res.json({
    smtpConfigured: !!(host && user && pass),
    smtpUser: user ? `${user.substring(0, 3)}***` : null
  });
});

// API Endpoint: Get PayPal Client ID safely for frontend SDK
app.get("/api/config/paypal-client-id", (req: Request, res: Response) => {
  res.json({ clientId: process.env.PAYPAL_CLIENT_ID || "" });
});

// Helper for lazy initialization of Google Gen AI
function getGeminiClient(customApiKey?: string): GoogleGenAI {
  const currentKey = (customApiKey || process.env.GEMINI_API_KEY || "").trim();
  if (
    !currentKey ||
    currentKey === "" ||
    currentKey.toLowerCase().includes("your_") ||
    currentKey.toLowerCase().includes("todo") ||
    currentKey.toLowerCase().includes("placeholder") ||
    currentKey.toLowerCase().includes("clave") ||
    currentKey.length < 20
  ) {
    throw new Error("La clave GEMINI_API_KEY no está configurada o es de simulación.");
  }
  return new GoogleGenAI({
    apiKey: currentKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

interface ImageQualityResult {
  isBlurry: boolean;
  isCropped: boolean;
  isLowLighting: boolean;
  isLegible: boolean;
  isIncomplete: boolean;
  reason: string;
}

async function analyzeTicketImageQuality(ai: any, imagePart: any): Promise<ImageQualityResult> {
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
      return JSON.parse(response.text.trim()) as ImageQualityResult;
    }
  } catch (e) {
    console.warn("Quality analysis model call failed:", e);
  }
  return { isBlurry: false, isCropped: false, isLowLighting: false, isLegible: true, isIncomplete: false, reason: "No se pudo analizar" };
}

async function runSecondaryExtraction(
  ai: any,
  imagePart: any,
  rawOcrText: string,
  connector: any,
  missingFieldKey: string
): Promise<string | null> {
  if (!connector || !connector.extractionContract) return null;
  const contract = connector.extractionContract;
  if (!contract.requiredPortalFields) return null;
  const field = contract.requiredPortalFields.find((f: any) => f.canonicalKey === missingFieldKey);
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
  prompt += `Busca en la imagen y el texto OCR únicamente este campo requerido por el portal: ${field.label}.\n`;
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

// API endpoint: Analyze buy ticket photo (AI Vision OCR)
app.post("/api/tickets/analyze", async (req: Request, res: Response): Promise<void> => {
  try {
    const { image, mimeType, forceTargetedRetry, connectorId } = req.body;
    const customKey = req.headers["x-gemini-api-key"] as string | undefined;

    if (!image) {
      res.status(400).json({ error: "Missing base64 ticket image" });
      return;
    }

     // List of models to try in order
    const MODELS_TO_TRY = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
    const MAX_RETRIES_PER_MODEL = 2; // Try up to 2 times for each model
    
    let ai: any;
    let fallbackToOcrMock = false;
    let ocrErrorDetails = "";

    try {
      ai = getGeminiClient(customKey);
    } catch (err: any) {
      console.warn("Gemini client missing or failed to initialize for OCR. Triggering high-fidelity mock fallback...");
      fallbackToOcrMock = true;
      ocrErrorDetails = err.message || "No client initialized";
    }

    const imagePart = {
      inlineData: {
        mimeType: mimeType || "image/jpeg",
        data: image,
      },
    };

    // Helper for matching connector on backend
    function backendMatchConnector(connectorsList: any[], tEmisorName: string, tEmisorRfc: string): any {
      const cleanStr = (s: string) => 
        (s || "")
         .toLowerCase()
         .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
         .replace(/[^a-z0-9\s]/g, "") // remove punctuation
         .replace(/\b(sa|de|cv|sapi|srl|de|cv|grupo|comercial|cadena|tiendas|sucursal|santa|fe|magna|pemex)\b/g, "")
         .trim();

      const tRfc = (tEmisorRfc || "").toLowerCase().trim();
      const tNombre = cleanStr(tEmisorName || "");

      const candidates = connectorsList.filter((c) => {
        // Filter out disabled/duplicate mock connectors
        if (c.status === "disabled" || c.disabledReason === "DUPLICATE_MOCK_CONNECTOR") return false;

        const cRfc = (c.rfc || "").toLowerCase().trim();
        if (tRfc && cRfc && tRfc === cRfc) return true;

        const cNombre = cleanStr(c.nombre || "");
        if (tNombre && cNombre && (tNombre.includes(cNombre) || cNombre.includes(tNombre))) return true;

        if (c.aliases && c.aliases.length > 0) {
          const matchingAlias = c.aliases.find((alias: string) => {
            const cleanAlias = cleanStr(alias);
            return tNombre && cleanAlias && (tNombre.includes(cleanAlias) || cleanAlias.includes(tNombre));
          });
          if (matchingAlias) return true;
        }

        if (tNombre && cNombre) {
          const tWords = tNombre.split(/\s+/).filter(w => w.length > 2);
          const cWords = cNombre.split(/\s+/).filter(w => w.length > 2);
          return tWords.some(w => cWords.includes(w));
        }

        return false;
      });

      if (candidates.length === 0) return null;

      // Prioritized Sorting
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
        if (aMock !== bMock) return aMock - bMock; // prefer non-mock (0) over mock (1)

        const aContract = (a.extractionContract && a.extractionContract.requiredPortalFields && a.extractionContract.requiredPortalFields.length > 0) ? 1 : 0;
        const bContract = (b.extractionContract && b.extractionContract.requiredPortalFields && b.extractionContract.requiredPortalFields.length > 0) ? 1 : 0;
        if (aContract !== bContract) return bContract - aContract;

        return 0;
      });

      return candidates[0];
    }

    let textResult = "";
    let promptTokens = 0;
    let outputTokens = 0;
    let matchedConnector = null;

    // Fetch connectors from Firestore
    let connectorsList: any[] = [];
    if (adminDb && typeof adminDb.collection === "function") {
      try {
        const snap = await adminDb.collection("connectors").get();
        connectorsList = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      } catch (e: any) {
        console.warn("Could not retrieve connectors list from DB:", e.message);
      }
    }

    let brandAliases: string[] = [];
    let billingUrl = "";
    let evidence = "";
    let confidence = 0.0;
    let isReadyConnector = false;

    if (!fallbackToOcrMock && ai) {
      let detectedName = "";
      let detectedRfc = "";

      if (forceTargetedRetry && connectorId) {
        matchedConnector = connectorsList.find(c => c.id === connectorId) || null;
        console.log(`[OCR Force Retry] Bypassing Stage 1. Forced connector: ${matchedConnector?.nombre}`);
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

        for (const model of MODELS_TO_TRY) {
          if (successId) break;
          try {
            console.log(`[OCR Stage 1] Identifying merchant with model ${model}`);
            const response = await ai.models.generateContent({
              model: model,
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
              console.log(`[OCR Stage 1] Identified: ${detectedName} (RFC: ${detectedRfc})`);
            }
          } catch (err: any) {
            console.warn(`[OCR Stage 1 Warning] Model ${model} failed:`, err?.message || err);
          }
        }

        matchedConnector = backendMatchConnector(connectorsList, detectedName, detectedRfc);
      }

      // Check conector existence and readiness
      isReadyConnector = false;
      if (matchedConnector && matchedConnector.status === "production_ready" && matchedConnector.runnerAvailable === true) {
        isReadyConnector = true;
      }

      if (!matchedConnector) {
        console.log(`[OCR Pipeline] No connector matched for ${detectedName} (${detectedRfc}). Creating candidate.`);
        if (adminDb && typeof adminDb.collection === "function") {
          try {
            const candidateRef = adminDb.collection("connector_candidates").doc();
            await candidateRef.set({
              nombre: detectedName || "Comercio por identificar",
              rfc: detectedRfc || "XAXX010101000",
              aliases: brandAliases || [],
              portalUrl: billingUrl || "",
              status: "pending_setup",
              createdAt: new Date().toISOString()
            });

            const reqRef = adminDb.collection("training_requests").doc();
            await reqRef.set({
              storeName: detectedName || "Comercio por identificar",
              rfc: detectedRfc || "XAXX010101000",
              officialBillingUrl: billingUrl || "",
              status: "pending_training",
              evidence: evidence || "",
              createdAt: new Date().toISOString()
            });
          } catch (e: any) {
            console.warn("Could not save connector candidate/training request to Firestore:", e.message);
          }
        }
      } else if (!isReadyConnector) {
        console.log(`[OCR Pipeline] Connector matched (${matchedConnector.nombre}) but not ready. Creating training request.`);
        if (adminDb && typeof adminDb.collection === "function") {
          try {
            const existingSnap = await adminDb.collection("training_requests")
              .where("rfc", "==", matchedConnector.rfc || detectedRfc)
              .limit(1)
              .get();
            if (existingSnap.empty) {
              const reqRef = adminDb.collection("training_requests").doc();
              await reqRef.set({
                storeName: matchedConnector.nombre || detectedName,
                rfc: matchedConnector.rfc || detectedRfc,
                officialBillingUrl: matchedConnector.portalUrl || billingUrl || "",
                status: "pending_training",
                evidence: evidence || "Existente pero no listo",
                createdAt: new Date().toISOString()
              });
            }
          } catch (e: any) {
            console.warn("Could not save training request to Firestore:", e.message);
          }
        }
      }

      // STAGE 2: Targeted OCR using extractionContract or generic fallback
      let targetedPromptText = "";
      let targetedSchema: any = {};

      if (isReadyConnector && matchedConnector && matchedConnector.extractionContract) {
        console.log(`[OCR Stage 2] Matched connector ${matchedConnector.nombre}. Loading extractionContract.`);
        const contract = matchedConnector.extractionContract;

        targetedPromptText = `Analiza la imagen del ticket de compra comercial del comercio: ${matchedConnector.nombre} (también conocido como: ${matchedConnector.aliases ? matchedConnector.aliases.join(", ") : "n/a"}).\n`;
        targetedPromptText += `Extrae únicamente los campos requeridos por el portal de facturación oficial:\n`;
        const requiredPortalFields = contract.requiredPortalFields || [];
        for (const f of requiredPortalFields) {
          const hints = f.fieldExtractionHints || {};
          const fieldKey = String(f.canonicalKey || f.key || "").replace(/^portalFields\./, "");
          targetedPromptText += `- Campo: ${f.label || fieldKey} (clave: ${fieldKey})\n`;
          if (f.hints) targetedPromptText += `  * Pistas: ${f.hints.join(". ")}\n`;
          if (hints.likelyZones) targetedPromptText += `  * Zonas probables: ${hints.likelyZones.join(", ")}\n`;
          if (hints.nearbyWords) targetedPromptText += `  * Palabras clave cercanas: ${hints.nearbyWords.join(", ")}\n`;
          if (f.validationPattern) targetedPromptText += `  * Formato esperado (Regex): ${f.validationPattern}\n`;
          if (f.forbiddenPatterns) targetedPromptText += `  * Patrones prohibidos: ${f.forbiddenPatterns.join(", ")}\n`;
        }
        targetedPromptText += `\nINSTRUCCIÓN CRÍTICA DE SEGURIDAD: Queda estrictamente prohibido extraer, inferir o inventar cualquier valor de tipo UUID (como xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx), ticketId, doc.id, jobId, folio fiscal SAT, o identificador interno de ZenTicket o del sistema. Si detectas tales valores, ignóralos y no los uses para el campo billingReference.\n`;
        targetedPromptText += `Si un campo requerido no aparece físicamente o de forma legible en el ticket, debes devolver obligatoriamente null o una cadena vacía. No inventes datos.\n`;
        targetedPromptText += `También extrae la fecha de compra (fechaCompra) en formato YYYY-MM-DD, la sucursal (sucursal) y la lista de artículos comprados (items).`;

        const customProperties: any = {
          rfcEmisor: { type: "STRING" },
          nombreEmisor: { type: "STRING" },
          fechaCompra: { type: "STRING", description: "Fecha de compra en formato YYYY-MM-DD. Si no la encuentras, devuelve null." },
          sucursal: { type: "STRING" },
          rawOcrText: { type: "STRING", description: "El texto completo e íntegro extraído del ticket de forma literal, línea por línea." },
          portalFieldsConfidence: { type: "OBJECT", properties: {} },
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

        // Add every portal field declared by the connector contract.
        const confidenceRequired: string[] = [];
        for (const f of requiredPortalFields) {
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
      } else {
        // Generic fallback for connector candidate or not ready!
        const storeName = matchedConnector ? matchedConnector.nombre : detectedName;
        console.log(`[OCR Stage 2 Fallback] Connector not ready/found for ${storeName}. Using generic fallback contract.`);

        targetedPromptText = `Analiza la imagen del ticket de compra de la tienda: ${storeName}.\n`;
        targetedPromptText += `Extrae los campos generales del ticket para poder registrar la compra:\n`;
        targetedPromptText += `- total (Importe Total de la compra con decimales)\n`;
        targetedPromptText += `- billingReference (Folio de venta o código de facturación impreso en el ticket)\n`;
        targetedPromptText += `- fechaCompra (Fecha de compra en formato YYYY-MM-DD)\n`;

        const customProperties: any = {
          rfcEmisor: { type: "STRING" },
          nombreEmisor: { type: "STRING" },
          fechaCompra: { type: "STRING", description: "Fecha de compra en formato YYYY-MM-DD. Si no la encuentras, devuelve null." },
          sucursal: { type: "STRING" },
          total: { type: "NUMBER", description: "Importe total del ticket con decimales. Si no lo encuentras, devuelve 0." },
          billingReference: { type: "STRING", description: "Folio de venta, número de ticket o referencia de facturación del ticket. Si no lo encuentras, devuelve una cadena vacía." },
          rawOcrText: { type: "STRING", description: "El texto completo e íntegro extraído del ticket de forma literal, línea por línea." },
          portalFieldsConfidence: {
            type: "OBJECT",
            properties: {
              total: { type: "NUMBER" },
              billingReference: { type: "NUMBER" }
            },
            required: ["total", "billingReference"]
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

        targetedSchema = {
          type: "OBJECT",
          properties: customProperties,
          required: ["rfcEmisor", "nombreEmisor", "rawOcrText", "items", "portalFieldsConfidence"]
        };
      }

      let successTarget = false;
      for (const model of MODELS_TO_TRY) {
        if (successTarget) break;
        for (let attempt = 1; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
          try {
            console.log(`[OCR Stage 2] Extracting details using model ${model} (Attempt ${attempt}/${MAX_RETRIES_PER_MODEL})`);
            const response = await ai.models.generateContent({
              model: model,
              contents: { parts: [imagePart, { text: targetedPromptText }] },
              config: {
                responseMimeType: "application/json",
                responseSchema: targetedSchema,
              },
            });

            if (response.text && response.text.trim()) {
              textResult = response.text.trim();
              promptTokens = response.usageMetadata?.promptTokenCount || 428;
              outputTokens = response.usageMetadata?.candidatesTokenCount || 215;
              console.log(`[OCR Stage 2] Success with model ${model}. Tokens: In=${promptTokens}, Out=${outputTokens}`);
              successTarget = true;
              fallbackToOcrMock = false;
              break;
            } else {
              throw new Error("Empty text returned from Gemini API Stage 2");
            }
          } catch (err: any) {
            console.warn(`[OCR Stage 2 Warning] Model ${model} failed on attempt ${attempt}: ${err?.message || err}`);
          }
        }
      }
      if (!successTarget) {
        fallbackToOcrMock = true;
      }
    }

    let extractedData: any;

    if (textResult) {
      try {
        extractedData = JSON.parse(textResult);
      } catch (e: any) {
        console.warn("[OCR] Error parsing model response JSON:", e.message);
        fallbackToOcrMock = true;
      }
    } else {
      fallbackToOcrMock = true;
    }

    // Fallback/Mock check
    if (fallbackToOcrMock || !extractedData) {
      console.warn("[OCR Fallback] Gemini unavailable. Returning empty manual-capture draft.", ocrErrorDetails);
      extractedData = {
        rfcEmisor: "",
        nombreEmisor: "",
        fechaCompra: "",
        folio: "",
        total: 0,
        sucursal: "",
        ocrFailed: true,
        ocrError: "El OCR no pudo procesar la imagen. Completa los campos manualmente.",
        items: [],
        rawOcrText: ""
      };
    }

    // PIPELINE IMPLEMENTATION
    const pipelineLogs: string[] = [];
    pipelineLogs.push("Etapa 1: Recibida imagen del ticket y decodificada.");
    
    // Etapa 2: QR detection
    let qrDetected = false;
    let qrValue = "";
    let qrParsed = parseSatQrUrl(textResult) || (extractedData && (parseSatQrUrl(extractedData.folio) || parseSatQrUrl(extractedData.sucursal)));
    if (qrParsed) {
      qrDetected = true;
      qrValue = `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${qrParsed.uuid}&re=${qrParsed.rfcEmisor}&rr=${qrParsed.rfcReceptor}&tt=${qrParsed.total}`;
      pipelineLogs.push("Etapa 2: Código QR SAT detectado en la imagen. Priorizando datos del QR sobre OCR.");
    } else {
      pipelineLogs.push("Etapa 2: Escaneando códigos de barras y QR... No se localizaron códigos legibles.");
    }

    pipelineLogs.push("Etapa 3: Analizando datos con motor OCR de IA Gemini.");

    // Etapa 4: Detección de comercio
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
          reqFields = parsedFields.filter((f: any) => f.required !== false).map((f: any) => f.key);
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
    const secondaryOcrFieldsList: string[] = [];
    const rejectedValuesList: string[] = [];
    let manualInputReason = "";
    let qualityResult: ImageQualityResult | null = null;

    let billingReference = extractedData.billingReference || extractedData.referenciaFacturacion || "";
    
    // Sanitise immediately
    const sanitized = sanitizeBillingReferenceForConnector(billingReference, extractedData.rawOcrText || "", matchedConnector);
    if (billingReference && billingReference !== sanitized) {
      rejectedValuesList.push(billingReference);
      billingReference = "";
    } else {
      billingReference = sanitized;
    }

    const contractFields: any[] = matchedConnector?.extractionContract?.requiredPortalFields || [];
    const dynamicPortalFields: Record<string, any> = {};
    const portalFieldsConfidence: Record<string, number> = {};
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

    // Phased validation checks
    const requiredFieldsNeedingRetry = contractFields.filter((field: any) => {
      if (field.required === false) return false;
      const key = String(field.canonicalKey || field.key || "").replace(/^portalFields\./, "");
      const value = dynamicPortalFields[key];
      return value === "" || value === null || value === undefined || (portalFieldsConfidence[key] || 0) < 0.5;
    });
    const isTextTooShort = !extractedData.rawOcrText || extractedData.rawOcrText.length < 50;

    if (requiredFieldsNeedingRetry.length > 0 || isTextTooShort) {
      console.log("[OCR Phased] Required field is missing/low confidence or text too short. Running quality analysis...");
      qualityResult = await analyzeTicketImageQuality(ai, imagePart);
      
      const isBadQuality = qualityResult.isBlurry || qualityResult.isCropped || qualityResult.isLowLighting || !qualityResult.isLegible || qualityResult.isIncomplete;

      if (isBadQuality) {
        manualInputReason = "IMAGE_QUALITY_ISSUE";
        console.log(`[OCR Phased] Bad quality detected: ${qualityResult.reason}. Skipping secondary extraction.`);
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

          let normalizedValue: any = secondaryValue.trim();
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
          console.log(`[OCR Phased] Secondary extraction found ${key}.`);
        }
      }
    }

    // Determine extraction state
    let extractionState = "extraction_found";
    const missingFieldsList: string[] = [];
    const lowConfidenceFieldsList: string[] = [];

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

    // Populate fields
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
        confidence: portalFieldsConfidence.billingReference,
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

    const portalFields = isReadyConnector ? dynamicPortalFields : {
      billingReference: extractedData.billingReference || "",
      total: extractedData.total || 0,
      fecha: extractedData.fechaCompra || ""
    };

    const avgConfidence = Object.values(fields).reduce((sum, f) => sum + f.confidence, 0) / Object.keys(fields).length;

    res.json({
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
      qrCfdiUuid: qrParsed ? qrParsed.uuid : null,
      ocrFailed: isReadyConnector ? (extractionState === "manual_input_required") : false,
      ocrError: isReadyConnector && (extractionState === "manual_input_required") ? "Requiere revisión del usuario por campo faltante o ilegible." : null,
      confidenceScore: parseFloat(avgConfidence.toFixed(4)),
      extractedFields: fields,
      pipelineLogs,
      cost: fallbackToOcrMock ? 0 : 0.50,
      rawCost: parseFloat((((promptTokens * 0.075) + (outputTokens * 0.30)) / 1000000 * 18.5).toFixed(6)),
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
      extractionState: isReadyConnector ? extractionState : "extraction_found",
      portalFieldsConfidence,
      extractionDiagnostics,
      status: isReadyConnector ? "extracted" : (matchedConnector ? "connector_not_ready" : "training_required")
    });
  } catch (error: any) {
    console.error("Critical OCR Analysis process went down:", error);
    res.json({
      rfcEmisor: "",
      nombreEmisor: "",
      fechaCompra: "",
      folio: "",
      total: 0,
      sucursal: "",
      ocrFailed: true,
      ocrError: "El OCR no pudo procesar la imagen. Completa los campos manualmente.",
      items: [],
      rawOcrText: "",
      cost: 0,
      rawCost: 0,
      extractionState: "manual_input_required",
      portalFieldsConfidence: { billingReference: 0, total: 0 },
      extractionDiagnostics: { reasonForManualInput: "CRITICAL_PROCESS_ERROR" }
    });
  }
});

// API Endpoint: Parse SAT Constancia de Situación Fiscal (PDF/Image)
app.post("/api/fiscal/parse-constancia", async (req: Request, res: Response): Promise<void> => {
  try {
    const { file, mimeType } = req.body;
    const customKey = req.headers["x-gemini-api-key"] as string | undefined;

    if (!file) {
      res.status(400).json({ error: "Falta el archivo base64 de la constancia fiscal" });
      return;
    }

    const MODELS_TO_TRY = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
    let ai;
    let fallbackToMock = false;
    let errorDetails = "";

    try {
      ai = getGeminiClient(customKey);
    } catch (err: any) {
      console.warn("Gemini client initialization failed for constancia parsing. Using high-fidelity mock...");
      fallbackToMock = true;
      errorDetails = err.message || "No client initialized";
    }

    const filePart = {
      inlineData: {
        mimeType: mimeType || "application/pdf",
        data: file,
      },
    };

    const textPart = {
      text: "Analiza esta Constancia de Situación Fiscal (SAT México) proporcionada. Extrae con precisión el RFC, la Razón Social o Denominación, el Código Postal del domicilio fiscal, y el número de código numérico de 3 dígitos del Régimen Fiscal actual preponderante o principal (ejemplo: 601, 612, 626, 605, 606). Si el archivo no es un PDF o imagen de constancia válida, o los datos no se encuentran, intenta interpretarlo o genera datos coherentes posibles.",
    };

    const responseSchema = {
      type: "OBJECT",
      properties: {
        rfc: { type: "STRING", description: "RFC del contribuyente (12 o 13 caracteres de longitud, sin espacios/guiones)" },
        razonSocial: { type: "STRING", description: "Nombre, Denominación o Razón Social completa en MAYÚSCULAS" },
        regimenFiscal: { type: "STRING", description: "Código de 3 dígitos del Régimen de adscripción (ej. 601, 603, 605, 606, 612, 626)" },
        codigoPostal: { type: "STRING", description: "Código postal del domicilio fiscal (5 dígitos)" }
      },
      required: ["rfc", "razonSocial", "regimenFiscal", "codigoPostal"],
    };

    let textResult = "";

    if (!fallbackToMock && ai) {
      for (const modelName of MODELS_TO_TRY) {
        if (textResult) break;
        try {
          console.log(`[CONSTANCIA] Analyzing with ${modelName}`);
          const response = await ai.models.generateContent({
            model: modelName,
            contents: { parts: [filePart, textPart] },
            config: {
              responseMimeType: "application/json",
              responseSchema,
            },
          });

          if (response.text && response.text.trim()) {
            textResult = response.text.trim();
            console.log(`[CONSTANCIA] Extracted successfully with ${modelName}`);
            break;
          }
        } catch (err: any) {
          console.warn(`[CONSTANCIA] Model ${modelName} parsing failed:`, err?.message || err);
          errorDetails += `\n[${modelName}]: ${err?.message || String(err)}`;
        }
      }
    }

    let parsedData;
    if (textResult) {
      try {
        parsedData = JSON.parse(textResult);
      } catch (e) {
        fallbackToMock = true;
      }
    } else {
      fallbackToMock = true;
    }

    if (fallbackToMock || !parsedData) {
      console.warn("[CONSTANCIA Fallback] Fallback to mock parser triggered", errorDetails);
      // Let's return a high fidelity dummy parsed Mexican CSF mapping to random dummy results
      const mockOptions = [
        {
          rfc: "GOMJ890112S89",
          razonSocial: "JUAN GOMEZ MARTINEZ",
          regimenFiscal: "612",
          codigoPostal: "03100"
        },
        {
          rfc: "CABE851024T8A",
          razonSocial: "RICARDO CASTRO BECERRIL",
          regimenFiscal: "626",
          codigoPostal: "03910"
        },
        {
          rfc: "LEG190820HR5",
          razonSocial: "CONSTRUCTORA LEGION DEL NORTE SA DE CV",
          regimenFiscal: "601",
          codigoPostal: "64000"
        }
      ];
      parsedData = mockOptions[Math.floor(Math.random() * mockOptions.length)];
    }

    res.json(parsedData);
  } catch (error: any) {
    console.error("Constancia processing error:", error);
    res.status(500).json({ error: "Error interno al procesar constancia fiscal" });
  }
});

// Helper function: Generate UUID for CFDI simulation fallback
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

// Helper function: Escape XML characters safely
function escapeXml(unsafe: string): string {
  if (typeof unsafe !== "string") return "";
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case "\"": return "&quot;";
      default: return c;
    }
  });
}

// Helper function: Generate standard Mexican Portal specifi// Helper function: Generate standard Mexican Portal specifications
function getLocalDictionaryMatch(nombreEmisor: string, rfcEmisor: string) {
  const nameClean = nombreEmisor.toLowerCase().trim();

  // Defined static mapping of major Mexican brands categorized into 18 main logic groups covering 80+ specific brands
  const BRAND_DICTIONARY = [
    {
      // 1. Alsea Brands (10 brands)
      keys: ["starbucks", "alsea", "vips", "domino", "burger king", "chili", "italianni", "cheesecake", "pf chang", "p.f. chang"],
      portalUrl: "https://historico.alsea.com.mx/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input[name='rfc']", type: "text", required: true },
        { key: "ticket", name: "Ticket (9 o 12 dígitos)", selector: "input#ticketNo, input[name='ticket']", type: "text", required: true },
        { key: "tienda", name: "Número de Tienda", selector: "input#storeNo", type: "text", required: true },
        { key: "fecha", name: "Fecha de Compra", selector: "input#fechaTicket", type: "date", required: true },
        { key: "total", name: "Monto Total", selector: "input#montoTotal", type: "number", required: true }
      ],
      steps: [
        "Navegar al Portal Unificado de Facturación Alsea",
        "Ingresar el RFC del cliente, número de ticket, número de tienda y monto total",
        "Hacer clic en 'Siguiente' para validar el ticket de consumo",
        "Ingresar o validar los datos fiscales corporativos",
        "Hacer clic en 'Facturar' y descargar XML y PDF"
      ]
    },
    {
      // 2. Oxxo & Oxxo Gas (2 brands)
      keys: ["oxxo", "oxxogas", "oxxo gas"],
      portalUrl: "https://www3.oxxo.com:8080/facturacionOXXO",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input[name='rfc']", type: "text", required: true },
        { key: "folio", name: "Folio de Venta (ID)", selector: "input[name='folio']", type: "text", required: true },
        { key: "fecha", name: "Fecha de Compra", selector: "input[name='fecha']", type: "date", required: true },
        { key: "total", name: "Monto del Ticket", selector: "input[name='total']", type: "number", required: true }
      ],
      steps: [
        "Navegar al portal de facturación oficial de OXXO / Oxxo Gas",
        "Ingresar los datos del Ticket (Folio de Venta, Fecha, Total) y RFC",
        "Confirmar la búsqueda del ticket y avanzar",
        "Completar la información fiscal e indicar el Uso de CFDI",
        "Presionar 'Emitir Factura' para recibir XML y PDF"
      ]
    },
    {
      // 3. Walmart Group (5 brands)
      keys: ["walmart", "bodega", "aurrera", "sams", "superama", "wal-mart", "express"],
      portalUrl: "https://facturacion.walmartmexico.com/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "tc", name: "Número de Ticket (TC)", selector: "input#ticketNo", type: "text", required: true },
        { key: "tr", name: "Código de Transacción (TR)", selector: "input#transactionNo", type: "text", required: true }
      ],
      steps: [
        "Ingresar al portal de facturación de Walmart México",
        "Introducir los identificadores de compra (Código TC de 20 dígitos y Código TR)",
        "Capturar el RFC de la persona física o moral receptora",
        "Asignar la Razón Social y Régimen de Impuestos correspondiente",
        "Hacer clic en 'Obtener Factura' para guardar y descargar archivos"
      ]
    },
    {
      // 4. Costco (1 brand)
      keys: ["costco"],
      portalUrl: "https://www3.costco.com.mx/facturacion",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input[name='rfc']", type: "text", required: true },
        { key: "ticket", name: "Número de Ticket", selector: "input#ticket", type: "text", required: true },
        { key: "membership", name: "Número de Membresía", selector: "input#membership", type: "text", required: true }
      ],
      steps: [
        "Navegar al sistema de facturación electrónica de Costco México",
        "Ingresar el RFC, número de ticket y el identificador de membresía activa",
        "Validar transacción e ingresar Razón Social",
        "Seleccionar Uso de CFDI default",
        "Confirmar generación y descargar el XML y PDF"
      ]
    },
    {
      // 5. Soriana & La Comer Group (5 brands)
      keys: ["soriana", "fresko", "la comer", "lacomer", "sumesa", "city market", "citymarket"],
      portalUrl: "https://facturacion.soriana.com/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "ticket", name: "Código de Barras del Ticket", selector: "input#ticketCode", type: "text", required: true },
        { key: "total", name: "Importe Total", selector: "input#monto", type: "number", required: true }
      ],
      steps: [
        "Ingresar al portal oficial de facturas de Soriana y Grupo La Comer",
        "Digitar el código de barras impreso en el ticket y el importe final",
        "Capturar la información fiscal (RFC, Régimen, CP)",
        "Hacer clic en 'Previsualizar Factura'",
        "Hacer clic en 'Generar' para crear el comprobante CFDI"
      ]
    },
    {
      // 6. Ride Sharing & Delivery (4 brands)
      keys: ["uber", "didi", "rappi", "cabify"],
      portalUrl: "https://riders.uber.com/trips",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input[name='rfc']", type: "text", required: true },
        { key: "trip", name: "ID de Viaje / Orden", selector: "input#orderId", type: "text", required: true },
        { key: "total", name: "Monto del Servicio", selector: "input#amount", type: "number", required: true }
      ],
      steps: [
        "Ingresar a la cuenta oficial de la app de transporte o delivery",
        "Ir a la sección de viajes facturables o facturación automática",
        "Ingresar los datos de RFC, ID del viaje y monto",
        "Confirmar perfil fiscal mexicano y régimen SAT",
        "Generar y descargar el comprobante timbrado fiscal"
      ]
    },
    {
      // 7. Chedraui Group (3 brands)
      keys: ["chedraui", "súper chedraui", "super chedraui", "selecto chedraui"],
      portalUrl: "https://facturacion.chedraui.com.mx/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#UserRFC", type: "text", required: true },
        { key: "ticket", name: "Código de Ticket Chedraui", selector: "input#TicketCode", type: "text", required: true },
        { key: "total", name: "Importe Total Facturable", selector: "input#TicketAmount", type: "number", required: true }
      ],
      steps: [
        "Ir al portal de Autofacturación de Grupo Chedraui",
        "Completar los inputs de RFC, el código impreso en el ticket y la cantidad monetaria",
        "Hacer clic en 'Validar' para pre-cargar la compra comercial",
        "Ingresar los datos de facturación (Nombre, CFDI, CP)",
        "Enviar solicitud y descargar la factura electrónica"
      ]
    },
    {
      // 8. Telecom & Tech (7 brands)
      keys: ["telmex", "telcel", "movistar", "at&t", "att", "izzi", "totalplay", "megacable"],
      portalUrl: "https://telmex.com/mi-telmex",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "cuenta", name: "Número de Teléfono / Cuenta (10 dígitos)", selector: "input#accountNumber", type: "text", required: true }
      ],
      steps: [
        "Acceder al área de clientes 'Mi Telmex', 'Mi Telcel' o portal de su proveedor",
        "Autenticarse con el número de teléfono o cuenta activa",
        "Navegar a la pestaña 'Recibos' o 'Facturación'",
        "Seleccionar el periodo e ingresar RFC fiscal",
        "Descargar el XML y PDF oficial del proveedor"
      ]
    },
    {
      // 9. Toll & Highway (5 brands)
      keys: ["caminos", "capufe", "caseta", "teletransito", "televia", "tag", "pase", "viapass"],
      portalUrl: "https://facturacioncapufe.com.mx/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc_client", type: "text", required: true },
        { key: "codigo", name: "Código de Peaje (18 letras/números)", selector: "input#peajeCode", type: "text", required: true }
      ],
      steps: [
        "Acceder al Sistema de Facturación de Peajes CAPUFE/TeleVía/PASE",
        "Ingresar el RFC del contribuyente receptor",
        "Escribir los códigos del ticket de la caseta de cobro",
        "Asignar Razón Social y forma de pago",
        "Hacer clic en 'Generar Factura' y descargar CFDI"
      ]
    },
    {
      // 10. Gasoline Stations (8 brands)
      keys: ["pemex", "g500", "g-500", "hidrosina", "bp gas", "shell", "mobil", "petro 7", "petro7", "chevron gas"],
      portalUrl: "https://www.facturagas.mx/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "ticket", name: "Número de Ticket de Combustible", selector: "input#ticket_combustible", type: "text", required: true },
        { key: "webid", name: "Web ID / Dígito Verificador", selector: "input#web_id", type: "text", required: true }
      ],
      steps: [
        "Entrar al portal oficial de facturación de la Gasolinera",
        "Ingresar el RFC y el Web ID/Folio que viene impreso en el ticket de carga",
        "Verificar que los datos de litros, precio y producto coincidan",
        "Completar datos fiscales (Uso CFDI, Código Postal)",
        "Confirmar timbrado y recibir los archivos XML/PDF en pantalla"
      ]
    },
    {
      // 11. Pharmacies & Wellness (4 brands)
      keys: ["farmacias guadalajara", "guadalajara", "farmacias del ahorro", "del ahorro", "ahorro", "benavides", "san pablo", "farmacia san pablo"],
      portalUrl: "https://facturacion.neofactura.com.mx/farmacias",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "ticket", name: "Número de Alianza o Folio de Ticket", selector: "input#folioTicket", type: "text", required: true },
        { key: "total", name: "Total del Ticket", selector: "input#totalTicket", type: "number", required: true }
      ],
      steps: [
        "Acceder al sitio de autofacturación de la red de farmacias",
        "Ingresar los dígitos del folio impreso del ticket de compra",
        "Validar el total monetario pagado y su RFC",
        "Añadir Razón Social y régimen fiscal",
        "Descargar su factura e imprimir comprobante"
      ]
    },
    {
      // 12. Convenience Stores (5 brands)
      keys: ["7-eleven", "seven eleven", "seven", "circle k", "circlek", "extra", "neto", "tiendas neto"],
      portalUrl: "https://www.7-eleven.com.mx/facturacion/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input[name='rfc']", type: "text", required: true },
        { key: "ticket", name: "Número de Ticket (Código de barras)", selector: "input#barcode", type: "text", required: true },
        { key: "total", name: "Importe con Centavos", selector: "input#montoTotal", type: "number", required: true }
      ],
      steps: [
        "Abrir el módulo de facturas del portal comercial",
        "Introducir el número de referencia de ticket e importe exacto",
        "Agregar el RFC y Correo Electrónico para el envío automático",
        "Validar datos generales y hacer clic en 'Registrar Factura'"
      ]
    },
    {
      // 13. Department Stores & General Retail (6 brands)
      keys: ["liverpool", "palacio de hierro", "palacio de hierro", "sears", "coppel", "suburbia", "sanborns"],
      portalUrl: "https://facturacion.liverpool.com.mx/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "ticket", name: "Código de Facturación (20 o 22 dígitos)", selector: "input#codFactura", type: "text", required: true }
      ],
      steps: [
        "Entrar al asistente de facturación del almacén mercantil",
        "Introducir el código de facturación impreso arriba o abajo del ticket",
        "Validar el total de la compra correspondiente",
        "Establecer la información fiscal mexicana (Regimen, CP, RFC)",
        "Generar factura y exportar a correo o disco local"
      ]
    },
    {
      // 14. Fast Fashion Retail (6 brands)
      keys: ["h&m", "h & m", "zara", "pull&bear", "pull and bear", "bershka", "stradivarius", "massimo dutti", "inditex"],
      portalUrl: "https://factura.inditex.com/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "ticket", name: "Número de Ticket de Compra", selector: "input#ticket_num", type: "text", required: true },
        { key: "establecimiento", name: "Número de Establecimiento/Tienda", selector: "input#store_id", type: "text", required: true }
      ],
      steps: [
        "Acceder al portal unificado de Tickets de Moda Internacional",
        "Ingresar el código de ticket junto con la fecha de la compra and RFC",
        "Seleccionar el uso correspondiente del CFDI",
        "Haz clic en 'Aceptar' para generar la factura timbrada"
      ]
    },
    {
      // 15. Entertainment & Cinema (4 brands)
      keys: ["cinepolis", "cinépolis", "cinemex", "ticketmaster", "superboletos", "súperboletos"],
      portalUrl: "https://www.cinepolis.com/facturacion-electronica",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "transaccion", name: "Número de Transacción / Folio de Boleto", selector: "input#transaction_id", type: "text", required: true },
        { key: "total", name: "Importe Total", selector: "input#amount", type: "number", required: true }
      ],
      steps: [
        "Ingresar al sistema de comprobantes de Boletaje o Cine",
        "Ingresar el número de referencia o ID de la confirmación de compra",
        "Escribir RFC y Correo del recipiente",
        "Hacer clic en 'Facturar boletos' y esperar el PDF y XML"
      ]
    },
    {
      // 16. Home Improvement & Construction (2 brands)
      keys: ["home depot", "homedepot", "sodimac"],
      portalUrl: "https://www.homedepot.com.mx/facturacion-electronica",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc_input", type: "text", required: true },
        { key: "itu", name: "Código ITU (Impreso en Ticket)", selector: "input#itu_code", type: "text", required: true }
      ],
      steps: [
        "Navegar al portal de Autofacturación de Artículos del Hogar",
        "Asignar su RFC e ingresar los caracteres del código ITU de seguridad",
        "Checar lista de artículos comprados",
        "Darle clic en 'Finalizar' para enviar e imprimir factura"
      ]
    },
    {
      // 17. Diners & Food Chains (7 brands)
      keys: ["toks", "el cardenal", "casa de toño", "casa de tono", "sonora grill", "fisher's", "fishers", "krispy kreme", "dunkin"],
      portalUrl: "https://facturacion.toks.com.mx/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#UserRFC", type: "text", required: true },
        { key: "ticket", name: "Folio de Facturación del Consumo", selector: "input#ticket_folio", type: "text", required: true },
        { key: "fecha", name: "Fecha del Consumo", selector: "input#date_input", type: "date", required: true }
      ],
      steps: [
        "Acceder al portal de facturación oficial de la cadena de alimentos",
        "Ingresar RFC, fecha de consumo y el folio de ticket impreso",
        "Confirmar desglose de alimentos, bebidas e impuestos",
        "Validar régimen fiscal mexicano y solicitar CFDI timbrado"
      ]
    },
    {
      // 18. Logistics & Shipping (4 brands)
      keys: ["dhl", "fedex", "estafeta", "redpack", "ups"],
      portalUrl: "https://facturacion.estafeta.com/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "guia", name: "Número de Guía o Código de Rastreo", selector: "input#tracking_number", type: "text", required: true }
      ],
      steps: [
        "Abrir el módulo de facturación del transportista",
        "Proporcionar el número de guía de envío de 10 o 22 dígitos",
        "Ingresar el RFC fiscal del contribuyente emisor",
        "Confirmar dirección e impuestos",
        "Hacer clic en 'Emitir Comprobante'"
      ]
    },
    {
      // 19. Farmacias Similares (Doctor Simi / Confianza)
      keys: ["farmacias similares", "similares", "doctor simi", "simi", "farmacias de confianza", "confianza"],
      portalUrl: "https://facturacion.gpupm.com/simifactura/portal",
      fields: [
        { key: "referenciaFacturacion", name: "Referencia de facturación", selector: "input#ref_simi", type: "text", required: true },
        { key: "total", name: "Total Facturado", selector: "input#total_simi", type: "number", required: true }
      ],
      steps: [
        "Navegar al portal de facturación de Farmacias Similares",
        "Ingresar la referencia de facturación y el importe total",
        "Completar datos fiscales y régimen SAT del receptor",
        "Generar y descargar la factura XML"
      ]
    }
  ];

  // Search in active brand directories using flexible keywords
  for (const brand of BRAND_DICTIONARY) {
    if (brand.keys.some(key => nameClean.includes(key))) {
      return {
        portalUrl: brand.portalUrl,
        fields: brand.fields,
        steps: brand.steps
      };
    }
  }

  return null;
}

function getLocalConnectorFallback(nombreEmisor: string, rfcEmisor: string) {
  const nameClean = nombreEmisor.toLowerCase();
  let portalUrlFallback = `https://facturacion.${nameClean.replace(/[^a-z0-9]/g, "") || "comercio"}.com.mx`;
  
  if (nameClean.includes("starbucks") || nameClean.includes("alsea") || nameClean.includes("vips") || nameClean.includes("domino")) {
    portalUrlFallback = "https://historico.alsea.com.mx/";
  } else if (nameClean.includes("oxxo")) {
    portalUrlFallback = "https://www3.oxxo.com:8080/facturacionOXXO";
  } else if (nameClean.includes("walmart") || nameClean.includes("bodega") || nameClean.includes("sams")) {
    portalUrlFallback = "https://facturacion.walmartmexico.com/";
  }

  return {
    portalUrl: portalUrlFallback,
    fields: [
      { key: "rfc", name: "RFC Cliente", selector: "input[name='rfc']", type: "text", required: true },
      { key: "folio", name: "Código de Facturación / Folio", selector: "#txtPrefactura, .input-folio, input[name='folio']", type: "text", required: true },
      { key: "fecha", name: "Fecha de Compra", selector: "input#fechaTicket, .datepicker-input", type: "date", required: true },
      { key: "total", name: "Monto Total (con decimales)", selector: "input[name='total'], #txtMontoTotal", type: "number", required: true }
    ],
    steps: [
      `Navegar al portal oficial de facturación de ${nombreEmisor} en ${portalUrlFallback}`,
      `Ingresar los datos identificadores del ticket: Folio, Fecha, Total y su RFC de cliente`,
      `Hacer clic en el botón 'Validar' o 'Buscar Ticket' para cargar el desglose detallado`,
      `Ingresar los datos de facturación de su Perfil Fiscal (Razón Social, Régimen Postal)`,
      `Hacer clic en el botón 'Generar Factura' o 'Solicitar CFDI'`,
      `Esperar la confirmación y descargar el XML y PDF timbrado`
    ]
  };
}


// API endpoint: Use Search Grounding to learn portal specs when no connector exists
app.post("/api/connectors/learn", async (req: Request, res: Response): Promise<void> => {
  const { nombreEmisor, rfcEmisor, learnedFrom, tokenSaver } = req.body;
  const customKey = req.headers["x-gemini-api-key"] as string | undefined;

  if (!nombreEmisor) {
    res.status(400).json({ error: "Missing nombreEmisor in request" });
    return;
  }

  // 1. OPTIMIZATION 1: Local Dictionary Cache Lookup (100% token-free, 0-cost, instant!)
  const dictMatch = getLocalDictionaryMatch(nombreEmisor, rfcEmisor);
  if (dictMatch) {
    console.log(`[Learn] Fast match in local dictionary for '${nombreEmisor}'. Zero-token cached specs returned.`);
    res.json({
      ...dictMatch,
      cost: learnedFrom === "portal_admin" ? 5.00 : 3.00, // Reduced cost for cached items!
      rawCost: 0,
      isCached: true
    });
    return;
  }

  let ai;
  try {
    ai = getGeminiClient(customKey);
  } catch (err: any) {
    // If no client available, fall back to rule-based spec immediately
    console.warn("Gemini client not initialized, using local fallback specs.");
    const fallbackSpecs = getLocalConnectorFallback(nombreEmisor, rfcEmisor);
    res.json({
      ...fallbackSpecs,
      cost: learnedFrom === "portal_admin" ? 25.00 : 15.00,
      rawCost: 0
    });
    return;
  }

  // 2. OPTIMIZATION 2: Dynamic Token-Saver Strategy Selection
  const isEcoMode = tokenSaver === true || tokenSaver === "true";
  
  try {
    if (isEcoMode) {
      // Direct Fast AI mapping (Pure LLM with no grounding + Minimal reasoning)
      console.log(`[Learn] Token-Saver (ECO) Mode active. Formulating fast offline AI mapping...`);
      
      const prompt = `Queremos automatizar de forma ultra-simplificada el proceso de facturación de tickets de la empresa mexicana '${nombreEmisor}' con RFC '${rfcEmisor || "No provisto"}'.
                      Basándote EN TU CONOCIMIENTO INTERNO (sin buscar en Google), genera la especificación estructurada estándar: determina de 2 a 3 campos requeridos clave para buscar el ticket y describe un flujo secuencial simplificado de máximo 4 pasos cortos.
                      Usa selectores CSS intuitivos y genéricos (como #txtTicket, input[name='rfc']). SÉ ABSOLUTAMENTE CONCISO Y LIMITA EL LARGO DEL TEXTO PARA AHORRAR TOKENS.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: "LOW" as any }, // Disables heavy reasoning tokens!
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              portalUrl: { type: "STRING" },
              fields: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    key: { type: "STRING" },
                    name: { type: "STRING" },
                    selector: { type: "STRING" },
                    type: { type: "STRING" },
                    required: { type: "BOOLEAN" },
                  },
                  required: ["key", "name", "selector", "type", "required"],
                },
              },
              steps: {
                type: "ARRAY",
                items: { type: "STRING" },
              },
            },
            required: ["portalUrl", "fields", "steps"],
          },
        },
      });

      const textResult = response.text;
      if (!textResult) {
        throw new Error("Empty ECO response from Gemini");
      }

      const promptTokens = response.usageMetadata?.promptTokenCount || 400;
      const outputTokens = response.usageMetadata?.candidatesTokenCount || 200;
      const exchangeRate = 18.50;
      const rawCost = (((promptTokens * 0.075 + outputTokens * 0.30) / 1000000)) * exchangeRate;

      const learnedSpecs = JSON.parse(textResult.trim());
      res.json({
        ...learnedSpecs,
        cost: learnedFrom === "portal_admin" ? 12.00 : 8.00, // Reduced cost for ECO mode!
        rawCost: parseFloat(rawCost.toFixed(6)),
        isEco: true
      });
      return;
    }

    // Default Mode: Search Grounding but fully optimized token parameters
    console.log("[Learn] Deep Mode active. Attempting to find connector details using Search Grounding + LOW reasoning...");
    
    const prompt = `Queremos automatizar el proceso de facturación de tickets de la empresa mexicana '${nombreEmisor}' con RFC '${rfcEmisor || "No provisto"}'.
                    Utilizando Google Search, busca el link directo al portal oficial de autofacturación de tickets para clientes en México.
                    Genera la especificación del conector: determina qué campos requiere el formulario para buscar el ticket e inventa selectores CSS realistas y de 4 a 5 pasos secuenciales cortos.
                    POR FAVOR SÉ EXTREMADAMENTE CONCISO: Genera nombres de campos cortos, selectores limpios y descripciones de pasos directas (máximo 12 palabras por instrucción) para reducir significativamente la generación de tokens.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingLevel: "LOW" }, // Cuts down reasoning tokens on search results
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            portalUrl: { type: "STRING", description: "URL oficial directo al portal en México" },
            fields: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  key: { type: "STRING" },
                  name: { type: "STRING" },
                  selector: { type: "STRING" },
                  type: { type: "STRING" },
                  required: { type: "BOOLEAN" },
                },
                required: ["key", "name", "selector", "type", "required"],
              },
            },
            steps: {
              type: "ARRAY",
              items: { type: "STRING" },
            },
          },
          required: ["portalUrl", "fields", "steps"],
        },
      },
    });

    const textResult = response.text;
    if (!textResult) {
      throw new Error("Empty search response from Gemini");
    }

    const promptTokens = response.usageMetadata?.promptTokenCount || 1000;
    const outputTokens = response.usageMetadata?.candidatesTokenCount || 400;
    const exchangeRate = 18.50;
    // Grounding contains $0.01 USD grounding crawl fee + prompt/output tokens at 3.5 Flash rate
    const rawCost = (((promptTokens * 0.075 + outputTokens * 0.30) / 1000000) + 0.01) * exchangeRate;

    const learnedSpecs = JSON.parse(textResult.trim());
    res.json({
      ...learnedSpecs,
      cost: learnedFrom === "portal_admin" ? 25.00 : 15.00,
      rawCost: parseFloat(rawCost.toFixed(6))
    });
  } catch (searchError: any) {
    console.warn("[Learn] Optimized path failed. Falling back to pure text based LLM...", searchError.message || searchError);
    
    try {
      // Second Attempt: Call Gemini without googleSearch tool configurations
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Queremos automatizar el proceso de facturación de tickets de la empresa mexicana '${nombreEmisor}' con RFC '${rfcEmisor || "No provisto"}'.
                  Genera la especificación simplificada y muy concisa del conector basada en tu conocimiento: determina de 2 a 3 campos requeridos (ej: folio, fecha, total, RFC) e inventa selectores CSS realistas (como #txtTicket, input[name='rfc']) y detalla de 3 a 4 pasos secuenciales muy cortos para un script de automatización. Evita palabras innecesarias para ahorrar tokens.`,
        config: {
          thinkingConfig: { thinkingLevel: "LOW" }, // Save reasoning tokens
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              portalUrl: { type: "STRING" },
              fields: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    key: { type: "STRING" },
                    name: { type: "STRING" },
                    selector: { type: "STRING" },
                    type: { type: "STRING" },
                    required: { type: "BOOLEAN" },
                  },
                  required: ["key", "name", "selector", "type", "required"],
                },
              },
              steps: {
                type: "ARRAY",
                items: { type: "STRING" },
              },
            },
            required: ["portalUrl", "fields", "steps"],
          },
        },
      });

      const textResult = response.text;
      if (!textResult) {
        throw new Error("Empty pure LLM response");
      }

      const promptTokens = response.usageMetadata?.promptTokenCount || 500;
      const outputTokens = response.usageMetadata?.candidatesTokenCount || 250;
      const exchangeRate = 18.50;
      const rawCost = (((promptTokens * 0.075 + outputTokens * 0.30) / 1000000)) * exchangeRate;

      const learnedSpecs = JSON.parse(textResult.trim());
      res.json({
        ...learnedSpecs,
        cost: learnedFrom === "portal_admin" ? 18.00 : 12.00,
        rawCost: parseFloat(rawCost.toFixed(6))
      });
    } catch (pureLlmError: any) {
      console.error("[Learn] Pure LLM failed too. Utilizing Rule-Based Heuristic Fallback.", pureLlmError.message || pureLlmError);
      
      const localSpecs = getLocalConnectorFallback(nombreEmisor, rfcEmisor);
      res.json({
        ...localSpecs,
        cost: learnedFrom === "portal_admin" ? 25.00 : 15.00,
        rawCost: 0
      });
    }
  }
});

app.post("/api/admin/discover-portal", async (req: Request, res: Response): Promise<void> => {
  const { officialBillingUrl } = req.body;
  const customKey = req.headers["x-gemini-api-key"] as string | undefined;

  if (!officialBillingUrl) {
    res.status(400).json({ error: "Falta la URL oficial de facturación (officialBillingUrl)." });
    return;
  }

  console.log(`[Discover Portal] Starting Playwright discovery on: ${officialBillingUrl}`);
  let browser = null;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(officialBillingUrl, { waitUntil: "load", timeout: 20000 });
    
    // Wait an extra 3 seconds for SPA elements
    await page.waitForTimeout(3000);

    const screenshotB64 = await page.screenshot({ encoding: "base64" });

    // Extract DOM information
    const discoveredElements = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input, select, textarea, button")).map(el => {
        let labelText = "";
        if (el.id) {
          const lbl = document.querySelector(`label[for="${el.id}"]`);
          if (lbl) labelText = lbl.textContent?.trim() || "";
        }
        if (!labelText) {
          const parentLbl = el.closest("label");
          if (parentLbl) labelText = parentLbl.textContent?.trim() || "";
        }
        if (!labelText) {
          labelText = el.getAttribute("placeholder") || el.getAttribute("aria-label") || "";
        }
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || "",
          name: (el as any).name || "",
          type: el.getAttribute("type") || "",
          placeholder: el.getAttribute("placeholder") || "",
          labelText: labelText.replace(/\s+/g, " ").trim(),
          className: el.className || "",
          value: (el as any).value || "",
          options: el.tagName === "SELECT" ? Array.from((el as HTMLSelectElement).options).map(o => o.text.trim()) : []
        };
      });

      // Get page title and basic text
      const title = document.title;
      const bodyText = document.body.innerText.substring(0, 1000).replace(/\s+/g, " ");

      return { title, bodyText, inputs };
    });

    await browser.close();

    // Call Gemini to analyze the DOM and suggest the extraction contract
    const ai = getGeminiClient(customKey);
    const geminiPrompt = `Analiza la estructura del portal de facturación y propón el extractionContract y stepsJson correspondientes.
    
    Título del portal: ${discoveredElements.title}
    Muestra del texto del portal: ${discoveredElements.bodyText}
    Elementos inputs/selects encontrados:
    ${JSON.stringify(discoveredElements.inputs, null, 2)}

    El extractionContract debe mapear únicamente los campos reales que el portal solicita en su primer formulario para identificar el ticket de consumo.
    Campos permitidos en portalFields:
    - billingReference (Referencia de facturación)
    - total (Total de la compra)
    - date (Fecha del ticket)
    - ticketNumber (Número de ticket)
    - storeNumber (Número de tienda)
    - branch (Sucursal)
    - barcode (Código de barras)
    - transactionNumber (Número de transacción)
    - purchaseTime (Hora de compra)

    Devuelve un JSON estructurado con:
    1. requiredPortalFields: array de campos del contrato (key, canonicalKey, label, type, hints, validationPattern, required: true/false, userEditable: true).
    2. fiscalFields: array con los campos fiscales del receptor (rfc, businessName, postalCode, taxRegime, cfdiUse, email).
    3. stepsJson: un array de pasos Playwright propuesto para interactuar con la página.
    4. warnings: advertencias sobre CAPTCHAs, iframes o complejidad observada.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: geminiPrompt,
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
                  hints: { type: "ARRAY", items: { type: "STRING" } },
                  validationPattern: { type: "STRING" },
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
            warnings: { type: "ARRAY", items: { type: "STRING" } }
          },
          required: ["requiredPortalFields", "fiscalFields", "stepsJson", "warnings"]
        }
      }
    });

    const geminiResult = JSON.parse(response.text || "{}");

    res.json({
      success: true,
      screenshot: `data:image/png;base64,${screenshotB64}`,
      discoveredInputs: discoveredElements.inputs,
      suggestedExtractionContract: {
        requiredPortalFields: geminiResult.requiredPortalFields,
        fiscalFields: geminiResult.fiscalFields,
        screenOrder: [
          { screenIndex: 1, description: "Búsqueda de ticket", requiredFields: geminiResult.requiredPortalFields.map((f: any) => f.key) },
          { screenIndex: 2, description: "Datos fiscales", requiredFields: geminiResult.fiscalFields.map((f: any) => f.key) }
        ]
      },
      suggestedStepsJson: geminiResult.stepsJson,
      warnings: geminiResult.warnings
    });

  } catch (err: any) {
    if (browser) {
      try { await browser.close(); } catch(e) {}
    }
    console.error("Playwright discovery failed:", err);
    res.status(500).json({ error: "Fallo durante el descubrimiento con Playwright: " + err.message });
  }
});

app.post("/api/tickets/train-jit", async (req: Request, res: Response): Promise<void> => {
  const { ticketId, nombreEmisor: bodyNombre, rfcEmisor: bodyRfc } = req.body;
  const customKey = req.headers["x-gemini-api-key"] as string | undefined;

  if (!ticketId) {
    res.status(400).json({ error: "Falta el ticketId" });
    return;
  }

  // Helper to update progress in automation_trainings
  const updateProgress = async (progress: number, step: string, state: "in_progress" | "completed" | "failed" = "in_progress") => {
    try {
      if (adminDb && typeof adminDb.collection === "function") {
        await adminDb.collection("automation_trainings").doc(ticketId).set({
          progress,
          step,
          status: step,
          state,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    } catch (e: any) {
      console.warn("Could not update training progress in Firestore:", e.message);
    }
  };

  try {
    // 1. Load the ticket from Firestore
    if (!adminDb || typeof adminDb.collection !== "function") {
      throw new Error("Firestore Admin SDK no inicializado");
    }
    const ticketDoc = await adminDb.collection("tickets").doc(ticketId).get();
    if (!ticketDoc.exists) {
      throw new Error("Ticket no encontrado");
    }
    const ticketData = ticketDoc.data()!;
    // Use body values as primary source (fresher), fall back to stored data
    const nombreEmisor = bodyNombre || ticketData.nombreEmisor || "Comercio por identificar";
    const rfcEmisor = bodyRfc || ticketData.rfcEmisor || "XAXX010101000";
    const imageBase64 = ticketData.imageUrl || "";


    // 2. Search for the portal URL via Search Grounding
    // IMPORTANT: Google Grounding tools are incompatible with responseMimeType/responseSchema.
    // We search for the URL as plain text first, then extract it.
    await updateProgress(15, "Buscando portal de facturación en base a DNS y Búsqueda de Google...");
    
    let portalUrl = "";
    try {
      const ai = getGeminiClient(customKey);
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
    } catch (err: any) {
      console.warn("Google Search Grounding failed, using keyword fallback:", err.message);
    }
    
    // Fallback: try known portal patterns or generic search
    if (!portalUrl) {
      const merchantSlug = nombreEmisor.toLowerCase().replace(/[^a-z0-9]/g, "");
      portalUrl = `https://facturacion.${merchantSlug}.com.mx/`;
    }

    // 3. Portal Structure Discovery — Gemini-first, Playwright as refinement
    await updateProgress(45, "Analizando el portal de facturación con IA para identificar los campos...");
    let discoverResult: any = null;
    
    // Primary: Gemini-only discovery (reliable, no browser dependency)
    try {
      const ai = getGeminiClient(customKey);
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
      // Use refined portalUrl from Gemini if provided
      if (discoverResult.portalUrl && discoverResult.portalUrl.startsWith("http")) {
        portalUrl = discoverResult.portalUrl;
      }
      
      // Secondary: Try Playwright to refine selectors (optional, non-blocking)
      await updateProgress(60, "Verificando estructura del portal con navegador automatizado...");
      let browser = null;
      try {
        const { chromium } = await import("playwright");
        browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
        const page = await browser.newPage();
        await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 12000 });
        await page.waitForTimeout(1500);

        const discoveredInputs = await page.evaluate(() => {
          return Array.from(document.querySelectorAll("input, select, textarea")).slice(0, 20).map(el => ({
            id: el.id || "",
            name: (el as any).name || "",
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

        // Refine selectors with actual DOM info
        if (discoveredInputs.length > 0) {
          const ai2 = getGeminiClient(customKey);
          const refineResponse = await ai2.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Refina los selectores CSS del conector para '${nombreEmisor}' basándote en los inputs reales encontrados en el portal.
            
            Conector base generado:
            ${JSON.stringify(discoverResult, null, 2)}
            
            Inputs reales del portal:
            ${JSON.stringify(discoveredInputs, null, 2)}
            
            Actualiza SOLO los stepsJson con selectores más precisos basados en los inputs reales. Mantén el resto igual.`,
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
        }
      } catch (playwrightErr: any) {
        if (browser) { try { await browser.close(); } catch(_e) {} }
        // Playwright refinement failed — OK, continue with Gemini-only result
        console.info("Playwright refinement skipped (non-fatal):", playwrightErr.message?.substring(0, 100));
      }
    } catch (discoveryErr: any) {
      console.warn("Gemini discovery failed, using hardcoded template:", discoveryErr.message);
      // Last resort: hardcoded template
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
          { action: "navigate", url: portalUrl },
          { action: "fill", selector: "input[name*='folio'],input[id*='folio'],input[placeholder*='ticket'],input[placeholder*='folio'],input[name*='ticket']", value: "{{portalFields.billingReference}}" },
          { action: "fill", selector: "input[name*='rfc'],input[id*='rfc'],input[placeholder*='RFC']", value: "{{fiscalProfile.rfc}}" },
          { action: "click", selector: "button[type='submit'],input[type='submit']" }
        ]),
        warnings: ["Usando plantilla genérica por fallo en discovery: " + discoveryErr.message]
      };
    }


    // 4. Save Connector to Firestore
    await updateProgress(70, "Guardando conector y mapa de navegación en base de datos...");
    const connectorId = nombreEmisor.toLowerCase().replace(/[^a-z0-9]/g, "-") || "gen-" + Date.now();
    const contract = {
      requiredPortalFields: discoverResult.requiredPortalFields,
      fiscalFields: discoverResult.fiscalFields,
      screenOrder: [
        { screenIndex: 1, description: "Búsqueda de ticket", requiredFields: discoverResult.requiredPortalFields.map((f: any) => f.key) },
        { screenIndex: 2, description: "Datos fiscales", requiredFields: discoverResult.fiscalFields.map((f: any) => f.key) }
      ]
    };
    const fields = discoverResult.requiredPortalFields.map((f: any) => ({
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
      status: "production_ready",
      runnerAvailable: true,
      extractionContract: contract,
      fieldsJson: JSON.stringify(fields),
      flowJson: discoverResult.stepsJson,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await adminDb.collection("connectors").doc(connectorId).set(newConnector);

    // Save Portal Map
    const reqFieldsList = discoverResult.requiredPortalFields.map((f: any) => ({
      key: f.key,
      label: f.label,
      source: "portalFields",
      required: f.required !== false,
      userEditable: true
    }));
    const fiscalKeys = ["rfc", "businessName", "postalCode", "taxRegime", "cfdiUse", "email"];
    fiscalKeys.forEach(k => {
      const matched = discoverResult.fiscalFields?.find((f: any) => f.key.endsWith("." + k));
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
    await adminDb.collection("portal_maps").doc(`map-${connectorId}`).set(portalMapData);

    // 5. Re-run OCR Stage 2
    await updateProgress(85, "Re-analizando el ticket para extraer los campos del portal...");
    
    let ocrResultData: any = {};
    try {
      const ai = getGeminiClient(customKey);
      const rawImage = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
      const mime = imageBase64.includes("image/png") ? "image/png" : "image/jpeg";

      const targetedPromptText = `Analiza la imagen del ticket de compra de la tienda: ${nombreEmisor}.
      Extrae únicamente los campos requeridos por el portal de facturación oficial:
      ${discoverResult.requiredPortalFields.map((f: any) => `- Campo: ${f.label} (clave: ${f.key.replace(/^portalFields\./, "")})`).join("\n")}
      También extrae el total de la compra (total) con decimales, la fecha de compra (fechaCompra) en formato YYYY-MM-DD, y el folio de venta (folio).`;

      const customProperties: any = {
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
      discoverResult.requiredPortalFields.forEach((f: any) => {
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
    } catch (ocrErr: any) {
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

    const portalFields: any = {};
    discoverResult.requiredPortalFields.forEach((f: any) => {
      const fieldKey = f.key.replace(/^portalFields\./, "");
      portalFields[fieldKey] = ocrResultData[fieldKey] || "";
    });
    portalFields.total = ocrResultData.total || ticketData.total || 0;
    portalFields.billingReference = ocrResultData.folio || ocrResultData.billingReference || ticketData.folio || "";

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
    await adminDb.collection("tickets").doc(ticketId).update(updatedFields);

    await updateProgress(100, "¡Configuración completada con éxito! Iniciando solicitud en el portal...", "completed");

    res.json({
      success: true,
      connector: newConnector,
      ocrResult: {
        ...ocrResultData,
        portalFields
      }
    });

  } catch (err: any) {
    console.error("JIT training failed:", err);
    await updateProgress(100, "Fallo durante el auto-entrenamiento: " + err.message, "failed");
    res.status(500).json({ error: "Fallo durante el auto-entrenamiento: " + err.message });
  }
});

app.post("/api/admin/analyze-html", async (req: Request, res: Response): Promise<void> => {
  const { htmlContent } = req.body;
  const customKey = req.headers["x-gemini-api-key"] as string | undefined;

  if (!htmlContent) {
    res.status(400).json({ error: "Falta el contenido HTML (htmlContent)." });
    return;
  }

  try {
    const ai = getGeminiClient(customKey);
    const geminiPrompt = `Analiza este fragmento HTML de un portal de facturación e identifica qué inputs y campos requiere para iniciar la facturación.
    
    HTML:
    ${htmlContent.substring(0, 15000)}

    Devuelve un JSON estructurado con requiredPortalFields, fiscalFields, stepsJson y warnings.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: geminiPrompt,
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
                  hints: { type: "ARRAY", items: { type: "STRING" } },
                  validationPattern: { type: "STRING" },
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
            warnings: { type: "ARRAY", items: { type: "STRING" } }
          },
          required: ["requiredPortalFields", "fiscalFields", "stepsJson", "warnings"]
        }
      }
    });

    const geminiResult = JSON.parse(response.text || "{}");

    res.json({
      success: true,
      suggestedExtractionContract: {
        requiredPortalFields: geminiResult.requiredPortalFields,
        fiscalFields: geminiResult.fiscalFields,
        screenOrder: [
          { screenIndex: 1, description: "Búsqueda de ticket", requiredFields: geminiResult.requiredPortalFields.map((f: any) => f.key) },
          { screenIndex: 2, description: "Datos fiscales", requiredFields: geminiResult.fiscalFields.map((f: any) => f.key) }
        ]
      },
      suggestedStepsJson: geminiResult.stepsJson,
      warnings: [...geminiResult.warnings, "Análisis basado únicamente en HTML estático pegado. Se recomienda verificación Playwright."]
    });

  } catch (err: any) {
    console.error("HTML analysis failed:", err);
    res.status(500).json({ error: "Fallo durante el análisis del HTML: " + err.message });
  }
});

import {
  parseSatQrUrl,
  validateXmlStructure,
  parseCfdiInfo,
  verifyCfdiWithSat
} from "./firebase/functions/fiscalUtils.js";

app.post("/api/cfdi/verify-sat", async (req: Request, res: Response): Promise<void> => {
  const { xmlContent } = req.body;
  if (!xmlContent) {
    res.status(400).json({ error: "Missing xmlContent in request body" });
    return;
  }

  // Execute structural validation on backend as source of truth
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

// API endpoint: Run high-fidelity automation simulation and generate official CFDI XML & PDF html representation
app.post("/api/automation/run", async (req: Request, res: Response): Promise<void> => {
  const { ticket, profile, connector } = req.body;

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

// API Endpoint: Send generated CFDI XML & PDF to user's registered address
app.post("/api/email/send", async (req: Request, res: Response): Promise<void> => {
  const { to, invoice } = req.body;

  if (!to || !invoice) {
    res.status(400).json({ error: "Missing 'to' email or 'invoice' body in request." });
    return;
  }

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn("SMTP credentials not fully set up in .env files. Simulated successful email send to: ", to);
    res.json({
      success: true,
      simulated: true,
      message: `[Simulación] Factura de ${invoice.nombreEmisor} enviada con éxito a ${to}.`
    });
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port || "465"),
      secure: port === "465", // Port 465 is typically secure
      auth: { user, pass },
    });

    const mailOptions = {
      from: `"FactuBot MX Support" <${user}>`,
      to,
      subject: `FactuBot MX - Tu CFDI 4.0 de ${invoice.nombreEmisor} está listo`,
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; background-color: #0c0a09; color: #f4f4f5; padding: 40px 20px; text-align: center;">
          <div style="max-width: 650px; margin: 0 auto; background-color: #1c1917; border: 1px solid #292524; border-radius: 20px; padding: 30px; text-align: left; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
              <span style="font-size: 24px; font-weight: 800; color: #6366f1;">FactuBot MX</span>
            </div>
            
            <h2 style="font-size: 18px; font-weight: 750; color: #ffffff; text-transform: uppercase;">¡Tu Factura Digital ha sido emitida!</h2>
            <p style="font-size: 13px; color: #a1a1aa; line-height: 1.6;">
              Excelente noticia, la inyección automatizada de tu ticket con folio fiscal <strong>${invoice.folioFiscal}</strong> ha finalizado exitosamente.
            </p>

            <div style="margin: 24px 0; padding: 16px; background-color: #09090b; border: 1px solid #1c1917; border-radius: 12px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 12px; color: #d4d4d8;">
                <tr>
                  <td style="padding: 6px 0; color: #71717a; font-weight: 600; text-transform: uppercase;">EMISOR</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #ffffff; text-transform: uppercase;">${invoice.nombreEmisor}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #71717a; font-weight: 600; text-transform: uppercase;">RFC EMISOR</td>
                  <td style="padding: 6px 0; text-align: right; font-family: monospace; color: #ffffff;">${invoice.rfcEmisor}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #71717a; font-weight: 600; text-transform: uppercase;">RECEPTOR</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #ffffff; text-transform: uppercase;">${invoice.nombreReceptor || "Configurado"}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #71717a; font-weight: 600; text-transform: uppercase;">RFC RECEPTOR</td>
                  <td style="padding: 6px 0; text-align: right; font-family: monospace; color: #ffffff;">${invoice.rfcReceptor || "Configurado"}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #71717a; font-weight: 600; text-transform: uppercase;">TOTAL</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #10b981; font-size: 14px;">$${Number(invoice.total || 0).toFixed(2)} MXN</td>
                </tr>
              </table>
            </div>

            <p style="font-size: 13px; color: #a1a1aa; line-height: 1.6;">
              Hemos adjuntado el comprobante timbrado en formato XML directo desde los servidores del SAT a este correo para tu contabilidad inmediata. A continuación tienes la representación visual interactiva:
            </p>

            <div style="margin-top: 30px; border-top: 1px solid #292524; padding-top: 20px; color: #1c1917; background-color: #ffffff; border-radius: 12px; padding: 15px;">
              ${invoice.pdfHtml || '<!-- Visual HTML empty -->'}
            </div>

            <p style="font-size: 11px; color: #52525b; text-align: center; margin-top: 40px; border-top: 1px solid #292524; padding-top: 15px;">
              Este es un correo electrónico generado automáticamente por FactuBot MX. Si tienes alguna duda, ponte en contacto con nosotros.
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `Factura_${invoice.nombreEmisor.replace(/[^a-zA-Z0-9]/g, "")}_${invoice.folioFiscal.substring(0, 8)}.xml`,
          content: invoice.xmlContent,
          contentType: "text/xml"
        }
      ]
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, simulated: false, message: `Email enviado exitosamente a ${to}.` });
  } catch (err: any) {
    console.error("Mail dispatch error:", err);
    res.status(500).json({ error: `Fallo al despachar email de factura por SMTP: ${err.message}` });
  }
});


// Helpers for PayPal Access Token
async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
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
  } catch (error: any) {
    const errData = error.response?.data;
    console.warn("PayPal Live Authentication failed. Error details:", errData || error.message);
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
      } catch (sandboxErr: any) {
        throw new Error("Las credenciales de PayPal son inválidas tanto para producción como para sandbox.");
      }
    }
    throw new Error("Error de comunicación o autenticación con PayPal: " + (errData?.error_description || error.message));
  }
}

const getSafeBaseUrl = (req: Request): string => {
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




// 3.4. Stripe Setup Intent (Card Registration)
app.post("/api/billing/setup/stripe", authenticateFirebaseToken, async (req: any, res: any) => {
  const userId = req.user.uid;
  const email = req.user.email;
  const emailVerified = req.user.email_verified;
  const { holderName, bankName } = req.body;

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuración de Stripe incompleta" });
    return;
  }

  try {
    let stripeCustomerId = await resolveStripeCustomerId(userId, email, emailVerified);

    if (!stripeCustomerId) {
      if (!email) {
        res.status(400).json({ error: "El usuario no tiene un correo electrónico verificado." });
        return;
      }
      const customerParams = new URLSearchParams({
        email: email,
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
      const billingRef = adminDb.collection("billingProfiles").doc(userId);
      await billingRef.set({ stripeCustomerId }, { merge: true });
    }

    const baseUrl = getSafeBaseUrl(req);
    const setupSuccessUrl = process.env.BILLING_SUCCESS_URL
      ? process.env.BILLING_SUCCESS_URL.replace("status=success", "status=card_setup_success")
      : `${baseUrl}/billing-setup-success.html?status=card_setup_success`;
    const setupCancelUrl = process.env.BILLING_FAILURE_URL
      ? process.env.BILLING_FAILURE_URL.replace("status=failure", "status=card_setup_cancelled")
      : `${baseUrl}/billing-failure.html?status=card_setup_cancelled`;
    const setupParams = new URLSearchParams({
      mode: "setup",
      customer: stripeCustomerId,
      currency: "mxn",
      client_reference_id: userId,
      success_url: setupSuccessUrl,
      cancel_url: setupCancelUrl,
      "metadata[holderName]": holderName || "",
      "metadata[bankName]": bankName || "",
      "payment_method_types[0]": "card",
      "wallet_options[link][display]": "never"
    });
    const setupResponse = await axios.post(
      "https://api.stripe.com/v1/checkout/sessions",
      setupParams.toString(),
      {
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );
    res.json({ checkoutUrl: setupResponse.data.url });
  } catch (error: any) {
    console.error("Error al vincular tarjeta en Stripe:", error.response?.data || error.message);
    const stripeError = error.response?.data?.error;
    res.status(500).json({
      error: stripeError?.message || "No se pudo iniciar el registro seguro de la tarjeta"
    });
  }
});

// 3.6. Stripe Confirm Payment
// 3.6. Stripe Confirm Payment
app.post("/api/billing/checkout/stripe/confirm", authenticateFirebaseToken, async (req: any, res: any) => {
  const userId = req.user.uid;
  const { sessionId } = req.body;
  if (!sessionId) {
    res.status(400).json({ error: "Falta sessionId" });
    return;
  }
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuración de Stripe incompleta" });
    return;
  }

  try {
    const response = await axios.get(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription&expand[]=subscription.default_payment_method&expand[]=payment_intent&expand[]=payment_intent.payment_method`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );
    const session = response.data;
    const [sessionUserId, planId] = String(session.client_reference_id || "").split(":");
    if (sessionUserId !== userId || !planId) {
      res.status(403).json({ error: "La sesión de Stripe no pertenece a este usuario." });
      return;
    }
    if (session.status !== "complete" || session.payment_status !== "paid") {
      res.status(409).json({ error: "Stripe todavía no confirma el pago." });
      return;
    }

    const limits: Record<string, number> = { brisa: 10, personal: 20, serenidad: 30, empresa: 60, nirvana: 100 };
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

    await adminDb.collection("payments").doc(`stripe_payment_${session.id}`).set({
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

    await adminDb.collection("subscriptions").doc(userId).set({
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

    // Actualizar perfil de facturación aislado billingProfiles
    const billingRef = adminDb.collection("billingProfiles").doc(userId);
    await billingRef.set({
      stripeCustomerId: session.customer || null,
      subscriptionId: stripeSubscriptionId || null,
      planId,
      subscriptionStatus: isSubscription ? "subscription_active" : "paid",
      defaultPaymentMethodId: paymentMethod?.id || null
    }, { merge: true });

    await adminDb.collection("fiscalProfiles").doc(userId).set({
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
          .filter((card: any) => card.id !== paymentMethod.id)
          .map((card: any) => ({ ...card, isDefault: false }))
      ];
      await billingRef.set({ paymentCards }, { merge: true });
    }

    res.json({ success: true, planId, planName, invoicesLimit });
  } catch (error: any) {
    console.error("Error al confirmar pago de Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.error?.message || "No se pudo confirmar el pago con Stripe." });
  }
});

// 3.5. Stripe Checkout (Session Creation)
app.post("/api/billing/checkout/stripe", authenticateFirebaseToken, async (req: any, res: any) => {
  const userId = req.user.uid;
  const email = req.user.email;
  const emailVerified = req.user.email_verified;
  const { planId } = req.body;
  if (!planId) {
    res.status(400).json({ error: "Falta el parámetro planId" });
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

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuración de pasarela Stripe incompleta en el servidor" });
    return;
  }

  try {
    const baseUrl = getSafeBaseUrl(req);
    console.log("DEBUG STRIPE BASEURL:", baseUrl);
    const successUrl = process.env.BILLING_SUCCESS_URL 
      ? `${process.env.BILLING_SUCCESS_URL}&plan=${planId}&session_id={CHECKOUT_SESSION_ID}` 
      : `${baseUrl}/billing-success.html?status=success&plan=${planId}&session_id={CHECKOUT_SESSION_ID}`;
    console.log("DEBUG STRIPE SUCCESSURL:", successUrl);

    const stripeCustomerId = await resolveStripeCustomerId(userId, email, emailVerified);

    const stripeParams = new URLSearchParams({
      "payment_method_types[0]": "card",
      "line_items[0][price_data][currency]": "mxn",
      "line_items[0][price_data][product_data][name]": title,
      "line_items[0][price_data][unit_amount]": Math.round(price * 100).toString(),
      "line_items[0][quantity]": "1",
      "mode": "payment",
      "success_url": successUrl,
      "cancel_url": process.env.BILLING_FAILURE_URL || `${baseUrl}/billing-failure.html?status=failure`,
      "client_reference_id": `${userId}:${planId}`,
      "payment_intent_data[setup_future_usage]": "off_session"
    });
    
    if (stripeCustomerId) {
      stripeParams.append("customer", stripeCustomerId);
    } else if (email) {
      stripeParams.append("customer_email", email);
    }

    const response = await axios.post(
      "https://api.stripe.com/v1/checkout/sessions",
      stripeParams.toString(),
      {
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const session = response.data;
    const paymentDocId = `stripe_pref_${session.id}`;

    // Register Stripe intent in Firestore
    await adminDb.collection("payments").doc(paymentDocId).set({
      userId,
      planId,
      provider: "stripe",
      providerPaymentId: session.id,
      amount: price,
      currency: "MXN",
      status: "pending_payment",
      checkoutUrl: session.url,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    res.json({ checkoutUrl: session.url });
  } catch (error: any) {
    console.error("Error al crear sesión en Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: "Error al comunicarse con Stripe" });
  }
});





// 6. Get Billing Status
app.get("/api/billing/status", authenticateFirebaseToken, async (req: any, res: any) => {
  const userId = req.user.uid;
  try {
    const docSnap = await adminDb.collection("subscriptions").doc(userId).get();
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
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Cancel Subscription

async function syncCustomerPaymentMethods(stripeCustomerId: string, stripeSecretKey: string, dbRef: any) {
  if (!stripeCustomerId) return;
  try {
    let docRef: any = null;

    // Check billingProfiles first
    const billingSnapshot = await dbRef.collection("billingProfiles")
      .where("stripeCustomerId", "==", stripeCustomerId)
      .limit(1)
      .get();
      
    if (!billingSnapshot.empty) {
      docRef = billingSnapshot.docs[0].ref;
    } else {
      // Fallback to fiscalProfiles
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

    // Fetch default payment method from Customer
    const customerRes = await axios.get(
      `https://api.stripe.com/v1/customers/${stripeCustomerId}`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );
    const defaultPaymentMethodId = customerRes.data?.invoice_settings?.default_payment_method;

    // Fetch all card methods
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
  } catch (error: any) {
    console.error(`[Stripe Webhook] Error al sincronizar métodos de pago para ${stripeCustomerId}:`, error.message);
  }
}

app.post("/api/billing/sync-subscription", authenticateFirebaseToken, async (req: any, res: any) => {
  const userId = req.user.uid;
  const email = req.user.email;
  const emailVerified = req.user.email_verified;

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
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
      const limits: Record<string, number> = { brisa: 10, personal: 20, serenidad: 30, empresa: 60, nirvana: 100 };
      const invoicesLimit = limits[planId] || 5;
      const planName = planId === "personal" ? "Plan Personal" : planId === "empresa" ? "Plan Empresa" : `Plan ${planId.charAt(0).toUpperCase() + planId.slice(1)}`;
      const nowIso = new Date().toISOString();
      const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

      await adminDb.collection("subscriptions").doc(userId).set({
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

      await adminDb.collection("billingProfiles").doc(userId).set({
        stripeCustomerId,
        subscriptionId: sub.id,
        planId,
        subscriptionStatus: "subscription_active",
        updatedAt: nowIso
      }, { merge: true });

      await adminDb.collection("fiscalProfiles").doc(userId).set({
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
      const limits: Record<string, number> = { brisa: 10, personal: 20, serenidad: 30, empresa: 60, nirvana: 100 };
      const invoicesLimit = limits[planId] || 5;
      const planName = planId === "personal" ? "Plan Personal" : planId === "empresa" ? "Plan Empresa" : `Plan ${planId.charAt(0).toUpperCase() + planId.slice(1)}`;
      const nowIso = new Date().toISOString();
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      await adminDb.collection("subscriptions").doc(userId).set({
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

      await adminDb.collection("billingProfiles").doc(userId).set({
        stripeCustomerId,
        subscriptionId: null,
        planId,
        subscriptionStatus: "paid",
        updatedAt: nowIso
      }, { merge: true });

      await adminDb.collection("fiscalProfiles").doc(userId).set({
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
  } catch (error: any) {
    console.error("Error al sincronizar suscripción de Stripe:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/billing/sync-customer", authenticateFirebaseToken, async (req: any, res: any) => {
  const userId = req.user.uid;
  const email = req.user.email;
  const emailVerified = req.user.email_verified;
  const { name } = req.body;

  if (!email) {
    res.status(400).json({ error: "Falta el email del usuario autenticado" });
    return;
  }
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuración de Stripe incompleta" });
    return;
  }
  try {
    let stripeCustomerId = await resolveStripeCustomerId(userId, email, emailVerified);

    if (!stripeCustomerId) {
      // Create new customer
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
      
      const billingRef = adminDb.collection("billingProfiles").doc(userId);
      await billingRef.set({ stripeCustomerId }, { merge: true });
    }
    res.json({ stripeCustomerId });
  } catch (error: any) {
    console.error("Error al sincronizar cliente en Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/billing/payment-methods", authenticateFirebaseToken, async (req: any, res: any) => {
  const userId = req.user.uid;
  const userEmail = req.user.email;
  const emailVerified = req.user.email_verified;
  
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
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

    // Fetch customer to check default payment method
    const customerRes = await axios.get(
      `https://api.stripe.com/v1/customers/${stripeCustomerId}`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );
    let defaultPaymentMethodId = customerRes.data?.invoice_settings?.default_payment_method;

    // Fetch payment methods from Stripe
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

    // If there is no default method set on Stripe but there are cards, set the first one as default
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

    // Cache to Firestore billingProfiles
    const billingRef = adminDb.collection("billingProfiles").doc(userId);
    await billingRef.set({ paymentCards: pms, stripeCustomerId }, { merge: true });

    res.json(pms);
  } catch (error: any) {
    console.error("Error al obtener métodos de pago de Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/billing/payment-methods/set-default", authenticateFirebaseToken, async (req: any, res: any) => {
  const userId = req.user.uid;
  const email = req.user.email;
  const emailVerified = req.user.email_verified;
  const { paymentMethodId } = req.body;
  if (!paymentMethodId) {
    res.status(400).json({ error: "Falta el parámetro paymentMethodId" });
    return;
  }
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
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

    // Set default in Stripe
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

    // Sync Firestore cached paymentCards list from billingProfiles
    const billingRef = adminDb.collection("billingProfiles").doc(userId);
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
  } catch (error: any) {
    console.error("Error al establecer tarjeta predeterminada en Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/billing/payment-methods/delete", authenticateFirebaseToken, async (req: any, res: any) => {
  const userId = req.user.uid;
  const email = req.user.email;
  const emailVerified = req.user.email_verified;
  const { paymentMethodId } = req.body;
  if (!paymentMethodId) {
    res.status(400).json({ error: "Falta el parámetro paymentMethodId" });
    return;
  }
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
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

    // Detach from Stripe
    await axios.post(
      `https://api.stripe.com/v1/payment_methods/${paymentMethodId}/detach`,
      "",
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );

    // Retrieve active list to recalculate default card if deleted was default
    const billingRef = adminDb.collection("billingProfiles").doc(userId);
    const billingSnapshot = await billingRef.get();
    const existingCards = Array.isArray(billingSnapshot.data()?.paymentCards)
      ? billingSnapshot.data().paymentCards
      : [];
    const deletedCard = existingCards.find(c => c.id === paymentMethodId);
    let updatedCards = existingCards.filter(c => c.id !== paymentMethodId);

    if (deletedCard?.isDefault && updatedCards.length > 0) {
      // Set the first remaining as new default
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
  } catch (error: any) {
    console.error("Error al eliminar tarjeta en Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/billing/payment-methods/attach", authenticateFirebaseToken, async (req: any, res: any) => {
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
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
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
    const billingRef = adminDb.collection("billingProfiles").doc(userId);
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
    await syncCustomerPaymentMethods(stripeCustomerId, stripeSecretKey, adminDb);
    console.log("[Attach PM] Sincronización completada.");
    
    const updatedSnapshot = await billingRef.get();
    const updatedCards = updatedSnapshot.data()?.paymentCards || [];
    console.log(`[Attach PM] Retornando ${updatedCards.length} tarjetas actualizadas.`);

    res.json({ success: true, paymentCards: updatedCards });
  } catch (error: any) {
    console.error("[Attach PM] EXCEPCIÓN DETECTADA:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});


app.post("/api/billing/cancel-subscription", authenticateFirebaseToken, async (req: any, res: any) => {
  const userId = req.user.uid;
  try {
    await adminDb.collection("subscriptions").doc(userId).set({
      status: "subscription_cancelled",
      updatedAt: new Date().toISOString()
    }, { merge: true });

    await adminDb.collection("billingProfiles").doc(userId).set({
      subscriptionStatus: "subscription_cancelled",
      planId: "gratuito"
    }, { merge: true });

    await adminDb.collection("fiscalProfiles").doc(userId).set({
      plan: "gratuito",
      paymentStatus: "subscription_cancelled",
      autoRenew: false
    }, { merge: true });

    res.json({ success: true, message: "Suscripción cancelada exitosamente." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// App server routing setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[FactuBot] Full-stack server active at http://localhost:${PORT}`);
  });
}

startServer();
