import { getDetailedReasonMsg } from "./ticketHelpers";
import { normalizeBillingAttemptFields } from "@/shared/utils/normalizeFields";
import { getBillingStatusVisual } from "@/shared/billing/billingStatusVisuals";

export interface BillingCanonicalState {
  canonicalStatus: string;
  isActive: boolean;
  isReady: boolean;
  isValidInvoice: boolean;
  requiresManualReview: boolean;
  canViewPdf: boolean;
  canDownloadXml: boolean;
  shouldAppearInReady: boolean;
  shouldAppearInAttention: boolean;
  shouldAppearInProcess: boolean;
  badgeLabel: string;
  badgeTone: string;
  message: string;
  displayTotal: number;
}

export const getBillingCanonicalState = (params: {
  ticket?: any;
  invoice?: any;
  job?: any;
}): BillingCanonicalState => {
  const t = params.ticket || {};
  const inv = params.invoice || {};
  const j = params.job || {};

  // 1. Correct Amount rule (displayTotal priority)
  let displayTotal = 0;
  if (t.expectedTicketTotal && t.expectedTicketTotal > 0) {
    displayTotal = t.expectedTicketTotal;
  } else if (t.portalFields?.totalAmount && t.portalFields.totalAmount > 0) {
    displayTotal = t.portalFields.totalAmount;
  } else if (t.portalFields?.total && t.portalFields.total > 0) {
    displayTotal = t.portalFields.total;
  } else if (t.ticketData?.total && t.ticketData.total > 0) {
    displayTotal = t.ticketData.total;
  } else if (t.amountPaid && t.amountPaid > 0) {
    displayTotal = t.amountPaid;
  } else if (inv.total && inv.total > 0) {
    displayTotal = inv.total;
  } else if (t.total !== undefined && t.total > 0) {
    displayTotal = t.total;
  } else if (inv.amount !== undefined && inv.amount > 0) {
    displayTotal = inv.amount;
  } else if (t.total !== undefined) {
    displayTotal = t.total;
  } else if (inv.amount !== undefined) {
    displayTotal = inv.amount;
  } else {
    displayTotal = 0;
  }

  // 2. CFDI Validated status
  const isCfdiValidated = inv.isCfdiValidated === true || 
                          inv.cfdiValidated === true || 
                          t.status === "cfdi_validated" || 
                          t.status === "completed" ||
                          j.cfdiValidated === true;

  // XML and PDF files availability
  const hasXml = (!!inv.xmlContent && inv.xmlContent.trim().length > 0) || (!!inv.xmlStoragePath && inv.xmlStoragePath.trim().length > 0);
  const hasPdf = (!!inv.pdfHtml && inv.pdfHtml.trim().length > 0) || (!!inv.pdfStoragePath && inv.pdfStoragePath.trim().length > 0);
  const hasFolio = !!inv.uuid || !!inv.folioFiscal || !!j.result?.uuid;

  // 3. Error code / rejection mapping
  const hasErrorCode = (code: string): boolean => {
    return inv.errorCode === code ||
           inv.reviewReasonCode === code ||
           inv.reviewError?.errorCode === code ||
           inv.reviewError?.code === code ||
           inv.reviewError?.runnerErrorCode === code ||
           t.errorCode === code ||
           t.reviewReasonCode === code ||
           t.reviewError?.errorCode === code ||
           t.reviewError?.code === code ||
           t.reviewError?.runnerErrorCode === code ||
           j.errorCode === code ||
           j.reviewReasonCode === code;
  };

  const isAlreadyInvoiced = hasErrorCode("TICKET_ALREADY_INVOICED") || 
                             inv.wasAlreadyInvoiced === true ||
                             t.wasAlreadyInvoiced === true ||
                             j.wasAlreadyInvoiced === true;

  const isTotalMismatch = hasErrorCode("CFDI_TOTAL_MISMATCH") ||
                          (t.status === "failed_blocking" && (t.errorMsg || "").toLowerCase().includes("total"));

  // Check if RFC receptor mismatch exists directly between invoice and ticket/profile
  const xmlRfcReceptor = inv.rfcReceptor || "";
  const expectedRfcReceptor = t.rfcReceptor || t.portalFields?.rfcReceptor || "";
  const isRfcMismatchDirect = (!!xmlRfcReceptor && !!expectedRfcReceptor && xmlRfcReceptor.trim().toUpperCase() !== expectedRfcReceptor.trim().toUpperCase());
  const isRfcMismatch = hasErrorCode("CFDI_RFC_RECEPTOR_MISMATCH") ||
                        isRfcMismatchDirect ||
                        (t.status === "failed_blocking" && (t.errorMsg || "").toLowerCase().includes("rfc"));

  const isRfcEmisorMismatch = hasErrorCode("CFDI_RFC_EMISOR_MISMATCH");
  const isInvalidXml = hasErrorCode("CFDI_INVALID_XML");

  // A ticket can be really total 0, check if we expected > 0
  const isInvalidTotal = (inv.total === 0 && displayTotal > 0);

  // Determine attempts/retries globally
  const satAttemptCount = inv.satAttemptCount ?? t.satAttemptCount ?? j.attempts ?? 0;
  const hasPendingRetries = satAttemptCount < 3 || !!(inv.nextSatValidationAt || t.nextSatValidationAt);

  // Normalize SAT status using our helper
  const satInv = normalizeSatValidationState(inv, hasPendingRetries);
  const satTicket = normalizeSatValidationState(t, hasPendingRetries);
  const satJob = normalizeSatValidationState(j, hasPendingRetries);

  const isSatValid = satInv.isSatValid || satTicket.isSatValid || satJob.isSatValid;
  const isSatPending = satInv.isSatPending || satTicket.isSatPending || satJob.isSatPending;
  const isSatNotFound = satInv.isSatNotFound || satTicket.isSatNotFound || satJob.isSatNotFound;
  const isSatTimeout = satInv.isSatTimeout || satTicket.isSatTimeout || satJob.isSatTimeout;
  const isSatCancelled = satInv.isSatCancelled || satTicket.isSatCancelled || satJob.isSatCancelled;

  const satBadge = satInv.satBadge || satTicket.satBadge || satJob.satBadge;
  const satMessage = satInv.satMessage || satTicket.satMessage || satJob.satMessage;

  // Status mapping logic
  let canonicalStatus = "unknown";
  let badgeLabel = "REVISIÓN MANUAL";
  let badgeTone = "zt-badge-attention";
  let message = "Estado de facturación desconocido o no reconocido.";

  let isActive = false;
  let isReady = false;
  let isValidInvoice = false;
  let requiresManualReview = true;
  let canViewPdf = false;
  let canDownloadXml = false;

  let shouldAppearInReady = false;
  let shouldAppearInAttention = true;
  let shouldAppearInProcess = false;

  // A real invoice is valid if it meets all these:
  const invoiceRealIsValid = 
    (!inv.id || !inv.id.startsWith("inv-fallback-")) && 
    inv.synthetic !== true &&
    (inv.isCfdiValidated === true || inv.cfdiValidated === true) &&
    (inv.satValidated === true || inv.satStatus?.toLowerCase() === "vigente" || inv.satEstado?.toLowerCase() === "vigente" || inv.estadoCfdi?.toLowerCase() === "vigente" || inv.validationStatus === "sat_validated") &&
    (!!inv.xmlContent || !!inv.xmlStoragePath) &&
    (!!inv.uuid || !!inv.folioFiscal) &&
    !isRfcMismatch &&
    !isTotalMismatch &&
    !isInvalidTotal;

  const ticketHasValidatedCfdi = 
    t.status === "cfdi_validated" || 
    t.isCfdiValidated === true || 
    t.satValidated === true ||
    t.validationStatus === "sat_validated" ||
    t.satStatus?.toLowerCase() === "vigente";

  const satisfiesStrictRules = 
    invoiceRealIsValid && 
    (displayTotal > 0 || (t.expectedTicketTotal === 0 || t.total === 0));

  const isAlreadyInvoicedXmlNotRecovered =
    hasErrorCode("ALREADY_INVOICED_XML_NOT_RECOVERED") ||
    t.status === "already_invoiced_unverified" ||
    j.status === "already_invoiced_unverified" ||
    t.reviewReasonCode === "ALREADY_INVOICED_XML_NOT_RECOVERED" ||
    j.reviewReasonCode === "ALREADY_INVOICED_XML_NOT_RECOVERED";

  const isAlreadyInvoicedDetected =
    isAlreadyInvoiced ||
    isAlreadyInvoicedXmlNotRecovered ||
    t.status === "portal_already_invoiced_detected" ||
    j.status === "portal_already_invoiced_detected" ||
    t.status === "invoice_recovery_pending" ||
    t.status === "invoice_recovery_retrying";

  const isRecoveryPending =
    (t.status === "invoice_recovery_pending" ||
     t.status === "invoice_recovery_retrying" ||
     t.status === "portal_already_invoiced_detected") ||
    (j.id && j.status !== "failed" && j.status !== "succeeded" && 
     (t.status === "invoice_recovery_pending" || t.status === "invoice_recovery_retrying" || isAlreadyInvoiced));

  // Evaluate states by strict priority order:
  if (isRfcMismatch) {
    canonicalStatus = "cfdi_rfc_mismatch";
    badgeLabel = "RFC INCORRECTO";
    badgeTone = "zt-badge-error";
    message = "La factura fue emitida con un RFC de receptor incorrecto.";
    shouldAppearInReady = false;
    shouldAppearInAttention = true;
    shouldAppearInProcess = false;
    requiresManualReview = true;
  } else if (isInvalidTotal) {
    canonicalStatus = "cfdi_invalid";
    badgeLabel = "CFDI INVÁLIDO";
    badgeTone = "zt-badge-error";
    message = "La factura tiene un total de $0.00 y no coincide con el ticket.";
    shouldAppearInReady = false;
    shouldAppearInAttention = true;
    shouldAppearInProcess = false;
    requiresManualReview = true;
  } else if (isTotalMismatch) {
    canonicalStatus = "cfdi_total_mismatch";
    badgeLabel = "TOTAL INCORRECTO";
    badgeTone = "zt-badge-error";
    message = "La factura fue emitida por un monto que no coincide con el ticket.";
    shouldAppearInReady = false;
    shouldAppearInAttention = true;
    shouldAppearInProcess = false;
    requiresManualReview = true;
  } else if (isSatCancelled) {
    canonicalStatus = "cfdi_cancelled";
    badgeLabel = "CFDI CANCELADO";
    badgeTone = "zt-badge-error";
    message = satMessage || "El XML obtenido se encuentra CANCELADO ante el SAT. Requiere revisión manual.";
    shouldAppearInReady = false;
    shouldAppearInAttention = true;
    shouldAppearInProcess = false;
    requiresManualReview = true;
  } else if (isSatNotFound) {
    canonicalStatus = "cfdi_not_found_in_sat";
    badgeLabel = "CFDI NO LOCALIZADO";
    badgeTone = "zt-badge-error";
    message = satMessage || "El CFDI no fue localizado en los controles del SAT después de varios intentos. Requiere revisión manual.";
    shouldAppearInReady = false;
    shouldAppearInAttention = true;
    shouldAppearInProcess = false;
    requiresManualReview = true;
  } else if (isSatPending) {
    canonicalStatus = "sat_validation_pending";
    badgeLabel = "VALIDANDO SAT";
    badgeTone = "zt-badge-process animate-pulse";
    message = satMessage || "El CFDI no ha sido localizado aún en el SAT. Reintentando validación automáticamente.";
    isActive = true;
    shouldAppearInProcess = true;
    shouldAppearInAttention = false;
    shouldAppearInReady = false;
  } else if (isSatTimeout) {
    canonicalStatus = "sat_timeout";
    badgeLabel = "REVISIÓN MANUAL";
    badgeTone = "zt-badge-attention";
    message = satMessage || "No pudimos verificar el CFDI ante el SAT en este momento.";
    shouldAppearInReady = false;
    shouldAppearInAttention = true;
    shouldAppearInProcess = false;
    requiresManualReview = true;
  } else if (isInvalidXml) {
    canonicalStatus = "cfdi_invalid_xml";
    badgeLabel = "XML INVÁLIDO";
    badgeTone = "zt-badge-error";
    message = "La estructura XML de la factura no es válida.";
    shouldAppearInReady = false;
    shouldAppearInAttention = true;
    shouldAppearInProcess = false;
    requiresManualReview = true;
  } else if (ticketHasValidatedCfdi && !invoiceRealIsValid) {
    canonicalStatus = "invoice_missing_for_validated_cfdi";
    badgeLabel = "SINCRONIZACIÓN PENDIENTE";
    badgeTone = "zt-badge-attention";
    message = "CFDI validado, pero falta sincronizar el documento de factura.";
    shouldAppearInReady = false;
    shouldAppearInAttention = true;
    shouldAppearInProcess = false;
    requiresManualReview = true;
    canViewPdf = false;
    canDownloadXml = false;
  } else if (satisfiesStrictRules) {
    canonicalStatus = "cfdi_validated";
    isReady = true;
    isValidInvoice = true;
    requiresManualReview = false;
    canViewPdf = hasPdf;
    canDownloadXml = hasXml;
    shouldAppearInReady = true;
    shouldAppearInAttention = false;
    shouldAppearInProcess = false;
    badgeLabel = isAlreadyInvoiced ? "YA FACTURADO" : "FACTURADO";
    badgeTone = isAlreadyInvoiced ? "zt-badge-attention" : "zt-badge-ok";
    message = "La factura ha sido emitida y validada exitosamente.";
  } else if (isAlreadyInvoicedDetected) {
    if (isRecoveryPending && !invoiceRealIsValid) {
      canonicalStatus = "invoice_recovery_pending";
      badgeLabel = "RECUPERANDO CFDI";
      badgeTone = "zt-badge-process animate-pulse";
      message = "El portal indica que este ticket ya fue facturado. ZenTicket está intentando recuperar el XML/PDF para validarlo con SAT.";
      shouldAppearInReady = false;
      shouldAppearInProcess = true;
      shouldAppearInAttention = false;
      canDownloadXml = false;
      canViewPdf = false;
      isActive = true;
      requiresManualReview = false;
    } else {
      canonicalStatus = "already_invoiced_unverified";
      badgeLabel = "YA FACTURADO SIN XML";
      badgeTone = "zt-badge-attention";
      message = t.portalMessage || t.errorMsg || j.lastError || "El portal indica que este ticket ya fue facturado, pero ZenTicket no pudo recuperar ni validar el XML fiscal.";
      shouldAppearInReady = false;
      shouldAppearInProcess = false;
      shouldAppearInAttention = true;
      requiresManualReview = true;
      canDownloadXml = false;
      canViewPdf = false;
    }
  } else if (t.status === "failed_blocking") {
    canonicalStatus = "failed_blocking";
    badgeLabel = "BLOQUEADO";
    badgeTone = "zt-badge-error";
    message = "Ticket Bloqueado: " + (t.errorMsg || "no se puede continuar con la automatización.");
  } else if (t.status === "requires_manual_review" || t.status === "review") {
    canonicalStatus = "requires_manual_review";
    badgeLabel = "REVISIÓN MANUAL";
    badgeTone = "zt-badge-attention";
    message = getDetailedReasonMsg(t);
  } else if (t.status === "invoice_obtained" && !isCfdiValidated) {
    canonicalStatus = "invoice_obtained_unverified";
    badgeLabel = "REVISIÓN MANUAL";
    badgeTone = "zt-badge-attention";
    message = "Esta factura requiere revisión. El CFDI no fue validado correctamente o el portal indica que el ticket ya fue facturado.";
  } else if (["waiting_user_captcha", "blocked_by_captcha", "waiting_human_verification", "captcha_failed", "captcha_timeout"].includes(t.status || "") || j.status === "waiting_user_action") {
    canonicalStatus = "waiting_user_captcha";
    isActive = true;
    requiresManualReview = true;
    shouldAppearInAttention = true;
    shouldAppearInProcess = true;
    badgeLabel = "CAPTCHA REQUERIDO";
    badgeTone = "zt-badge-attention animate-pulse";
    message = getDetailedReasonMsg(t);
  } else if (isCfdiValidated) {
    canonicalStatus = "invoice_obtained_unverified";
    badgeLabel = "REVISIÓN MANUAL";
    badgeTone = "zt-badge-attention";
    message = "Esta factura requiere revisión. El CFDI no fue validado correctamente o el portal indica que el ticket ya fue facturado.";
    shouldAppearInReady = false;
    shouldAppearInAttention = true;
    shouldAppearInProcess = false;
    requiresManualReview = true;
  } else {
    // Check active processing
    const isProcessing = ["runner_processing", "processing", "queued_for_runner", "pending_portal_submission", "submitted_to_merchant", "waiting_portal_result", "sat_verifying", "merchant_cfdi_downloaded"].includes(t.status || "") || (j.id && j.status !== "failed" && j.status !== "succeeded");
    if (isProcessing) {
      const isQueued = t.status === "queued_for_runner";
      canonicalStatus = isQueued ? "queued" : "active_processing";
      isActive = true;
      requiresManualReview = false;
      shouldAppearInAttention = false;
      shouldAppearInProcess = true;
      badgeLabel = isQueued ? "EN COLA (JIT)" : "AUTOMATIZANDO";
      badgeTone = isQueued ? "zt-badge-archived" : "zt-badge-process";
      message = isQueued ? "El ticket está en cola y comenzará a procesarse en breve." : "Procesando de forma automatizada. Por favor espera.";
    } else {
      // Fallback fallback
      const hasControlFields = 
        !!t.status || 
        !!t.errorCode || 
        !!t.reviewReasonCode || 
        !!t.portalMessage || 
        !!t.reviewError?.runnerErrorCode || 
        !!inv.satStatus || 
        !!inv.id || 
        !!j.id || 
        isAlreadyInvoiced;
      
      if (hasControlFields) {
        canonicalStatus = "requires_manual_review";
        shouldAppearInReady = false;
        shouldAppearInAttention = true;
        shouldAppearInProcess = false;
        requiresManualReview = true;
        badgeLabel = "REVISIÓN MANUAL";
        badgeTone = "zt-badge-attention";
        message = t.portalMessage || t.errorMsg || j.lastError || (t.errorCode ? `Error: ${t.errorCode}` : "Ocurrió un inconveniente con el procesamiento en el portal.");
      } else {
        canonicalStatus = "unknown";
        badgeLabel = "REVISIÓN MANUAL";
        badgeTone = "zt-badge-attention";
        message = "Estado de facturación desconocido o no reconocido.";
      }
    }
  }

  // Apply priority message resolution
  let finalMessage = message;

  const isAlreadyInvoicedMsg = 
    hasErrorCode("TICKET_ALREADY_INVOICED") || 
    hasErrorCode("ALREADY_INVOICED_XML_NOT_RECOVERED") ||
    t.wasAlreadyInvoiced === true ||
    inv.wasAlreadyInvoiced === true ||
    j.wasAlreadyInvoiced === true ||
    t.status === "already_invoiced_unverified";

  if (isAlreadyInvoicedMsg) {
    if (canonicalStatus === "invoice_recovery_pending") {
      finalMessage = "El portal indica que este ticket ya fue facturado. ZenTicket está intentando recuperar el XML/PDF para validarlo con SAT.";
    } else {
      finalMessage = "El portal indica que este ticket ya fue facturado, pero ZenTicket no pudo recuperar ni validar el XML fiscal.";
    }
  } else {
    // Priority order:
    // 1. canonicalState.message
    // 2. portalMessage
    // 3. reviewError.userMessage
    // 4. errorCatalog
    // 5. fallback
    if (finalMessage === "Ocurrió un inconveniente con el procesamiento en el portal." || finalMessage === "Estado de facturación desconocido o no reconocido.") {
      const portalMsg = t.portalMessage ?? j.portalMessage ?? null;
      const reviewUserMsg = t.reviewError?.friendlyMessage ?? t.reviewError?.userMessage ?? t.reviewError?.message ?? null;
      const errorCatalogMsg = t.errorMsg ?? j.lastError ?? null;

      if (portalMsg) {
        finalMessage = portalMsg;
      } else if (reviewUserMsg) {
        finalMessage = reviewUserMsg;
      } else if (errorCatalogMsg) {
        finalMessage = errorCatalogMsg;
      }
    }
  }

  message = finalMessage;

  const visual = getBillingStatusVisual(canonicalStatus);
  badgeTone = visual.badgeClassName;

  return {
    canonicalStatus,
    isActive,
    isReady,
    isValidInvoice,
    requiresManualReview,
    canViewPdf,
    canDownloadXml,
    shouldAppearInReady,
    shouldAppearInAttention,
    shouldAppearInProcess,
    badgeLabel,
    badgeTone,
    message,
    displayTotal
  };
};

