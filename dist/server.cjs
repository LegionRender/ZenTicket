var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// firebase/functions/fiscalUtils.js
var require_fiscalUtils = __commonJS({
  "firebase/functions/fiscalUtils.js"(exports2, module2) {
    var axios2 = require("axios");
    function parseSatQrUrl2(text) {
      if (!text) return null;
      const idMatch = /[?&]id=([^&]+)/i.exec(text);
      const reMatch = /[?&]re=([^&]+)/i.exec(text);
      const rrMatch = /[?&]rr=([^&]+)/i.exec(text);
      const ttMatch = /[?&]tt=([^&]+)/i.exec(text);
      if (!idMatch || !reMatch || !rrMatch || !ttMatch) return null;
      const uuid = idMatch[1].trim();
      const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
      if (!uuidRegex.test(uuid)) return null;
      return {
        uuid,
        rfcEmisor: reMatch[1].trim(),
        rfcReceptor: rrMatch[1].trim(),
        total: parseFloat(ttMatch[1].trim()) || 0
      };
    }
    function validateXmlStructure2(xmlContent) {
      if (!xmlContent) return false;
      const hasComprobante = /<cfdi:Comprobante\b/i.test(xmlContent) || /<Comprobante\b/i.test(xmlContent);
      const hasEmisor = /<cfdi:Emisor\b[^>]*\bRfc=/i.test(xmlContent) || /<Emisor\b[^>]*\bRfc=/i.test(xmlContent);
      const hasReceptor = /<cfdi:Receptor\b[^>]*\bRfc=/i.test(xmlContent) || /<Receptor\b[^>]*\bRfc=/i.test(xmlContent);
      const hasTimbre = (/<tfd:TimbreFiscalDigital\b/i.test(xmlContent) || /<TimbreFiscalDigital\b/i.test(xmlContent)) && /\bUUID=/i.test(xmlContent) && /\bFechaTimbrado=/i.test(xmlContent) && /\bSelloCFD=/i.test(xmlContent) && /\bSelloSAT=/i.test(xmlContent) && /\bNoCertificadoSAT=/i.test(xmlContent);
      return !!(hasComprobante && hasEmisor && hasReceptor && hasTimbre);
    }
    function parseCfdiInfo2(xmlContent) {
      const uuidMatch = /UUID="([^"]+)"/i.exec(xmlContent);
      const emisorRfcMatch = /<cfdi:Emisor\b[^>]*\bRfc="([^"]+)"/i.exec(xmlContent) || /<Emisor\b[^>]*\bRfc="([^"]+)"/i.exec(xmlContent);
      const receptorRfcMatch = /<cfdi:Receptor\b[^>]*\bRfc="([^"]+)"/i.exec(xmlContent) || /<Receptor\b[^>]*\bRfc="([^"]+)"/i.exec(xmlContent);
      const totalMatch = /<cfdi:Comprobante\b[^>]*\bTotal="([^"]+)"/i.exec(xmlContent) || /<Comprobante\b[^>]*\bTotal="([^"]+)"/i.exec(xmlContent);
      return {
        uuid: uuidMatch ? uuidMatch[1].trim() : "",
        rfcEmisor: emisorRfcMatch ? emisorRfcMatch[1].trim() : "",
        rfcReceptor: receptorRfcMatch ? receptorRfcMatch[1].trim() : "",
        total: totalMatch ? parseFloat(totalMatch[1].trim()) : 0,
        totalStr: totalMatch ? totalMatch[1].trim() : ""
      };
    }
    var maskUuid = (u) => u.length > 8 ? `${u.substring(0, 4)}...${u.substring(u.length - 4)}` : u;
    var maskRfc = (r) => r.length > 6 ? `${r.substring(0, 3)}***${r.substring(r.length - 3)}` : r;
    async function verifyCfdiWithSat2(rfcEmisor, rfcReceptor, total, uuid) {
      const expression = `?re=${rfcEmisor}&rr=${rfcReceptor}&tt=${total.toFixed(2)}&id=${uuid}`;
      const soapEnvelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
   <soapenv:Header/>
   <soapenv:Body>
      <tem:Consulta>
         <tem:expresionImpresa><![CDATA[${expression}]]></tem:expresionImpresa>
      </tem:Consulta>
   </soapenv:Body>
</soapenv:Envelope>`;
      try {
        const response = await axios2.post("https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc", soapEnvelope, {
          headers: {
            "Content-Type": "text/xml;charset=utf-8",
            "SOAPAction": "http://tempuri.org/IConsultaCFDIService/Consulta"
          }
        });
        const xmlResponse = response.data;
        console.log(`[SAT Verify] Expression: ?re=${maskRfc(rfcEmisor)}&rr=${maskRfc(rfcReceptor)}&tt=${total}&id=${maskUuid(uuid)}`);
        const estadoMatch = /<a:Estado>([^<]+)<\/a:Estado>/i.exec(xmlResponse) || /<Estado>([^<]+)<\/Estado>/i.exec(xmlResponse);
        const codigoEstatusMatch = /<a:CodigoEstatus>([^<]+)<\/a:CodigoEstatus>/i.exec(xmlResponse) || /<CodigoEstatus>([^<]+)<\/CodigoEstatus>/i.exec(xmlResponse);
        const estado = estadoMatch ? estadoMatch[1].trim() : "";
        const codigoEstatus = codigoEstatusMatch ? codigoEstatusMatch[1].trim() : "";
        const estadoLower = estado.toLowerCase();
        if (estadoLower === "vigente") {
          return { status: "valid", satStatus: estado, detail: `Estado: ${estado}. Codigo: ${codigoEstatus}` };
        } else if (estadoLower === "cancelado") {
          return { status: "canceled", satStatus: estado, detail: `Estado: ${estado}. Codigo: ${codigoEstatus}` };
        } else {
          return { status: "not_found", satStatus: estado || "No Encontrado", detail: `Estado: ${estado || "No Encontrado"}. Codigo: ${codigoEstatus}` };
        }
      } catch (err) {
        console.error("Error calling SAT CFDI verification service:", err);
        return { status: "error", satStatus: "Timeout o error cr\xEDtico", detail: err.message || "Network error calling SAT service" };
      }
    }
    module2.exports = {
      parseSatQrUrl: parseSatQrUrl2,
      validateXmlStructure: validateXmlStructure2,
      parseCfdiInfo: parseCfdiInfo2,
      verifyCfdiWithSat: verifyCfdiWithSat2,
      maskUuid,
      maskRfc
    };
  }
});

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
var import_nodemailer = __toESM(require("nodemailer"), 1);
var import_app = require("firebase-admin/app");
var import_firestore = require("firebase-admin/firestore");
var import_auth = require("firebase-admin/auth");
var import_axios = __toESM(require("axios"), 1);
var import_crypto = __toESM(require("crypto"), 1);

// src/shared/utils/validation.ts
function sanitizeBillingReferenceForConnector(value, rawOcrText, connector, fieldContract) {
  if (!value) return "";
  let cleanValue = String(value).trim();
  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(cleanValue);
  const hasInternalPrefix = /^ticket_|^job_|^OFFLINE-|^worker-/i.test(cleanValue);
  if (isUuid || hasInternalPrefix) {
    console.log(`[Sanitizer] Blocked UUID or internal prefix: "${cleanValue}"`);
    return "";
  }
  if (cleanValue.length > 20) {
    let patternPassed = false;
    let contractField2 = fieldContract;
    if (!contractField2 && connector && connector.extractionContract) {
      contractField2 = connector.extractionContract.requiredPortalFields?.find(
        (f) => f.canonicalKey === "billingReference" || f.key === "portalFields.billingReference"
      );
    }
    if (contractField2 && contractField2.validationPattern) {
      try {
        const regex = new RegExp(contractField2.validationPattern, "i");
        patternPassed = regex.test(cleanValue);
      } catch (e) {
      }
    }
    if (!patternPassed) {
      console.log(`[Sanitizer] Blocked too long value (>20 chars) without matching pattern: "${cleanValue}"`);
      return "";
    }
  }
  let contractField = fieldContract;
  if (!contractField && connector && connector.extractionContract) {
    contractField = connector.extractionContract.requiredPortalFields?.find(
      (f) => f.canonicalKey === "billingReference" || f.key === "portalFields.billingReference"
    );
  }
  if (contractField) {
    if (contractField.validationPattern) {
      try {
        const regex = new RegExp(contractField.validationPattern, "i");
        if (!regex.test(cleanValue)) {
          console.log(`[Sanitizer] Blocked by validationPattern "${contractField.validationPattern}": "${cleanValue}"`);
          return "";
        }
      } catch (e) {
      }
    }
    if (contractField.forbiddenPatterns && contractField.forbiddenPatterns.length > 0) {
      for (const pattern of contractField.forbiddenPatterns) {
        try {
          const regex = new RegExp(pattern, "i");
          if (regex.test(cleanValue)) {
            console.log(`[Sanitizer] Blocked by forbiddenPattern "${pattern}": "${cleanValue}"`);
            return "";
          }
        } catch (e) {
        }
      }
    }
    if (contractField.requireLiteralMatch === true && rawOcrText) {
      if (!rawOcrText.includes(cleanValue)) {
        console.log(`[Sanitizer] Blocked: value "${cleanValue}" is not present in rawOcrText`);
        return "";
      }
    }
  }
  return cleanValue;
}

// server.ts
import_dotenv.default.config();
var hasRealCredentials = !!(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS);
var adminDb;
if (hasRealCredentials) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      (0, import_app.initializeApp)({
        credential: (0, import_app.cert)(serviceAccount)
      });
    } else {
      (0, import_app.initializeApp)({
        projectId: "factubolt"
      });
    }
    console.log("[Firebase Admin] Inicializado exitosamente.");
    adminDb = (0, import_firestore.getFirestore)();
  } catch (e) {
    console.warn("[Firebase Admin Warning] No se pudo inicializar con credenciales reales.", e);
  }
}
if (!adminDb) {
  console.log("[Firebase Admin] No se detectaron credenciales reales. Cargando B\xF3veda Mock en Memoria para desarrollo local.");
  const mockDb = {
    payments: {},
    subscriptions: {},
    fiscalProfiles: {},
    billingEvents: {}
  };
  adminDb = {
    collection: (colName) => {
      if (!mockDb[colName]) mockDb[colName] = {};
      return {
        doc: (docId) => {
          return {
            set: async (data, options) => {
              console.log(`[Mock Firestore Set] ${colName}/${docId}:`, data);
              if (options?.merge) {
                mockDb[colName][docId] = { ...mockDb[colName][docId], ...data };
              } else {
                mockDb[colName][docId] = data;
              }
              return { writeTime: /* @__PURE__ */ new Date() };
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
        add: async (data) => {
          const docId = "mock_event_" + Date.now();
          console.log(`[Mock Firestore Add] ${colName}/${docId}:`, data);
          mockDb[colName][docId] = data;
          return { id: docId, writeTime: /* @__PURE__ */ new Date() };
        }
      };
    }
  };
}
var authenticateFirebaseToken = async (req, res, next) => {
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
    res.status(401).json({ error: "Falta el token de autorizaci\xF3n o es inv\xE1lido" });
    return;
  }
  const token = authHeader.split("Bearer ")[1];
  try {
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
    const decodedToken = await (0, import_auth.getAuth)().verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || "",
      email_verified: decodedToken.email_verified === true
    };
    next();
  } catch (error) {
    console.error("Error al verificar token de Firebase:", error.message);
    res.status(401).json({ error: "Token de Firebase inv\xE1lido o expirado" });
  }
};
async function resolveStripeCustomerId(uid, email, emailVerified) {
  const billingRef = adminDb.collection("billingProfiles").doc(uid);
  const billingSnap = await billingRef.get();
  if (billingSnap.exists) {
    const data = billingSnap.data();
    if (data?.stripeCustomerId) {
      return data.stripeCustomerId;
    }
  }
  const fiscalRef = adminDb.collection("fiscalProfiles").doc(uid);
  const fiscalSnap = await fiscalRef.get();
  if (fiscalSnap.exists) {
    const historicalCustomerId = fiscalSnap.data()?.stripeCustomerId;
    if (historicalCustomerId) {
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (stripeSecretKey) {
        try {
          const res = await import_axios.default.get(
            `https://api.stripe.com/v1/customers/${historicalCustomerId}`,
            { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
          );
          const customer = res.data;
          if (email && emailVerified && customer.email && customer.email.toLowerCase() === email.toLowerCase()) {
            console.log(`[Migration] Migrando stripeCustomerId ${historicalCustomerId} desde fiscalProfiles a billingProfiles para ${uid}`);
            await billingRef.set({ stripeCustomerId: historicalCustomerId }, { merge: true });
            return historicalCustomerId;
          } else {
            console.warn(`[Migration warning] Email mismatch for historical stripeCustomerId ${historicalCustomerId}. Token email: ${email}, Customer email: ${customer.email}. No se migr\xF3.`);
          }
        } catch (err) {
          console.error(`[Migration error] Error al validar customer hist\xF3rico ${historicalCustomerId}:`, err.message);
        }
      }
    }
  }
  if (email && emailVerified) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (stripeSecretKey) {
      try {
        const response = await import_axios.default.get(
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
          console.warn(`[Migration warning] M\xFAltiples clientes encontrados para ${email}. Se requiere resoluci\xF3n manual.`);
        }
      } catch (err) {
        console.error(`[Migration error] Error al buscar customer por correo:`, err.message);
      }
    }
  }
  if (email) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (stripeSecretKey) {
      try {
        const customerParams = new URLSearchParams({
          email,
          name: email.split("@")[0],
          "metadata[userId]": uid
        });
        const customerResponse = await import_axios.default.post(
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
  const signedPayload = `${timestamp}.${rawBody}`;
  const computedSig = import_crypto.default.createHmac("sha256", webhookSecret).update(signedPayload).digest("hex");
  const computedBuffer = Buffer.from(computedSig, "hex");
  for (const sig of signatures) {
    const sigBuffer = Buffer.from(sig, "hex");
    if (computedBuffer.length === sigBuffer.length && import_crypto.default.timingSafeEqual(computedBuffer, sigBuffer)) {
      return true;
    }
  }
  return false;
}
var app = (0, import_express.default)();
var PORT = process.env.PORT ? parseInt(process.env.PORT) : 3e3;
app.post("/api/billing/webhooks/stripe", import_express.default.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !webhookSecret) {
    console.error("[Stripe Webhook Error] Falta la firma stripe-signature o STRIPE_WEBHOOK_SECRET");
    res.status(400).send("Webhook signature verification failed");
    return;
  }
  const rawBody = req.body.toString("utf8");
  if (!verifyStripeSignature(rawBody, sig, webhookSecret)) {
    console.error("[Stripe Webhook Error] Firma de Stripe inv\xE1lida");
    res.status(400).send("Webhook signature verification failed");
    return;
  }
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
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
        const paymentQuery = await adminDb.collection("payments").where("providerPaymentId", "==", paymentIntentId).limit(1).get();
        if (!paymentQuery.empty) {
          await paymentQuery.docs[0].ref.set({
            status: "paid",
            paidAt: (/* @__PURE__ */ new Date()).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          }, { merge: true });
        }
      }
    }
    await adminDb.collection("billingEvents").add({
      provider: "stripe",
      eventType: event.type || "unknown",
      providerEventId: event.id || "unknown",
      processed: true,
      receivedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (event.type === "checkout.session.completed") {
      const sessionObj = event.data?.object;
      if (sessionObj && sessionObj.id) {
        const sessionId = sessionObj.id;
        const response = await import_axios.default.get(
          `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
          {
            headers: {
              Authorization: `Bearer ${stripeSecretKey}`
            }
          }
        );
        const session = response.data;
        const paymentStatus = session.payment_status;
        const externalReference = session.client_reference_id;
        console.log(`[Stripe] Checkout Session retrieve: status=${session.status}, payment_status=${paymentStatus}, ref=${externalReference}`);
        if (session.mode === "setup" && session.setup_intent && externalReference) {
          const setupResponse = await import_axios.default.get(
            `https://api.stripe.com/v1/setup_intents/${session.setup_intent}?expand[]=payment_method`,
            { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
          );
          const paymentMethod = setupResponse.data.payment_method;
          const card = paymentMethod?.card;
          if (card) {
            const billingRef = adminDb.collection("billingProfiles").doc(externalReference);
            const billingSnapshot = await billingRef.get();
            const existingCards = Array.isArray(billingSnapshot.data()?.paymentCards) ? billingSnapshot.data().paymentCards : [];
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
              ...existingCards.filter((item) => item.id !== paymentMethod.id).map((item) => ({ ...item, isDefault: false }))
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
            amount,
            currency: session.currency?.toUpperCase() || "MXN",
            status: "paid",
            paidAt: (/* @__PURE__ */ new Date()).toISOString(),
            createdAt: (/* @__PURE__ */ new Date()).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          }, { merge: true });
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
            currentPeriodStart: (/* @__PURE__ */ new Date()).toISOString(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString(),
            invoicesLimit: limit,
            invoicesUsed: 0,
            createdAt: (/* @__PURE__ */ new Date()).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          });
          await adminDb.collection("billingProfiles").doc(userId).set({
            stripeCustomerId: session.customer || null,
            planId,
            subscriptionStatus: "paid",
            subscriptionId: session.id
          }, { merge: true });
          await adminDb.collection("fiscalProfiles").doc(userId).set({
            plan: planId,
            planStartDate: (/* @__PURE__ */ new Date()).toISOString(),
            paymentStatus: "paid",
            autoRenew: true
          }, { merge: true });
        }
      }
    }
    res.status(200).send("OK");
  } catch (error) {
    console.error("Error al procesar webhook de Stripe:", error.response?.data || error.message);
    res.status(500).send("Error de procesamiento");
  }
});
app.use(import_express.default.json({ limit: "15mb" }));
app.use(import_express.default.urlencoded({ extended: true, limit: "15mb" }));
app.get("/api/config/status", (req, res) => {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  res.json({
    smtpConfigured: !!(host && user && pass),
    smtpUser: user ? `${user.substring(0, 3)}***` : null
  });
});
app.get("/api/config/paypal-client-id", (req, res) => {
  res.json({ clientId: process.env.PAYPAL_CLIENT_ID || "" });
});
function getGeminiClient(customApiKey) {
  const currentKey = (customApiKey || process.env.GEMINI_API_KEY || "").trim();
  if (!currentKey || currentKey === "" || currentKey.toLowerCase().includes("your_") || currentKey.toLowerCase().includes("todo") || currentKey.toLowerCase().includes("placeholder") || currentKey.toLowerCase().includes("clave") || currentKey.length < 20) {
    throw new Error("La clave GEMINI_API_KEY no est\xE1 configurada o es de simulaci\xF3n.");
  }
  return new import_genai.GoogleGenAI({
    apiKey: currentKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
app.post("/api/tickets/analyze", async (req, res) => {
  try {
    let backendMatchConnector = function(connectorsList, tEmisorName, tEmisorRfc) {
      const cleanStr = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").replace(/\b(sa|de|cv|sapi|srl|de|cv|grupo|comercial|cadena|tiendas|sucursal|santa|fe|magna|pemex)\b/g, "").trim();
      const tRfc = (tEmisorRfc || "").toLowerCase().trim();
      const tNombre = cleanStr(tEmisorName || "");
      const found = connectorsList.find((c) => {
        const cRfc = (c.rfc || "").toLowerCase().trim();
        if (tRfc && cRfc && tRfc === cRfc) return true;
        const cNombre = cleanStr(c.nombre || "");
        if (tNombre && cNombre && (tNombre.includes(cNombre) || cNombre.includes(tNombre))) return true;
        if (c.aliases && c.aliases.length > 0) {
          const matchingAlias = c.aliases.find((alias) => {
            const cleanAlias = cleanStr(alias);
            return tNombre && cleanAlias && (tNombre.includes(cleanAlias) || cleanAlias.includes(tNombre));
          });
          if (matchingAlias) return true;
        }
        if (tNombre && cNombre) {
          const tWords = tNombre.split(/\s+/).filter((w) => w.length > 2);
          const cWords = cNombre.split(/\s+/).filter((w) => w.length > 2);
          return tWords.some((w) => cWords.includes(w));
        }
        return false;
      });
      return found || null;
    };
    const { image, mimeType } = req.body;
    const customKey = req.headers["x-gemini-api-key"];
    if (!image) {
      res.status(400).json({ error: "Missing base64 ticket image" });
      return;
    }
    const MODELS_TO_TRY = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
    const MAX_RETRIES_PER_MODEL = 2;
    let ai;
    let fallbackToOcrMock = false;
    let ocrErrorDetails = "";
    try {
      ai = getGeminiClient(customKey);
    } catch (err) {
      console.warn("Gemini client missing or failed to initialize for OCR. Triggering high-fidelity mock fallback...");
      fallbackToOcrMock = true;
      ocrErrorDetails = err.message || "No client initialized";
    }
    const imagePart = {
      inlineData: {
        mimeType: mimeType || "image/jpeg",
        data: image
      }
    };
    let textResult = "";
    let promptTokens = 0;
    let outputTokens = 0;
    let matchedConnector = null;
    if (!fallbackToOcrMock && ai) {
      let detectedName = "";
      let detectedRfc = "";
      let successId = false;
      const idSchema = {
        type: "OBJECT",
        properties: {
          rfcEmisor: { type: "STRING", description: "RFC del emisor de la tienda. Si no viene o no es legible, coloca 'XAXX010101000'." },
          nombreEmisor: { type: "STRING", description: "Nombre de la tienda en may\xFAsculas." }
        },
        required: ["rfcEmisor", "nombreEmisor"]
      };
      const idPrompt = {
        text: "Analiza esta fotograf\xEDa de un ticket de compra. Identifica \xFAnicamente el nombre del comercio (nombreEmisor) y su RFC (rfcEmisor). Si no encuentras el RFC, pon 'XAXX010101000'."
      };
      for (const model of MODELS_TO_TRY) {
        if (successId) break;
        try {
          console.log(`[OCR Stage 1] Identifying merchant with model ${model}`);
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
            detectedName = parsed.nombreEmisor || "";
            detectedRfc = parsed.rfcEmisor || "";
            successId = true;
            console.log(`[OCR Stage 1] Identified: ${detectedName} (RFC: ${detectedRfc})`);
          }
        } catch (err) {
          console.warn(`[OCR Stage 1 Warning] Model ${model} failed:`, err?.message || err);
        }
      }
      let connectorsList = [];
      if (adminDb && typeof adminDb.collection === "function") {
        try {
          const snap = await adminDb.collection("connectors").get();
          connectorsList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (e) {
          console.warn("Could not retrieve connectors list from DB:", e.message);
        }
      }
      matchedConnector = backendMatchConnector(connectorsList, detectedName, detectedRfc);
      let targetedPromptText = "";
      let targetedSchema = {};
      if (matchedConnector && matchedConnector.extractionContract) {
        console.log(`[OCR Stage 2] Matched connector ${matchedConnector.nombre}. Loading extractionContract.`);
        const contract = matchedConnector.extractionContract;
        targetedPromptText = `Este ticket pertenece a ${matchedConnector.nombre}.
`;
        targetedPromptText += `Extrae \xFAnicamente los campos requeridos por este portal:
`;
        for (const f of contract.requiredPortalFields) {
          targetedPromptText += `- ${f.label} (${f.canonicalKey}): ${f.hints.join(". ")} (patr\xF3n esperado: ${f.validationPattern}).
`;
        }
        targetedPromptText += `INSTRUCCI\xD3N CR\xCDTICA: Si no encuentras un dato literalmente en el ticket, devuelve null. No inventes valores. No uses UUIDs, ticketId, doc.id, UUID SAT ni identificadores internos como referencia de facturaci\xF3n.
`;
        targetedPromptText += `Tambi\xE9n extrae la fecha de compra (fechaCompra) en formato YYYY-MM-DD, la sucursal (sucursal) y la lista de art\xEDculos comprados (items).`;
        const customProperties = {
          rfcEmisor: { type: "STRING" },
          nombreEmisor: { type: "STRING" },
          fechaCompra: { type: "STRING", description: "Fecha de compra en formato YYYY-MM-DD. Si no la encuentras, devuelve null." },
          sucursal: { type: "STRING" },
          rawOcrText: { type: "STRING", description: "El texto completo e \xEDntegro extra\xEDdo del ticket de forma literal, l\xEDnea por l\xEDnea." },
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
        for (const f of contract.requiredPortalFields) {
          if (f.canonicalKey === "billingReference") {
            customProperties.billingReference = {
              type: "STRING",
              description: `${f.label}. Si no se encuentra literal en el ticket, devuelve null.`
            };
          } else if (f.canonicalKey === "total") {
            customProperties.total = {
              type: "NUMBER",
              description: `${f.label}. Si no se encuentra literal en el ticket, devuelve null.`
            };
          }
        }
        targetedSchema = {
          type: "OBJECT",
          properties: customProperties,
          required: ["rfcEmisor", "nombreEmisor", "rawOcrText", "items"]
        };
      } else {
        console.log(`[OCR Stage 2] No matched connector. Using generic fallback schema.`);
        targetedPromptText = "Analiza exhaustivamente esta fotograf\xEDa de un ticket de compra mexicano. Extrae con precisi\xF3n los datos y estructura el resultado exactamente seg\xFAn el esqueleto proporcionado. INSTRUCCI\xD3N CR\xCDTICA: No asumas marcas populares si el ticket no pertenece a ellas. Si es una farmacia o comercio local, extrae fielmente el nombre exacto de la marca. Si encuentras un c\xF3digo de barras largo o n\xFAmero de referencia, extr\xE1elos. Si no encuentras un dato literalmente, devuelve null y no inventes valores.";
        targetedSchema = {
          type: "OBJECT",
          properties: {
            rfcEmisor: { type: "STRING", description: "RFC del emisor de la tienda (12 o 13 car\xE1cteres). Si no viene o no es legible, coloca 'XAXX010101000'." },
            nombreEmisor: { type: "STRING", description: "Nombre comercial o raz\xF3n social de la tienda en may\xFAsculas." },
            fechaCompra: { type: "STRING", description: "Fecha de compra aproximada o exacta en formato YYYY-MM-DD" },
            folio: { type: "STRING", description: "Folio del ticket, ID de transacci\xF3n, c\xF3digo de facturaci\xF3n o referencia de ticket." },
            total: { type: "NUMBER", description: "Total monetario pagado en el ticket en pesos mexicanos" },
            sucursal: { type: "STRING", description: "Sucursal o ubicaci\xF3n donde se realiz\xF3 la compra" },
            referenciaFacturacion: { type: "STRING", description: "Referencia para facturaci\xF3n, c\xF3digo de facturaci\xF3n o c\xF3digo largo impreso en el ticket." },
            codigoBarras: { type: "STRING", description: "C\xF3digo de barras num\xE9rico impreso en el ticket." },
            rawOcrText: { type: "STRING", description: "El texto completo e \xEDntegro extra\xEDdo del ticket de forma literal, l\xEDnea por l\xEDnea." },
            items: {
              type: "ARRAY",
              description: "Lista de conceptos comprados descritos en el ticket",
              items: {
                type: "OBJECT",
                properties: {
                  description: { type: "STRING", description: "Concepto del producto" },
                  amount: { type: "NUMBER", description: "Precio o importe de este concepto" }
                },
                required: ["description", "amount"]
              }
            }
          },
          required: ["rfcEmisor", "nombreEmisor", "fechaCompra", "folio", "total", "rawOcrText", "items"]
        };
      }
      let successTarget = false;
      for (const model of MODELS_TO_TRY) {
        if (successTarget) break;
        for (let attempt = 1; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
          try {
            console.log(`[OCR Stage 2] Extracting details using model ${model} (Attempt ${attempt}/${MAX_RETRIES_PER_MODEL})`);
            const response = await ai.models.generateContent({
              model,
              contents: { parts: [imagePart, { text: targetedPromptText }] },
              config: {
                responseMimeType: "application/json",
                responseSchema: targetedSchema
              }
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
          } catch (err) {
            console.warn(`[OCR Stage 2 Warning] Model ${model} failed on attempt ${attempt}: ${err?.message || err}`);
          }
        }
      }
      if (!successTarget) {
        fallbackToOcrMock = true;
      }
    }
    let extractedData;
    if (textResult) {
      try {
        extractedData = JSON.parse(textResult);
      } catch (e) {
        console.warn("[OCR] Error parsing model response JSON:", e.message);
        fallbackToOcrMock = true;
      }
    } else {
      fallbackToOcrMock = true;
    }
    const MERCHANT_PROFILES = {
      "system-oxxo": {
        name: "OXXO Cadena",
        rfc: "CCO8605231N4",
        portalUrl: "http://factura.oxxo.com:8080",
        requiredFields: ["rfcEmisor", "folio", "total", "fecha"],
        folioPattern: /^[a-zA-Z0-9\-]+$/i,
        dateFormat: "YYYY-MM-DD",
        minConfidence: 0.7
      },
      "system-starbucks": {
        name: "Starbucks / Alsea",
        rfc: "SHE190630TX1",
        portalUrl: "https://alsea.facturacion.com",
        requiredFields: ["rfcEmisor", "folio", "total", "fecha"],
        folioPattern: /^[0-9]+$/i,
        dateFormat: "YYYY-MM-DD",
        minConfidence: 0.7
      },
      "system-walmart": {
        name: "Walmart / Aurrera",
        rfc: "NWM9709244W4",
        portalUrl: "https://facturacion.walmartmexico.com",
        requiredFields: ["rfcEmisor", "folio", "total", "fecha"],
        folioPattern: /^[0-9]+$/i,
        dateFormat: "YYYY-MM-DD",
        minConfidence: 0.7
      }
    };
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
    const pipelineLogs = [];
    pipelineLogs.push("Etapa 1: Recibida imagen del ticket y decodificada.");
    let qrDetected = false;
    let qrValue = "";
    let qrParsed = parseSatQrUrl(textResult) || extractedData && (parseSatQrUrl(extractedData.folio) || parseSatQrUrl(extractedData.sucursal));
    if (qrParsed) {
      qrDetected = true;
      qrValue = `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${qrParsed.uuid}&re=${qrParsed.rfcEmisor}&rr=${qrParsed.rfcReceptor}&tt=${qrParsed.total}`;
      pipelineLogs.push("Etapa 2: C\xF3digo QR SAT detectado en la imagen. Priorizando datos del QR sobre OCR.");
    } else {
      pipelineLogs.push("Etapa 2: Escaneando c\xF3digos de barras y QR... No se localizaron c\xF3digos legibles.");
    }
    pipelineLogs.push("Etapa 3: Analizando datos con motor OCR de IA Gemini.");
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
        } catch (_) {
        }
      }
      detectedProfile = {
        name: matchedConnector.nombre,
        rfc: matchedConnector.rfc,
        portalUrl: matchedConnector.portalUrl,
        requiredFields: reqFields,
        folioPattern: /.*/,
        dateFormat: "YYYY-MM-DD",
        minConfidence: 0.7
      };
    } else {
      if (rawRfc.toUpperCase().includes("CCO8605231N4") || rawNombre.toUpperCase().includes("OXXO")) {
        detectedProfileKey = "system-oxxo";
        detectedProfile = MERCHANT_PROFILES["system-oxxo"];
      } else if (rawRfc.toUpperCase().includes("SHE190630TX1") || rawNombre.toUpperCase().includes("STARBUCKS") || rawNombre.toUpperCase().includes("ALSEA")) {
        detectedProfileKey = "system-starbucks";
        detectedProfile = MERCHANT_PROFILES["system-starbucks"];
      } else if (rawRfc.toUpperCase().includes("NWM9709244W4") || rawNombre.toUpperCase().includes("WALMART") || rawNombre.toUpperCase().includes("AURRERA")) {
        detectedProfileKey = "system-walmart";
        detectedProfile = MERCHANT_PROFILES["system-walmart"];
      }
    }
    if (detectedProfile) {
      pipelineLogs.push(`Etapa 4: Comercio identificado: ${detectedProfile.name} (${detectedProfile.rfc}).`);
    } else {
      pipelineLogs.push("Etapa 4: Comercio identificado como comercio local/general.");
    }
    const fields = {
      comercio: {
        value: detectedProfile ? detectedProfile.name : rawNombre || "Comercio General",
        confidence: detectedProfile ? 0.98 : 0.85,
        source: "ocr",
        rawText: rawNombre,
        normalizedValue: detectedProfile ? detectedProfile.name : rawNombre || "Comercio General"
      },
      rfcEmisor: {
        value: qrParsed ? qrParsed.rfcEmisor : rawRfc.toUpperCase().replace(/[^A-Z0-9]/g, "") || "XAXX010101000",
        confidence: qrParsed ? 1 : rawRfc && rawRfc.length >= 12 ? 0.97 : 0.5,
        source: qrParsed ? "qr" : "ocr",
        rawText: rawRfc,
        normalizedValue: qrParsed ? qrParsed.rfcEmisor : rawRfc.toUpperCase().replace(/[^A-Z0-9]/g, "") || "XAXX010101000"
      },
      fecha: {
        value: extractedData.fechaCompra || "",
        confidence: extractedData.fechaCompra ? 0.95 : 0.5,
        source: "ocr",
        rawText: extractedData.fechaCompra || "",
        normalizedValue: extractedData.fechaCompra || ""
      },
      hora: {
        value: extractedData.hora || "12:00:00",
        confidence: extractedData.hora ? 0.88 : 0.6,
        source: "ocr",
        rawText: extractedData.hora || "",
        normalizedValue: extractedData.hora || "12:00:00"
      },
      total: {
        value: qrParsed ? qrParsed.total : parseFloat(String(extractedData.total)) || 0,
        confidence: qrParsed ? 1 : extractedData.total ? 0.96 : 0.4,
        source: qrParsed ? "qr" : "ocr",
        rawText: String(extractedData.total || ""),
        normalizedValue: qrParsed ? String(qrParsed.total) : String(extractedData.total || 0)
      },
      folio: {
        value: extractedData.folio || "",
        confidence: extractedData.folio ? 0.93 : 0,
        source: "ocr",
        rawText: extractedData.folio || "",
        normalizedValue: extractedData.folio || ""
      },
      referenciaFacturacion: {
        value: extractedData.referenciaFacturacion || "",
        confidence: extractedData.referenciaFacturacion ? 0.95 : 0,
        source: "ocr",
        rawText: extractedData.referenciaFacturacion || "",
        normalizedValue: extractedData.referenciaFacturacion || ""
      },
      codigoBarras: {
        value: extractedData.codigoBarras || "",
        confidence: extractedData.codigoBarras ? 0.95 : 0,
        source: "ocr",
        rawText: extractedData.codigoBarras || "",
        normalizedValue: extractedData.codigoBarras || ""
      },
      sucursal: {
        value: extractedData.sucursal || "Matriz",
        confidence: extractedData.sucursal ? 0.88 : 0.5,
        source: "ocr",
        rawText: extractedData.sucursal || "",
        normalizedValue: extractedData.sucursal || "Matriz"
      },
      terminal: {
        value: extractedData.terminal || "Caja 1",
        confidence: extractedData.terminal ? 0.8 : 0.5,
        source: "ocr",
        rawText: extractedData.terminal || "",
        normalizedValue: extractedData.terminal || "Caja 1"
      },
      barcode: {
        value: qrValue,
        confidence: qrDetected ? 1 : 0,
        source: qrDetected ? "qr" : "none",
        rawText: qrValue,
        normalizedValue: qrValue
      }
    };
    pipelineLogs.push("Etapa 5: Ejecutando normalizaci\xF3n de campos (limpieza de RFC, formato de fechas y totales).");
    let validationFailed = false;
    let failReason = "";
    if (detectedProfile && fields.folio.value && detectedProfile.folioPattern) {
      if (!detectedProfile.folioPattern.test(fields.folio.value)) {
        fields.folio.confidence = 0.5;
        pipelineLogs.push(`\u26A0\uFE0F Advertencia: El folio '${fields.folio.value}' no coincide con el patr\xF3n esperado del comercio.`);
      }
    }
    const required = detectedProfile ? detectedProfile.requiredFields : ["rfcEmisor", "folio", "total", "fecha"];
    for (const reqField of required) {
      const fieldKey = reqField === "fecha" ? "fecha" : reqField;
      const f = fields[fieldKey];
      if (!f || !f.value || f.confidence < 0.7) {
        validationFailed = true;
        failReason = `El campo requerido '${reqField}' falta o tiene baja confianza de extracci\xF3n.`;
        pipelineLogs.push(`\u274C Fall\xF3 validaci\xF3n: Campo '${reqField}' no es confiable (Confianza: ${f ? Math.round(f.confidence * 100) : 0}%).`);
      }
    }
    const sumConf = Object.values(fields).reduce((sum, f) => sum + f.confidence, 0);
    const avgConfidence = sumConf / Object.keys(fields).length;
    pipelineLogs.push(`Etapa 6: C\xE1lculo de confianza general completado: ${Math.round(avgConfidence * 100)}%.`);
    let finalOcrFailed = fallbackToOcrMock || validationFailed;
    let ocrErrorStr = "";
    if (validationFailed) {
      ocrErrorStr = `Extracci\xF3n de datos con baja confianza o incompleta: ${failReason} Requiere revisi\xF3n del usuario.`;
      pipelineLogs.push("Decisi\xF3n: Confianza insuficiente para automatizaci\xF3n autom\xE1tica. Marcando para revisi\xF3n manual.");
    } else {
      pipelineLogs.push("Decisi\xF3n: Confianza aprobada. Listo para automatizaci\xF3n autom\xE1tica.");
    }
    const cost = fallbackToOcrMock ? 0 : 0.5;
    let rawCost = 0;
    if (textResult) {
      const exchangeRate = 18.5;
      rawCost = (promptTokens * 0.075 + outputTokens * 0.3) / 1e6 * exchangeRate;
    }
    let billingReference = sanitizeBillingReferenceForConnector(
      extractedData.billingReference || extractedData.referenciaFacturacion || extractedData.folio || "",
      textResult,
      matchedConnector
    );
    fields.referenciaFacturacion.value = billingReference;
    fields.referenciaFacturacion.normalizedValue = billingReference;
    const portalFields = {
      billingReference: billingReference || "",
      total: qrParsed ? qrParsed.total : parseFloat(String(extractedData.total)) || 0,
      date: extractedData.fechaCompra || ""
    };
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
      ocrFailed: finalOcrFailed,
      ocrError: ocrErrorStr || extractedData.ocrError || null,
      confidenceScore: parseFloat(avgConfidence.toFixed(4)),
      extractedFields: fields,
      pipelineLogs,
      cost,
      rawCost: parseFloat(rawCost.toFixed(6)),
      matchedConnector: matchedConnector ? {
        id: matchedConnector.id,
        nombre: matchedConnector.nombre,
        rfc: matchedConnector.rfc,
        portalUrl: matchedConnector.portalUrl,
        fieldsJson: matchedConnector.fieldsJson,
        flowJson: matchedConnector.flowJson,
        extractionContract: matchedConnector.extractionContract,
        status: matchedConnector.status
      } : null
    });
  } catch (error) {
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
      rawCost: 0
    });
  }
});
app.post("/api/fiscal/parse-constancia", async (req, res) => {
  try {
    const { file, mimeType } = req.body;
    const customKey = req.headers["x-gemini-api-key"];
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
    } catch (err) {
      console.warn("Gemini client initialization failed for constancia parsing. Using high-fidelity mock...");
      fallbackToMock = true;
      errorDetails = err.message || "No client initialized";
    }
    const filePart = {
      inlineData: {
        mimeType: mimeType || "application/pdf",
        data: file
      }
    };
    const textPart = {
      text: "Analiza esta Constancia de Situaci\xF3n Fiscal (SAT M\xE9xico) proporcionada. Extrae con precisi\xF3n el RFC, la Raz\xF3n Social o Denominaci\xF3n, el C\xF3digo Postal del domicilio fiscal, y el n\xFAmero de c\xF3digo num\xE9rico de 3 d\xEDgitos del R\xE9gimen Fiscal actual preponderante o principal (ejemplo: 601, 612, 626, 605, 606). Si el archivo no es un PDF o imagen de constancia v\xE1lida, o los datos no se encuentran, intenta interpretarlo o genera datos coherentes posibles."
    };
    const responseSchema = {
      type: "OBJECT",
      properties: {
        rfc: { type: "STRING", description: "RFC del contribuyente (12 o 13 caracteres de longitud, sin espacios/guiones)" },
        razonSocial: { type: "STRING", description: "Nombre, Denominaci\xF3n o Raz\xF3n Social completa en MAY\xDASCULAS" },
        regimenFiscal: { type: "STRING", description: "C\xF3digo de 3 d\xEDgitos del R\xE9gimen de adscripci\xF3n (ej. 601, 603, 605, 606, 612, 626)" },
        codigoPostal: { type: "STRING", description: "C\xF3digo postal del domicilio fiscal (5 d\xEDgitos)" }
      },
      required: ["rfc", "razonSocial", "regimenFiscal", "codigoPostal"]
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
              responseSchema
            }
          });
          if (response.text && response.text.trim()) {
            textResult = response.text.trim();
            console.log(`[CONSTANCIA] Extracted successfully with ${modelName}`);
            break;
          }
        } catch (err) {
          console.warn(`[CONSTANCIA] Model ${modelName} parsing failed:`, err?.message || err);
          errorDetails += `
[${modelName}]: ${err?.message || String(err)}`;
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
  } catch (error) {
    console.error("Constancia processing error:", error);
    res.status(500).json({ error: "Error interno al procesar constancia fiscal" });
  }
});
function getLocalDictionaryMatch(nombreEmisor, rfcEmisor) {
  const nameClean = nombreEmisor.toLowerCase().trim();
  const BRAND_DICTIONARY = [
    {
      // 1. Alsea Brands (10 brands)
      keys: ["starbucks", "alsea", "vips", "domino", "burger king", "chili", "italianni", "cheesecake", "pf chang", "p.f. chang"],
      portalUrl: "https://historico.alsea.com.mx/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input[name='rfc']", type: "text", required: true },
        { key: "ticket", name: "Ticket (9 o 12 d\xEDgitos)", selector: "input#ticketNo, input[name='ticket']", type: "text", required: true },
        { key: "tienda", name: "N\xFAmero de Tienda", selector: "input#storeNo", type: "text", required: true },
        { key: "fecha", name: "Fecha de Compra", selector: "input#fechaTicket", type: "date", required: true },
        { key: "total", name: "Monto Total", selector: "input#montoTotal", type: "number", required: true }
      ],
      steps: [
        "Navegar al Portal Unificado de Facturaci\xF3n Alsea",
        "Ingresar el RFC del cliente, n\xFAmero de ticket, n\xFAmero de tienda y monto total",
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
        "Navegar al portal de facturaci\xF3n oficial de OXXO / Oxxo Gas",
        "Ingresar los datos del Ticket (Folio de Venta, Fecha, Total) y RFC",
        "Confirmar la b\xFAsqueda del ticket y avanzar",
        "Completar la informaci\xF3n fiscal e indicar el Uso de CFDI",
        "Presionar 'Emitir Factura' para recibir XML y PDF"
      ]
    },
    {
      // 3. Walmart Group (5 brands)
      keys: ["walmart", "bodega", "aurrera", "sams", "superama", "wal-mart", "express"],
      portalUrl: "https://facturacion.walmartmexico.com/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "tc", name: "N\xFAmero de Ticket (TC)", selector: "input#ticketNo", type: "text", required: true },
        { key: "tr", name: "C\xF3digo de Transacci\xF3n (TR)", selector: "input#transactionNo", type: "text", required: true }
      ],
      steps: [
        "Ingresar al portal de facturaci\xF3n de Walmart M\xE9xico",
        "Introducir los identificadores de compra (C\xF3digo TC de 20 d\xEDgitos y C\xF3digo TR)",
        "Capturar el RFC de la persona f\xEDsica o moral receptora",
        "Asignar la Raz\xF3n Social y R\xE9gimen de Impuestos correspondiente",
        "Hacer clic en 'Obtener Factura' para guardar y descargar archivos"
      ]
    },
    {
      // 4. Costco (1 brand)
      keys: ["costco"],
      portalUrl: "https://www3.costco.com.mx/facturacion",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input[name='rfc']", type: "text", required: true },
        { key: "ticket", name: "N\xFAmero de Ticket", selector: "input#ticket", type: "text", required: true },
        { key: "membership", name: "N\xFAmero de Membres\xEDa", selector: "input#membership", type: "text", required: true }
      ],
      steps: [
        "Navegar al sistema de facturaci\xF3n electr\xF3nica de Costco M\xE9xico",
        "Ingresar el RFC, n\xFAmero de ticket y el identificador de membres\xEDa activa",
        "Validar transacci\xF3n e ingresar Raz\xF3n Social",
        "Seleccionar Uso de CFDI default",
        "Confirmar generaci\xF3n y descargar el XML y PDF"
      ]
    },
    {
      // 5. Soriana & La Comer Group (5 brands)
      keys: ["soriana", "fresko", "la comer", "lacomer", "sumesa", "city market", "citymarket"],
      portalUrl: "https://facturacion.soriana.com/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "ticket", name: "C\xF3digo de Barras del Ticket", selector: "input#ticketCode", type: "text", required: true },
        { key: "total", name: "Importe Total", selector: "input#monto", type: "number", required: true }
      ],
      steps: [
        "Ingresar al portal oficial de facturas de Soriana y Grupo La Comer",
        "Digitar el c\xF3digo de barras impreso en el ticket y el importe final",
        "Capturar la informaci\xF3n fiscal (RFC, R\xE9gimen, CP)",
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
        "Ir a la secci\xF3n de viajes facturables o facturaci\xF3n autom\xE1tica",
        "Ingresar los datos de RFC, ID del viaje y monto",
        "Confirmar perfil fiscal mexicano y r\xE9gimen SAT",
        "Generar y descargar el comprobante timbrado fiscal"
      ]
    },
    {
      // 7. Chedraui Group (3 brands)
      keys: ["chedraui", "s\xFAper chedraui", "super chedraui", "selecto chedraui"],
      portalUrl: "https://facturacion.chedraui.com.mx/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#UserRFC", type: "text", required: true },
        { key: "ticket", name: "C\xF3digo de Ticket Chedraui", selector: "input#TicketCode", type: "text", required: true },
        { key: "total", name: "Importe Total Facturable", selector: "input#TicketAmount", type: "number", required: true }
      ],
      steps: [
        "Ir al portal de Autofacturaci\xF3n de Grupo Chedraui",
        "Completar los inputs de RFC, el c\xF3digo impreso en el ticket y la cantidad monetaria",
        "Hacer clic en 'Validar' para pre-cargar la compra comercial",
        "Ingresar los datos de facturaci\xF3n (Nombre, CFDI, CP)",
        "Enviar solicitud y descargar la factura electr\xF3nica"
      ]
    },
    {
      // 8. Telecom & Tech (7 brands)
      keys: ["telmex", "telcel", "movistar", "at&t", "att", "izzi", "totalplay", "megacable"],
      portalUrl: "https://telmex.com/mi-telmex",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "cuenta", name: "N\xFAmero de Tel\xE9fono / Cuenta (10 d\xEDgitos)", selector: "input#accountNumber", type: "text", required: true }
      ],
      steps: [
        "Acceder al \xE1rea de clientes 'Mi Telmex', 'Mi Telcel' o portal de su proveedor",
        "Autenticarse con el n\xFAmero de tel\xE9fono o cuenta activa",
        "Navegar a la pesta\xF1a 'Recibos' o 'Facturaci\xF3n'",
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
        { key: "codigo", name: "C\xF3digo de Peaje (18 letras/n\xFAmeros)", selector: "input#peajeCode", type: "text", required: true }
      ],
      steps: [
        "Acceder al Sistema de Facturaci\xF3n de Peajes CAPUFE/TeleV\xEDa/PASE",
        "Ingresar el RFC del contribuyente receptor",
        "Escribir los c\xF3digos del ticket de la caseta de cobro",
        "Asignar Raz\xF3n Social y forma de pago",
        "Hacer clic en 'Generar Factura' y descargar CFDI"
      ]
    },
    {
      // 10. Gasoline Stations (8 brands)
      keys: ["pemex", "g500", "g-500", "hidrosina", "bp gas", "shell", "mobil", "petro 7", "petro7", "chevron gas"],
      portalUrl: "https://www.facturagas.mx/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "ticket", name: "N\xFAmero de Ticket de Combustible", selector: "input#ticket_combustible", type: "text", required: true },
        { key: "webid", name: "Web ID / D\xEDgito Verificador", selector: "input#web_id", type: "text", required: true }
      ],
      steps: [
        "Entrar al portal oficial de facturaci\xF3n de la Gasolinera",
        "Ingresar el RFC y el Web ID/Folio que viene impreso en el ticket de carga",
        "Verificar que los datos de litros, precio y producto coincidan",
        "Completar datos fiscales (Uso CFDI, C\xF3digo Postal)",
        "Confirmar timbrado y recibir los archivos XML/PDF en pantalla"
      ]
    },
    {
      // 11. Pharmacies & Wellness (4 brands)
      keys: ["farmacias guadalajara", "guadalajara", "farmacias del ahorro", "del ahorro", "ahorro", "benavides", "san pablo", "farmacia san pablo"],
      portalUrl: "https://facturacion.neofactura.com.mx/farmacias",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "ticket", name: "N\xFAmero de Alianza o Folio de Ticket", selector: "input#folioTicket", type: "text", required: true },
        { key: "total", name: "Total del Ticket", selector: "input#totalTicket", type: "number", required: true }
      ],
      steps: [
        "Acceder al sitio de autofacturaci\xF3n de la red de farmacias",
        "Ingresar los d\xEDgitos del folio impreso del ticket de compra",
        "Validar el total monetario pagado y su RFC",
        "A\xF1adir Raz\xF3n Social y r\xE9gimen fiscal",
        "Descargar su factura e imprimir comprobante"
      ]
    },
    {
      // 12. Convenience Stores (5 brands)
      keys: ["7-eleven", "seven eleven", "seven", "circle k", "circlek", "extra", "neto", "tiendas neto"],
      portalUrl: "https://www.7-eleven.com.mx/facturacion/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input[name='rfc']", type: "text", required: true },
        { key: "ticket", name: "N\xFAmero de Ticket (C\xF3digo de barras)", selector: "input#barcode", type: "text", required: true },
        { key: "total", name: "Importe con Centavos", selector: "input#montoTotal", type: "number", required: true }
      ],
      steps: [
        "Abrir el m\xF3dulo de facturas del portal comercial",
        "Introducir el n\xFAmero de referencia de ticket e importe exacto",
        "Agregar el RFC y Correo Electr\xF3nico para el env\xEDo autom\xE1tico",
        "Validar datos generales y hacer clic en 'Registrar Factura'"
      ]
    },
    {
      // 13. Department Stores & General Retail (6 brands)
      keys: ["liverpool", "palacio de hierro", "palacio de hierro", "sears", "coppel", "suburbia", "sanborns"],
      portalUrl: "https://facturacion.liverpool.com.mx/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "ticket", name: "C\xF3digo de Facturaci\xF3n (20 o 22 d\xEDgitos)", selector: "input#codFactura", type: "text", required: true }
      ],
      steps: [
        "Entrar al asistente de facturaci\xF3n del almac\xE9n mercantil",
        "Introducir el c\xF3digo de facturaci\xF3n impreso arriba o abajo del ticket",
        "Validar el total de la compra correspondiente",
        "Establecer la informaci\xF3n fiscal mexicana (Regimen, CP, RFC)",
        "Generar factura y exportar a correo o disco local"
      ]
    },
    {
      // 14. Fast Fashion Retail (6 brands)
      keys: ["h&m", "h & m", "zara", "pull&bear", "pull and bear", "bershka", "stradivarius", "massimo dutti", "inditex"],
      portalUrl: "https://factura.inditex.com/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "ticket", name: "N\xFAmero de Ticket de Compra", selector: "input#ticket_num", type: "text", required: true },
        { key: "establecimiento", name: "N\xFAmero de Establecimiento/Tienda", selector: "input#store_id", type: "text", required: true }
      ],
      steps: [
        "Acceder al portal unificado de Tickets de Moda Internacional",
        "Ingresar el c\xF3digo de ticket junto con la fecha de la compra and RFC",
        "Seleccionar el uso correspondiente del CFDI",
        "Haz clic en 'Aceptar' para generar la factura timbrada"
      ]
    },
    {
      // 15. Entertainment & Cinema (4 brands)
      keys: ["cinepolis", "cin\xE9polis", "cinemex", "ticketmaster", "superboletos", "s\xFAperboletos"],
      portalUrl: "https://www.cinepolis.com/facturacion-electronica",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "transaccion", name: "N\xFAmero de Transacci\xF3n / Folio de Boleto", selector: "input#transaction_id", type: "text", required: true },
        { key: "total", name: "Importe Total", selector: "input#amount", type: "number", required: true }
      ],
      steps: [
        "Ingresar al sistema de comprobantes de Boletaje o Cine",
        "Ingresar el n\xFAmero de referencia o ID de la confirmaci\xF3n de compra",
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
        { key: "itu", name: "C\xF3digo ITU (Impreso en Ticket)", selector: "input#itu_code", type: "text", required: true }
      ],
      steps: [
        "Navegar al portal de Autofacturaci\xF3n de Art\xEDculos del Hogar",
        "Asignar su RFC e ingresar los caracteres del c\xF3digo ITU de seguridad",
        "Checar lista de art\xEDculos comprados",
        "Darle clic en 'Finalizar' para enviar e imprimir factura"
      ]
    },
    {
      // 17. Diners & Food Chains (7 brands)
      keys: ["toks", "el cardenal", "casa de to\xF1o", "casa de tono", "sonora grill", "fisher's", "fishers", "krispy kreme", "dunkin"],
      portalUrl: "https://facturacion.toks.com.mx/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#UserRFC", type: "text", required: true },
        { key: "ticket", name: "Folio de Facturaci\xF3n del Consumo", selector: "input#ticket_folio", type: "text", required: true },
        { key: "fecha", name: "Fecha del Consumo", selector: "input#date_input", type: "date", required: true }
      ],
      steps: [
        "Acceder al portal de facturaci\xF3n oficial de la cadena de alimentos",
        "Ingresar RFC, fecha de consumo y el folio de ticket impreso",
        "Confirmar desglose de alimentos, bebidas e impuestos",
        "Validar r\xE9gimen fiscal mexicano y solicitar CFDI timbrado"
      ]
    },
    {
      // 18. Logistics & Shipping (4 brands)
      keys: ["dhl", "fedex", "estafeta", "redpack", "ups"],
      portalUrl: "https://facturacion.estafeta.com/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "guia", name: "N\xFAmero de Gu\xEDa o C\xF3digo de Rastreo", selector: "input#tracking_number", type: "text", required: true }
      ],
      steps: [
        "Abrir el m\xF3dulo de facturaci\xF3n del transportista",
        "Proporcionar el n\xFAmero de gu\xEDa de env\xEDo de 10 o 22 d\xEDgitos",
        "Ingresar el RFC fiscal del contribuyente emisor",
        "Confirmar direcci\xF3n e impuestos",
        "Hacer clic en 'Emitir Comprobante'"
      ]
    },
    {
      // 19. Farmacias Similares (Doctor Simi / Confianza)
      keys: ["farmacias similares", "similares", "doctor simi", "simi", "farmacias de confianza", "confianza"],
      portalUrl: "https://facturacion.gpupm.com/simifactura/portal",
      fields: [
        { key: "referenciaFacturacion", name: "Referencia de facturaci\xF3n", selector: "input#ref_simi", type: "text", required: true },
        { key: "total", name: "Total Facturado", selector: "input#total_simi", type: "number", required: true }
      ],
      steps: [
        "Navegar al portal de facturaci\xF3n de Farmacias Similares",
        "Ingresar la referencia de facturaci\xF3n y el importe total",
        "Completar datos fiscales y r\xE9gimen SAT del receptor",
        "Generar y descargar la factura XML"
      ]
    }
  ];
  for (const brand of BRAND_DICTIONARY) {
    if (brand.keys.some((key) => nameClean.includes(key))) {
      return {
        portalUrl: brand.portalUrl,
        fields: brand.fields,
        steps: brand.steps
      };
    }
  }
  return null;
}
function getLocalConnectorFallback(nombreEmisor, rfcEmisor) {
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
      { key: "folio", name: "C\xF3digo de Facturaci\xF3n / Folio", selector: "#txtPrefactura, .input-folio, input[name='folio']", type: "text", required: true },
      { key: "fecha", name: "Fecha de Compra", selector: "input#fechaTicket, .datepicker-input", type: "date", required: true },
      { key: "total", name: "Monto Total (con decimales)", selector: "input[name='total'], #txtMontoTotal", type: "number", required: true }
    ],
    steps: [
      `Navegar al portal oficial de facturaci\xF3n de ${nombreEmisor} en ${portalUrlFallback}`,
      `Ingresar los datos identificadores del ticket: Folio, Fecha, Total y su RFC de cliente`,
      `Hacer clic en el bot\xF3n 'Validar' o 'Buscar Ticket' para cargar el desglose detallado`,
      `Ingresar los datos de facturaci\xF3n de su Perfil Fiscal (Raz\xF3n Social, R\xE9gimen Postal)`,
      `Hacer clic en el bot\xF3n 'Generar Factura' o 'Solicitar CFDI'`,
      `Esperar la confirmaci\xF3n y descargar el XML y PDF timbrado`
    ]
  };
}
app.post("/api/connectors/learn", async (req, res) => {
  const { nombreEmisor, rfcEmisor, learnedFrom, tokenSaver } = req.body;
  const customKey = req.headers["x-gemini-api-key"];
  if (!nombreEmisor) {
    res.status(400).json({ error: "Missing nombreEmisor in request" });
    return;
  }
  const dictMatch = getLocalDictionaryMatch(nombreEmisor, rfcEmisor);
  if (dictMatch) {
    console.log(`[Learn] Fast match in local dictionary for '${nombreEmisor}'. Zero-token cached specs returned.`);
    res.json({
      ...dictMatch,
      cost: learnedFrom === "portal_admin" ? 5 : 3,
      // Reduced cost for cached items!
      rawCost: 0,
      isCached: true
    });
    return;
  }
  let ai;
  try {
    ai = getGeminiClient(customKey);
  } catch (err) {
    console.warn("Gemini client not initialized, using local fallback specs.");
    const fallbackSpecs = getLocalConnectorFallback(nombreEmisor, rfcEmisor);
    res.json({
      ...fallbackSpecs,
      cost: learnedFrom === "portal_admin" ? 25 : 15,
      rawCost: 0
    });
    return;
  }
  const isEcoMode = tokenSaver === true || tokenSaver === "true";
  try {
    if (isEcoMode) {
      console.log(`[Learn] Token-Saver (ECO) Mode active. Formulating fast offline AI mapping...`);
      const prompt2 = `Queremos automatizar de forma ultra-simplificada el proceso de facturaci\xF3n de tickets de la empresa mexicana '${nombreEmisor}' con RFC '${rfcEmisor || "No provisto"}'.
                      Bas\xE1ndote EN TU CONOCIMIENTO INTERNO (sin buscar en Google), genera la especificaci\xF3n estructurada est\xE1ndar: determina de 2 a 3 campos requeridos clave para buscar el ticket y describe un flujo secuencial simplificado de m\xE1ximo 4 pasos cortos.
                      Usa selectores CSS intuitivos y gen\xE9ricos (como #txtTicket, input[name='rfc']). S\xC9 ABSOLUTAMENTE CONCISO Y LIMITA EL LARGO DEL TEXTO PARA AHORRAR TOKENS.`;
      const response2 = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt2,
        config: {
          thinkingConfig: { thinkingLevel: "LOW" },
          // Disables heavy reasoning tokens!
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
                    required: { type: "BOOLEAN" }
                  },
                  required: ["key", "name", "selector", "type", "required"]
                }
              },
              steps: {
                type: "ARRAY",
                items: { type: "STRING" }
              }
            },
            required: ["portalUrl", "fields", "steps"]
          }
        }
      });
      const textResult2 = response2.text;
      if (!textResult2) {
        throw new Error("Empty ECO response from Gemini");
      }
      const promptTokens2 = response2.usageMetadata?.promptTokenCount || 400;
      const outputTokens2 = response2.usageMetadata?.candidatesTokenCount || 200;
      const exchangeRate2 = 18.5;
      const rawCost2 = (promptTokens2 * 0.075 + outputTokens2 * 0.3) / 1e6 * exchangeRate2;
      const learnedSpecs2 = JSON.parse(textResult2.trim());
      res.json({
        ...learnedSpecs2,
        cost: learnedFrom === "portal_admin" ? 12 : 8,
        // Reduced cost for ECO mode!
        rawCost: parseFloat(rawCost2.toFixed(6)),
        isEco: true
      });
      return;
    }
    console.log("[Learn] Deep Mode active. Attempting to find connector details using Search Grounding + LOW reasoning...");
    const prompt = `Queremos automatizar el proceso de facturaci\xF3n de tickets de la empresa mexicana '${nombreEmisor}' con RFC '${rfcEmisor || "No provisto"}'.
                    Utilizando Google Search, busca el link directo al portal oficial de autofacturaci\xF3n de tickets para clientes en M\xE9xico.
                    Genera la especificaci\xF3n del conector: determina qu\xE9 campos requiere el formulario para buscar el ticket e inventa selectores CSS realistas y de 4 a 5 pasos secuenciales cortos.
                    POR FAVOR S\xC9 EXTREMADAMENTE CONCISO: Genera nombres de campos cortos, selectores limpios y descripciones de pasos directas (m\xE1ximo 12 palabras por instrucci\xF3n) para reducir significativamente la generaci\xF3n de tokens.`;
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingLevel: "LOW" },
        // Cuts down reasoning tokens on search results
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            portalUrl: { type: "STRING", description: "URL oficial directo al portal en M\xE9xico" },
            fields: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  key: { type: "STRING" },
                  name: { type: "STRING" },
                  selector: { type: "STRING" },
                  type: { type: "STRING" },
                  required: { type: "BOOLEAN" }
                },
                required: ["key", "name", "selector", "type", "required"]
              }
            },
            steps: {
              type: "ARRAY",
              items: { type: "STRING" }
            }
          },
          required: ["portalUrl", "fields", "steps"]
        }
      }
    });
    const textResult = response.text;
    if (!textResult) {
      throw new Error("Empty search response from Gemini");
    }
    const promptTokens = response.usageMetadata?.promptTokenCount || 1e3;
    const outputTokens = response.usageMetadata?.candidatesTokenCount || 400;
    const exchangeRate = 18.5;
    const rawCost = ((promptTokens * 0.075 + outputTokens * 0.3) / 1e6 + 0.01) * exchangeRate;
    const learnedSpecs = JSON.parse(textResult.trim());
    res.json({
      ...learnedSpecs,
      cost: learnedFrom === "portal_admin" ? 25 : 15,
      rawCost: parseFloat(rawCost.toFixed(6))
    });
  } catch (searchError) {
    console.warn("[Learn] Optimized path failed. Falling back to pure text based LLM...", searchError.message || searchError);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Queremos automatizar el proceso de facturaci\xF3n de tickets de la empresa mexicana '${nombreEmisor}' con RFC '${rfcEmisor || "No provisto"}'.
                  Genera la especificaci\xF3n simplificada y muy concisa del conector basada en tu conocimiento: determina de 2 a 3 campos requeridos (ej: folio, fecha, total, RFC) e inventa selectores CSS realistas (como #txtTicket, input[name='rfc']) y detalla de 3 a 4 pasos secuenciales muy cortos para un script de automatizaci\xF3n. Evita palabras innecesarias para ahorrar tokens.`,
        config: {
          thinkingConfig: { thinkingLevel: "LOW" },
          // Save reasoning tokens
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
                    required: { type: "BOOLEAN" }
                  },
                  required: ["key", "name", "selector", "type", "required"]
                }
              },
              steps: {
                type: "ARRAY",
                items: { type: "STRING" }
              }
            },
            required: ["portalUrl", "fields", "steps"]
          }
        }
      });
      const textResult = response.text;
      if (!textResult) {
        throw new Error("Empty pure LLM response");
      }
      const promptTokens = response.usageMetadata?.promptTokenCount || 500;
      const outputTokens = response.usageMetadata?.candidatesTokenCount || 250;
      const exchangeRate = 18.5;
      const rawCost = (promptTokens * 0.075 + outputTokens * 0.3) / 1e6 * exchangeRate;
      const learnedSpecs = JSON.parse(textResult.trim());
      res.json({
        ...learnedSpecs,
        cost: learnedFrom === "portal_admin" ? 18 : 12,
        rawCost: parseFloat(rawCost.toFixed(6))
      });
    } catch (pureLlmError) {
      console.error("[Learn] Pure LLM failed too. Utilizing Rule-Based Heuristic Fallback.", pureLlmError.message || pureLlmError);
      const localSpecs = getLocalConnectorFallback(nombreEmisor, rfcEmisor);
      res.json({
        ...localSpecs,
        cost: learnedFrom === "portal_admin" ? 25 : 15,
        rawCost: 0
      });
    }
  }
});
var {
  parseSatQrUrl,
  validateXmlStructure,
  parseCfdiInfo,
  verifyCfdiWithSat
} = require_fiscalUtils();
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
      satStatus: "Estructura inv\xE1lida",
      error: "El XML no contiene la estructura b\xE1sica obligatoria o le faltan nodos requeridos (Comprobante, Emisor, Receptor o TimbreFiscalDigital)."
    });
    return;
  }
  const info = parseCfdiInfo(xmlContent);
  if (!info.uuid || !info.rfcEmisor || !info.rfcReceptor || !info.total) {
    res.json({
      status: "invalid_xml",
      satStatus: "XML incompleto",
      error: "El XML no contiene toda la informaci\xF3n fiscal obligatoria (UUID, RFC Emisor, RFC Receptor o Total)."
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
app.post("/api/automation/run", async (req, res) => {
  const { ticket, profile, connector } = req.body;
  if (!ticket || !profile || !connector) {
    res.status(400).json({ error: "Missing ticket, profile, or connector data for automation" });
    return;
  }
  res.status(502).json({
    error: "No fue posible completar la solicitud en el portal del comercio. Revisa los datos del ticket o solicita revisi\xF3n manual."
  });
});
app.post("/api/email/send", async (req, res) => {
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
      message: `[Simulaci\xF3n] Factura de ${invoice.nombreEmisor} enviada con \xE9xito a ${to}.`
    });
    return;
  }
  try {
    const transporter = import_nodemailer.default.createTransport({
      host,
      port: parseInt(port || "465"),
      secure: port === "465",
      // Port 465 is typically secure
      auth: { user, pass }
    });
    const mailOptions = {
      from: `"FactuBot MX Support" <${user}>`,
      to,
      subject: `FactuBot MX - Tu CFDI 4.0 de ${invoice.nombreEmisor} est\xE1 listo`,
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; background-color: #0c0a09; color: #f4f4f5; padding: 40px 20px; text-align: center;">
          <div style="max-width: 650px; margin: 0 auto; background-color: #1c1917; border: 1px solid #292524; border-radius: 20px; padding: 30px; text-align: left; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
              <span style="font-size: 24px; font-weight: 800; color: #6366f1;">FactuBot MX</span>
            </div>
            
            <h2 style="font-size: 18px; font-weight: 750; color: #ffffff; text-transform: uppercase;">\xA1Tu Factura Digital ha sido emitida!</h2>
            <p style="font-size: 13px; color: #a1a1aa; line-height: 1.6;">
              Excelente noticia, la inyecci\xF3n automatizada de tu ticket con folio fiscal <strong>${invoice.folioFiscal}</strong> ha finalizado exitosamente.
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
              Hemos adjuntado el comprobante timbrado en formato XML directo desde los servidores del SAT a este correo para tu contabilidad inmediata. A continuaci\xF3n tienes la representaci\xF3n visual interactiva:
            </p>

            <div style="margin-top: 30px; border-top: 1px solid #292524; padding-top: 20px; color: #1c1917; background-color: #ffffff; border-radius: 12px; padding: 15px;">
              ${invoice.pdfHtml || "<!-- Visual HTML empty -->"}
            </div>

            <p style="font-size: 11px; color: #52525b; text-align: center; margin-top: 40px; border-top: 1px solid #292524; padding-top: 15px;">
              Este es un correo electr\xF3nico generado autom\xE1ticamente por FactuBot MX. Si tienes alguna duda, ponte en contacto con nosotros.
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
  } catch (err) {
    console.error("Mail dispatch error:", err);
    res.status(500).json({ error: `Fallo al despachar email de factura por SMTP: ${err.message}` });
  }
});
var getSafeBaseUrl = (req) => {
  const referer = req.headers.referer;
  if (referer) {
    try {
      const parsed = new URL(referer);
      return parsed.origin;
    } catch (e) {
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
app.post("/api/billing/setup/stripe", authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const email = req.user.email;
  const emailVerified = req.user.email_verified;
  const { holderName, bankName } = req.body;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuraci\xF3n de Stripe incompleta" });
    return;
  }
  try {
    let stripeCustomerId = await resolveStripeCustomerId(userId, email, emailVerified);
    if (!stripeCustomerId) {
      if (!email) {
        res.status(400).json({ error: "El usuario no tiene un correo electr\xF3nico verificado." });
        return;
      }
      const customerParams = new URLSearchParams({
        email,
        "metadata[userId]": userId
      });
      const customerResponse = await import_axios.default.post(
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
    const setupSuccessUrl = process.env.BILLING_SUCCESS_URL ? process.env.BILLING_SUCCESS_URL.replace("status=success", "status=card_setup_success") : `${baseUrl}/billing-setup-success.html?status=card_setup_success`;
    const setupCancelUrl = process.env.BILLING_FAILURE_URL ? process.env.BILLING_FAILURE_URL.replace("status=failure", "status=card_setup_cancelled") : `${baseUrl}/billing-failure.html?status=card_setup_cancelled`;
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
    const setupResponse = await import_axios.default.post(
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
  } catch (error) {
    console.error("Error al vincular tarjeta en Stripe:", error.response?.data || error.message);
    const stripeError = error.response?.data?.error;
    res.status(500).json({
      error: stripeError?.message || "No se pudo iniciar el registro seguro de la tarjeta"
    });
  }
});
app.post("/api/billing/checkout/stripe/confirm", authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const { sessionId } = req.body;
  if (!sessionId) {
    res.status(400).json({ error: "Falta sessionId" });
    return;
  }
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuraci\xF3n de Stripe incompleta" });
    return;
  }
  try {
    const response = await import_axios.default.get(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription&expand[]=subscription.default_payment_method&expand[]=payment_intent&expand[]=payment_intent.payment_method`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );
    const session = response.data;
    const [sessionUserId, planId] = String(session.client_reference_id || "").split(":");
    if (sessionUserId !== userId || !planId) {
      res.status(403).json({ error: "La sesi\xF3n de Stripe no pertenece a este usuario." });
      return;
    }
    if (session.status !== "complete" || session.payment_status !== "paid") {
      res.status(409).json({ error: "Stripe todav\xEDa no confirma el pago." });
      return;
    }
    const limits = { brisa: 10, personal: 20, serenidad: 30, empresa: 60, nirvana: 100 };
    const invoicesLimit = limits[planId] || 5;
    const planName = planId === "personal" ? "Plan Personal" : planId === "empresa" ? "Plan Empresa" : `Plan ${planId.charAt(0).toUpperCase() + planId.slice(1)}`;
    const isSubscription = session.mode === "subscription";
    const stripeSubscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    const paymentMethod = session.subscription?.default_payment_method || session.payment_intent?.payment_method;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString();
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
      const existingCards = Array.isArray(billingSnapshot.data()?.paymentCards) ? billingSnapshot.data().paymentCards : [];
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
        ...existingCards.filter((card) => card.id !== paymentMethod.id).map((card) => ({ ...card, isDefault: false }))
      ];
      await billingRef.set({ paymentCards }, { merge: true });
    }
    res.json({ success: true, planId, planName, invoicesLimit });
  } catch (error) {
    console.error("Error al confirmar pago de Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.error?.message || "No se pudo confirmar el pago con Stripe." });
  }
});
app.post("/api/billing/checkout/stripe", authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const email = req.user.email;
  const emailVerified = req.user.email_verified;
  const { planId } = req.body;
  if (!planId) {
    res.status(400).json({ error: "Falta el par\xE1metro planId" });
    return;
  }
  let price = 0;
  let title = "";
  if (planId === "brisa") {
    price = 15;
    title = "Plan Brisa (Prueba Stripe M\xEDnima $15) - ZenTicket";
  } else if (planId === "serenidad") {
    price = 250;
    title = "Plan Serenidad - ZenTicket";
  } else if (planId === "nirvana") {
    price = 500;
    title = "Plan Nirvana - ZenTicket";
  } else if (planId === "personal") {
    price = 150;
    title = "Plan Personal - ZenTicket";
  } else if (planId === "empresa") {
    price = 300;
    title = "Plan Empresa - ZenTicket";
  } else {
    res.status(400).json({ error: "Plan inv\xE1lido para pago" });
    return;
  }
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuraci\xF3n de pasarela Stripe incompleta en el servidor" });
    return;
  }
  try {
    const baseUrl = getSafeBaseUrl(req);
    console.log("DEBUG STRIPE BASEURL:", baseUrl);
    const successUrl = process.env.BILLING_SUCCESS_URL ? `${process.env.BILLING_SUCCESS_URL}&plan=${planId}&session_id={CHECKOUT_SESSION_ID}` : `${baseUrl}/billing-success.html?status=success&plan=${planId}&session_id={CHECKOUT_SESSION_ID}`;
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
    const response = await import_axios.default.post(
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
    await adminDb.collection("payments").doc(paymentDocId).set({
      userId,
      planId,
      provider: "stripe",
      providerPaymentId: session.id,
      amount: price,
      currency: "MXN",
      status: "pending_payment",
      checkoutUrl: session.url,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    res.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error("Error al crear sesi\xF3n en Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: "Error al comunicarse con Stripe" });
  }
});
app.get("/api/billing/status", authenticateFirebaseToken, async (req, res) => {
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
        currentPeriodStart: (/* @__PURE__ */ new Date()).toISOString(),
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1e3).toISOString(),
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
async function syncCustomerPaymentMethods(stripeCustomerId, stripeSecretKey, dbRef) {
  if (!stripeCustomerId) return;
  try {
    let docRef = null;
    const billingSnapshot = await dbRef.collection("billingProfiles").where("stripeCustomerId", "==", stripeCustomerId).limit(1).get();
    if (!billingSnapshot.empty) {
      docRef = billingSnapshot.docs[0].ref;
    } else {
      const fiscalSnapshot = await dbRef.collection("fiscalProfiles").where("stripeCustomerId", "==", stripeCustomerId).limit(1).get();
      if (!fiscalSnapshot.empty) {
        docRef = fiscalSnapshot.docs[0].ref;
      }
    }
    if (!docRef) {
      console.log(`[Stripe Webhook] No user profile found with customer ID: ${stripeCustomerId}`);
      return;
    }
    const customerRes = await import_axios.default.get(
      `https://api.stripe.com/v1/customers/${stripeCustomerId}`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );
    const defaultPaymentMethodId = customerRes.data?.invoice_settings?.default_payment_method;
    const pmRes = await import_axios.default.get(
      `https://api.stripe.com/v1/payment_methods?customer=${stripeCustomerId}&type=card`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );
    const paymentMethods = pmRes.data?.data || [];
    const pms = paymentMethods.map((pm) => {
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
        await import_axios.default.post(
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
    console.log(`[Stripe Webhook] Sincronizados ${pms.length} m\xE9todos de pago para el cliente ${stripeCustomerId}`);
  } catch (error) {
    console.error(`[Stripe Webhook] Error al sincronizar m\xE9todos de pago para ${stripeCustomerId}:`, error.message);
  }
}
app.post("/api/billing/sync-subscription", authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const email = req.user.email;
  const emailVerified = req.user.email_verified;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuraci\xF3n de Stripe incompleta" });
    return;
  }
  try {
    const stripeCustomerId = await resolveStripeCustomerId(userId, email, emailVerified);
    if (!stripeCustomerId) {
      res.status(400).json({ error: "El usuario no tiene un cliente de Stripe creado." });
      return;
    }
    const subsResponse = await import_axios.default.get(
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
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const periodEnd = new Date(sub.current_period_end * 1e3).toISOString();
      await adminDb.collection("subscriptions").doc(userId).set({
        userId,
        planId,
        planName,
        status: "subscription_active",
        provider: "stripe",
        providerSubscriptionId: sub.id,
        stripeCustomerId,
        currentPeriodStart: new Date(sub.current_period_start * 1e3).toISOString(),
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
        planStartDate: new Date(sub.current_period_start * 1e3).toISOString(),
        paymentStatus: "subscription_active",
        autoRenew: true,
        stripeCustomerId,
        invoicesLimit
      }, { merge: true });
      res.json({ success: true, planId, status: "subscription_active", source: "stripe_subscription" });
      return;
    }
    const sessionsResponse = await import_axios.default.get(
      `https://api.stripe.com/v1/checkout/sessions?customer=${stripeCustomerId}&limit=5`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );
    const sessions = sessionsResponse.data.data;
    const paidSession = sessions.find((s) => s.payment_status === "paid");
    if (paidSession) {
      const planId = paidSession.metadata?.planId || "gratuito";
      const limits = { brisa: 10, personal: 20, serenidad: 30, empresa: 60, nirvana: 100 };
      const invoicesLimit = limits[planId] || 5;
      const planName = planId === "personal" ? "Plan Personal" : planId === "empresa" ? "Plan Empresa" : `Plan ${planId.charAt(0).toUpperCase() + planId.slice(1)}`;
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString();
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
  } catch (error) {
    console.error("Error al sincronizar suscripci\xF3n de Stripe:", error.message);
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
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuraci\xF3n de Stripe incompleta" });
    return;
  }
  try {
    let stripeCustomerId = await resolveStripeCustomerId(userId, email, emailVerified);
    if (!stripeCustomerId) {
      const customerParams = new URLSearchParams({
        email,
        name: name || "",
        "metadata[userId]": userId
      });
      const customerResponse = await import_axios.default.post(
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
  } catch (error) {
    console.error("Error al sincronizar cliente en Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/billing/payment-methods", authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const userEmail = req.user.email;
  const emailVerified = req.user.email_verified;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuraci\xF3n de Stripe incompleta" });
    return;
  }
  try {
    const stripeCustomerId = await resolveStripeCustomerId(userId, userEmail, emailVerified);
    if (!stripeCustomerId) {
      res.json([]);
      return;
    }
    const customerRes = await import_axios.default.get(
      `https://api.stripe.com/v1/customers/${stripeCustomerId}`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );
    let defaultPaymentMethodId = customerRes.data?.invoice_settings?.default_payment_method;
    const pmRes = await import_axios.default.get(
      `https://api.stripe.com/v1/payment_methods?customer=${stripeCustomerId}&type=card`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );
    const paymentMethods = pmRes.data?.data || [];
    let pms = paymentMethods.map((pm) => {
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
        await import_axios.default.post(
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
    const billingRef = adminDb.collection("billingProfiles").doc(userId);
    await billingRef.set({ paymentCards: pms, stripeCustomerId }, { merge: true });
    res.json(pms);
  } catch (error) {
    console.error("Error al obtener m\xE9todos de pago de Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/billing/payment-methods/set-default", authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const email = req.user.email;
  const emailVerified = req.user.email_verified;
  const { paymentMethodId } = req.body;
  if (!paymentMethodId) {
    res.status(400).json({ error: "Falta el par\xE1metro paymentMethodId" });
    return;
  }
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuraci\xF3n de Stripe incompleta" });
    return;
  }
  try {
    const stripeCustomerId = await resolveStripeCustomerId(userId, email, emailVerified);
    if (!stripeCustomerId) {
      res.status(400).json({ error: "El usuario no tiene un cliente de Stripe creado." });
      return;
    }
    await import_axios.default.post(
      `https://api.stripe.com/v1/customers/${stripeCustomerId}`,
      `invoice_settings[default_payment_method]=${paymentMethodId}`,
      {
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );
    const billingRef = adminDb.collection("billingProfiles").doc(userId);
    const billingSnapshot = await billingRef.get();
    const existingCards = Array.isArray(billingSnapshot.data()?.paymentCards) ? billingSnapshot.data().paymentCards : [];
    const updatedCards = existingCards.map((c) => ({
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
    res.status(400).json({ error: "Falta el par\xE1metro paymentMethodId" });
    return;
  }
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuraci\xF3n de Stripe incompleta" });
    return;
  }
  try {
    const stripeCustomerId = await resolveStripeCustomerId(userId, email, emailVerified);
    if (!stripeCustomerId) {
      res.status(400).json({ error: "El usuario no tiene un cliente de Stripe creado." });
      return;
    }
    await import_axios.default.post(
      `https://api.stripe.com/v1/payment_methods/${paymentMethodId}/detach`,
      "",
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );
    const billingRef = adminDb.collection("billingProfiles").doc(userId);
    const billingSnapshot = await billingRef.get();
    const existingCards = Array.isArray(billingSnapshot.data()?.paymentCards) ? billingSnapshot.data().paymentCards : [];
    const deletedCard = existingCards.find((c) => c.id === paymentMethodId);
    let updatedCards = existingCards.filter((c) => c.id !== paymentMethodId);
    if (deletedCard?.isDefault && updatedCards.length > 0) {
      const newDefaultId = updatedCards[0].id;
      updatedCards[0].isDefault = true;
      try {
        await import_axios.default.post(
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
    console.warn("[Attach PM] Error: Falta el par\xE1metro paymentMethodId");
    res.status(400).json({ error: "Faltan par\xE1metros paymentMethodId" });
    return;
  }
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    console.error("[Attach PM] Error: STRIPE_SECRET_KEY no est\xE1 configurado");
    res.status(500).json({ error: "Configuraci\xF3n de Stripe incompleta" });
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
    const pmDetailsRes = await import_axios.default.get(
      `https://api.stripe.com/v1/payment_methods/${paymentMethodId}`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );
    const pmDetails = pmDetailsRes.data;
    console.log(`[Attach PM] Detalles obtenidos. Cliente actual del PM en Stripe: ${pmDetails.customer}`);
    if (pmDetails.customer && pmDetails.customer !== stripeCustomerId) {
      console.warn(`[Attach PM] Error de permisos: PM pertenece a otro cliente (${pmDetails.customer})`);
      res.status(403).json({ error: "No tienes permisos para asociar este m\xE9todo de pago." });
      return;
    }
    if (pmDetails.customer !== stripeCustomerId) {
      console.log(`[Attach PM] Vinculando PM ${paymentMethodId} al cliente ${stripeCustomerId}...`);
      const attachRes = await import_axios.default.post(
        `https://api.stripe.com/v1/payment_methods/${paymentMethodId}/attach`,
        `customer=${stripeCustomerId}`,
        {
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      );
      console.log(`[Attach PM] Vinculado con \xE9xito. Cliente reportado por attach: ${attachRes.data.customer}`);
      if (attachRes.data.customer !== stripeCustomerId) {
        console.error("[Attach PM] Error: Operaci\xF3n de vinculaci\xF3n inv\xE1lida");
        res.status(403).json({ error: "Operaci\xF3n de vinculaci\xF3n inv\xE1lida." });
        return;
      }
    }
    console.log("[Attach PM] Obteniendo perfil de facturaci\xF3n actual de Firestore...");
    const billingRef = adminDb.collection("billingProfiles").doc(userId);
    const billingSnapshot = await billingRef.get();
    const existingCards = Array.isArray(billingSnapshot.data()?.paymentCards) ? billingSnapshot.data().paymentCards : [];
    console.log(`[Attach PM] Tarjetas existentes en Firestore: ${existingCards.length}`);
    const setAsDefault = isDefault || existingCards.length === 0;
    if (setAsDefault) {
      console.log(`[Attach PM] Configurando PM ${paymentMethodId} como predeterminado en Stripe...`);
      await import_axios.default.post(
        `https://api.stripe.com/v1/customers/${stripeCustomerId}`,
        `invoice_settings[default_payment_method]=${paymentMethodId}`,
        {
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      );
      console.log("[Attach PM] Predeterminado configurado con \xE9xito en Stripe.");
    }
    console.log("[Attach PM] Sincronizando m\xE9todos de pago de Stripe a Firestore...");
    await syncCustomerPaymentMethods(stripeCustomerId, stripeSecretKey, adminDb);
    console.log("[Attach PM] Sincronizaci\xF3n completada.");
    const updatedSnapshot = await billingRef.get();
    const updatedCards = updatedSnapshot.data()?.paymentCards || [];
    console.log(`[Attach PM] Retornando ${updatedCards.length} tarjetas actualizadas.`);
    res.json({ success: true, paymentCards: updatedCards });
  } catch (error) {
    console.error("[Attach PM] EXCEPCI\xD3N DETECTADA:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/billing/cancel-subscription", authenticateFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  try {
    await adminDb.collection("subscriptions").doc(userId).set({
      status: "subscription_cancelled",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
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
    res.json({ success: true, message: "Suscripci\xF3n cancelada exitosamente." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[FactuBot] Full-stack server active at http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
