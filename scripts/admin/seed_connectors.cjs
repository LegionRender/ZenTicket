const admin = require("firebase-admin");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

const serviceAccountPath = path.join(__dirname, "../../serviceAccountKey.json");

if (fs.existsSync(serviceAccountPath)) {
  initializeApp({
    credential: cert(serviceAccountPath)
  });
} else {
  initializeApp({
    projectId: "factubolt"
  });
}

let databaseId = undefined;
const firebaseConfigPath = path.join(__dirname, "../../firebase-applet-config.json");
if (fs.existsSync(firebaseConfigPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
    databaseId = config.firestoreDatabaseId;
  } catch (err) {
    console.warn("Failed to parse firebase-applet-config.json:", err.message);
  }
}

const db = getFirestore(undefined, databaseId);

const FORBIDDEN_PATTERNS = [
  "^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$",
  "^ticket_",
  "^job_",
  "^OFFLINE-"
];

const DEFAULT_FISCAL_FIELDS = [
  { key: "fiscalProfile.rfc", label: "RFC receptor", required: true, source: "fiscalProfile" },
  { key: "fiscalProfile.businessName", label: "Razón social", required: true, source: "fiscalProfile" },
  { key: "fiscalProfile.postalCode", label: "Código postal fiscal", required: true, source: "fiscalProfile" },
  { key: "fiscalProfile.taxRegime", label: "Régimen fiscal", required: true, source: "fiscalProfile" },
  { key: "fiscalProfile.cfdiUse", label: "Uso de CFDI", required: true, source: "fiscalProfile" },
  { key: "fiscalProfile.email", label: "Correo electrónico", required: true, source: "fiscalProfile" }
];

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
    extractionContract: {
      requiredPortalFields: [
        {
          key: "portalFields.billingReference",
          canonicalKey: "billingReference",
          label: "Ticket Folio",
          type: "string",
          hints: ["Folio impreso en tu ticket de compra."],
          validationPattern: "^[0-9]+$",
          forbiddenPatterns: FORBIDDEN_PATTERNS,
          required: true,
          userEditable: true,
          source: "ticket"
        },
        {
          key: "portalFields.total",
          canonicalKey: "total",
          label: "Total Importe",
          type: "number",
          hints: ["Total de la compra."],
          validationPattern: "^[0-9]+(\\.[0-9]{1,2})?$",
          required: true,
          userEditable: true,
          source: "ticket"
        }
      ],
      fiscalFields: DEFAULT_FISCAL_FIELDS,
      screenOrder: [
        { screenIndex: 1, description: "Búsqueda de ticket", requiredFields: ["portalFields.billingReference"] },
        { screenIndex: 2, description: "Monto de ticket", requiredFields: ["portalFields.total"] },
        { screenIndex: 3, description: "Datos fiscales", requiredFields: ["fiscalProfile.rfc", "fiscalProfile.businessName", "fiscalProfile.postalCode", "fiscalProfile.taxRegime", "fiscalProfile.cfdiUse", "fiscalProfile.email"] }
      ]
    },
    createdAt: new Date().toISOString(),
    status: "automation_pending_setup",
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
    extractionContract: {
      requiredPortalFields: [
        {
          key: "portalFields.billingReference",
          canonicalKey: "billingReference",
          label: "Número de Folio",
          type: "string",
          hints: ["Folio impreso en el ticket Oxxo."],
          validationPattern: "^[A-Za-z0-9\\-]+$",
          forbiddenPatterns: FORBIDDEN_PATTERNS,
          required: true,
          userEditable: true,
          source: "ticket"
        },
        {
          key: "portalFields.total",
          canonicalKey: "total",
          label: "Total Ticket",
          type: "number",
          hints: ["Total de la compra."],
          validationPattern: "^[0-9]+(\\.[0-9]{1,2})?$",
          required: true,
          userEditable: true,
          source: "ticket"
        }
      ],
      fiscalFields: DEFAULT_FISCAL_FIELDS,
      screenOrder: [
        { screenIndex: 1, description: "Búsqueda de ticket", requiredFields: ["portalFields.billingReference"] },
        { screenIndex: 2, description: "Monto de ticket", requiredFields: ["portalFields.total"] },
        { screenIndex: 3, description: "Datos fiscales", requiredFields: ["fiscalProfile.rfc", "fiscalProfile.businessName", "fiscalProfile.postalCode", "fiscalProfile.taxRegime", "fiscalProfile.cfdiUse", "fiscalProfile.email"] }
      ]
    },
    createdAt: new Date().toISOString(),
    status: "automation_pending_setup",
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
    extractionContract: {
      requiredPortalFields: [
        {
          key: "portalFields.billingReference",
          canonicalKey: "billingReference",
          label: "Número de Transacción",
          type: "string",
          hints: ["Folio/TR impreso en el ticket."],
          validationPattern: "^[0-9]+$",
          forbiddenPatterns: FORBIDDEN_PATTERNS,
          required: true,
          userEditable: true,
          source: "ticket"
        },
        {
          key: "portalFields.total",
          canonicalKey: "total",
          label: "Monto Neto Total",
          type: "number",
          hints: ["Monto neto total del ticket."],
          validationPattern: "^[0-9]+(\\.[0-9]{1,2})?$",
          required: true,
          userEditable: true,
          source: "ticket"
        }
      ],
      fiscalFields: DEFAULT_FISCAL_FIELDS,
      screenOrder: [
        { screenIndex: 1, description: "Búsqueda de ticket", requiredFields: ["portalFields.billingReference"] },
        { screenIndex: 2, description: "Monto de ticket", requiredFields: ["portalFields.total"] },
        { screenIndex: 3, description: "Datos fiscales", requiredFields: ["fiscalProfile.rfc", "fiscalProfile.businessName", "fiscalProfile.postalCode", "fiscalProfile.taxRegime", "fiscalProfile.cfdiUse", "fiscalProfile.email"] }
      ]
    },
    createdAt: new Date().toISOString(),
    status: "automation_pending_setup",
    isProductionReady: false,
    isMock: false,
    isRestricted: false,
    runnerAvailable: false,
    aliases: ["walmart", "aurrera", "sams", "superama", "bodega aurrera"]
  },
  {
    nombre: "Farmacias Similares",
    rfc: "FSI120304XYZ",
    portalUrl: "https://facturacion.gpupm.com/simifactura/portal",
    fieldsJson: JSON.stringify([
      { key: "referenciaFacturacion", name: "Referencia de facturación", selector: "input#Referencia", type: "text", required: true, source: "ticket" },
      { key: "sucursal", name: "Sucursal", selector: "input#Sucursal", type: "text", required: true, source: "ticket" },
      { key: "codigoBarras", name: "Código de barras", selector: "input#CodigoBarras", type: "text", required: true, source: "ticket" },
      { key: "total", name: "Total", selector: "input#total_simi", type: "number", required: true, source: "ticket" },
      { key: "rfcReceptor", name: "RFC Receptor", selector: "input#rfc_simi", type: "text", required: true, source: "fiscalProfile" },
      { key: "razonSocial", name: "Razón Social", selector: "input#razon_simi", type: "text", required: true, source: "fiscalProfile" },
      { key: "codigoPostal", name: "Código Postal", selector: "input#cp_simi", type: "text", required: true, source: "fiscalProfile" },
      { key: "regimenFiscal", name: "Régimen Fiscal", selector: "select#regimen_simi", type: "text", required: true, source: "fiscalProfile" },
      { key: "usoCFDI", name: "Uso CFDI", selector: "select#uso_simi", type: "text", required: true, source: "fiscalProfile" },
      { key: "email", name: "Correo Electrónico", selector: "input#email_simi", type: "text", required: true, source: "fiscalProfile" }
    ]),
    flowJson: JSON.stringify([
      "1. Navegar al dominio de facturación de Farmacias Similares",
      "2. Ingresar la referencia de facturación, sucursal, código de barras y el importe total",
      "3. Autocompletar RFC, Razón Social, C.P. y Régimen desde el perfil del usuario",
      "4. Solicitar CFDI y guardar XML"
    ]),
    extractionContract: {
      requiredPortalFields: [
        {
          key: "portalFields.billingReference",
          canonicalKey: "billingReference",
          label: "Referencia de facturación",
          type: "string",
          hints: [
            "Número impreso en el ticket requerido por el portal",
            "No confundir con UUID, folio interno, ticketId o UUID SAT"
          ],
          validationPattern: "^\\d{12}$",
          forbiddenPatterns: FORBIDDEN_PATTERNS,
          required: true,
          userEditable: true,
          source: "ticket"
        },
        {
          key: "portalFields.branch",
          canonicalKey: "branch",
          label: "Sucursal",
          type: "string",
          hints: [
            "Número de sucursal emisor del ticket"
          ],
          validationPattern: "^\\d+$",
          required: true,
          userEditable: true,
          source: "ticket"
        },
        {
          key: "portalFields.barcode",
          canonicalKey: "barcode",
          label: "Código de barras",
          type: "string",
          hints: [
            "Código de barras impreso en el ticket"
          ],
          validationPattern: "^\\d+$",
          required: true,
          userEditable: true,
          source: "ticket"
        },
        {
          key: "portalFields.total",
          canonicalKey: "total",
          label: "Total",
          type: "number",
          hints: [
            "Importe total de la compra tal como aparece en el ticket"
          ],
          validationPattern: "^[0-9]+(\\.[0-9]{1,2})?$",
          required: true,
          userEditable: true,
          source: "ticket"
        }
      ],
      fiscalFields: DEFAULT_FISCAL_FIELDS,
      screenOrder: [
        { screenIndex: 1, description: "Búsqueda de ticket", requiredFields: ["portalFields.billingReference", "portalFields.branch", "portalFields.barcode", "portalFields.total"] },
        { screenIndex: 2, description: "Datos fiscales", requiredFields: ["fiscalProfile.rfc", "fiscalProfile.businessName", "fiscalProfile.postalCode", "fiscalProfile.taxRegime", "fiscalProfile.cfdiUse", "fiscalProfile.email"] }
      ]
    },
    createdAt: new Date().toISOString(),
    status: "automation_available",
    isProductionReady: false,
    isMock: false,
    isRestricted: false,
    runnerAvailable: true,
    aliases: ["farmacias similares", "similares", "doctor simi", "simi", "farmacias de confianza", "confianza"]
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
    extractionContract: {
      requiredPortalFields: [
        {
          key: "portalFields.billingReference",
          canonicalKey: "billingReference",
          label: "Folio de Factura",
          type: "string",
          hints: ["Folio de Soriana impreso en el ticket."],
          validationPattern: "^[0-9]+$",
          forbiddenPatterns: FORBIDDEN_PATTERNS,
          required: true,
          userEditable: true,
          source: "ticket"
        },
        {
          key: "portalFields.total",
          canonicalKey: "total",
          label: "Total Neto",
          type: "number",
          hints: ["Total de la compra."],
          validationPattern: "^[0-9]+(\\.[0-9]{1,2})?$",
          required: true,
          userEditable: true,
          source: "ticket"
        }
      ],
      fiscalFields: DEFAULT_FISCAL_FIELDS,
      screenOrder: [
        { screenIndex: 1, description: "Búsqueda de ticket", requiredFields: ["portalFields.billingReference"] },
        { screenIndex: 2, description: "Monto de ticket", requiredFields: ["portalFields.total"] },
        { screenIndex: 3, description: "Datos fiscales", requiredFields: ["fiscalProfile.rfc", "fiscalProfile.businessName", "fiscalProfile.postalCode", "fiscalProfile.taxRegime", "fiscalProfile.cfdiUse", "fiscalProfile.email"] }
      ]
    },
    createdAt: new Date().toISOString(),
    status: "automation_pending_setup",
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
    // Dynamically inject fieldExtractionHints to connectors seed
    for (const item of connectorsSeed) {
      if (item.extractionContract && item.extractionContract.requiredPortalFields) {
        for (const f of item.extractionContract.requiredPortalFields) {
          if (f.canonicalKey === "billingReference") {
            f.fieldExtractionHints = {
              likelyZones: ["bottom", "near_barcode", "invoice_instructions"],
              nearbyWords: ["referencia", "facturacion", "factura", "portal", "codigo", "ticket", "folio"],
              rejectIfLooksLike: ["uuid", "internal_id", "cfdi_uuid"],
              allowSecondaryOcr: true,
              requireLiteralMatch: true
            };
          } else if (f.canonicalKey === "total") {
            f.fieldExtractionHints = {
              likelyZones: ["bottom", "summary"],
              nearbyWords: ["total", "neto", "importe", "pago", "monto"],
              rejectIfLooksLike: ["uuid", "internal_id"],
              allowSecondaryOcr: true
            };
          } else if (f.canonicalKey === "branch") {
            f.fieldExtractionHints = {
              likelyZones: ["top", "header"],
              nearbyWords: ["sucursal", "suc", "tienda", "no"],
              rejectIfLooksLike: ["uuid"],
              allowSecondaryOcr: true
            };
          } else if (f.canonicalKey === "barcode") {
            f.fieldExtractionHints = {
              likelyZones: ["bottom", "barcode_area"],
              nearbyWords: ["codigo", "barras", "ticket"],
              rejectIfLooksLike: ["uuid"],
              allowSecondaryOcr: true
            };
          }
        }
      }
    }

    for (const item of connectorsSeed) {
      let connectorId;
      const snapshot = await db.collection("connectors")
        .where("rfc", "==", item.rfc)
        .get();

      if (!snapshot.empty) {
        const docRef = snapshot.docs[0].ref;
        connectorId = docRef.id;
        await docRef.update({
          ...item,
          userId: "system"
        });
        console.log(`Updated existing conector: ${item.nombre} (ID: ${connectorId})`);
      } else {
        const docRef = db.collection("connectors").doc();
        connectorId = docRef.id;
        await docRef.set({
          ...item,
          userId: "system"
        });
        console.log(`Created new seed conector: ${item.nombre} (ID: ${connectorId})`);
      }

      // Seed corresponding PortalMap
      // Oxxo & Walmart -> Approved
      // Starbucks -> Unapproved
      // Farmacias Similares -> No portal map seeded (to test not found)
      if (item.rfc !== "SOR990805111") {
        const isApproved = item.rfc !== "SHE190630TX1"; // Starbucks unapproved
        const portalMapSnapshot = await db.collection("portal_maps")
          .where("connectorId", "==", connectorId)
          .get();

        let steps = [];
        if (item.rfc === "FSI120304XYZ") {
          // Farmacias Similares real flow steps
          steps = [
            { type: "goto", url: "{{portalMap.entryUrl}}" },
            { type: "fill", selector: "input#Referencia", value: "{{portalFields.billingReference}}", transform: "trim" },
            { type: "fill", selector: "input#Sucursal", value: "{{portalFields.branch}}", transform: "trim" },
            { type: "fill", selector: "input#CodigoBarras", value: "{{portalFields.barcode}}", transform: "trim" },
            { type: "fill", selector: "input#total_simi", value: "{{portalFields.total}}", transform: "fixed2" },
            { type: "click", selector: "button#btnBuscar" },
            { type: "waitForSelector", selector: "input#rfc_simi" },
            { type: "fill", selector: "input#rfc_simi", value: "{{fiscalProfile.rfc}}", transform: "uppercase" },
            { type: "fill", selector: "input#razon_simi", value: "{{fiscalProfile.businessName}}", transform: "uppercase" },
            { type: "fill", selector: "input#cp_simi", value: "{{fiscalProfile.postalCode}}", transform: "trim" },
            { type: "select", selector: "select#regimen_simi", value: "{{fiscalProfile.taxRegime}}" },
            { type: "select", selector: "select#uso_simi", value: "{{fiscalProfile.cfdiUse}}" },
            { type: "fill", selector: "input#email_simi", value: "{{fiscalProfile.email}}", transform: "lowercase" },
            { type: "click", selector: "button#btnGenerar" },
            { type: "waitForDownload" }
          ];
        } else {
          // Oxxo, Starbucks, Walmart
          steps = [
            { type: "goto", url: "{{portalMap.entryUrl}}" },
            { type: "fill", selector: "input#rfc", value: "{{fiscalProfile.rfc}}", transform: "uppercase" },
            { type: "click", selector: "button#submit" }
          ];
        }

        const reqFieldsList = [];
        if (item.extractionContract && item.extractionContract.requiredPortalFields) {
          item.extractionContract.requiredPortalFields.forEach(f => {
            reqFieldsList.push({
              key: f.key,
              label: f.label,
              source: f.source || "portalFields",
              required: f.required !== false,
              userEditable: f.userEditable !== false
            });
          });
        }
        const fiscalKeys = ["rfc", "businessName", "postalCode", "taxRegime", "cfdiUse", "email"];
        fiscalKeys.forEach(k => {
          const matched = item.extractionContract.fiscalFields?.find(f => f.key.endsWith("." + k));
          reqFieldsList.push({
            key: matched?.key || `fiscalProfile.${k}`,
            label: matched?.label || (k === "rfc" ? "RFC receptor" : k === "businessName" ? "Razón Social" : k === "postalCode" ? "Código Postal" : k === "taxRegime" ? "Régimen Fiscal" : k === "cfdiUse" ? "Uso CFDI" : "Correo electrónico"),
            source: "fiscalProfile",
            required: true,
            userEditable: true
          });
        });

        const portalMapData = {
          connectorId,
          entryUrl: item.portalUrl,
          url: item.portalUrl,
          requiredFields: reqFieldsList,
          fiscalFields: ["fiscalProfile.rfc", "fiscalProfile.businessName", "fiscalProfile.postalCode", "fiscalProfile.taxRegime", "fiscalProfile.cfdiUse", "fiscalProfile.email"],
          captchaSelectorsJson: JSON.stringify(["iframe[src*='recaptcha']", ".g-recaptcha", "#captcha"]),
          errorSelectorsJson: JSON.stringify([".swal-text", ".alert-danger", "#error-msg", ".text-danger"]),
          successSelectorsJson: JSON.stringify([".success-msg", "#download-area"]),
          downloadRulesJson: JSON.stringify({ xmlRequired: true, pdfRequired: false }),
          stepsJson: JSON.stringify(steps),
          isApproved,
          status: isApproved ? "approved" : "pending_approval",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        if (!portalMapSnapshot.empty) {
          await portalMapSnapshot.docs[0].ref.update({
            ...portalMapData,
            updatedAt: new Date().toISOString()
          });
          console.log(`Updated portal map for: ${item.nombre} (Approved: ${isApproved})`);
        } else {
          await db.collection("portal_maps").add(portalMapData);
          console.log(`Created portal map for: ${item.nombre} (Approved: ${isApproved})`);
        }
      }
    }
    // CLEANUP DUPLICATES
    console.log("Starting cleanup of user-created duplicate / mock connectors...");
    const cleanStr = (s) => 
      (s || "")
       .toLowerCase()
       .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
       .replace(/[^a-z0-9\s]/g, "") // remove punctuation
       .replace(/\b(sa|de|cv|sapi|srl|de|cv|grupo|comercial|cadena|tiendas|sucursal|santa|fe|magna|pemex)\b/g, "")
       .trim();

    const connSnapshot = await db.collection("connectors").get();
    for (const d of connSnapshot.docs) {
      const data = d.data();
      const isOfficial = data.userId === "system";
      if (!isOfficial && data.status !== "disabled") {
        const cleanName = cleanStr(data.nombre);
        const officialMatch = connectorsSeed.find(official => {
          const cleanOfficial = cleanStr(official.nombre);
          return (data.rfc && official.rfc && data.rfc === official.rfc) || (cleanName && cleanOfficial && cleanName === cleanOfficial);
        });

        if (officialMatch) {
          const officialQuery = await db.collection("connectors")
            .where("userId", "==", "system")
            .where("nombre", "==", officialMatch.nombre)
            .get();
          
          if (!officialQuery.empty) {
            const canonicalId = officialQuery.docs[0].id;
            await d.ref.update({
              status: "disabled",
              disabledReason: "DUPLICATE_MOCK_CONNECTOR",
              canonicalConnectorId: canonicalId,
              updatedAt: new Date().toISOString()
            });
            console.log(`Disabled mock duplicate connector for: ${data.nombre} (ID: ${d.id}) -> canonical ID: ${canonicalId}`);
          }
        }
      }
    }

    console.log("Connectors and Portal Maps seed run successfully completed!");
  } catch (err) {
    console.error("Critical seed failure:", err.message);
  }
}

seedConnectors();