export interface BillingAlertStyle {
  tone: 'red' | 'amber' | 'blue' | 'green' | 'gray';
  bgClass: string;
  borderClass: string;
  textClass: string;
  icon: string;
  labelClass: string;
}

export const getBillingAlertStyle = (state: { canonicalStatus: string }): BillingAlertStyle => {
  const visual = getBillingStatusVisual(state?.canonicalStatus);
  return {
    tone: visual.statusGroup === "OK" ? "green" :
          visual.statusGroup === "COLA" ? "blue" :
          visual.statusGroup === "ALERTAS" ? "amber" :
          visual.statusGroup === "FALLOS" ? "red" : "gray",
    bgClass: visual.className,
    borderClass: "border-transparent",
    textClass: "",
    icon: visual.icon,
    labelClass: ""
  };
};

const normalizeKey = (key: any): string => {
  if (typeof key !== "string") return String(key || "").trim().toUpperCase();
  let normalized = key
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^TICKET#/g, "")
    .replace(/^FOLIO#/g, "")
    .replace(/^#/g, "");

  // Strip prefixes to align matching keys
  normalized = normalized
    .replace(/^INV-FALLBACK-/g, "")
    .replace(/^INVFALLBACK/g, "")
    .replace(/^INV_/g, "")
    .replace(/^INV-/g, "")
    .replace(/^SYN-/g, "");

  return normalized;
};

export const isSiblingTicket = (t1: any, t2: any): boolean => {
  if (!t1 || !t2) return false;
  if (t1.userId !== t2.userId) return false;

  const ref1 = (t1.portalFields?.billingReference || t1.reference || t1.folio || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+/, "");
  const ref2 = (t2.portalFields?.billingReference || t2.reference || t2.folio || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+/, "");
  if (!ref1 || ref1 !== ref2) return false;

  const rfc1 = (t1.rfcEmisor || t1.comercio || t1.nombreEmisor || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const rfc2 = (t2.rfcEmisor || t2.comercio || t2.nombreEmisor || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!rfc1 || rfc1 !== rfc2) return false;

  const date1 = (t1.fechaCompra || t1.fecha || "").substring(0, 10);
  const date2 = (t2.fechaCompra || t2.fecha || "").substring(0, 10);
  if (!date1 || date1 !== date2) return false;

  const total1 = parseFloat(parseFloat(String(t1.total || t1.expectedTicketTotal || 0)).toFixed(2));
  const total2 = parseFloat(parseFloat(String(t2.total || t2.expectedTicketTotal || 0)).toFixed(2));
  if (isNaN(total1) || total1 <= 0 || total1 !== total2) return false;

  return true;
};

export const resolveConnectorId = (commerceName: string): string => {
  const name = String(commerceName || "").toLowerCase().trim();
  
  if (name.includes("oxxo")) return "oxxocadena";
  if (name.includes("cinemex")) return "cinemex";
  if (name.includes("uber")) return "uber";
  if (name.includes("didi")) return "didi";
  if (name.includes("walmart") || name.includes("bodega aurrera") || name.includes("sams")) return "walmart";
  if (name.includes("costco")) return "costco";
  if (name.includes("amazon")) return "amazon";
  if (name.includes("mercadolibre") || name.includes("mercado libre")) return "mercadolibre";
  
  return name.replace(/[^a-z0-9]/g, "");
};

export const getBillingVisualKey = (params: {
  ticket?: any;
  invoice?: any;
  job?: any;
}): string => {
  const t = params.ticket || {};
  const inv = params.invoice || {};
  const j = params.job || {};

  // 1. Explicit canonicalTicketId priority
  if (t.canonicalTicketId && String(t.canonicalTicketId).trim().length > 0 && String(t.canonicalTicketId).trim().toUpperCase() !== "S/D") {
    return normalizeKey(t.canonicalTicketId);
  }
  if (inv.canonicalTicketId && String(inv.canonicalTicketId).trim().length > 0 && String(inv.canonicalTicketId).trim().toUpperCase() !== "S/D") {
    return normalizeKey(inv.canonicalTicketId);
  }
  if (j.canonicalTicketId && String(j.canonicalTicketId).trim().length > 0 && String(j.canonicalTicketId).trim().toUpperCase() !== "S/D") {
    return normalizeKey(j.canonicalTicketId);
  }

  // 2. Explicit sourceTicketId / ticketId from job
  const jobTicketId = j.ticketId || j.sourceTicketId;
  if (jobTicketId && String(jobTicketId).trim().length > 0 && String(jobTicketId).trim().toUpperCase() !== "S/D") {
    return normalizeKey(jobTicketId);
  }

  // 3. Explicit invoice-ticket relation
  const invoiceTicketId = inv.ticketId || inv.sourceTicketId;
  if (invoiceTicketId && String(invoiceTicketId).trim().length > 0 && String(invoiceTicketId).trim().toUpperCase() !== "S/D") {
    return normalizeKey(invoiceTicketId);
  }

  // 4. Fallback legacy compound fingerprint key
  const uId = t.userId || inv.userId || j.userId || "";
  const commerce = t.comercio || t.nombreEmisor || inv.nombreEmisor || j.comercio || "";
  const ref = t.reference || t.folio || t.portalFields?.billingReference || inv.ticketReference || inv.reference || j.ticketReference || "";
  const date = t.fechaCompra || t.fecha || "";
  const total = t.total || t.expectedTicketTotal || inv.total || "";

  if (uId && commerce && ref && date && total) {
    const cleanCommerce = String(commerce).toLowerCase().replace(/[^a-z0-9]/g, "").trim();
    const cleanRef = String(ref).toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+/, "");
    const cleanDate = String(date).substring(0, 10); // YYYY-MM-DD
    const cleanTotal = parseFloat(String(total)).toFixed(2);
    return `legacy_${uId}_${cleanCommerce}_${cleanRef}_${cleanDate}_${cleanTotal}`;
  }

  // 5. Explicit SAT UUID / Folio Fiscal priority
  const explicitUuid = inv.folioFiscal || inv.uuid || j.result?.uuid || inv.invoiceId;
  if (explicitUuid && String(explicitUuid).trim().length > 0 && String(explicitUuid).trim().toUpperCase() !== "S/D") {
    return normalizeKey(explicitUuid);
  }

  // 6. Normalized Document IDs priority
  const normalizedT = t.id ? normalizeKey(t.id) : null;
  const normalizedInv = inv.id ? normalizeKey(inv.id) : null;
  const normalizedJ = j.id ? normalizeKey(j.id) : null;

  if (normalizedT && normalizedT !== "UNKNOWN_KEY" && normalizedT !== "S/D") return normalizedT;
  if (normalizedInv && normalizedInv !== "UNKNOWN_KEY" && normalizedInv !== "S/D") return normalizedInv;
  if (normalizedJ && normalizedJ !== "UNKNOWN_KEY" && normalizedJ !== "S/D") return normalizedJ;

  // 7. Fallback reference (for simple unit tests or basic records)
  if (ref && String(ref).trim().length > 0 && String(ref).trim().toUpperCase() !== "S/D") {
    return normalizeKey(ref);
  }

  return "UNKNOWN_KEY";
};

const getItemDedupeScore = (item: { ticket?: any; invoice?: any; job?: any }): number => {
  const t = item.ticket || {};
  const inv = item.invoice || {};
  const j = item.job || {};

  let score = 0;
  
  // Real ticket scoring
  const isRealTicket = t.id && !t.id.startsWith("syn-") && t.status !== "deleted" && t.hiddenFromUser !== true;
  if (isRealTicket) {
    score += 100;
    if (t.reference && t.reference !== "S/D") {
      score += 10;
    }
    if (t.status !== "extracted") {
      score += 50; // Give higher score to processed/failed tickets over extracted ones
    }
  }

  // Real validated invoice
  const isRealInvoice = inv.id && !inv.id.startsWith("inv-fallback-") && !inv.synthetic;
  const isCfdiValidated = inv.isCfdiValidated === true || inv.cfdiValidated === true;
  if (isRealInvoice) {
    score += 80;
    if (isCfdiValidated) {
      score += 20;
    }
  }

  // Associated job
  if (j.id) {
    score += 60;
  }

  return score || 10;
};

export const dedupeBillingItems = (items: Array<{ ticket?: any; invoice?: any; job?: any }>): Array<{ ticket?: any; invoice?: any; job?: any }> => {
  const groups: { [key: string]: Array<{ ticket?: any; invoice?: any; job?: any }> } = {};

  items.forEach(item => {
    const key = getBillingVisualKey({ ticket: item.ticket, invoice: item.invoice, job: item.job });
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
  });

  const deduped: Array<{ ticket?: any; invoice?: any; job?: any }> = [];

  Object.keys(groups).forEach(key => {
    const groupItems = groups[key];
    groupItems.sort((a, b) => getItemDedupeScore(b) - getItemDedupeScore(a));
    const bestItem = { ...groupItems[0] };
    
    groupItems.slice(1).forEach(other => {
      if (!bestItem.ticket && other.ticket) {
        bestItem.ticket = other.ticket;
      }
      if (!bestItem.invoice && other.invoice) {
        bestItem.invoice = other.invoice;
      }
      if (!bestItem.job && other.job) {
        bestItem.job = other.job;
      }
    });

    deduped.push(bestItem);
  });

  return deduped;
};

export interface SatValidationState {
  isSatValid: boolean;
  isSatPending: boolean;
  isSatNotFound: boolean;
  isSatTimeout: boolean;
  isSatCancelled: boolean;
  satBadge: string;
  satMessage: string;
}

export const normalizeSatValidationState = (doc: any, hasPendingRetries?: boolean): SatValidationState => {
  if (!doc) {
    return {
      isSatValid: false,
      isSatPending: false,
      isSatNotFound: false,
      isSatTimeout: false,
      isSatCancelled: false,
      satBadge: "",
      satMessage: ""
    };
  }

  // Helper to extract nested error/codes
  const hasCode = (code: string): boolean => {
    return doc.errorCode === code ||
           doc.reviewReasonCode === code ||
           doc.reviewError?.errorCode === code ||
           doc.reviewError?.code === code ||
           doc.reviewError?.runnerErrorCode === code;
  };

  const satValidated = doc.satValidated === true ||
                       doc.validationStatus === "sat_validated" ||
                       doc.cfdiValidationStatus === "sat_validated" ||
                       doc.satValidationStatus === "sat_validated" ||
                       doc.satStatus?.toLowerCase() === "vigente" ||
                       doc.satEstado?.toLowerCase() === "vigente" ||
                       doc.estadoCfdi?.toLowerCase() === "vigente" ||
                       doc.satMessage?.toLowerCase().includes("vigente");

  const isCancelled = doc.satStatus?.toLowerCase() === "cancelado" ||
                      doc.satEstado?.toLowerCase() === "cancelado" ||
                      doc.estadoCfdi?.toLowerCase() === "cancelado" ||
                      hasCode("SAT_CANCELED") ||
                      hasCode("CFDI_CANCELED") ||
                      doc.satMessage?.toLowerCase().includes("cancelado");

  const isNotFound = doc.satStatus?.toLowerCase() === "no encontrado" ||
                     doc.satStatus?.toLowerCase() === "not_found" ||
                     doc.satEstado?.toLowerCase() === "no localizado" ||
                     hasCode("SAT_NOT_FOUND") ||
                     hasCode("CFDI_NOT_FOUND_IN_SAT") ||
                     doc.satMessage?.toLowerCase().includes("no localizado") ||
                     doc.satMessage?.toLowerCase().includes("cfdi no localizado");

  const isTimeout = doc.satStatus?.toLowerCase() === "timeout" ||
                    hasCode("SAT_TIMEOUT") ||
                    hasCode("SAT_VALIDATION_TIMEOUT") ||
                    doc.satMessage?.toLowerCase().includes("timeout") ||
                    doc.satMessage?.toLowerCase().includes("no pudimos verificar");

  const satAttemptCount = doc.satAttemptCount ?? doc.attempts ?? 0;
  const pending = hasPendingRetries !== undefined ? hasPendingRetries : (satAttemptCount < 3 || !!doc.nextSatValidationAt);

  let isSatValid = satValidated && !isCancelled && !isNotFound && !isTimeout;
  let isSatPending = false;
  let isSatNotFound = false;
  let isSatTimeout = isTimeout;
  let isSatCancelled = isCancelled;
  let satBadge = "";
  let satMessage = doc.satMessage || doc.reviewReasonMessage || "";

  if (isNotFound) {
    if (pending) {
      isSatPending = true;
      satBadge = "VALIDANDO SAT";
      if (!satMessage) satMessage = "El CFDI no ha sido localizado aún en el SAT. Reintentando validación automáticamente.";
    } else {
      isSatNotFound = true;
      satBadge = "CFDI NO LOCALIZADO";
      if (!satMessage) satMessage = "El CFDI no fue localizado en los controles del SAT después de varios intentos. Requiere revisión manual.";
    }
  } else if (isCancelled) {
    satBadge = "CFDI CANCELADO";
    if (!satMessage) satMessage = "El XML obtenido se encuentra CANCELADO ante el SAT. Requiere revisión manual.";
  } else if (isTimeout) {
    satBadge = "REVISIÓN MANUAL";
    if (!satMessage) satMessage = "No pudimos verificar el CFDI ante el SAT en este momento.";
  } else if (isSatValid) {
    satBadge = "FACTURADO";
    if (!satMessage) satMessage = "La factura ha sido emitida y validada exitosamente.";
  }

  return {
    isSatValid,
    isSatPending,
    isSatNotFound,
    isSatTimeout,
    isSatCancelled,
    satBadge,
    satMessage
  };
};

export const resolveRelatedBillingDocs = (params: {
  ticket?: any;
  invoice?: any;
  job?: any;
  tickets?: any[];
  invoices?: any[];
  jobs?: any[];
}): { ticket: any; invoice: any; job: any } => {
  const tickets = params.tickets || [];
  const invoices = params.invoices || [];
  const jobs = params.jobs || [];

  let t = params.ticket || null;
  let inv = params.invoice || null;
  let j = params.job || null;

  const userId = t?.userId || inv?.userId || j?.userId || null;
  const matchUser = (doc: any) => {
    if (!userId) return true;
    if (doc.userId && doc.userId !== userId) return false;
    return true;
  };

  const cleanKey = (val: any): string => {
    if (typeof val !== "string") return "";
    return val.trim().toUpperCase().replace(/\s+/g, "").replace(/^(TICKET#|FOLIO#|SYN-|INV-FALLBACK-|INV-)/, "");
  };

  const refMatches = (docA: any, docB: any): boolean => {
    const refA = docA.reference || docA.ticketNumber || docA.ticketId || "";
    const refB = docB.reference || docB.ticketNumber || docB.ticketId || "";
    const cleanedA = cleanKey(refA);
    const cleanedB = cleanKey(refB);
    return !!cleanedA && cleanedA === cleanedB;
  };

  if (t) {
    if (!inv) {
      inv = invoices.find(i => matchUser(i) && (
        i.sourceTicketId === t.id ||
        i.ticketId === t.id ||
        t.invoiceId === i.id ||
        (t.invoiceId && (t.invoiceId === i.uuid || t.invoiceId === i.folioFiscal))
      )) || null;

      if (!inv) {
        inv = invoices.find(i => matchUser(i) && refMatches(t, i)) || null;
      }
    }

    if (!j) {
      j = jobs.find(job => matchUser(job) && (
        job.ticketId === t.id ||
        (inv && job.result?.uuid && (job.result.uuid === inv.uuid || job.result.uuid === inv.folioFiscal))
      )) || null;

      if (!j) {
        j = jobs.find(job => matchUser(job) && refMatches(t, job)) || null;
      }
    }
  }

  if (inv) {
    if (!t) {
      t = tickets.find(ticket => matchUser(ticket) && (
        inv.sourceTicketId === ticket.id ||
        inv.ticketId === ticket.id ||
        ticket.invoiceId === inv.id ||
        (inv.uuid && ticket.invoiceId === inv.uuid) ||
        (inv.folioFiscal && ticket.invoiceId === inv.folioFiscal)
      )) || null;

      if (!t) {
        t = tickets.find(ticket => matchUser(ticket) && refMatches(inv, ticket)) || null;
      }
    }

    if (!j) {
      j = jobs.find(job => matchUser(job) && (
        (t && job.ticketId === t.id) ||
        (job.result?.uuid && (job.result.uuid === inv.uuid || job.result.uuid === inv.folioFiscal))
      )) || null;

      if (!j) {
        j = jobs.find(job => matchUser(job) && refMatches(inv, job)) || null;
      }
    }
  }

  if (j) {
    if (!t) {
      t = tickets.find(ticket => matchUser(ticket) && (
        j.ticketId === ticket.id
      )) || null;

      if (!t) {
        t = tickets.find(ticket => matchUser(ticket) && refMatches(j, ticket)) || null;
      }
    }

    if (!inv) {
      inv = invoices.find(i => matchUser(i) && (
        (t && (i.sourceTicketId === t.id || i.ticketId === t.id)) ||
        (j.result?.uuid && (j.result.uuid === i.uuid || j.result.uuid === i.folioFiscal))
      )) || null;

      if (!inv) {
        inv = invoices.find(i => matchUser(i) && refMatches(j, i)) || null;
      }
    }
  }

  return { ticket: t, invoice: inv, job: j };
};

export const buildBillingDashboardStats = (params: {
  tickets?: any[];
  invoices?: any[];
  jobs?: any[];
  fiscalProfile?: any;
  subscription?: any;
  userId?: string;
}): {
  processedCount: number;
  followUpCount: number;
  cycleUsed: number;
  cycleLimit: number;
  cycleRemaining: number;
} => {
  const rawTickets = params.tickets || [];
  const rawInvoices = params.invoices || [];
  const rawJobs = params.jobs || [];
  const currentUserId = params.userId || params.fiscalProfile?.userId || params.subscription?.userId || "";

  // 1. Filter tickets
  const filteredTickets = rawTickets.filter(t => {
    if (!t) return false;
    if (currentUserId && t.userId !== currentUserId) return false;
    if (!t.userId) return false;
    if (t.hiddenFromUser === true) return false;
    if (t.deletedAt) return false;
    if (t.status === "deleted" || t.status === "draft" || t.status === "hidden" || t.status === "orphaned") return false;
    return true;
  });

  // 2. Filter invoices
  const filteredInvoices = rawInvoices.filter(inv => {
    if (!inv) return false;
    if (currentUserId && inv.userId !== currentUserId) return false;
    if (!inv.userId) return false;
    if (inv.hiddenFromUser === true) return false;
    if (inv.linkedTicketDeleted === true) return false;
    if (inv.synthetic === true) return false;
    if (inv.status === "deleted" || inv.status === "draft" || inv.status === "hidden" || inv.status === "orphaned") return false;
    if (inv.id && (inv.id.startsWith("inv-fallback-") || inv.id.startsWith("syn-"))) return false;
    return true;
  });

  // 3. Filter jobs
  const filteredJobs = rawJobs.filter(j => {
    if (!j) return false;
    if (currentUserId && j.userId !== currentUserId) return false;
    if (!j.userId) return false;
    if (j.hiddenFromUser === true) return false;
    if (j.status === "deleted" || j.status === "draft" || j.status === "hidden" || j.status === "orphaned") return false;
    return true;
  });

  // Pair docs
  const pairedItems: Array<{ ticket?: any; invoice?: any; job?: any }> = [];
  const processedTicketIds = new Set<string>();
  const processedInvoiceIds = new Set<string>();

  filteredInvoices.forEach(inv => {
    const resolved = resolveRelatedBillingDocs({
      invoice: inv,
      tickets: filteredTickets,
      invoices: filteredInvoices,
      jobs: filteredJobs
    });

    if (resolved.ticket) processedTicketIds.add(resolved.ticket.id);
    processedInvoiceIds.add(inv.id);

    pairedItems.push(resolved);
  });

  filteredTickets.forEach(t => {
    if (processedTicketIds.has(t.id)) return;

    const resolved = resolveRelatedBillingDocs({
      ticket: t,
      tickets: filteredTickets,
      invoices: filteredInvoices,
      jobs: filteredJobs
    });

    if (resolved.ticket) processedTicketIds.add(resolved.ticket.id);
    if (resolved.invoice) processedInvoiceIds.add(resolved.invoice.id);

    pairedItems.push(resolved);
  });

  // Deduplicate
  const dedupedItems = dedupeBillingItems(pairedItems);

  // Compute stats
  let processedCount = 0;
  let followUpCount = 0;

  dedupedItems.forEach(item => {
    const state = getBillingCanonicalState({ ticket: item.ticket, invoice: item.invoice, job: item.job });
    
    if (state.shouldAppearInReady && state.isValidInvoice && item.invoice && item.invoice.synthetic !== true && !item.invoice.id?.startsWith("inv-fallback-")) {
      processedCount++;
    } else if (state.shouldAppearInProcess || state.shouldAppearInAttention) {
      if (item.ticket || item.invoice) {
        followUpCount++;
      }
    }
  });

  // Plan / Cycle Stats
  const plan = params.fiscalProfile?.plan || params.subscription?.plan || "gratuito";
  let limit = 5;
  if (plan === "brisa") limit = 10;
  else if (plan === "serenidad") limit = 30;
  else if (plan === "nirvana") limit = 100;

  const planStartDateStr = params.fiscalProfile?.planStartDate || params.fiscalProfile?.createdAt || new Date().toISOString();
  const planStartDate = new Date(planStartDateStr);

  const cycleUsed = filteredInvoices.filter(inv => {
    if (!inv.createdAt) return false;
    const isAfterStart = new Date(inv.createdAt) >= planStartDate;
    if (!isAfterStart) return false;
    
    const relatedTicket = filteredTickets.find(t => t.invoiceId === inv.id || t.id === inv.ticketId);
    const state = getBillingCanonicalState({ invoice: inv, ticket: relatedTicket });
    return state.shouldAppearInReady === true;
  }).length;

  const cycleRemaining = Math.max(limit - cycleUsed, 0);

  return {
    processedCount,
    followUpCount,
    cycleUsed,
    cycleLimit: limit,
    cycleRemaining
  };
};

export const selectDiagnosticAttempt = (params: {
  canonicalTicketId: string;
  memberTicketIds: string[];
  jobs: any[];
}): any | null => {
  const { canonicalTicketId, memberTicketIds, jobs } = params;

  const filteredJobs = jobs.filter(j => {
    if (!j) return false;
    const matchesTicket = j.ticketId === canonicalTicketId || memberTicketIds.includes(j.ticketId);
    if (!matchesTicket) return false;
    if (j.archived === true || j.status === "archived") return false;
    return true;
  });

  if (filteredJobs.length === 0) return null;

  const getJobScore = (job: any): number => {
    let score = 0;
    const isFailedOrBlocked = ["failed", "blocked", "failed_blocking", "error"].includes(job.status);
    if (isFailedOrBlocked) score += 1000;

    const hasEvents = Array.isArray(job.events) && job.events.length > 0;
    const hasTimeline = Array.isArray(job.timeline) && job.timeline.length > 0;
    const hasError = !!(job.technicalError || job.lastError || job.errorMsg);
    const hasScreenshot = !!(job.evidenceScreenshotPath || job.screenshot);
    
    if (hasEvents || hasTimeline) score += 100;
    if (hasError) score += 50;
    if (hasScreenshot) score += 50;

    return score;
  };

  const getJobTime = (job: any): number => {
    const d = job.updatedAt || job.createdAt || 0;
    return d ? new Date(d).getTime() : 0;
  };

  filteredJobs.sort((a, b) => {
    const scoreA = getJobScore(a);
    const scoreB = getJobScore(b);
    if (scoreA !== scoreB) return scoreB - scoreA;

    const timeA = getJobTime(a);
    const timeB = getJobTime(b);
    if (timeA !== timeB) return timeB - timeA;

    return String(b.id || "").localeCompare(String(a.id || ""));
  });

  return filteredJobs[0];
};

export const buildUserTicketsView = (params: {
  tickets?: any[];
  invoices?: any[];
  jobs?: any[];
  fiscalProfile?: any;
  userId?: string;
  userDisplayName?: string;
  userEmailMasked?: string;
}): {
  userId: string;
  userDisplayName: string;
  userEmailMasked: string;
  items: any[];
  counts: {
    totalVisible: number;
    inProcess: number;
    ready: number;
    attention: number;
    failed: number;
    correctionRequired: number;
    archived: number;
  };
} => {
  const rawTickets = params.tickets || [];
  const rawInvoices = params.invoices || [];
  const rawJobs = params.jobs || [];
  const currentUserId = params.userId || params.fiscalProfile?.userId || "";
  const displayName = params.userDisplayName || "Usuario";
  const emailMasked = params.userEmailMasked || "S/D";

  // 1. Filter tickets (active/visible ones, excluding archived/deleted/legacy)
  const activeTickets = rawTickets.filter(t => {
    if (!t) return false;
    if (currentUserId && t.userId !== currentUserId) return false;
    if (t.hiddenFromUser === true) return false;
    if (t.deletedAt) return false;
    if (t.status === "deleted" || t.status === "hidden" || t.status === "orphaned" || t.status === "archived") return false;
    if (t.archived === true || t.hiddenFromActiveDiagnostics === true) return false;
    return true;
  });

  // 2. Filter invoices (including legacy root invoices)
  const activeInvoices = rawInvoices.filter(inv => {
    if (!inv) return false;
    if (currentUserId && inv.userId !== currentUserId) return false;
    
    const isRoot = inv._path ? inv._path.split("/").length === 2 : false;
    if (isRoot) return true;

    if (inv.hiddenFromUser === true) return false;
    if (inv.linkedTicketDeleted === true) return false;
    if (inv.synthetic === true) return false;
    if (inv.status === "deleted") return false;
    if (inv.id && (inv.id.startsWith("inv-fallback-") || inv.id.startsWith("syn-"))) return false;
    return true;
  });

  // 3. Filter jobs
  const activeJobs = rawJobs.filter(j => {
    if (!j) return false;
    if (currentUserId && j.userId !== currentUserId) return false;
    if (j.hiddenFromUser === true) return false;
    if (j.status === "deleted") return false;
    return true;
  });

  // Sibling resolving: mutate tickets in activeTickets to group them canonically!
  const ticketGroups: Array<any[]> = [];
  activeTickets.forEach(t => {
    let added = false;
    for (const group of ticketGroups) {
      if (isSiblingTicket(group[0], t)) {
        group.push(t);
        added = true;
        break;
      }
    }
    if (!added) {
      ticketGroups.push([t]);
    }
  });

  ticketGroups.forEach(group => {
    // Find canonical representative
    let canonical = group.find(t => t.canonicalTicketId && t.canonicalTicketId === t.id);
    if (!canonical) {
      canonical = group.find(t => activeJobs.some(j => j.ticketId === t.id));
    }
    if (!canonical) {
      canonical = [...group].sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeA - timeB;
      })[0];
    }
    const memberIds = group.map(gt => gt.id);
    group.forEach(t => {
      t.canonicalTicketId = canonical.id;
      t.memberTicketIds = memberIds;
    });
  });

  // Pair docs
  const pairedItems: Array<{ ticket?: any; invoice?: any; job?: any }> = [];
  const processedTicketIds = new Set<string>();
  const processedInvoiceIds = new Set<string>();

  activeInvoices.forEach(inv => {
    const resolved = resolveRelatedBillingDocs({
      invoice: inv,
      tickets: activeTickets,
      invoices: activeInvoices,
      jobs: activeJobs
    });

    if (resolved.ticket) processedTicketIds.add(resolved.ticket.id);
    processedInvoiceIds.add(inv.id);
    pairedItems.push(resolved);
  });

  activeTickets.forEach(t => {
    if (processedTicketIds.has(t.id)) return;

    const resolved = resolveRelatedBillingDocs({
      ticket: t,
      tickets: activeTickets,
      invoices: activeInvoices,
      jobs: activeJobs
    });

    if (resolved.ticket) processedTicketIds.add(resolved.ticket.id);
    if (resolved.invoice) processedInvoiceIds.add(resolved.invoice.id);
    pairedItems.push(resolved);
  });

  const dedupedItems = dedupeBillingItems(pairedItems);

  // Apply deterministic job selection for each deduplicated case
  dedupedItems.forEach(item => {
    const t = item.ticket || {};
    const memberTicketIds = t.memberTicketIds || [t.id].filter(Boolean);
    const canonicalTicketId = t.canonicalTicketId || t.id || "";
    
    const selectedJob = selectDiagnosticAttempt({
      canonicalTicketId,
      memberTicketIds,
      jobs: activeJobs
    });
    
    item.job = selectedJob;
  });

  const items = dedupedItems.map(item => {
    const canonicalState = getBillingCanonicalState({ ticket: item.ticket, invoice: item.invoice, job: item.job });
    const visualKey = getBillingVisualKey({ ticket: item.ticket, invoice: item.invoice, job: item.job });

    // Check if it's a legacy root invoice linked to a deleted/hidden ticket
    const isRoot = item.invoice?._path ? item.invoice._path.split("/").length === 2 : false;
    const relatedTicket = item.ticket || (item.invoice && rawTickets.find(t => t.id === item.invoice.ticketId || t.id === item.invoice.sourceTicketId));
    const isLinkedTicketDeleted = !relatedTicket || relatedTicket.status === "deleted" || relatedTicket.deletedAt || relatedTicket.hiddenFromUser === true;
    const isLegacyRoot = isRoot && (isLinkedTicketDeleted || item.invoice.legacyRootInvoice === true || item.invoice.hiddenFromUser === true || item.invoice.linkedTicketDeleted === true);

    // Bucket resolution
    let bucket: "ready" | "in_process" | "attention" | "failed" | "correction_required" | "archived" = "in_process";
    
    const isFailedStatus = ["failed", "failed_blocking", "cfdi_validation_failed", "sat_validation_failed", "automation_failed"].includes(canonicalState.canonicalStatus);

    if (isLegacyRoot) {
      bucket = "archived";
    } else if (canonicalState.shouldAppearInReady && canonicalState.isValidInvoice) {
      bucket = "ready";
    } else if (isFailedStatus) {
      bucket = "failed";
    } else if (canonicalState.canonicalStatus === "requires_field_correction") {
      bucket = "correction_required";
    } else if (canonicalState.shouldAppearInAttention) {
      bucket = "attention";
    } else if (canonicalState.shouldAppearInProcess) {
      bucket = "in_process";
    } else {
      bucket = "archived";
    }

    const ticketRef = item.ticket?.folio || item.ticket?.portalFields?.billingReference || item.invoice?.ticketReference || item.invoice?.folioFiscal || "S/D";
    
    return {
      visualKey,
      ticketId: item.ticket?.id || item.invoice?.ticketId || null,
      canonicalTicketId: item.ticket?.canonicalTicketId || item.ticket?.id || null,
      memberTicketIds: item.ticket?.memberTicketIds || [item.ticket?.id].filter(Boolean),
      ticketReference: ticketRef,
      invoiceId: item.invoice?.id || null,
      jobId: item.job?.id || null,
      selectedJobId: item.job?.id || null,
      relatedJobIds: activeJobs.filter(j => (item.ticket?.memberTicketIds || []).includes(j.ticketId)).map(j => j.id),
      portal: item.ticket?.nombreEmisor || item.invoice?.nombreEmisor || "Emisor",
      connectorId: item.ticket?.connectorId || item.job?.connectorId || resolveConnectorId(item.ticket?.nombreEmisor || item.invoice?.nombreEmisor || ""),
      amount: canonicalState.displayTotal,
      date: item.ticket?.createdAt || item.invoice?.createdAt || item.job?.createdAt || null,
      canonicalStatus: isLegacyRoot ? "archived" : canonicalState.canonicalStatus,
      badgeLabel: isLegacyRoot ? "TICKET ELIMINADO" : canonicalState.badgeLabel,
      message: isLegacyRoot ? "Root invoice linked to deleted ticket" : canonicalState.message,
      bucket,
      canDownloadXml: canonicalState.canDownloadXml,
      canViewPdf: canonicalState.canViewPdf,
      sourceType: isLegacyRoot ? "legacy_root" : (item.invoice ? "materialized_success" : (item.job ? "derived_from_job" : "derived_from_ticket")),
      reasonIncluded: isLegacyRoot ? "Root invoice linked to deleted ticket" : canonicalState.message,
      legacyRootInvoice: isRoot,
      linkedTicketDeleted: isLinkedTicketDeleted,
      hiddenFromUser: item.invoice?.hiddenFromUser === true || isLinkedTicketDeleted
    };
  });

  // Calculate counts using all items (including archived for test compatibility)
  const counts = {
    totalVisible: items.filter(x => x.bucket !== "archived").length,
    inProcess: items.filter(x => x.bucket === "in_process").length,
    ready: items.filter(x => x.bucket === "ready").length,
    attention: items.filter(x => x.bucket === "attention").length,
    failed: items.filter(x => x.bucket === "failed").length,
    correctionRequired: items.filter(x => x.bucket === "correction_required").length,
    archived: items.filter(x => x.bucket === "archived").length
  };

  return {
    userId: currentUserId,
    userDisplayName: displayName,
    userEmailMasked: emailMasked,
    items,
    counts
  };
};
