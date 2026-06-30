const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

const serviceAccountPath = path.join(__dirname, "../../serviceAccountKey.json");

if (fs.existsSync(serviceAccountPath)) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath)
  });
} else {
  admin.initializeApp({
    projectId: "factubolt"
  });
}

const db = getFirestore();

const connectorsSeed = [
  {
    nombre: "Starbucks / Alsea",
    rfc: "SHE190630TX1",
    portalUrl: "https://alsea.facturacion.com",
    fieldsJson: JSON.stringify([
      { key: "rfc", name: "RFC Receptor", selector: "input#rfc_id", type: "text", required: true, source: "fiscalProfile" },
      { key: "folio", name: "Ticket Folio", selector: "input#folio_ticket", type: "text", required: true, source: "ticket" },
      { key: "total", name: "Total Importe", selector: "input#total_amount", type: "number", required: true, source: "ticket" },
      { key: "fecha", name: "Fecha Compra", selector: "input#fecha_day", type: "date", required: true, source: "ticket" }
    ]),
    flowJson: JSON.stringify([
      "1. Acceder al portal de facturación Alsea",
      "2. Capturar RFC receptor y datos del ticket de compra",
      "3. Indicar Uso de CFDI correspondiente",
      "4. Obtener CFDI",
      "5. Guardar documentos PDF y XML generados"
    ]),
    createdAt: new Date().toISOString(),
    status: "runner_not_available", // Corrected classification (no active runner)
    isProductionReady: false,
    isMock: false,
    isRestricted: false,
    runnerAvailable: false,
    aliases: ["alsea", "starbucks", "vips", "dominos", "chilis", "italiannis", "pfchangs"]
  },
  {
    nombre: "OXXO Cadena",
    rfc: "CCO8605231N4",
    portalUrl: "http://factura.oxxo.com:8080",
    fieldsJson: JSON.stringify([
      { key: "rfc", name: "RFC Receptor", selector: "input[name='rfc']", type: "text", required: true, source: "fiscalProfile" },
      { key: "folio", name: "Número de Folio", selector: "input#folio", type: "text", required: true, source: "ticket" },
      { key: "total", name: "Total Ticket", selector: "input#importe", type: "number", required: true, source: "ticket" },
      { key: "fecha", name: "Fecha de Compra", selector: "input#fecha", type: "date", required: true, source: "ticket" }
    ]),
    flowJson: JSON.stringify([
      "1. Cargar el portal oficial de facturas de Tiendas OXXO",
      "2. Capturar los datos de ticket correspondientes",
      "3. Ingresar RFC de receptor fiscal",
      "4. Autorizar emisión de CFDI con sello SAT",
      "5. Consolidar documentos digitales en almacén"
    ]),
    createdAt: new Date().toISOString(),
    status: "runner_not_available", // Corrected classification
    isProductionReady: false,
    isMock: false,
    isRestricted: false,
    runnerAvailable: false,
    aliases: ["oxxo", "cadena comercial oxxo", "femsa"]
  },
  {
    nombre: "Walmart / Aurrera",
    rfc: "NWM9709244W4",
    portalUrl: "https://facturacion.walmartmexico.com",
    fieldsJson: JSON.stringify([
      { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true, source: "fiscalProfile" },
      { key: "folio", name: "Número de Transacción", selector: "input#ticket", type: "text", required: true, source: "ticket" },
      { key: "total", name: "Monto Neto Total", selector: "input#monto", type: "number", required: true, source: "ticket" },
      { key: "fecha", name: "Fecha del Ticket", selector: "input#fecha", type: "date", required: true, source: "ticket" }
    ]),
    flowJson: JSON.stringify([
      "1. Ingresar al portal de facturas Walmart México",
      "2. Suministrar TR y RFC receptor",
      "3. Suministrar código de sucursal de compra",
      "4. Obtener CFDI",
      "5. Almacenar facturas PDF y XML"
    ]),
    createdAt: new Date().toISOString(),
    status: "runner_not_available", // Corrected classification
    isProductionReady: false,
    isMock: false,
    isRestricted: false,
    runnerAvailable: false,
    aliases: ["walmart", "aurrera", "sams", "superama", "bodega aurrera"]
  },
  {
    nombre: "Farmacias Similares",
    rfc: "FSI120304XYZ",
    portalUrl: "https://facturacion.farmaciassimilares.com",
    fieldsJson: JSON.stringify([
      { key: "referenciaFacturacion", name: "Referencia de facturación", selector: "input#ref_simi", type: "text", required: true, source: "ticket" },
      { key: "total", name: "Total Facturado", selector: "input#total_simi", type: "number", required: true, source: "ticket" },
      { key: "rfcReceptor", name: "RFC Receptor", selector: "input#rfc_simi", type: "text", required: true, source: "fiscalProfile" },
      { key: "razonSocial", name: "Razón Social", selector: "input#razon_simi", type: "text", required: true, source: "fiscalProfile" },
      { key: "codigoPostal", name: "Código Postal", selector: "input#cp_simi", type: "text", required: true, source: "fiscalProfile" },
      { key: "regimenFiscal", name: "Régimen Fiscal", selector: "select#regimen_simi", type: "text", required: true, source: "fiscalProfile" },
      { key: "usoCFDI", name: "Uso CFDI", selector: "select#uso_simi", type: "text", required: true, source: "fiscalProfile" },
      { key: "email", name: "Correo Electrónico", selector: "input#email_simi", type: "text", required: true, source: "fiscalProfile" }
    ]),
    flowJson: JSON.stringify([
      "1. Navegar al dominio de facturación de Farmacias Similares",
      "2. Ingresar la referencia de facturación y el importe total",
      "3. Autocompletar RFC, Razón Social, C.P. y Régimen desde el perfil del usuario",
      "4. Solicitar CFDI y guardar XML"
    ]),
    createdAt: new Date().toISOString(),
    status: "trained_needs_validation",
    isProductionReady: false,
    isMock: false,
    isRestricted: false,
    runnerAvailable: false,
    aliases: ["farmacias similares", "similares", "doctor simi", "simi"]
  },
  {
    nombre: "Tiendas Soriana",
    rfc: "SOR990805111",
    portalUrl: "https://facturacion.soriana.com",
    fieldsJson: JSON.stringify([
      { key: "rfc", name: "RFC Receptor", selector: "input#rfc", type: "text", required: true, source: "fiscalProfile" },
      { key: "folio", name: "Folio de Factura", selector: "input#folio", type: "text", required: true, source: "ticket" },
      { key: "total", name: "Total Neto", selector: "input#total", type: "number", required: true, source: "ticket" },
      { key: "fecha", name: "Fecha del Ticket", selector: "input#fecha", type: "date", required: true, source: "ticket" }
    ]),
    flowJson: JSON.stringify([
      "1. Acceder al portal de facturación de Tiendas Soriana",
      "2. Digitar RFC receptor y folios",
      "3. Validar y descargar XML"
    ]),
    createdAt: new Date().toISOString(),
    status: "mock_only",
    isProductionReady: false,
    isMock: true,
    isRestricted: false,
    runnerAvailable: false,
    aliases: ["soriana", "tiendas soriana", "soriana hiper", "soriana super", "soriana mercado"]
  }
];

async function seedConnectors() {
  console.log("Starting administrative connectors seed run...");
  try {
    for (const item of connectorsSeed) {
      const snapshot = await db.collection("connectors")
        .where("rfc", "==", item.rfc)
        .get();

      if (!snapshot.empty) {
        const docRef = snapshot.docs[0].ref;
        await docRef.update({
          ...item,
          userId: "system"
        });
        console.log(`Updated existing conector: ${item.nombre} (ID: ${docRef.id})`);
      } else {
        const docRef = db.collection("connectors").doc();
        await docRef.set({
          ...item,
          userId: "system"
        });
        console.log(`Created new seed conector: ${item.nombre} (ID: ${docRef.id})`);
      }
    }
    console.log("Connectors seed run successfully completed!");
  } catch (err) {
    console.error("Critical seed failure:", err.message);
  }
}

seedConnectors();
