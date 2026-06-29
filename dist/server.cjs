var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
var import_nodemailer = __toESM(require("nodemailer"), 1);
var import_app = require("firebase-admin/app");
var import_firestore = require("firebase-admin/firestore");
var import_axios = __toESM(require("axios"), 1);
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
var app = (0, import_express.default)();
var PORT = process.env.PORT ? parseInt(process.env.PORT) : 3e3;
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
    const textPart = {
      text: "Analiza exhaustivamente esta fotograf\xEDa de un ticket de compra mexicano. Extrae con precisi\xF3n los datos y estructura el resultado exactamente seg\xFAn el esqueleto proporcionado. INSTRUCCI\xD3N CR\xCDTICA DE INTEGRIDAD: No asumes marcas populares (ej. OXXO, Walmart, Starbucks, etc.) si el ticket no pertenece expl\xEDcitamente a ellas. Si es una farmacia u otro comercio local (ej. Farmacias del Ahorro, Farmacias Guadalajara, farmacias locales, etc.), extrae fielmente el nombre exacto de la marca o raz\xF3n social impreso en la parte superior. Si el RFC no es legible o no se localiza, coloca 'XAXX010101000' en rfcEmisor, pero NUNCA inventes o asocies el RFC de otra franquicia para rellenar."
    };
    const responseSchema = {
      type: "OBJECT",
      properties: {
        rfcEmisor: { type: "STRING", description: "RFC del emisor de la tienda (12 o 13 car\xE1cteres). Si no viene o no es legible, coloca 'XAXX010101000'." },
        nombreEmisor: { type: "STRING", description: "Nombre comercial o raz\xF3n social de la tienda en may\xFAsculas (ej: FARMACIAS GUADALAJARA, OXXO, WALMART, TOKIO, STARBUCKS)" },
        fechaCompra: { type: "STRING", description: "Fecha de compra aproximada o exacta en formato YYYY-MM-DD" },
        folio: { type: "STRING", description: "Folio del ticket, ID de transacci\xF3n, c\xF3digo de facturaci\xF3n o referencia de ticket (ej: 0251846 o 4821-3921-1923)" },
        total: { type: "NUMBER", description: "Total monetario pagado en el ticket en pesos mexicanos" },
        sucursal: { type: "STRING", description: "Sucursal o ubicaci\xF3n donde se realiz\xF3 la compra" },
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
      required: ["rfcEmisor", "nombreEmisor", "fechaCompra", "folio", "total", "items"]
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
              model,
              contents: { parts: [imagePart, textPart] },
              config: {
                responseMimeType: "application/json",
                responseSchema
              }
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
          } catch (err) {
            const currentErr = err?.message || String(err);
            console.warn(`[OCR Warning] Model ${model} failed on attempt ${attempt}: ${currentErr}`);
            ocrErrorDetails += `
[${model} attempt ${attempt}]: ${currentErr}`;
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
      } catch (e) {
        console.warn("[OCR] Error parsing model response JSON:", e.message);
        fallbackToOcrMock = true;
      }
    } else {
      fallbackToOcrMock = true;
    }
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
    const cost = fallbackToOcrMock ? 0 : 0.5;
    let rawCost = 0;
    if (textResult) {
      const exchangeRate = 18.5;
      rawCost = (promptTokens * 0.075 + outputTokens * 0.3) / 1e6 * exchangeRate;
    }
    res.json({
      ...extractedData,
      cost,
      rawCost: parseFloat(rawCost.toFixed(6))
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
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16).toUpperCase();
  });
}
function escapeXml(unsafe) {
  if (typeof unsafe !== "string") return "";
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}
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
function generateLocalXml(ticket, profile, connector, folioFiscal) {
  const dateStr = (/* @__PURE__ */ new Date()).toISOString().substring(0, 19);
  const total = parseFloat(ticket.total) || 0;
  const subtotal = (total / 1.16).toFixed(2);
  const iva = (total - parseFloat(subtotal)).toFixed(2);
  let itemsXml = "";
  if (Array.isArray(ticket.items) && ticket.items.length > 0) {
    itemsXml = ticket.items.map((item, idx) => {
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
    itemsXml = `    <cfdi:Concepto ClaveProdServ="90101501" NoIdentificacion="CON-01" Cantidad="1.00" ClaveUnidad="E48" Unidad="Servicio" Descripcion="Consumo de alimentos seg\xFAn ticket folio ${escapeXml(ticket.folio || "001")}" ValorUnitario="${subtotal}" Importe="${subtotal}">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="${subtotal}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva}" />
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd http://www.sat.gob.mx/TimbreFiscalDigital http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd" Version="4.0" Serie="FACT" Folio="${Math.floor(1e5 + Math.random() * 9e5)}" Fecha="${dateStr}" Sello="SIM_SELLOS_AUTOMATION_OK_FACTUBOT" NoCertificado="00001000000504454321" SubTotal="${subtotal}" Total="${total.toFixed(2)}" Moneda="MXN" TipoDeComprobante="I" Exportacion="01" LugarExpedicion="${profile.codigoPostal || "01000"}">
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
function generateLocalPdfHtml(ticket, profile, connector, folioFiscal) {
  const dateStr = (/* @__PURE__ */ new Date()).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const total = parseFloat(ticket.total) || 0;
  const subtotal = total / 1.16;
  const iva = total - subtotal;
  let itemsRows = "";
  if (Array.isArray(ticket.items) && ticket.items.length > 0) {
    itemsRows = ticket.items.map((item, idx) => {
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
        <td class="py-3 px-4 text-zinc-750 text-xs">Consumo de alimentos seg\xFAn ticket folio: ${escapeXml(ticket.folio || "M-8495")}</td>
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
            <span class="text-xl font-bold tracking-tight text-neutral-900 uppercase">FactuBot Automaci\xF3n</span>
          </div>
          <p class="text-[12px] text-zinc-500 max-w-sm leading-relaxed">Este documento es una representaci\xF3n impresa de un CFDI 4.0 generado mediante simulaci\xF3n de inteligencia artificial de alto nivel con backup local.</p>
        </div>
        
        <div class="text-right space-y-1">
          <div class="inline-block bg-indigo-50 text-indigo-700 font-bold px-3 py-1 rounded-lg text-xs uppercase tracking-wider">Factura Electr\xF3nica</div>
          <p class="text-xs text-zinc-400">Folio Interno: <span class="font-mono text-zinc-700 font-semibold">FACT-${Math.floor(1e5 + Math.random() * 9e5)}</span></p>
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
            <p class="text-xs text-zinc-500">R\xE9gimen Fiscal: 601 General de Ley Personas Morales</p>
            <p class="text-xs text-zinc-500">Portal de Origen: <span class="text-indigo-650 underline font-mono text-[10px] break-all">${escapeXml(connector.portalUrl || "https://facturacion.net")}</span></p>
          </div>
        </div>

        <div class="space-y-3">
          <div class="text-xs text-zinc-400 font-bold uppercase tracking-wider">DATOS DEL RECEPTOR</div>
          <div class="space-y-1 bg-zinc-50 p-4 rounded-xl border border-zinc-100">
            <p class="font-bold text-zinc-900 text-base">${escapeXml(profile.razonSocial || "CLIENTE RECEPTOR S.C.")}</p>
            <p class="font-mono text-xs text-zinc-650">RFC: <span class="font-semibold text-zinc-900">${escapeXml(profile.rfc || "XAXX010101000")}</span></p>
            <p class="text-xs text-zinc-500">R\xE9gimen Fiscal: ${escapeXml(profile.regimenFiscal || "605 - Sueldos y Salarios")}</p>
            <p class="text-xs text-zinc-500">C\xF3digo Postal Fiscal: <span class="font-mono">${escapeXml(profile.codigoPostal || "01000")}</span></p>
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
                <th class="py-3 px-4">Descripci\xF3n</th>
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
          
          <p class="text-[9.5px] text-zinc-400 italic pt-2 leading-relaxed">Esta es una factura de prueba generada el ${dateStr}. Cumple t\xE9cnicamente con las especificaciones v4.0 en entornos simulados.</p>
        </div>
      </div>
    </div>
  `;
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
app.post("/api/automation/run", async (req, res) => {
  const { ticket, profile, connector } = req.body;
  const customKey = req.headers["x-gemini-api-key"];
  if (!ticket || !profile || !connector) {
    res.status(400).json({ error: "Missing ticket, profile, or connector data for automation" });
    return;
  }
  const generatedFolioFiscal = generateUUID();
  let ai;
  try {
    ai = getGeminiClient(customKey);
  } catch (err) {
    console.warn("Gemini client missing or failed to initialize, using robust offline invoice generator.");
    res.json({
      xmlContent: generateLocalXml(ticket, profile, connector, generatedFolioFiscal),
      pdfHtml: generateLocalPdfHtml(ticket, profile, connector, generatedFolioFiscal),
      folioFiscal: generatedFolioFiscal,
      cost: connector?.learnedFrom === "automatizacion_ticket" ? 1.5 : 2.5,
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
        systemInstruction: `Eres FactuBot AI, el motor de generaci\xF3n CFDI 4.0 oficial de simulaci\xF3n.
                            Dado un ticket de compra mexicano extra\xEDdo, la direcci\xF3n del portal de facturaci\xF3n y el perfil fiscal del receptor, procesa la automatizaci\xF3n.
                            Debes generar tres piezas de informaci\xF3n extremadamente estructuradas:
                            1. Un CFDI v4.0 XML realista. Debe poseer etiquetas est\xE1ndar (cfdi:Comprobante, cfdi:Emisor, cfdi:Receptor, cfdi:Conceptos, cfdi:Concepto, cfdi:Impuestos, cfdi:Traslados, cfdi:Traslado con TipoFactor='Tasa', TasaOCuota='0.160000', timbrado con un timbre tfd:TimbreFiscalDigital realista con FolioFiscal UUID, NoCertificadoSAT y SellosBase64 simulados).
                            2. Un PDF en HTML responsive moderno, estilizado con excelentes clases de Tailwind CSS, que asombre visualmente. Debe poseer un t\xEDtulo formal de 'REPRESENTACI\xD3N IMPRESA DE CFDI 4.0', un dise\xF1o tabular impecable, logo estilizado, c\xF3digo de barras QR (representado con un recuadro interactivo o SVG visual), sello digital de emisor, receptor, totales desglosados (Subtotal, IVA 16%, Total), desglose de conceptos, y un bot\xF3n para exportar o imprimir. El HTML no debe incluir doctype de p\xE1gina completa, solo un contenedor div principal.
                            3. El Folio Fiscal UUID de la transacci\xF3n simulada.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            xmlContent: { type: "STRING", description: "El XML de CFDI 4.0 alinedado estrictamente con el SAT en M\xE9xico" },
            pdfHtml: { type: "STRING", description: "El c\xF3digo HTML responsive completo y elegante estilizado con Tailwind CSS (sin incluir headers html o doctype, solo el container del cuerpo de la factura para renderizado seguro)." },
            folioFiscal: { type: "STRING", description: "UUID de 36 caracteres del Timbre Fiscal Digital SAT (ej: 3FA8F392-80FF-11ED-A1EB-0242AC120002)" }
          },
          required: ["xmlContent", "pdfHtml", "folioFiscal"]
        }
      }
    });
    const textResult = response.text;
    if (!textResult) {
      throw new Error("Failed to compile CFDI data from Gemini");
    }
    const promptTokens = response.usageMetadata?.promptTokenCount || 1500;
    const outputTokens = response.usageMetadata?.candidatesTokenCount || 4500;
    const exchangeRate = 18.5;
    const rawCost = (promptTokens * 0.075 + outputTokens * 0.3) / 1e6 * exchangeRate;
    const generatedInvoicing = JSON.parse(textResult.trim());
    res.json({
      ...generatedInvoicing,
      cost: connector?.learnedFrom === "automatizacion_ticket" ? 15 : 2.5,
      rawCost: parseFloat(rawCost.toFixed(6))
    });
  } catch (error) {
    console.warn("Automation simulation failed using Gemini API. Falling back to robust offline generation engine...", error.message || error);
    const xml = generateLocalXml(ticket, profile, connector, generatedFolioFiscal);
    const pdf = generateLocalPdfHtml(ticket, profile, connector, generatedFolioFiscal);
    res.json({
      xmlContent: xml,
      pdfHtml: pdf,
      folioFiscal: generatedFolioFiscal,
      cost: connector?.learnedFrom === "automatizacion_ticket" ? 1.5 : 2.5,
      rawCost: 0
    });
  }
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
async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Faltan credenciales PAYPAL_CLIENT_ID o PAYPAL_CLIENT_SECRET.");
  }
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  try {
    const response = await import_axios.default.post(
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
      try {
        const response = await import_axios.default.post(
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
        throw new Error("Las credenciales de PayPal son inv\xE1lidas tanto para producci\xF3n como para sandbox.");
      }
    }
    throw new Error("Error de comunicaci\xF3n o autenticaci\xF3n con PayPal: " + (errData?.error_description || error.message));
  }
}
var getSafeBaseUrl = (req) => {
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
app.post("/api/billing/checkout/mercadopago", async (req, res) => {
  const { userId, planId, payerEmail } = req.body;
  if (!userId || !planId) {
    res.status(400).json({ error: "Faltan par\xE1metros userId o planId" });
    return;
  }
  let price = 0;
  let title = "";
  if (planId === "brisa") {
    price = 2;
    title = "Plan Brisa - ZenTicket";
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
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    res.status(400).json({ error: "Configuraci\xF3n de pasarela Mercado Pago incompleta en el servidor. Falta el token de acceso (MERCADOPAGO_ACCESS_TOKEN) de producci\xF3n." });
    return;
  }
  try {
    const baseUrl = getSafeBaseUrl(req);
    const response = await import_axios.default.post(
      "https://api.mercadopago.com/checkout/preferences",
      {
        items: [
          {
            title,
            quantity: 1,
            unit_price: price,
            currency_id: "MXN"
          }
        ],
        payer: payerEmail ? { email: payerEmail } : void 0,
        back_urls: {
          success: process.env.BILLING_SUCCESS_URL ? `${process.env.BILLING_SUCCESS_URL}&plan=${planId}` : `${baseUrl}/workspace?tab=cuenta&status=success&plan=${planId}`,
          failure: process.env.BILLING_FAILURE_URL || `${baseUrl}/workspace?tab=cuenta&status=failure`,
          pending: process.env.BILLING_PENDING_URL || `${baseUrl}/workspace?tab=cuenta&status=pending`
        },
        auto_return: "approved",
        notification_url: `${baseUrl}/api/billing/webhooks/mercadopago`,
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
    await adminDb.collection("payments").doc(paymentDocId).set({
      userId,
      planId,
      provider: "mercadopago",
      providerPaymentId: preference.id,
      amount: price,
      currency: "MXN",
      status: "pending_payment",
      checkoutUrl: preference.init_point,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    res.json({ checkoutUrl: preference.init_point });
  } catch (error) {
    console.error("Error al crear preferencia en Mercado Pago:", error.response?.data || error.message);
    res.status(500).json({ error: "Error al comunicarse con Mercado Pago" });
  }
});
app.post("/api/billing/subscription/mercadopago", async (req, res) => {
  const { userId, planId, payerEmail } = req.body;
  if (!userId || !planId) {
    res.status(400).json({ error: "Faltan par\xE1metros userId o planId" });
    return;
  }
  let price = 0;
  let title = "";
  if (planId === "brisa") {
    price = 10;
    title = "Plan Brisa (M\xEDnimo Suscripci\xF3n $10) - ZenTicket";
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
    res.status(400).json({ error: "Plan inv\xE1lido para suscripci\xF3n" });
    return;
  }
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    res.status(400).json({ error: "Configuraci\xF3n de pasarela Mercado Pago incompleta en el servidor. Falta el token de acceso (MERCADOPAGO_ACCESS_TOKEN) de producci\xF3n." });
    return;
  }
  try {
    const baseUrl = getSafeBaseUrl(req);
    const preapprovalBody = {
      back_url: process.env.BILLING_SUCCESS_URL || `${baseUrl}/workspace?tab=cuenta&status=success`,
      reason: title,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: price,
        currency_id: "MXN"
      },
      external_reference: `${userId}:${planId}`
    };
    if (payerEmail && payerEmail.trim()) {
      preapprovalBody.payer_email = payerEmail.trim();
    }
    const response = await import_axios.default.post(
      "https://api.mercadopago.com/preapproval",
      preapprovalBody,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );
    const preapproval = response.data;
    const paymentDocId = `mp_sub_${preapproval.id}`;
    await adminDb.collection("payments").doc(paymentDocId).set({
      userId,
      planId,
      provider: "mercadopago",
      providerPaymentId: preapproval.id,
      amount: price,
      currency: "MXN",
      status: "pending_payment",
      checkoutUrl: preapproval.init_point,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    res.json({ checkoutUrl: preapproval.init_point });
  } catch (error) {
    console.error("Error al crear suscripci\xF3n en Mercado Pago:", error.response?.data || error.message);
    res.status(500).json({ error: "Error al crear suscripci\xF3n en Mercado Pago" });
  }
});
app.post("/api/billing/checkout/paypal", async (req, res) => {
  const { userId, planId, payerEmail } = req.body;
  if (!userId || !planId) {
    res.status(400).json({ error: "Faltan par\xE1metros userId o planId" });
    return;
  }
  let price = 0;
  let title = "";
  if (planId === "brisa") {
    price = 2;
    title = "Plan Brisa - ZenTicket";
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
  try {
    const baseUrl = getSafeBaseUrl(req);
    const { accessToken, host } = await getPayPalAccessToken();
    const orderData = {
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
        return_url: process.env.BILLING_SUCCESS_URL ? `${process.env.BILLING_SUCCESS_URL}&plan=${planId}` : `${baseUrl}/workspace?tab=cuenta&status=success&plan=${planId}`,
        cancel_url: process.env.BILLING_FAILURE_URL || `${baseUrl}/workspace?tab=cuenta&status=failure`
      }
    };
    if (payerEmail) {
      orderData.payer = {
        email_address: payerEmail
      };
    }
    const response = await import_axios.default.post(
      `${host}/v2/checkout/orders`,
      orderData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );
    const order = response.data;
    const approvalUrl = order.links.find((l) => l.rel === "approve")?.href;
    const paymentDocId = `pp_pref_${order.id}`;
    await adminDb.collection("payments").doc(paymentDocId).set({
      userId,
      planId,
      provider: "paypal",
      providerPaymentId: order.id,
      amount: price,
      currency: "MXN",
      status: "pending_payment",
      checkoutUrl: approvalUrl,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    res.json({ checkoutUrl: approvalUrl, orderId: order.id });
  } catch (error) {
    console.error("Error al crear orden en PayPal:", error.response?.data || error.message);
    res.status(500).json({ error: error.message || "Error al comunicarse con PayPal" });
  }
});
app.post("/api/billing/setup/stripe", async (req, res) => {
  const { userId, payerEmail, holderName, bankName } = req.body;
  if (!userId || !payerEmail) {
    res.status(400).json({ error: "Faltan userId o payerEmail" });
    return;
  }
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuraci\xF3n de Stripe incompleta" });
    return;
  }
  try {
    const profileRef = adminDb.collection("fiscalProfiles").doc(userId);
    const profileSnapshot = await profileRef.get();
    let stripeCustomerId = profileSnapshot.data()?.stripeCustomerId;
    if (!stripeCustomerId) {
      const customerParams = new URLSearchParams({
        email: payerEmail,
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
      await profileRef.set({ stripeCustomerId, correoPago: payerEmail }, { merge: true });
    }
    const baseUrl = getSafeBaseUrl(req);
    const setupSuccessUrl = process.env.BILLING_SUCCESS_URL ? process.env.BILLING_SUCCESS_URL.replace("status=success", "status=card_setup_success") : `${baseUrl}/workspace?tab=cuenta&status=card_setup_success`;
    const setupCancelUrl = process.env.BILLING_FAILURE_URL ? process.env.BILLING_FAILURE_URL.replace("status=failure", "status=card_setup_cancelled") : `${baseUrl}/workspace?tab=cuenta&status=card_setup_cancelled`;
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
app.post("/api/billing/checkout/stripe/confirm", async (req, res) => {
  const { sessionId, userId } = req.body;
  if (!sessionId || !userId) {
    res.status(400).json({ error: "Faltan sessionId o userId" });
    return;
  }
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuraci\xF3n de Stripe incompleta" });
    return;
  }
  try {
    const response = await import_axios.default.get(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription.default_payment_method&expand[]=payment_intent.payment_method`,
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
    await adminDb.collection("fiscalProfiles").doc(userId).set({
      plan: planId,
      planStartDate: nowIso,
      paymentStatus: isSubscription ? "subscription_active" : "paid",
      autoRenew: isSubscription,
      stripeCustomerId: session.customer || null,
      invoicesLimit
    }, { merge: true });
    if (paymentMethod?.id && paymentMethod.card) {
      const profileRef = adminDb.collection("fiscalProfiles").doc(userId);
      const profileSnapshot = await profileRef.get();
      const existingCards = Array.isArray(profileSnapshot.data()?.paymentCards) ? profileSnapshot.data().paymentCards : [];
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
      await profileRef.set({ paymentCards }, { merge: true });
    }
    res.json({ success: true, planId, planName, invoicesLimit });
  } catch (error) {
    console.error("Error al confirmar pago de Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.error?.message || "No se pudo confirmar el pago con Stripe." });
  }
});
app.post("/api/billing/checkout/stripe", async (req, res) => {
  const { userId, planId, payerEmail } = req.body;
  if (!userId || !planId) {
    res.status(400).json({ error: "Faltan par\xE1metros userId o planId" });
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
    const successUrl = process.env.BILLING_SUCCESS_URL ? `${process.env.BILLING_SUCCESS_URL}&plan=${planId}&session_id={CHECKOUT_SESSION_ID}` : `${baseUrl}/workspace?tab=cuenta&status=success&plan=${planId}&session_id={CHECKOUT_SESSION_ID}`;
    console.log("DEBUG STRIPE SUCCESSURL:", successUrl);
    const profileSnapshot = await adminDb.collection("fiscalProfiles").doc(userId).get();
    const stripeCustomerId = profileSnapshot.data()?.stripeCustomerId;
    const stripeParams = new URLSearchParams({
      "automatic_payment_methods[enabled]": "true",
      "line_items[0][price_data][currency]": "mxn",
      "line_items[0][price_data][product_data][name]": title,
      "line_items[0][price_data][unit_amount]": Math.round(price * 100).toString(),
      "line_items[0][quantity]": "1",
      "mode": "payment",
      "success_url": successUrl,
      "cancel_url": process.env.BILLING_FAILURE_URL || `${baseUrl}/workspace?tab=cuenta&status=failure`,
      "client_reference_id": `${userId}:${planId}`
    });
    if (stripeCustomerId) {
      stripeParams.append("customer", stripeCustomerId);
    } else if (payerEmail) {
      stripeParams.append("customer_email", payerEmail);
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
      await adminDb.collection("billingEvents").add({
        provider: "mercadopago",
        eventType: topic || "unknown",
        providerEventId: paymentId.toString(),
        processed: true,
        receivedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      if (topic === "payment" || topic === "payment.created" || topic === "payment.updated") {
        const response = await import_axios.default.get(
          `https://api.mercadopago.com/v1/payments/${paymentId}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );
        const paymentData = response.data;
        const status = paymentData.status;
        const externalReference = paymentData.external_reference;
        console.log(`[Mercado Pago] Estatus de pago para ${paymentId}: ${status}`);
        if (externalReference) {
          const [userId, planId] = externalReference.split(":");
          let localStatus = "pending_payment";
          if (status === "approved") localStatus = "paid";
          else if (status === "in_process" || status === "pending") localStatus = "payment_processing";
          else if (status === "rejected") localStatus = "payment_rejected";
          else if (status === "cancelled" || status === "refunded") localStatus = "payment_failed";
          const paymentDocId = `mp_payment_${paymentId}`;
          await adminDb.collection("payments").doc(paymentDocId).set({
            userId,
            planId,
            provider: "mercadopago",
            providerPaymentId: paymentId.toString(),
            amount: paymentData.transaction_amount,
            currency: paymentData.currency_id || "MXN",
            status: localStatus,
            paidAt: status === "approved" ? (/* @__PURE__ */ new Date()).toISOString() : null,
            createdAt: new Date(paymentData.date_created).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          }, { merge: true });
          if (status === "approved") {
            let limit = 5;
            if (planId === "brisa") limit = 10;
            else if (planId === "serenidad") limit = 30;
            else if (planId === "nirvana") limit = 100;
            else if (planId === "personal") limit = 20;
            else if (planId === "empresa") limit = 60;
            await adminDb.collection("subscriptions").doc(userId).set({
              userId,
              planId,
              planName: `Plan ${planId.charAt(0).toUpperCase() + planId.slice(1)}`,
              status: "subscription_active",
              provider: "mercadopago",
              providerSubscriptionId: paymentId.toString(),
              currentPeriodStart: (/* @__PURE__ */ new Date()).toISOString(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString(),
              invoicesLimit: limit,
              invoicesUsed: 0,
              createdAt: (/* @__PURE__ */ new Date()).toISOString(),
              updatedAt: (/* @__PURE__ */ new Date()).toISOString()
            });
            await adminDb.collection("fiscalProfiles").doc(userId).set({
              plan: planId,
              planStartDate: (/* @__PURE__ */ new Date()).toISOString(),
              paymentStatus: "paid",
              autoRenew: true
            }, { merge: true });
          }
        }
      } else if (topic === "preapproval" || topic === "subscription") {
        const response = await import_axios.default.get(
          `https://api.mercadopago.com/preapproval/${paymentId}`,
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
            else if (planId === "personal") limit = 20;
            else if (planId === "empresa") limit = 60;
            await adminDb.collection("subscriptions").doc(userId).set({
              userId,
              planId,
              planName: `Plan ${planId.charAt(0).toUpperCase() + planId.slice(1)}`,
              status: "subscription_active",
              provider: "mercadopago",
              providerSubscriptionId: subData.id.toString(),
              currentPeriodStart: (/* @__PURE__ */ new Date()).toISOString(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString(),
              invoicesLimit: limit,
              invoicesUsed: 0,
              createdAt: (/* @__PURE__ */ new Date()).toISOString(),
              updatedAt: (/* @__PURE__ */ new Date()).toISOString()
            });
            await adminDb.collection("fiscalProfiles").doc(userId).set({
              plan: planId,
              planStartDate: (/* @__PURE__ */ new Date()).toISOString(),
              paymentStatus: "subscription_active",
              autoRenew: true
            }, { merge: true });
          } else if (status === "cancelled") {
            await adminDb.collection("subscriptions").doc(userId).set({
              status: "subscription_cancelled",
              updatedAt: (/* @__PURE__ */ new Date()).toISOString()
            }, { merge: true });
            await adminDb.collection("fiscalProfiles").doc(userId).set({
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
app.post("/api/billing/webhooks/paypal", async (req, res) => {
  const event = req.body;
  console.log(`[PayPal Webhook] Recibido event: ${event?.event_type}`);
  try {
    await adminDb.collection("billingEvents").add({
      provider: "paypal",
      eventType: event.event_type || "unknown",
      providerEventId: event.id || "unknown",
      processed: true,
      receivedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED" || event.event_type === "CHECKOUT.ORDER.APPROVED") {
      const capture = event.resource;
      const orderId = capture.custom_id || event.resource.supplementary_data?.related_ids?.order_id || capture.id;
      const { accessToken, host } = await getPayPalAccessToken();
      const orderResponse = await import_axios.default.get(
        `${host}/v2/checkout/orders/${orderId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );
      const orderData = orderResponse.data;
      const purchaseUnit = orderData.purchase_units?.[0];
      const externalReference = purchaseUnit?.reference_id;
      if (externalReference) {
        const [userId, planId] = externalReference.split(":");
        const amount = parseFloat(purchaseUnit.amount.value);
        const paymentDocId = `pp_payment_${capture.id}`;
        await adminDb.collection("payments").doc(paymentDocId).set({
          userId,
          planId,
          provider: "paypal",
          providerPaymentId: capture.id,
          amount,
          currency: purchaseUnit.amount.currency_code || "MXN",
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
          planName: `Plan ${planId.charAt(0).toUpperCase() + planId.slice(1)}`,
          status: "subscription_active",
          provider: "paypal",
          providerSubscriptionId: orderId,
          currentPeriodStart: (/* @__PURE__ */ new Date()).toISOString(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString(),
          invoicesLimit: limit,
          invoicesUsed: 0,
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        await adminDb.collection("fiscalProfiles").doc(userId).set({
          plan: planId,
          planStartDate: (/* @__PURE__ */ new Date()).toISOString(),
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
app.post("/api/billing/webhooks/stripe", async (req, res) => {
  const event = req.body;
  console.log(`[Stripe Webhook] Recibido event: ${event?.type}`);
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
            const profileRef = adminDb.collection("fiscalProfiles").doc(externalReference);
            const profileSnapshot = await profileRef.get();
            const existingCards = Array.isArray(profileSnapshot.data()?.paymentCards) ? profileSnapshot.data().paymentCards : [];
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
            await profileRef.set({ paymentCards, stripeCustomerId: session.customer }, { merge: true });
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
app.get("/api/billing/status/:userId", async (req, res) => {
  const { userId } = req.params;
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
    const snapshot = await dbRef.collection("fiscalProfiles").where("stripeCustomerId", "==", stripeCustomerId).limit(1).get();
    if (snapshot.empty) {
      console.log(`[Stripe Webhook] No user found with customer ID: ${stripeCustomerId}`);
      return;
    }
    const docRef = snapshot.docs[0].ref;
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
app.post("/api/billing/sync-customer", async (req, res) => {
  const { userId, email, name } = req.body;
  if (!userId || !email) {
    res.status(400).json({ error: "Faltan par\xE1metros userId o email" });
    return;
  }
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuraci\xF3n de Stripe incompleta" });
    return;
  }
  try {
    const profileRef = adminDb.collection("fiscalProfiles").doc(userId);
    const profileSnapshot = await profileRef.get();
    let stripeCustomerId = profileSnapshot.data()?.stripeCustomerId;
    if (!stripeCustomerId) {
      const searchRes = await import_axios.default.get(
        `https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}`,
        { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
      );
      if (searchRes.data?.data && searchRes.data.data.length > 0) {
        stripeCustomerId = searchRes.data.data[0].id;
      } else {
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
      }
      await profileRef.set({ stripeCustomerId, correoPago: email }, { merge: true });
    }
    res.json({ stripeCustomerId });
  } catch (error) {
    console.error("Error al sincronizar cliente en Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/billing/payment-methods/:userId", async (req, res) => {
  const { userId } = req.params;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuraci\xF3n de Stripe incompleta" });
    return;
  }
  try {
    const profileRef = adminDb.collection("fiscalProfiles").doc(userId);
    const profileSnapshot = await profileRef.get();
    const stripeCustomerId = profileSnapshot.data()?.stripeCustomerId;
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
        expiry: `${String(card.exp_month).padStart(2, "0")}/&nbsp;${String(card.exp_year).slice(-2)}`.replace("&nbsp;", ""),
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
    await profileRef.set({ paymentCards: pms }, { merge: true });
    res.json(pms);
  } catch (error) {
    console.error("Error al obtener m\xE9todos de pago de Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/billing/payment-methods/set-default", async (req, res) => {
  const { userId, paymentMethodId } = req.body;
  if (!userId || !paymentMethodId) {
    res.status(400).json({ error: "Faltan par\xE1metros userId o paymentMethodId" });
    return;
  }
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuraci\xF3n de Stripe incompleta" });
    return;
  }
  try {
    const profileRef = adminDb.collection("fiscalProfiles").doc(userId);
    const profileSnapshot = await profileRef.get();
    const stripeCustomerId = profileSnapshot.data()?.stripeCustomerId;
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
    const existingCards = Array.isArray(profileSnapshot.data()?.paymentCards) ? profileSnapshot.data().paymentCards : [];
    const updatedCards = existingCards.map((c) => ({
      ...c,
      isDefault: c.id === paymentMethodId
    }));
    await profileRef.set({ paymentCards: updatedCards }, { merge: true });
    res.json({ success: true, paymentCards: updatedCards });
  } catch (error) {
    console.error("Error al establecer tarjeta predeterminada en Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/billing/payment-methods/delete", async (req, res) => {
  const { userId, paymentMethodId } = req.body;
  if (!userId || !paymentMethodId) {
    res.status(400).json({ error: "Faltan par\xE1metros userId o paymentMethodId" });
    return;
  }
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuraci\xF3n de Stripe incompleta" });
    return;
  }
  try {
    const profileRef = adminDb.collection("fiscalProfiles").doc(userId);
    const profileSnapshot = await profileRef.get();
    const stripeCustomerId = profileSnapshot.data()?.stripeCustomerId;
    await import_axios.default.post(
      `https://api.stripe.com/v1/payment_methods/${paymentMethodId}/detach`,
      "",
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );
    const existingCards = Array.isArray(profileSnapshot.data()?.paymentCards) ? profileSnapshot.data().paymentCards : [];
    const deletedCard = existingCards.find((c) => c.id === paymentMethodId);
    let updatedCards = existingCards.filter((c) => c.id !== paymentMethodId);
    if (deletedCard?.isDefault && updatedCards.length > 0 && stripeCustomerId) {
      const newDefaultId = updatedCards[0].id;
      updatedCards[0].isDefault = true;
      try {
        await import_axios.default.post(
          `https://api.stripe.com/v1/customers/${stripeCustomerId}`,
          `invoice_settings[default_payment_method]=&nbsp;${newDefaultId}`.replace("&nbsp;", ""),
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
    await profileRef.set({ paymentCards: updatedCards }, { merge: true });
    res.json({ success: true, paymentCards: updatedCards });
  } catch (error) {
    console.error("Error al eliminar tarjeta en Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/billing/payment-methods/attach", async (req, res) => {
  const { userId, paymentMethodId, isDefault } = req.body;
  if (!userId || !paymentMethodId) {
    res.status(400).json({ error: "Faltan par\xE1metros userId o paymentMethodId" });
    return;
  }
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Configuraci\xF3n de Stripe incompleta" });
    return;
  }
  try {
    const profileRef = adminDb.collection("fiscalProfiles").doc(userId);
    const profileSnapshot = await profileRef.get();
    let stripeCustomerId = profileSnapshot.data()?.stripeCustomerId;
    if (!stripeCustomerId) {
      const email = profileSnapshot.data()?.correoRecepcion || profileSnapshot.data()?.correoElectronico || "";
      const name = profileSnapshot.data()?.razonSocial || "";
      const customerResponse = await import_axios.default.post(
        "https://api.stripe.com/v1/customers",
        `email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`,
        {
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      );
      stripeCustomerId = customerResponse.data.id;
      await profileRef.set({ stripeCustomerId }, { merge: true });
    }
    await import_axios.default.post(
      `https://api.stripe.com/v1/payment_methods/${paymentMethodId}/attach`,
      `customer=${stripeCustomerId}`,
      {
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );
    const existingCards = Array.isArray(profileSnapshot.data()?.paymentCards) ? profileSnapshot.data().paymentCards : [];
    const setAsDefault = isDefault || existingCards.length === 0;
    if (setAsDefault) {
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
    }
    await syncCustomerPaymentMethods(stripeCustomerId, stripeSecretKey, adminDb);
    const updatedSnapshot = await profileRef.get();
    const updatedCards = updatedSnapshot.data()?.paymentCards || [];
    res.json({ success: true, paymentCards: updatedCards });
  } catch (error) {
    console.error("Error al vincular tarjeta en Stripe:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/billing/cancel-subscription", async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    res.status(400).json({ error: "Falta userId" });
    return;
  }
  try {
    await adminDb.collection("subscriptions").doc(userId).set({
      status: "subscription_cancelled",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
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
