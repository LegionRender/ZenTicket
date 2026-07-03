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

const FISCAL_FIELDS_MAP = {
  rfc: { key: "fiscalProfile.rfc", label: "RFC receptor", required: true, source: "fiscalProfile" },
  rfcReceptor: { key: "fiscalProfile.rfc", label: "RFC receptor", required: true, source: "fiscalProfile" },
  razonSocial: { key: "fiscalProfile.businessName", label: "Razón social", required: true, source: "fiscalProfile" },
  codigoPostal: { key: "fiscalProfile.postalCode", label: "Código postal fiscal", required: true, source: "fiscalProfile" },
  regimenFiscal: { key: "fiscalProfile.taxRegime", label: "Régimen fiscal", required: true, source: "fiscalProfile" },
  usoCFDI: { key: "fiscalProfile.cfdiUse", label: "Uso de CFDI", required: true, source: "fiscalProfile" },
  email: { key: "fiscalProfile.email", label: "Correo electrónico", required: true, source: "fiscalProfile" }
};

const DEFAULT_FISCAL_FIELDS = [
  { key: "fiscalProfile.rfc", label: "RFC receptor", required: true, source: "fiscalProfile" },
  { key: "fiscalProfile.businessName", label: "Razón social", required: true, source: "fiscalProfile" },
  { key: "fiscalProfile.postalCode", label: "Código postal fiscal", required: true, source: "fiscalProfile" },
  { key: "fiscalProfile.taxRegime", label: "Régimen fiscal", required: true, source: "fiscalProfile" },
  { key: "fiscalProfile.cfdiUse", label: "Uso de CFDI", required: true, source: "fiscalProfile" },
  { key: "fiscalProfile.email", label: "Correo electrónico", required: true, source: "fiscalProfile" }
];

async function migrateConnectors() {
  console.log("Iniciando migración de conectores al nuevo formato de extractionContract...");
  try {
    const snapshot = await db.collection("connectors").get();
    if (snapshot.empty) {
      console.log("No se encontraron conectores para migrar.");
      return;
    }

    for (const doc of snapshot.docs) {
      const data = doc.data();
      console.log(`\nProcesando conector: ${data.nombre} (ID: ${doc.id})`);

      let requiredPortalFields = [];
      let fiscalFields = [];
      
      // Parse legacy fields if available
      let parsedFields = [];
      try {
        if (data.fieldsJson) {
          parsedFields = JSON.parse(data.fieldsJson);
        }
      } catch (e) {
        console.warn(`[Advertencia] No se pudo parsear fieldsJson para ${data.nombre}:`, e.message);
      }

      const isSimilares = data.nombre.toLowerCase().includes("similares") || data.rfc === "FSI120304XYZ";

      if (isSimilares) {
        // Build the exact Farmacias Similares extractionContract requested
        requiredPortalFields = [
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
            key: "portalFields.total",
            canonicalKey: "total",
            label: "Total facturado",
            type: "number",
            hints: [
              "Importe total de la compra tal como aparece en el ticket"
            ],
            validationPattern: "^[0-9]+(\\.[0-9]{1,2})?$",
            required: true,
            userEditable: true,
            source: "ticket"
          }
        ];
        fiscalFields = DEFAULT_FISCAL_FIELDS;
      } else {
        // Generic fallback migration for other legacy connectors
        // Map ticket fields
        let hasBillingRef = false;
        let hasTotal = false;

        for (const f of parsedFields) {
          if (f.source === "ticket") {
            const canonicalKey = (f.key === "referenciaFacturacion" || f.key === "folio" || f.key === "ticketNumber") ? "billingReference" : f.key;
            const key = `portalFields.${canonicalKey}`;
            const label = f.name || canonicalKey;
            
            const portalField = {
              key,
              canonicalKey,
              label,
              type: f.type === "number" ? "number" : "string",
              hints: [`Valor de ${label} requerido por el portal del comercio.`],
              validationPattern: canonicalKey === "billingReference" ? "^[A-Za-z0-9\\-]+$" : ".*",
              forbiddenPatterns: canonicalKey === "billingReference" ? FORBIDDEN_PATTERNS : [],
              required: f.required !== false,
              userEditable: true,
              source: "ticket"
            };

            if (canonicalKey === "billingReference") hasBillingRef = true;
            if (canonicalKey === "total") hasTotal = true;

            requiredPortalFields.push(portalField);
          } else if (f.source === "fiscalProfile") {
            const mapped = FISCAL_FIELDS_MAP[f.key];
            if (mapped) {
              fiscalFields.push(mapped);
            }
          }
        }

        // Ensure billingReference and total are populated
        if (!hasBillingRef) {
          requiredPortalFields.push({
            key: "portalFields.billingReference",
            canonicalKey: "billingReference",
            label: "Folio del ticket",
            type: "string",
            hints: ["Folio impreso en el ticket."],
            validationPattern: "^[A-Za-z0-9\\-]+$",
            forbiddenPatterns: FORBIDDEN_PATTERNS,
            required: true,
            userEditable: true,
            source: "ticket"
          });
        }
        if (!hasTotal) {
          requiredPortalFields.push({
            key: "portalFields.total",
            canonicalKey: "total",
            label: "Total facturado",
            type: "number",
            hints: ["Importe total de la compra."],
            validationPattern: "^[0-9]+(\\.[0-9]{1,2})?$",
            required: true,
            userEditable: true,
            source: "ticket"
          });
        }

        if (fiscalFields.length === 0) {
          fiscalFields = DEFAULT_FISCAL_FIELDS;
        }
      }

      // Build Screen Order
      const screen1Fields = requiredPortalFields.filter(f => f.canonicalKey === "billingReference").map(f => f.key);
      const screen2Fields = requiredPortalFields.filter(f => f.canonicalKey !== "billingReference").map(f => f.key);
      
      const screenOrder = [
        {
          screenIndex: 1,
          description: "Búsqueda de ticket",
          requiredFields: screen1Fields.length > 0 ? screen1Fields : ["portalFields.billingReference"]
        },
        {
          screenIndex: 2,
          description: "Monto de ticket",
          requiredFields: screen2Fields.length > 0 ? screen2Fields : ["portalFields.total"]
        },
        {
          screenIndex: 3,
          description: "Datos fiscales",
          requiredFields: fiscalFields.map(f => f.key)
        }
      ];

      const extractionContract = {
        requiredPortalFields,
        fiscalFields,
        screenOrder
      };

      // Save migration result
      await doc.ref.update({
        extractionContract,
        updatedAt: new Date().toISOString()
      });
      console.log(`[Migrado] extractionContract agregado con éxito.`);
    }

    console.log("\n¡Migración finalizada exitosamente!");
  } catch (err) {
    console.error("Fallo durante la migración de conectores:", err.message);
  }
}

migrateConnectors();
