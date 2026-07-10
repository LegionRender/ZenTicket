import { getBillingStatusVisual } from "@/shared/billing/billingStatusVisuals";

export const getTicketTotal = (t: any): number => {
  if (!t) return 0;
  if (t.expectedTicketTotal !== undefined && t.expectedTicketTotal !== null && t.expectedTicketTotal !== 0) return Number(t.expectedTicketTotal);
  if (t.portalFields?.total !== undefined && t.portalFields?.total !== null && t.portalFields?.total !== 0) return Number(t.portalFields.total);
  if (t.ticketData?.total !== undefined && t.ticketData?.total !== null && t.ticketData?.total !== 0) return Number(t.ticketData.total);
  if (t.amountPaid !== undefined && t.amountPaid !== null && t.amountPaid !== 0) return Number(t.amountPaid);
  if (t.total !== undefined && t.total !== null) return Number(t.total);
  return 0;
};

export const getDetailedReasonMsg = (ticket: any): string => {
  if (!ticket) return "Error desconocido.";
  
  const isAlreadyInvoiced = ticket.reviewReasonCode === "TICKET_ALREADY_INVOICED" || 
                            ticket.reviewError?.errorCode === "TICKET_ALREADY_INVOICED" || 
                            ticket.reviewError?.runnerErrorCode === "TICKET_ALREADY_INVOICED" ||
                            ticket.reviewError?.reviewReasonCode === "TICKET_ALREADY_INVOICED" ||
                            ticket.wasAlreadyInvoiced || 
                            ticket.errorCode === "TICKET_ALREADY_INVOICED";

  if (isAlreadyInvoiced) {
    return `el folio ${ticket.folio || ticket.billingReference || "S/D"} ya fue emitido anteriormente.`;
  }
  if (ticket.status === "duplicate") {
    return `el folio ${ticket.folio || ticket.billingReference || "S/D"} es un duplicado en el sistema.`;
  }
  if (ticket.status === "failed_blocking") {
    return `el folio ${ticket.folio || ticket.billingReference || "S/D"} está bloqueado.`;
  }

  if (ticket.status === "connector_auth_required") {
    return "El portal oficial de este comercio exige iniciar sesión o crear una cuenta. No faltan datos del ticket; la facturación no puede continuar sin autorización del usuario.";
  }
  if (["waiting_user_captcha", "blocked_by_captcha", "waiting_human_verification"].includes(ticket.status)) {
    return "El portal está esperando el código de verificación mostrado en la captura.";
  }
  if (ticket.status === "training_required") {
    return "Este comercio aún no tenía automatización. Estamos localizando su portal y preparando los datos que solicita. El primer proceso puede tardar algunos minutos.";
  }
  if (ticket.status === "connector_not_ready") {
    return "El conector de este comercio está en mantenimiento técnico o ajustes.";
  }
  if (ticket.status === "waiting_fiscal_profile") {
    return ticket.errorMsg || "El portal necesita tus datos fiscales para continuar con la factura. Por favor completa tu perfil en Mi Cuenta.";
  }
  if (ticket.status === "waiting_merchant_sync") {
    return ticket.errorMsg || "El comercio todavía está validando este ticket. Podrás reintentarlo más tarde.";
  }
  const revErr = ticket.reviewError;

  if (revErr) {
    if (revErr.naturalMessage) return revErr.naturalMessage;
    const code = revErr.runnerErrorCode || revErr.reviewReasonCode;
    if (code === "PORTAL_AJAX_TIMEOUT") return "El portal del comercio tardó demasiado en cargar información secundaria.";
    if (code === "PORTAL_SELECTOR_NOT_FOUND") return "No pudimos localizar un elemento necesario en la página del comercio.";
    if (code === "PRIMEFACES_DROPDOWN_ERROR") return "No fue posible seleccionar tu Régimen Fiscal o Uso de CFDI.";
    if (code === "SAT_RFC_NOT_FOUND") return "El SAT reporta que tu RFC no está registrado en su base de datos.";
    if (code === "INVALID_FISCAL_PROFILE_DATA") return "Los datos de tu perfil fiscal tienen un formato incorrecto o incompleto.";
    if (code === "TICKET_TOO_NEW") return "El comercio todavía está validando este ticket. Podrás reintentarlo más tarde.";
    if (code === "PORTAL_STRUCTURE_CHANGED") return "El portal de facturación del comercio cambió su estructura o diseño.";
    if (code === "CAPTCHA_DETECTED") return "El portal del comercio solicita una verificación manual (CAPTCHA).";
    if (code === "TICKET_ALREADY_INVOICED") return "Este ticket ya ha sido facturado con anterioridad.";
    if (code === "PERIOD_EXPIRED") return "El periodo permitido por el comercio para facturar este ticket ya venció.";
    if (code === "INVALID_PORTAL_FIELD_VALUE") return revErr.portalErrorMessage || "Alguno de los datos del ticket es inválido.";
    
    if (code === "CONNECTOR_NOT_FOUND") return "Este comercio aún no puede procesarse automáticamente. Estamos revisando si puede agregarse.";
    if (code === "PORTAL_NO_XML") return "Este comercio requiere revisión manual o no entregó el XML/PDF en el proceso automatizado. ZenTicket no genera documentos sustitutos si el portal del comercio no entrega el XML.";
    if (code === "PORTAL_REJECTED_FOLIO") return "El portal no reconoció el folio del ticket.";
    if (code === "PORTAL_REJECTED_TOTAL") return "El portal no reconoció el total detectado.";
    if (code === "SAT_NOT_FOUND") return "El CFDI no fue localizado en los controles del SAT.";
    if (code === "SAT_CANCELED") return "El CFDI aparece cancelado ante el SAT.";
    if (code === "SAT_TIMEOUT") return "No pudimos verificar el CFDI ante el SAT en este momento.";
    if (code === "USER_REQUESTED_REVIEW") return "El usuario solicitó revisión manual del ticket.";
    if (code === "CONNECTOR_TIMEOUT") return "El conector del comercio tardó más de lo esperado en responder.";
    if (code === "PORTAL_ERROR") return revErr.reviewReasonMessage || "Ocurrió un error en el portal del comercio.";
    if (code === "CONNECTOR_RUNNER_NOT_AVAILABLE") return "El conector está entrenado, pero el motor productivo de automatización aún no está disponible.";
    if (code === "CONNECTOR_SCHEMA_INVALID") return "El conector tiene una configuración incompleta y requiere revisión técnica.";
    if (code === "PORTAL_CHANGED") return "El portal de facturación cambió y el conector necesita actualizar su navegación. No es necesario corregir los datos del ticket.";
    if (code === "PORTAL_TIMEOUT" || code === "RUNNER_TIMEOUT") return "El portal de facturación tardó más de lo esperado. Conservamos el ticket para poder reintentar el proceso.";
    if (code === "CONNECTOR_NOT_PRODUCTION_READY") return "El conector de este comercio está en validación técnica y no está listo para producción.";
    if (code === "CONNECTOR_RESTRICTED") return "Este portal requiere credenciales especiales o permisos de acceso restringidos.";
    if (code === "CONNECTOR_BROKEN") return "El conector de este portal se encuentra temporalmente fuera de servicio por mantenimiento.";
    if (code === "PORTAL_FIELD_MAP_CHANGED") return "La estructura del portal oficial ha cambiado. Se ha programado un rediscovery técnico.";
  }
  
  return ticket.errorMsg || "No fue posible completar la solicitud en el portal del comercio. Revisa los datos del ticket o solicita revisión manual.";
};

