export interface PaymentCard {
  id: string;
  brand: "VISA" | "MASTERCARD" | "AMEX" | "MERCADOPAGO" | "PAYPAL" | "APPLEPAY" | "GOOGLEPAY" | "SPINBYOXXO";
  last4: string;
  expiry: string;
  isDefault: boolean;
  holderName: string;
  bankName?: string;
  stripePaymentMethodId?: string;
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
  portalFields?: Record<string, any>;
  portalFieldsConfidence?: Record<string, number>;
  status?: string;
}

export type TicketStatus = 
  | "uploaded"
  | "ocr_processing"
  | "connector_detected"
  | "missing_required_fields"
  | "queued_for_runner"
  | "runner_processing"
  | "merchant_cfdi_downloaded"
  | "xml_structure_validated"
  | "sat_validation_pending"
  | "cfdi_validated"
  | "invoice_obtained"
  | "requires_manual_review"
  | "failed"
  | "training_required"
  | "connector_not_ready"
  | "connector_resolving"
  | "pending_portal_submission"
  | "submitted_to_merchant"
  | "waiting_portal_result"
  | "sat_verifying"
  | "waiting_fiscal_profile"
  // Backwards compatibility
  | "extracted"
  | "processing"
  | "completed"
  | "review"
  | "requires_user_correction"
  | "cancelled_by_user";

export type InvoiceJobStatus = 
  | "pending"
  | "locked"
  | "running"
  | "waiting_user_input"
  | "downloaded"
  | "validating_xml"
  | "validating_sat"
  | "succeeded"
  | "failed"
  | "manual_review"
  | "cancelled";

export type ReviewReasonCode = 
  | "CONNECTOR_NOT_FOUND"
  | "CONNECTOR_NOT_PRODUCTION_READY"
  | "CONNECTOR_RUNNER_NOT_AVAILABLE"
  | "PORTAL_MAP_NOT_FOUND"
  | "PORTAL_MAP_NOT_APPROVED"
  | "MISSING_REQUIRED_FIELDS"
  | "CAPTCHA_DETECTED"
  | "PORTAL_TIMEOUT"
  | "PORTAL_CHANGED"
  | "PORTAL_RETURNED_ERROR"
  | "PORTAL_REJECTED_TICKET_DATA"
  | "XML_NOT_DOWNLOADED"
  | "PDF_NOT_DOWNLOADED"
  | "XML_STRUCTURE_INVALID"
  | "XML_RFC_MISMATCH"
  | "XML_TOTAL_MISMATCH"
  | "XML_UUID_MISSING"
  | "SAT_STATUS_NOT_FOUND"
  | "SAT_STATUS_CANCELLED"
  | "SAT_VALIDATION_UNAVAILABLE"
  | "UNKNOWN_RUNNER_ERROR"
  | "RUNNER_TIMEOUT"
  // Backwards compatibility
  | "CONNECTOR_SCHEMA_INVALID"
  | "USER_REQUESTED_REVIEW";

export interface Ticket {
  id?: string;
  userId: string;
  imageUrl: string;
  status: TicketStatus;
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
  correctionError?: any;
  reviewError?: any;
  automationEvents?: any[];
  processingMessage?: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt?: string;
  portalFields?: Record<string, any>;
  portalFieldsConfidence?: Record<string, number>;
  rawOcrText?: string;
  missingFields?: string[];
  reviewReasonCode?: string;
  shortCode?: string;
  billingReference?: string;
  referenciaFacturacion?: string;
  extractionState?: string;
  jobId?: string;
  extractionDiagnostics?: any;
}

export interface InvoiceJob {
  id?: string;
  ticketId: string;
  userId: string;
  status: InvoiceJobStatus;
  connectorId: string;
  ticketDataSnapshot: ExtractedTicketData;
  fiscalProfileSnapshot: FiscalProfile;
  lockedBy?: string | null;
  lockedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  attempts: number;
  maxAttempts?: number;
  lastError?: string | null;
  lastErrorTime?: string | null;
  waitingForFields?: string[];
  userInputData?: Record<string, string>;
  createdAt: string;
  updatedAt?: string;
}

export interface PortalMap {
  id?: string;
  connectorId: string;
  url: string;
  selectorsJson: string; // CSS selectors
  isApproved: boolean;
  approvedBy?: string;
  createdAt: string;
  updatedAt?: string;
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
  runnerAvailable?: boolean;
  status?: string;
  isProductionReady?: boolean;
  extractionContract?: any;
  aliases?: string[];
  isMock?: boolean;
  disabledReason?: string;
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
  status?: string;
  emailReceptor?: string;
  regimenFiscalReceptor?: string;
  usoCfdiReceptor?: string;
  regimenFiscalEmisor?: string;
  cost?: number;
  rawCost?: number; // Raw model execution token-based cost
  connectorType?: "existente" | "nuevo";
}
