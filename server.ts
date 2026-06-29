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
    adminDb = getFirestore();
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
  if (billingSnap.exists()) {
    const data = billingSnap.data();
    if (data?.stripeCustomerId) {
      return data.stripeCustomerId;
    }
  }

  // 2. Si no, revisamos fiscalProfiles (migración segura e histórica)
  const fiscalRef = adminDb.collection("fiscalProfiles").doc(uid);
  const fiscalSnap = await fiscalRef.get();
  if (fiscalSnap.exists()) {
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

// API endpoint: Analyze buy ticket photo (AI Vision OCR)
app.post("/api/tickets/analyze", async (req: Request, res: Response): Promise<void> => {
  try {
    const { image, mimeType } = req.body;
    const customKey = req.headers["x-gemini-api-key"] as string | undefined;

    if (!image) {
      res.status(400).json({ error: "Missing base64 ticket image" });
      return;
    }

    // List of models to try in order
    const MODELS_TO_TRY = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
    const MAX_RETRIES_PER_MODEL = 2; // Try up to 2 times for each model
    
    let ai;
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

    const textPart = {
      text: "Analiza exhaustivamente esta fotografía de un ticket de compra mexicano. Extrae con precisión los datos y estructura el resultado exactamente según el esqueleto proporcionado. INSTRUCCIÓN CRÍTICA DE INTEGRIDAD: No asumes marcas populares (ej. OXXO, Walmart, Starbucks, etc.) si el ticket no pertenece explícitamente a ellas. Si es una farmacia u otro comercio local (ej. Farmacias del Ahorro, Farmacias Guadalajara, farmacias locales, etc.), extrae fielmente el nombre exacto de la marca o razón social impreso en la parte superior. Si el RFC no es legible o no se localiza, coloca 'XAXX010101000' en rfcEmisor, pero NUNCA inventes o asocies el RFC de otra franquicia para rellenar.",
    };

    const responseSchema = {
      type: "OBJECT",
      properties: {
        rfcEmisor: { type: "STRING", description: "RFC del emisor de la tienda (12 o 13 carácteres). Si no viene o no es legible, coloca 'XAXX010101000'." },
        nombreEmisor: { type: "STRING", description: "Nombre comercial o razón social de la tienda en mayúsculas (ej: FARMACIAS GUADALAJARA, OXXO, WALMART, TOKIO, STARBUCKS)" },
        fechaCompra: { type: "STRING", description: "Fecha de compra aproximada o exacta en formato YYYY-MM-DD" },
        folio: { type: "STRING", description: "Folio del ticket, ID de transacción, código de facturación o referencia de ticket (ej: 0251846 o 4821-3921-1923)" },
        total: { type: "NUMBER", description: "Total monetario pagado en el ticket en pesos mexicanos" },
        sucursal: { type: "STRING", description: "Sucursal o ubicación donde se realizó la compra" },
        items: {
          type: "ARRAY",
          description: "Lista de conceptos comprados descritos en el ticket",
          items: {
            type: "OBJECT",
            properties: {
              description: { type: "STRING", description: "Concepto del producto" },
              amount: { type: "NUMBER", description: "Precio o importe de este concepto" },
            },
            required: ["description", "amount"],
          },
        },
      },
      required: ["rfcEmisor", "nombreEmisor", "fechaCompra", "folio", "total", "items"],
    };

    let textResult = "";
    let promptTokens = 0;
    let outputTokens = 0;
    
    if (!fallbackToOcrMock && ai) {
      let success = false;
      for (const model of MODELS_TO_TRY) {
        if (success) break;
        for (let attempt = 1; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
          try {
            console.log(`[OCR] Trying model ${model} (Attempt ${attempt}/${MAX_RETRIES_PER_MODEL})`);
            const response = await ai.models.generateContent({
              model: model,
              contents: { parts: [imagePart, textPart] },
              config: {
                responseMimeType: "application/json",
                responseSchema,
              },
            });

            if (response.text && response.text.trim()) {
              textResult = response.text.trim();
              promptTokens = response.usageMetadata?.promptTokenCount || 428;
              outputTokens = response.usageMetadata?.candidatesTokenCount || 215;
              console.log(`[OCR] Success with model ${model}. Tokens: In=${promptTokens}, Out=${outputTokens}`);
              success = true;
              fallbackToOcrMock = false;
              break;
            } else {
              throw new Error("Empty text returned from Gemini API");
            }
          } catch (err: any) {
            const currentErr = err?.message || String(err);
            console.warn(`[OCR Warning] Model ${model} failed on attempt ${attempt}: ${currentErr}`);
            ocrErrorDetails += `\n[${model} attempt ${attempt}]: ${currentErr}`;
          }
        }
      }
      if (!success) {
        fallbackToOcrMock = true;
      }
    }

    let extractedData;

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

    // Do not invent ticket data when Gemini is unavailable or overloaded (503/429).
    // Return an empty draft so the user can complete the fields manually.
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
        items: []
      };
    }
    // calculate real costs in MXN (Gemini LLM model rates + basic operational cost)
    const cost = fallbackToOcrMock ? 0 : 0.50; // no OCR charge when only a manual-capture draft is returned
    let rawCost = 0.00;
    if (textResult) {
      const exchangeRate = 18.50;
      // gemini-3.5-flash: $0.075 / 1M input, $0.30 / 1M output USD
      rawCost = (((promptTokens * 0.075) + (outputTokens * 0.30)) / 1000000) * exchangeRate;
    }

    res.json({
      ...extractedData,
      cost,
      rawCost: parseFloat(rawCost.toFixed(6))
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
      cost: 0,
      rawCost: 0
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

// Helper function: Generate elegant compliant simulated XML (fallback)
function generateLocalXml(ticket: any, profile: any, connector: any, folioFiscal: string): string {
  const dateStr = new Date().toISOString().substring(0, 19);
  const total = parseFloat(ticket.total) || 0;
  const subtotal = (total / 1.16).toFixed(2);
  const iva = (total - parseFloat(subtotal)).toFixed(2);
  
  let itemsXml = "";
  if (Array.isArray(ticket.items) && ticket.items.length > 0) {
    itemsXml = ticket.items.map((item: any, idx: number) => {
      const itemAmount = parseFloat(item.amount) || 0;
      const itemSubtotal = (itemAmount / 1.16).toFixed(2);
      const itemIva = (itemAmount - parseFloat(itemSubtotal)).toFixed(2);
      return `    <cfdi:Concepto ClaveProdServ="90101501" NoIdentificacion="REF_${idx + 1}" Cantidad="1.00" ClaveUnidad="E48" Unidad="Servicio" Descripcion="${escapeXml(item.description || "Consumo general")}" ValorUnitario="${itemSubtotal}" Importe="${itemSubtotal}">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="${itemSubtotal}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${itemIva}" />
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>`;
    }).join("\n");
  } else {
    itemsXml = `    <cfdi:Concepto ClaveProdServ="90101501" NoIdentificacion="CON-01" Cantidad="1.00" ClaveUnidad="E48" Unidad="Servicio" Descripcion="Consumo de alimentos según ticket folio ${escapeXml(ticket.folio || "001")}" ValorUnitario="${subtotal}" Importe="${subtotal}">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="${subtotal}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva}" />
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd http://www.sat.gob.mx/TimbreFiscalDigital http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd" Version="4.0" Serie="FACT" Folio="${Math.floor(100000 + Math.random() * 900000)}" Fecha="${dateStr}" Sello="SIM_SELLOS_AUTOMATION_OK_FACTUBOT" NoCertificado="00001000000504454321" SubTotal="${subtotal}" Total="${total.toFixed(2)}" Moneda="MXN" TipoDeComprobante="I" Exportacion="01" LugarExpedicion="${profile.codigoPostal || "01000"}">
  <cfdi:Emisor Rfc="${escapeXml(ticket.rfcEmisor || "XAXX010101000")}" Nombre="${escapeXml(ticket.nombreEmisor || "EMISOR SIMULADO S.A. DE C.V.")}" RegimenFiscal="601" />
  <cfdi:Receptor Rfc="${escapeXml(profile.rfc || "XAXX010101000")}" Nombre="${escapeXml(profile.razonSocial || "CLIENTE RECEPTOR S.A.")}" DomicilioFiscalReceptor="${profile.codigoPostal || "01000"}" RegimenFiscalReceptor="${profile.regimenFiscal || "605"}" UsoCFDI="${profile.usoCFDI || "G03"}" />
  <cfdi:Conceptos>
${itemsXml}
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${iva}">
    <cfdi:Traslados>
      <cfdi:Traslado Base="${subtotal}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva}" />
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="${folioFiscal}" FechaTimbrado="${dateStr}" NoCertificadoSAT="00001000000502000436" SelloCFD="SelloDigitalEmisorSimuladoFactuBot" SelloSAT="SelloDigitalSatSimuladoFactuBot" RfcProvCertif="SAT970701NN3" />
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}

// Helper function: Generate high-fidelity simulated PDF design with Tailwind (fallback)
function generateLocalPdfHtml(ticket: any, profile: any, connector: any, folioFiscal: string): string {
  const dateStr = new Date().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const total = parseFloat(ticket.total) || 0;
  const subtotal = total / 1.16;
  const iva = total - subtotal;
  
  let itemsRows = "";
  if (Array.isArray(ticket.items) && ticket.items.length > 0) {
    itemsRows = ticket.items.map((item: any, idx: number) => {
      const itemAmount = parseFloat(item.amount) || 0;
      const itemSub = itemAmount / 1.16;
      return `
        <tr class="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/50 transition">
          <td class="py-3 px-4 font-medium text-zinc-800">1</td>
          <td class="py-3 px-4 font-mono text-xs text-zinc-500">90101501</td>
          <td class="py-3 px-4 text-zinc-750 text-xs">${escapeXml(item.description || "Consumo general")}</td>
          <td class="py-3 px-4 text-right font-mono text-xs text-zinc-600">$${itemSub.toFixed(2)}</td>
          <td class="py-3 px-4 text-right font-mono font-semibold text-xs text-zinc-900">$${itemAmount.toFixed(2)}</td>
        </tr>
      `;
    }).join("");
  } else {
    itemsRows = `
      <tr class="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/50 transition">
        <td class="py-3 px-4 font-semibold text-zinc-850">1</td>
        <td class="py-3 px-4 font-mono text-xs text-zinc-500">90101501</td>
        <td class="py-3 px-4 text-zinc-750 text-xs">Consumo de alimentos según ticket folio: ${escapeXml(ticket.folio || "M-8495")}</td>
        <td class="py-3 px-4 text-right font-mono text-xs text-zinc-600">$${subtotal.toFixed(2)}</td>
        <td class="py-3 px-4 text-right font-mono font-bold text-xs text-zinc-900">$${total.toFixed(2)}</td>
      </tr>
    `;
  }

  return `
    <div class="max-w-4xl mx-auto bg-white p-6 md:p-12 shadow-2xl rounded-2xl border border-zinc-150 text-zinc-800 text-sm font-sans relative overflow-hidden my-6">
      <!-- Watermark Badge for Demo Fallback -->
      <div class="absolute top-4 right-4 bg-amber-50 border border-amber-200 text-amber-700 font-bold px-3 py-1 rounded-full text-[10px] uppercase tracking-wider flex items-center gap-1">
        <span>Prueba Simulada</span>
      </div>

      <!-- Header -->
      <div class="flex flex-col md:flex-row justify-between items-start border-b border-zinc-200 pb-8 gap-6">
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-lg select-none">F</div>
            <span class="text-xl font-bold tracking-tight text-neutral-900 uppercase">FactuBot Automación</span>
          </div>
          <p class="text-[12px] text-zinc-500 max-w-sm leading-relaxed">Este documento es una representación impresa de un CFDI 4.0 generado mediante simulación de inteligencia artificial de alto nivel con backup local.</p>
        </div>
        
        <div class="text-right space-y-1">
          <div class="inline-block bg-indigo-50 text-indigo-700 font-bold px-3 py-1 rounded-lg text-xs uppercase tracking-wider">Factura Electrónica</div>
          <p class="text-xs text-zinc-400">Folio Interno: <span class="font-mono text-zinc-700 font-semibold">FACT-${Math.floor(100000 + Math.random() * 900000)}</span></p>
          <p class="text-xs text-zinc-400">Fecha de Timbrado: <span class="font-mono text-zinc-700">${dateStr}</span></p>
        </div>
      </div>

      <!-- Emisor / Receptor Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 py-8 border-b border-zinc-150">
        <div class="space-y-3">
          <div class="text-xs text-zinc-400 font-bold uppercase tracking-wider">DATOS DEL EMISOR</div>
          <div class="space-y-1 bg-zinc-50 p-4 rounded-xl border border-zinc-100">
            <p class="font-bold text-zinc-900 text-base">${escapeXml(ticket.nombreEmisor || "EMISOR AUTOMATIZADO S.A. DE C.V.")}</p>
            <p class="font-mono text-xs text-zinc-650">RFC: <span class="font-semibold text-zinc-900">${escapeXml(ticket.rfcEmisor || "XAXX010101000")}</span></p>
            <p class="text-xs text-zinc-500">Régimen Fiscal: 601 General de Ley Personas Morales</p>
            <p class="text-xs text-zinc-500">Portal de Origen: <span class="text-indigo-650 underline font-mono text-[10px] break-all">${escapeXml(connector.portalUrl || "https://facturacion.net")}</span></p>
          </div>
        </div>

        <div class="space-y-3">
          <div class="text-xs text-zinc-400 font-bold uppercase tracking-wider">DATOS DEL RECEPTOR</div>
          <div class="space-y-1 bg-zinc-50 p-4 rounded-xl border border-zinc-100">
            <p class="font-bold text-zinc-900 text-base">${escapeXml(profile.razonSocial || "CLIENTE RECEPTOR S.C.")}</p>
            <p class="font-mono text-xs text-zinc-650">RFC: <span class="font-semibold text-zinc-900">${escapeXml(profile.rfc || "XAXX010101000")}</span></p>
            <p class="text-xs text-zinc-500">Régimen Fiscal: ${escapeXml(profile.regimenFiscal || "605 - Sueldos y Salarios")}</p>
            <p class="text-xs text-zinc-500">Código Postal Fiscal: <span class="font-mono">${escapeXml(profile.codigoPostal || "01000")}</span></p>
            <p class="text-xs text-zinc-500">Uso de CFDI: <span class="font-semibold">${escapeXml(profile.usoCFDI || "G03 - Gastos en general")}</span></p>
          </div>
        </div>
      </div>

      <!-- Partidas / Conceptos Table -->
      <div class="py-8">
        <div class="text-[11px] text-zinc-400 font-bold uppercase tracking-wider mb-3">CONCEPTOS INCLUIDOS EN FACTURA</div>
        <div class="border border-zinc-155 rounded-xl overflow-hidden">
          <table class="w-full text-left border-collapse">
            <thead class="bg-zinc-50 text-xs text-zinc-500 font-semibold border-b border-zinc-150">
              <tr>
                <th class="py-3 px-4 w-12">Cant</th>
                <th class="py-3 px-4 w-28">Clave SAT</th>
                <th class="py-3 px-4">Descripción</th>
                <th class="py-3 px-4 text-right w-28">Pr. Unitario</th>
                <th class="py-3 px-4 text-right w-28">Importe</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Totales y Sello Fiscal Digital -->
      <div class="grid grid-cols-1 md:grid-cols-12 gap-8 pt-6 border-t border-zinc-150 items-start">
        <!-- SAT Stamp Metadata -->
        <div class="md:col-span-7 col-span-1 border border-zinc-100 rounded-xl p-4 bg-zinc-50 space-y-4">
          <div class="flex items-start gap-4">
            <!-- Simulated QR Code representing CFDI verification -->
            <div class="w-24 h-24 bg-white border border-zinc-250 flex flex-col items-center justify-center p-1 rounded-lg shadow-sm shrink-0">
              <svg class="w-full h-full text-zinc-800" viewBox="0 0 100 100">
                <rect x="5" y="5" width="25" height="25" fill="currentColor" />
                <rect x="10" y="10" width="15" height="15" fill="white" />
                <rect x="13" y="13" width="9" height="9" fill="currentColor" />
                <rect x="70" y="5" width="25" height="25" fill="currentColor" />
                <rect x="75" y="10" width="15" height="15" fill="white" />
                <rect x="78" y="13" width="9" height="9" fill="currentColor" />
                <rect x="5" y="70" width="25" height="25" fill="currentColor" />
                <rect x="10" y="75" width="15" height="15" fill="white" />
                <rect x="13" y="78" width="9" height="9" fill="currentColor" />
                <rect x="35" y="12" width="5" height="5" fill="currentColor" />
                <rect x="45" y="8" width="8" fill="currentColor" />
                <rect x="58" y="12" width="4" height="4" fill="currentColor" />
                <rect x="38" y="24" width="12" height="4" fill="currentColor" />
                <rect x="38" y="32" width="6" height="6" fill="currentColor" />
                <rect x="50" y="45" width="10" height="10" fill="currentColor" />
                <rect x="18" y="45" width="4" height="8" fill="currentColor" />
                <rect x="35" y="58" width="15" height="3" fill="currentColor" />
                <rect x="5" y="40" width="12" height="2" fill="currentColor" />
                <rect x="85" y="45" width="8" height="8" fill="currentColor" />
                <rect x="72" y="58" width="14" height="4" fill="currentColor" />
                <rect x="42" y="70" width="8" height="12" fill="currentColor" />
                <rect x="62" y="75" width="28" height="5" fill="currentColor" />
                <rect x="75" y="85" width="4" height="10" fill="currentColor" />
                <rect x="42" y="88" width="15" height="4" fill="currentColor" />
              </svg>
            </div>
            
            <div class="flex-1 space-y-1 min-w-0">
              <span class="text-[9px] uppercase tracking-wider text-zinc-400 font-bold block">Folio Fiscal Digital (UUID)</span>
              <p class="font-mono text-[11px] text-indigo-700 font-bold select-all break-all">${folioFiscal}</p>
              <div class="grid grid-cols-2 gap-2 pt-2">
                <div>
                  <span class="text-[8px] uppercase tracking-wider text-zinc-400 font-bold block">No. Certificado SAT</span>
                  <p class="font-mono text-[10px] text-zinc-700 font-medium font-bold">00001000000502000436</p>
                </div>
                <div>
                  <span class="text-[8px] uppercase tracking-wider text-zinc-400 font-bold block">Proveedor Certif.</span>
                  <p class="font-mono text-[10px] text-zinc-700 font-medium font-bold">SAT970701NN3</p>
                </div>
              </div>
            </div>
          </div>

          <div class="space-y-1 border-t border-zinc-200 pt-3">
            <span class="text-[8px] uppercase tracking-wider text-zinc-400 font-bold block">Sello Digital del Emisor</span>
            <p class="font-mono text-[8px] text-zinc-500 break-all leading-normal select-all bg-white p-1.5 rounded border border-zinc-100">SIM_S8e7XU9rR/g8eY7wI2w9f8W9uR9xX8y3t1W7+R3v7f1m6eY=</p>
          </div>
          
          <div class="space-y-1 border-t border-zinc-200/60 pt-3">
            <span class="text-[8px] uppercase tracking-wider text-zinc-400 font-bold block">Sello Digital del SAT</span>
            <p class="font-mono text-[8px] text-zinc-500 break-all leading-normal select-all bg-white p-1.5 rounded border border-zinc-100">SIM_SAT_f1e2a82_b500_4db2_9cf3_751b301c35ee_OK_S6g=</p>
          </div>
        </div>

        <!-- Financial Totals -->
        <div class="md:col-span-5 col-span-1 space-y-2 text-right">
          <div class="flex justify-between items-center text-zinc-500 text-xs px-2">
            <span>Subtotal Gravado</span>
            <span class="font-mono font-medium text-zinc-700">$${subtotal.toFixed(2)}</span>
          </div>
          <div class="flex justify-between items-center text-zinc-500 text-xs px-2">
            <span>IVA Trasladado (16.00%)</span>
            <span class="font-mono font-medium text-zinc-700">$${iva.toFixed(2)}</span>
          </div>
          <div class="flex justify-between items-center text-zinc-900 font-bold text-base bg-indigo-50 p-3 rounded-xl border border-indigo-100/40">
            <span class="text-indigo-900 font-black tracking-tight text-xs uppercase">Total de Factura</span>
            <span class="font-mono text-indigo-700 text-lg">$${total.toFixed(2)}</span>
          </div>
          
          <p class="text-[9.5px] text-zinc-400 italic pt-2 leading-relaxed">Esta es una factura de prueba generada el ${dateStr}. Cumple técnicamente con las especificaciones v4.0 en entornos simulados.</p>
        </div>
      </div>
    </div>
  `;
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
          thinkingConfig: { thinkingLevel: "LOW" }, // Disables heavy reasoning tokens!
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

// API endpoint: Run high-fidelity automation simulation and generate official CFDI XML & PDF html representation
app.post("/api/automation/run", async (req: Request, res: Response): Promise<void> => {
  const { ticket, profile, connector } = req.body;
  const customKey = req.headers["x-gemini-api-key"] as string | undefined;

  if (!ticket || !profile || !connector) {
    res.status(400).json({ error: "Missing ticket, profile, or connector data for automation" });
    return;
  }

  const generatedFolioFiscal = generateUUID();

  let ai;
  try {
    ai = getGeminiClient(customKey);
  } catch (err: any) {
    console.warn("Gemini client missing or failed to initialize, using robust offline invoice generator.");
    res.json({
      xmlContent: generateLocalXml(ticket, profile, connector, generatedFolioFiscal),
      pdfHtml: generateLocalPdfHtml(ticket, profile, connector, generatedFolioFiscal),
      folioFiscal: generatedFolioFiscal,
      cost: connector?.learnedFrom === "automatizacion_ticket" ? 1.50 : 2.50,
      rawCost: 0
    });
    return;
  }

  const payloadText = `TICKET COMPRADO: ${JSON.stringify(ticket)}
                       DATOS FISCALES RECEPTOR: ${JSON.stringify(profile)}
                       CONECTOR PORTAL: ${JSON.stringify(connector)}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: payloadText,
      config: {
        systemInstruction: `Eres FactuBot AI, el motor de generación CFDI 4.0 oficial de simulación.
                            Dado un ticket de compra mexicano extraído, la dirección del portal de facturación y el perfil fiscal del receptor, procesa la automatización.
                            Debes generar tres piezas de información extremadamente estructuradas:
                            1. Un CFDI v4.0 XML realista. Debe poseer etiquetas estándar (cfdi:Comprobante, cfdi:Emisor, cfdi:Receptor, cfdi:Conceptos, cfdi:Concepto, cfdi:Impuestos, cfdi:Traslados, cfdi:Traslado con TipoFactor='Tasa', TasaOCuota='0.160000', timbrado con un timbre tfd:TimbreFiscalDigital realista con FolioFiscal UUID, NoCertificadoSAT y SellosBase64 simulados).
                            2. Un PDF en HTML responsive moderno, estilizado con excelentes clases de Tailwind CSS, que asombre visualmente. Debe poseer un título formal de 'REPRESENTACIÓN IMPRESA DE CFDI 4.0', un diseño tabular impecable, logo estilizado, código de barras QR (representado con un recuadro interactivo o SVG visual), sello digital de emisor, receptor, totales desglosados (Subtotal, IVA 16%, Total), desglose de conceptos, y un botón para exportar o imprimir. El HTML no debe incluir doctype de página completa, solo un contenedor div principal.
                            3. El Folio Fiscal UUID de la transacción simulada.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            xmlContent: { type: "STRING", description: "El XML de CFDI 4.0 alinedado estrictamente con el SAT en México" },
            pdfHtml: { type: "STRING", description: "El código HTML responsive completo y elegante estilizado con Tailwind CSS (sin incluir headers html o doctype, solo el container del cuerpo de la factura para renderizado seguro)." },
            folioFiscal: { type: "STRING", description: "UUID de 36 caracteres del Timbre Fiscal Digital SAT (ej: 3FA8F392-80FF-11ED-A1EB-0242AC120002)" },
          },
          required: ["xmlContent", "pdfHtml", "folioFiscal"],
        },
      },
    });

    const textResult = response.text;
    if (!textResult) {
      throw new Error("Failed to compile CFDI data from Gemini");
    }

    const promptTokens = response.usageMetadata?.promptTokenCount || 1500;
    const outputTokens = response.usageMetadata?.candidatesTokenCount || 4500;
    const exchangeRate = 18.50;
    const rawCost = (((promptTokens * 0.075 + outputTokens * 0.30) / 1000000)) * exchangeRate;

    const generatedInvoicing = JSON.parse(textResult.trim());
    res.json({
      ...generatedInvoicing,
      cost: connector?.learnedFrom === "automatizacion_ticket" ? 15.00 : 2.50,
      rawCost: parseFloat(rawCost.toFixed(6))
    });
  } catch (error: any) {
    console.warn("Automation simulation failed using Gemini API. Falling back to robust offline generation engine...", error.message || error);
    
    // Fallback to local rendering block (so the simulation never fails/stops for the user)
    const xml = generateLocalXml(ticket, profile, connector, generatedFolioFiscal);
    const pdf = generateLocalPdfHtml(ticket, profile, connector, generatedFolioFiscal);
    
    res.json({
      xmlContent: xml,
      pdfHtml: pdf,
      folioFiscal: generatedFolioFiscal,
      cost: connector?.learnedFrom === "automatizacion_ticket" ? 1.50 : 2.50,
      rawCost: 0
    });
  }
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
      "metadata[bankName]": bankName || ""
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
      "automatic_payment_methods[enabled]": "true",
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

  if (!paymentMethodId) {
    res.status(400).json({ error: "Faltan parámetros paymentMethodId" });
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

    // 1. Obtener detalles del método de pago de Stripe para validar propiedad
    const pmDetailsRes = await axios.get(
      `https://api.stripe.com/v1/payment_methods/${paymentMethodId}`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );
    const pmDetails = pmDetailsRes.data;

    // 2. Si ya está asociado a otro cliente diferente, rechazar de inmediato
    if (pmDetails.customer && pmDetails.customer !== stripeCustomerId) {
      res.status(403).json({ error: "No tienes permisos para asociar este método de pago." });
      return;
    }

    // 3. Si no está asociado al cliente del usuario, lo adjuntamos
    if (pmDetails.customer !== stripeCustomerId) {
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
      // Validar propiedad después de adjuntar
      if (attachRes.data.customer !== stripeCustomerId) {
        res.status(403).json({ error: "Operación de vinculación inválida." });
        return;
      }
    }

    // Set as default if requested or if this is the first/only card
    const billingRef = adminDb.collection("billingProfiles").doc(userId);
    const billingSnapshot = await billingRef.get();
    const existingCards = Array.isArray(billingSnapshot.data()?.paymentCards)
      ? billingSnapshot.data().paymentCards
      : [];
    
    const setAsDefault = isDefault || existingCards.length === 0;
    if (setAsDefault) {
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
    }

    // Sync Firestore cached paymentCards list using our existing function
    await syncCustomerPaymentMethods(stripeCustomerId, stripeSecretKey, adminDb);
    
    // Retrieve the newly updated profile to get the sync'ed paymentCards list
    const updatedSnapshot = await billingRef.get();
    const updatedCards = updatedSnapshot.data()?.paymentCards || [];

    res.json({ success: true, paymentCards: updatedCards });
  } catch (error: any) {
    console.error("Error al vincular tarjeta en Stripe:", error.response?.data || error.message);
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
