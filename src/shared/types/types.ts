export interface PaymentCard {
  id: string;
  brand: "VISA" | "MASTERCARD" | "AMEX" | "MERCADOPAGO" | "PAYPAL" | "APPLEPAY" | "GOOGLEPAY" | "SPINBYOXXO";
  last4: string;
  expiry: string;
  isDefault: boolean;
  holderName: string;
  bankName?: string;
  isGooglePaySynced?: boolean;
}

export interface FiscalProfile {
  id?: string;
  userId: string;
  rfc: string;
  razonSocial: string;
  regimenFiscal: string; // e.g. "601", "605", "625", "612"
  codigoPostal: string; // 5 digits
  usoCFDI: string; // e.g. "G03", "D01", "D02", "CP01"
  createdAt: string;
  updatedAt?: string;
  personalGeminiKey?: string; // Optional user's custom Gemini API key to optimize complex processes
  plan?: "gratuito" | "brisa" | "serenidad" | "nirvana"; // Active user plan
  paymentStatus?: "free" | "pending_payment" | "payment_processing" | "paid" | "payment_failed" | "payment_rejected" | "payment_expired" | "subscription_active" | "subscription_paused" | "subscription_cancelled" | "requires_payment_method";
  paymentCards?: PaymentCard[]; // Registered cards
  correoElectronico?: string;
  correoRecepcion?: string;
  navigationDisabled?: boolean;
}

export interface Subscription {
  userId: string;
  planId: "gratuito" | "brisa" | "serenidad" | "nirvana";
  planName: string;
  status: "free" | "pending_payment" | "payment_processing" | "paid" | "payment_failed" | "payment_rejected" | "payment_expired" | "subscription_active" | "subscription_paused" | "subscription_cancelled" | "requires_payment_method";
  provider: "mercadopago" | "paypal" | "none";
  providerSubscriptionId?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  invoicesLimit: number;
  invoicesUsed: number;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id?: string;
  userId: string;
  planId: "brisa" | "serenidad" | "nirvana";
  provider: "mercadopago" | "paypal";
  providerPaymentId: string;
  amount: number;
  currency: string;
  status: "pending_payment" | "payment_processing" | "paid" | "payment_failed" | "payment_rejected" | "payment_expired";
  checkoutUrl?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillingEvent {
  id?: string;
  provider: "mercadopago" | "paypal";
  eventType: string;
  providerEventId: string;
  processed: boolean;
  receivedAt: string;
}

export interface TicketItem {
  description: string;
  amount: number;
}

export interface ExtractedTicketData {
  rfcEmisor: string;
  nombreEmisor: string;
  fechaCompra: string;
  folio: string;
  total: number;
  sucursal?: string;
  items: TicketItem[];
  ocrFailed?: boolean;
  ocrError?: string;
}

export interface Ticket {
  id?: string;
  userId: string;
  imageUrl: string;
  status: "extracted" | "processing" | "completed" | "failed" | "review";
  rfcEmisor?: string;
  nombreEmisor?: string;
  fechaCompra?: string;
  folio?: string;
  total?: number;
  sucursal?: string;
  itemsJson?: string; // Stringified TicketItem[]
  connectorId?: string;
  invoiceId?: string;
  errorMsg?: string;
  createdAt: string;
  cost?: number; // OCR cost
  rawCost?: number; // Raw model token-based cost
  learningApprovedByAdmin?: boolean;
  isOfflinePending?: boolean;
  wasProcessedOffline?: boolean;
}

export interface ConnectorField {
  key: string; // e.g. "rfc", "folio", "fecha", "total"
  name: string; // e.g. "RFC Emisor", "Folio del Ticket"
  selector: string; // CSS selector
  type: "text" | "number" | "date" | "select";
  required: boolean;
  value?: string;
}

export interface Connector {
  id?: string;
  userId: string; // 'system' or authenticated uid
  nombre: string;
  rfc: string;
  portalUrl: string;
  fieldsJson: string; // Serialized ConnectorField[]
  flowJson: string; // Serialized string[] (steps description)
  createdAt: string;
  cost?: number; // Training/learning cost
  rawCost?: number; // Raw model training token-based cost
  learnedFrom?: "automatizacion_ticket" | "portal_admin"; // Origin of learning
  userName?: string;
  userEmail?: string;
}

export interface Invoice {
  id?: string;
  userId: string;
  ticketId: string;
  folioFiscal: string; // UUID
  rfcEmisor: string;
  nombreEmisor: string;
  rfcReceptor: string;
  nombreReceptor: string;
  total: number;
  xmlContent: string;
  pdfHtml?: string; // HTML invoice layout
  createdAt: string;
  cost?: number;
  rawCost?: number; // Raw model execution token-based cost
  connectorType?: "existente" | "nuevo";
}