export interface TicketVisualState {
  visualStatus: string;
  badgeLabel: string;
  badgeTone: string;
  message: string;
  isActive: boolean;
  requiresAttention: boolean;
}

export const getTicketVisualState = (ticket: any): TicketVisualState => {
  const state = _getTicketVisualState(ticket);
  const statusKey = ticket?.status || state.visualStatus;
  const visual = getBillingStatusVisual(statusKey);
  state.badgeTone = visual.badgeClassName;
  return state;
};

const _getTicketVisualState = (ticket: any): TicketVisualState => {
  if (!ticket) {
    return {
      visualStatus: "unknown",
      badgeLabel: "DESCONOCIDO",
      badgeTone: "zt-badge-alert text-[#777F8D]",
      message: "Error desconocido.",
      isActive: false,
      requiresAttention: false
    };
  }

  // 1. TICKET_ALREADY_INVOICED / wasAlreadyInvoiced
  const isAlreadyInvoiced = ticket.reviewReasonCode === "TICKET_ALREADY_INVOICED" || 
                            ticket.reviewError?.errorCode === "TICKET_ALREADY_INVOICED" || 
                            ticket.reviewError?.runnerErrorCode === "TICKET_ALREADY_INVOICED" ||
                            ticket.reviewError?.reviewReasonCode === "TICKET_ALREADY_INVOICED" ||
                            ticket.wasAlreadyInvoiced || 
                            ticket.errorCode === "TICKET_ALREADY_INVOICED" ||
                            ticket.reviewError?.code === "TICKET_ALREADY_INVOICED";

  if (isAlreadyInvoiced) {
    const folio = ticket.folio || ticket.billingReference || "";
    const folioText = folio ? `el folio ${folio}` : "este folio";
    return {
      visualStatus: "already_invoiced",
      badgeLabel: "YA FACTURADO",
      badgeTone: "zt-badge-attention",
      message: `Ticket ya facturado: ${folioText} ya fue emitido anteriormente.`,
      isActive: false,
      requiresAttention: true
    };
  }

  // 2. duplicate
  if (ticket.status === "duplicate") {
    const folio = ticket.folio || ticket.billingReference || "";
    const folioText = folio ? `el folio ${folio}` : "este folio";
    return {
      visualStatus: "duplicate",
      badgeLabel: "DUPLICADO",
      badgeTone: "zt-badge-attention",
      message: `Ticket duplicado: ${folioText} es un duplicado en el sistema.`,
      isActive: false,
      requiresAttention: true
    };
  }

  // 3. failed_blocking
  if (ticket.status === "failed_blocking") {
    const folio = ticket.folio || ticket.billingReference || "";
    const folioText = folio ? `el folio ${folio}` : "este folio";
    return {
      visualStatus: "failed_blocking",
      badgeLabel: "BLOQUEADO",
      badgeTone: "zt-badge-error",
      message: `Ticket Bloqueado: ${folioText} está bloqueado.`,
      isActive: false,
      requiresAttention: true
    };
  }

  // 4. requires_manual_review / review
  if (ticket.status === "requires_manual_review" || ticket.status === "review") {
    return {
      visualStatus: "requires_manual_review",
      badgeLabel: "REVISIÓN MANUAL",
      badgeTone: "zt-badge-attention",
      message: getDetailedReasonMsg(ticket),
      isActive: false,
      requiresAttention: true
    };
  }

  // 5. requires_user_correction
  if (ticket.status === "requires_user_correction") {
    return {
      visualStatus: "requires_user_correction",
      badgeLabel: "REQUIERE CORRECCIÓN",
      badgeTone: "zt-badge-attention",
      message: getDetailedReasonMsg(ticket),
      isActive: false,
      requiresAttention: true
    };
  }

  // 6. connector_auth_required
  if (ticket.status === "connector_auth_required") {
    return {
      visualStatus: "connector_auth_required",
      badgeLabel: "REQUIERE CUENTA",
      badgeTone: "zt-badge-attention",
      message: getDetailedReasonMsg(ticket),
      isActive: false,
      requiresAttention: true
    };
  }

  // 7. waiting_fiscal_profile
  if (ticket.status === "waiting_fiscal_profile") {
    return {
      visualStatus: "waiting_fiscal_profile",
      badgeLabel: "FALTAN DATOS FISCALES",
      badgeTone: "zt-badge-attention",
      message: getDetailedReasonMsg(ticket),
      isActive: false,
      requiresAttention: true
    };
  }

  // 8. waiting_user_captcha (and other captcha statuses)
  const isTicketCaptcha = ["waiting_user_captcha", "blocked_by_captcha", "waiting_human_verification", "captcha_failed", "captcha_timeout"].includes(ticket.status || "");
  if (isTicketCaptcha) {
    return {
      visualStatus: "waiting_user_captcha",
      badgeLabel: "CAPTCHA REQUERIDO",
      badgeTone: "zt-badge-attention animate-pulse",
      message: getDetailedReasonMsg(ticket),
      isActive: true,
      requiresAttention: true
    };
  }

  // 9. verifying_captcha
  if (["verifying_captcha", "captcha_submitted"].includes(ticket.status || "")) {
    return {
      visualStatus: "verifying_captcha",
      badgeLabel: "VERIFICANDO CAPTCHA",
      badgeTone: "zt-badge-attention animate-pulse",
      message: getDetailedReasonMsg(ticket),
      isActive: true,
      requiresAttention: false
    };
  }

  // 10. training_required
  if (ticket.status === "training_required") {
    return {
      visualStatus: "training_required",
      badgeLabel: "PREPARANDO PORTAL",
      badgeTone: "zt-badge-archived",
      message: getDetailedReasonMsg(ticket),
      isActive: false,
      requiresAttention: false
    };
  }

  // 11. connector_not_ready
  if (ticket.status === "connector_not_ready") {
    return {
      visualStatus: "connector_not_ready",
      badgeLabel: "CONECTOR NO LISTO",
      badgeTone: "zt-badge-attention",
      message: getDetailedReasonMsg(ticket),
      isActive: false,
      requiresAttention: false
    };
  }

  // 12. waiting_merchant_sync
  if (ticket.status === "waiting_merchant_sync") {
    return {
      visualStatus: "waiting_merchant_sync",
      badgeLabel: "ESPERANDO COMERCIO",
      badgeTone: "zt-badge-archived",
      message: getDetailedReasonMsg(ticket),
      isActive: false,
      requiresAttention: false
    };
  }

  // 13. runner_processing / processing
  if (ticket.status === "runner_processing" || ticket.status === "processing") {
    return {
      visualStatus: "runner_processing",
      badgeLabel: "AUTOMATIZANDO",
      badgeTone: "zt-badge-process",
      message: "Procesando de forma automatizada. Por favor espera.",
      isActive: true,
      requiresAttention: false
    };
  }

  // 14. queued_for_runner
  if (ticket.status === "queued_for_runner") {
    return {
      visualStatus: "queued_for_runner",
      badgeLabel: "EN COLA (JIT)",
      badgeTone: "zt-badge-archived",
      message: "El ticket está en cola y comenzará a procesarse en breve.",
      isActive: true,
      requiresAttention: false
    };
  }

  // 15. pending_portal_submission (and other submitting/verifying statuses)
  if (["pending_portal_submission", "submitted_to_merchant", "waiting_portal_result", "sat_verifying", "merchant_cfdi_downloaded"].includes(ticket.status || "")) {
    return {
      visualStatus: "facturando",
      badgeLabel: "FACTURANDO",
      badgeTone: "zt-badge-process",
      message: "Se están enviando los datos al portal del comercio.",
      isActive: true,
      requiresAttention: false
    };
  }

  // 16. cfdi_validated / emitted / completed
  if (["cfdi_validated", "invoice_obtained", "completed", "xml_structure_validated", "sat_validation_pending"].includes(ticket.status || "")) {
    return {
      visualStatus: "completed",
      badgeLabel: "FACTURADO",
      badgeTone: "zt-badge-ok",
      message: "La factura ha sido emitida y validada exitosamente.",
      isActive: false,
      requiresAttention: false
    };
  }

  // 17. failed (but not blocking / already invoiced)
  if (ticket.status === "failed") {
    return {
      visualStatus: "failed",
      badgeLabel: "NO SE PUDO COMPLETAR",
      badgeTone: "zt-badge-error",
      message: ticket.errorMsg || "No pudimos completar la automatización de tu factura.",
      isActive: false,
      requiresAttention: true
    };
  }

  // 18. fallback
  return {
    visualStatus: "processing",
    badgeLabel: "PROCESANDO",
    badgeTone: "zt-badge-attention",
    message: "Procesando ticket...",
    isActive: true,
    requiresAttention: false
  };
};

