import { db } from "@/services/firebase/client";
import { collection, doc, setDoc } from "firebase/firestore";

function buildConnectorPayload({
  cost,
  fields,
  flow,
  learnedFrom,
  nombre,
  rawCost,
  rfc,
  user,
  fiscalProfile
}) {
  return {
    userId: user.uid,
    nombre: nombre.toUpperCase(),
    rfc: rfc.toUpperCase(),
    portalUrl: `https://${nombre.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "")}.com.mx/facturacion`,
    fieldsJson: JSON.stringify(fields),
    flowJson: JSON.stringify(flow),
    createdAt: new Date().toISOString(),
    cost,
    rawCost,
    learnedFrom,
    userName: fiscalProfile?.razonSocial || user?.displayName || "Usuario Integrado",
    userEmail: user?.email || "usuario@mail.com"
  };
}

export async function createInlineConnector(user, fiscalProfile, nombre, rfc, learnedFrom = "automatizacion_ticket") {
  const fields = [
    { key: "rfc", name: "RFC Receptor", selector: "input#receptor_rfc", type: "text", required: true },
    { key: "folio", name: "Codigo de Facturacion", selector: "input#ticket_id_folio", type: "text", required: true },
    { key: "total", name: "Total Facturado", selector: "input#total_amount_charge", type: "number", required: true },
    { key: "fecha", name: "Fecha del Ticket", selector: "input#fecha_day", type: "date", required: true }
  ];
  const flow = [
    "1. Acceder al portal remoto de facturacion corporativa",
    "2. Ingresar codigo de referencia y RFC de receptor",
    "3. Configurar Uso de CFDI 4.0 seleccionado",
    "4. Solicitar timbrado certificado ante PAC",
    "5. Sincronizar comprobantes PDF y XML oficiales"
  ];

  const connectorPayload = buildConnectorPayload({
    cost: 15.0,
    fields,
    fiscalProfile,
    flow,
    learnedFrom,
    nombre,
    rawCost: 0.12,
    rfc,
    user
  });

  const connectorRef = doc(collection(db, "connectors"));
  await setDoc(connectorRef, connectorPayload);
  return { id: connectorRef.id, ...connectorPayload };
}

export async function createTrainedConnector(user, fiscalProfile, nombre, rfc, tokenSaver = true) {
  const fields = [
    { key: "rfc", name: "RFC Emisor", selector: "input[name='rfc_receptor']", type: "text", required: true },
    { key: "folio", name: "Folio de Factura", selector: "input#folio_ticket", type: "text", required: true },
    { key: "total", name: "Total Neto", selector: "input.amount_sub", type: "number", required: true },
    { key: "fecha", name: "Fecha del Ticket", selector: "input#fecha_day", type: "date", required: true }
  ];
  const flow = [
    "1. Navegar al dominio de autofactura",
    "2. Identificar el ticket de consumo",
    "3. Llenar los datos de receptor fiscal",
    "4. Generar CFDI timbrado",
    "5. Descargar XML y representaciones visuales"
  ];

  const connectorPayload = buildConnectorPayload({
    cost: tokenSaver ? 12.5 : 25.0,
    fields,
    fiscalProfile,
    flow,
    learnedFrom: "portal_admin",
    nombre,
    rawCost: tokenSaver ? 0.08 : 0.22,
    rfc,
    user
  });

  const connectorRef = doc(collection(db, "connectors"));
  await setDoc(connectorRef, connectorPayload);
  return { id: connectorRef.id, ...connectorPayload };
}

export async function seedDefaultConnectors(connectors) {
  const standardList = [
    {
      userId: "system",
      nombre: "Starbucks / Alsea",
      rfc: "SHE190630TX1",
      portalUrl: "https://alsea.facturacion.com",
      fieldsJson: JSON.stringify([
        { key: "rfc", name: "RFC Receptor", selector: "input#rfc_id", type: "text", required: true },
        { key: "folio", name: "Ticket Folio", selector: "input#folio_ticket", type: "text", required: true },
        { key: "total", name: "Total Importe", selector: "input#total_amount", type: "number", required: true },
        { key: "fecha", name: "Fecha Compra", selector: "input#fecha_day", type: "date", required: true }
      ]),
      flowJson: JSON.stringify([
        "1. Acceder al portal de facturacion Alsea",
        "2. Capturar RFC receptor y datos del ticket de compra",
        "3. Indicar Uso de CFDI correspondiente",
        "4. Efectuar timbrado digital federal SAT",
        "5. Guardar documentos PDF y XML generados"
      ]),
      createdAt: new Date().toISOString()
    },
    {
      userId: "system",
      nombre: "OXXO Cadena",
      rfc: "CCO8605231N4",
      portalUrl: "http://factura.oxxo.com:8080",
      fieldsJson: JSON.stringify([
        { key: "rfc", name: "RFC Emisor", selector: "input[name='rfc']", type: "text", required: true },
        { key: "folio", name: "Numero de Folio", selector: "input#folio", type: "text", required: true },
        { key: "total", name: "Total Ticket", selector: "input#importe", type: "number", required: true },
        { key: "fecha", name: "Fecha de Compra", selector: "input#fecha", type: "date", required: true }
      ]),
      flowJson: JSON.stringify([
        "1. Cargar el portal oficial de facturas de Tiendas OXXO",
        "2. Capturar los datos de ticket correspondientes",
        "3. Ingresar RFC de receptor fiscal",
        "4. Autorizar emision de CFDI con sello SAT",
        "5. Consolidar documentos digitales en almacen"
      ]),
      createdAt: new Date().toISOString()
    },
    {
      userId: "system",
      nombre: "Walmart / Aurrera",
      rfc: "NWM9709244W4",
      portalUrl: "https://facturacion.walmartmexico.com",
      fieldsJson: JSON.stringify([
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "folio", name: "Numero de Transaccion", selector: "input#ticket", type: "text", required: true },
        { key: "total", name: "Monto Neto Total", selector: "input#monto", type: "number", required: true },
        { key: "fecha", name: "Fecha del Ticket", selector: "input#fecha", type: "date", required: true }
      ]),
      flowJson: JSON.stringify([
        "1. Ingresar al portal de facturas Walmart Mexico",
        "2. Suministrar TR y RFC receptor",
        "3. Suministrar codigo de sucursal de compra",
        "4. Proceder con el timbrado fiscal",
        "5. Almacenar facturas PDF y XML"
      ]),
      createdAt: new Date().toISOString()
    }
  ];

  for (const connector of standardList) {
    const found = connectors.find((item) => item.rfc === connector.rfc);
    if (!found) {
      await setDoc(doc(collection(db, "connectors")), connector);
    }
  }

  return standardList;
}
