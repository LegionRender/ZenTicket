import { MOCK_ACTIVE_TICKETS, MOCK_EMITTED_INVOICES } from "@/workspace/features/tickets/ticketsMocks";

const now = new Date().toISOString();

export const FALLBACK_CONNECTORS = [
  {
    id: "fallback-connector-starbucks",
    userId: "system",
    nombre: "Starbucks / Alsea",
    rfc: "SHE190630TX1",
    portalUrl: "https://alsea.facturacion.com",
    fieldsJson: JSON.stringify([
      { key: "rfc", name: "RFC Receptor", selector: "input#rfc_id", type: "text", required: true },
      { key: "folio", name: "Ticket Folio", selector: "input#folio_ticket", type: "text", required: true },
      { key: "total", name: "Total Importe", selector: "input#total_amount", type: "number", required: true },
      { key: "fecha", name: "Fecha Compra", selector: "input#fecha_day", type: "date", required: true },
    ]),
    flowJson: JSON.stringify([
      "Acceder al portal de facturacion Alsea",
      "Capturar RFC receptor y datos del ticket",
      "Timbrar CFDI y descargar XML/PDF",
    ]),
    createdAt: now,
  },
  {
    id: "fallback-connector-oxxo",
    userId: "system",
    nombre: "OXXO Cadena",
    rfc: "CCO8605231N4",
    portalUrl: "http://factura.oxxo.com:8080",
    fieldsJson: JSON.stringify([
      { key: "rfc", name: "RFC Emisor", selector: "input[name='rfc']", type: "text", required: true },
      { key: "folio", name: "Numero de Folio", selector: "input#folio", type: "text", required: true },
      { key: "total", name: "Total Ticket", selector: "input#importe", type: "number", required: true },
      { key: "fecha", name: "Fecha de Compra", selector: "input#fecha", type: "date", required: true },
    ]),
    flowJson: JSON.stringify([
      "Cargar portal oficial de OXXO",
      "Capturar datos del ticket",
      "Emitir CFDI con sello SAT",
    ]),
    createdAt: now,
  },
  {
    id: "fallback-connector-walmart",
    userId: "system",
    nombre: "Walmart / Aurrera",
    rfc: "NWM9709244W4",
    portalUrl: "https://facturacion.walmartmexico.com",
    fieldsJson: JSON.stringify([
      { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
      { key: "folio", name: "Numero de Transaccion", selector: "input#ticket", type: "text", required: true },
      { key: "total", name: "Monto Neto Total", selector: "input#monto", type: "number", required: true },
      { key: "fecha", name: "Fecha del Ticket", selector: "input#fecha", type: "date", required: true },
    ]),
    flowJson: JSON.stringify([
      "Ingresar al portal de Walmart Mexico",
      "Suministrar TR y RFC receptor",
      "Guardar facturas PDF y XML",
    ]),
    createdAt: now,
  },
  {
    id: "fallback-trained-ticketmaster",
    userId: "fallback-admin",
    nombre: "Ticketmaster MX",
    rfc: "TME840315KT6",
    portalUrl: "https://facturacion.ticketmaster.com.mx",
    fieldsJson: JSON.stringify([
      { key: "rfc", name: "RFC Receptor", selector: "input#customer_rfc", type: "text", required: true },
      { key: "folio", name: "Codigo de compra", selector: "input#order_code", type: "text", required: true },
      { key: "total", name: "Total", selector: "input#total", type: "number", required: true },
    ]),
    flowJson: JSON.stringify([
      "Detectar portal con captcha intermitente",
      "Aplicar reintentos OCR",
      "Solicitar timbrado por portal emisor",
    ]),
    learnedFrom: "fallback_training",
    cost: 18.4,
    rawCost: 0.19,
    createdAt: now,
    userEmail: "admin@zenticket.mx",
  },
];

export const FALLBACK_TICKETS = MOCK_ACTIVE_TICKETS.map((ticket, index) => ({
  ...ticket,
  id: ticket.id || `fallback-ticket-${index + 1}`,
  userId: "fallback-user",
  rfcEmisor: index === 0 ? "CSI020226MV4" : "PEME8201249A2",
  cost: index === 0 ? 0.5 : 0.65,
  rawCost: index === 0 ? 0.04 : 0.06,
  createdAt: now,
}));

export const FALLBACK_INVOICES = MOCK_EMITTED_INVOICES.map((invoice, index) => ({
  ...invoice,
  id: invoice.id || `fallback-invoice-${index + 1}`,
  userId: "fallback-user",
  cost: 2.5,
  rawCost: 0.12,
}));

export function getFallbackProfiles(user) {
  return [
    {
      id: user?.uid || "fallback-user",
      userId: user?.uid || "fallback-user",
      razonSocial: "RICARDO CASTRO BECERRIL",
      rfc: "CABE850101ABC",
      correoRecepcion: user?.email || "contacto@zenticket.mx",
      plan: "empresa",
      onboardingCompleted: true,
    },
  ];
}