export interface InvoiceVisualState {
  visualStatus: string;
  badgeLabel: string;
  badgeTone: string;
  message: string;
  canViewPdf: boolean;
  canDownloadXml: boolean;
  requiresAttention: boolean;
  isValidInvoice: boolean;
  displayTotal: number;
}

export const getInvoiceVisualState = (invoice: any, relatedTicket?: any): InvoiceVisualState => {
  const state = _getInvoiceVisualState(invoice, relatedTicket);
  const statusKey = invoice?.errorCode || invoice?.status || (relatedTicket?.status) || state.visualStatus;
  const visual = getBillingStatusVisual(statusKey);
  state.badgeTone = visual.badgeClassName;
  return state;
};

const _getInvoiceVisualState = (invoice: any, relatedTicket?: any): InvoiceVisualState => {
  if (!invoice) {
    return {
      visualStatus: "unknown",
      badgeLabel: "DESCONOCIDO",
      badgeTone: "zt-badge-archived",
      message: "Factura no encontrada.",
      canViewPdf: false,
      canDownloadXml: false,
      requiresAttention: true,
      isValidInvoice: false,
      displayTotal: 0
    };
  }

  const t = relatedTicket || {};

  // Extract displayTotal
  const displayTotal = invoice.total !== undefined ? invoice.total : (t.total || 0);

  // Check expected ticket total vs invoice total
  const expectedTotal = t.expectedTicketTotal || t.portalFields?.totalAmount || t.total || 0;
  const isInvalidTotal = (displayTotal === 0 && expectedTotal > 0);

  // Error code matching helper
  const hasErrorCode = (code: string): boolean => {
    return invoice.errorCode === code ||
           invoice.reviewReasonCode === code ||
           invoice.reviewError?.errorCode === code ||
           invoice.reviewError?.code === code ||
           invoice.reviewError?.runnerErrorCode === code ||
           t.errorCode === code ||
           t.reviewReasonCode === code ||
           t.reviewError?.errorCode === code ||
           t.reviewError?.code === code ||
           t.reviewError?.runnerErrorCode === code;
  };

  // 1. TICKET_ALREADY_INVOICED / wasAlreadyInvoiced
  const isAlreadyInvoiced = hasErrorCode("TICKET_ALREADY_INVOICED") || 
                            invoice.wasAlreadyInvoiced === true ||
                            t.wasAlreadyInvoiced === true;

  // 2. CFDI_TOTAL_MISMATCH
  const isTotalMismatch = hasErrorCode("CFDI_TOTAL_MISMATCH") ||
                          (t.status === "failed_blocking" && (t.errorMsg || "").toLowerCase().includes("total"));

  // 3. CFDI_RFC_RECEPTOR_MISMATCH
  const isRfcMismatch = hasErrorCode("CFDI_RFC_RECEPTOR_MISMATCH") ||
                        (t.status === "failed_blocking" && (t.errorMsg || "").toLowerCase().includes("rfc"));

  // 4. isCfdiValidated / cfdiValidated status
  const isCfdiValidated = invoice.isCfdiValidated === true || 
                          invoice.cfdiValidated === true || 
                          t.status === "cfdi_validated" || 
                          t.status === "completed";

  // Check physical availability of XML / PDF
  const hasXml = !!invoice.xmlContent && invoice.xmlContent.trim().length > 0;
  const hasPdf = !!invoice.pdfHtml && invoice.pdfHtml.trim().length > 0;

  // Rule Priorities
  if (isInvalidTotal) {
    return {
      visualStatus: "invalid_total",
      badgeLabel: "CFDI INVÁLIDO",
      badgeTone: "zt-badge-error",
      message: "La factura tiene un total de $0.00 y no coincide con el ticket.",
      canViewPdf: false,
      canDownloadXml: false,
      requiresAttention: true,
      isValidInvoice: false,
      displayTotal
    };
  }

  if (isTotalMismatch) {
    return {
      visualStatus: "total_mismatch",
      badgeLabel: "TOTAL INCORRECTO",
      badgeTone: "zt-badge-error",
      message: "La factura fue emitida por un monto que no coincide con el ticket.",
      canViewPdf: false,
      canDownloadXml: false,
      requiresAttention: true,
      isValidInvoice: false,
      displayTotal
    };
  }

  if (isRfcMismatch) {
    return {
      visualStatus: "rfc_mismatch",
      badgeLabel: "RFC INCORRECTO",
      badgeTone: "zt-badge-error",
      message: "La factura fue emitida con un RFC de receptor incorrecto.",
      canViewPdf: false,
      canDownloadXml: false,
      requiresAttention: true,
      isValidInvoice: false,
      displayTotal
    };
  }

  if (isAlreadyInvoiced) {
    return {
      visualStatus: "already_invoiced",
      badgeLabel: "YA FACTURADO",
      badgeTone: "zt-badge-attention",
      message: "El portal indica que este ticket ya fue facturado anteriormente.",
      canViewPdf: isCfdiValidated && hasPdf,
      canDownloadXml: isCfdiValidated && hasXml,
      requiresAttention: true,
      isValidInvoice: isCfdiValidated,
      displayTotal
    };
  }

  if (!isCfdiValidated) {
    return {
      visualStatus: "requires_review",
      badgeLabel: "REVISIÓN MANUAL",
      badgeTone: "zt-badge-attention",
      message: "Esta factura requiere revisión. El CFDI no fue validado correctamente o el portal indica que el ticket ya fue facturado.",
      canViewPdf: hasPdf,
      canDownloadXml: hasXml,
      requiresAttention: true,
      isValidInvoice: false,
      displayTotal
    };
  }

  return {
    visualStatus: "valid",
    badgeLabel: "FACTURADO",
    badgeTone: "zt-badge-ok",
    message: "La factura ha sido emitida y validada exitosamente.",
    canViewPdf: hasPdf,
    canDownloadXml: hasXml,
    requiresAttention: false,
    isValidInvoice: true,
    displayTotal
  };
};
