import { getBillingCanonicalState, type BillingCanonicalState } from "./billingStateHelpers";

export type CustomerBillingKind = "received" | "processing" | "needs_correction" | "ready" | "unavailable";

export interface CustomerBillingState {
  kind: CustomerBillingKind;
  badgeLabel: string;
  title: string;
  message: string;
  tone: "info" | "warning" | "success";
  canEdit: boolean;
  requiresCaptcha: boolean;
  canonical: BillingCanonicalState;
}

const hasReason = (ticket: any, invoice: any, job: any, codes: string[]) => {
  const sources = [ticket, invoice, job];
  return sources.some((source) => codes.some((code) =>
    source?.errorCode === code ||
    source?.reviewReasonCode === code ||
    source?.reviewError?.code === code ||
    source?.reviewError?.errorCode === code ||
    source?.reviewError?.runnerErrorCode === code
  ));
};

/**
 * Maps internal runner and connector states to the small vocabulary shown to
 * customers. Detailed causes remain available only in Administration.
 */
export const getCustomerBillingState = (params: { ticket?: any; invoice?: any; job?: any }): CustomerBillingState => {
  const ticket = params.ticket || {};
  const invoice = params.invoice || {};
  const job = params.job || {};
  const canonical = getBillingCanonicalState({ ticket, invoice, job });
  const status = canonical.canonicalStatus;

  if (canonical.isReady && canonical.isValidInvoice) {
    return {
      kind: "ready",
      badgeLabel: "LISTA",
      title: "Tu factura está lista",
      message: "Ya puedes consultar y descargar tus archivos.",
      tone: "success",
      canEdit: false,
      requiresCaptcha: false,
      canonical
    };
  }

  const needsCorrection = status === "requires_field_correction" ||
    ticket.status === "requires_user_correction" ||
    hasReason(ticket, invoice, job, [
      "MISSING_REQUIRED_FIELDS",
      "INVALID_PORTAL_FIELD_VALUE",
      "PORTAL_REJECTED_FOLIO",
      "PORTAL_REJECTED_TOTAL",
      "PORTAL_REJECTED_TICKET_DATA"
    ]);

  if (needsCorrection) {
    return {
      kind: "needs_correction",
      badgeLabel: "REQUIERE DATOS",
      title: "Necesitamos confirmar un dato",
      message: "Revisa únicamente los datos marcados del ticket para continuar.",
      tone: "warning",
      canEdit: true,
      requiresCaptcha: false,
      canonical
    };
  }

  const requiresCaptcha = status === "waiting_user_captcha" ||
    job.captchaFlowActive === true ||
    ticket.captchaFlowActive === true;

  if (requiresCaptcha) {
    return {
      kind: "unavailable",
      badgeLabel: "EN REVISIÓN",
      title: "Estamos revisando tu ticket",
      message: "Conservamos tu ticket y te avisaremos cuando podamos continuar. No necesitas enviarlo de nuevo.",
      tone: "warning",
      canEdit: false,
      requiresCaptcha: false,
      canonical
    };
  }

  if (canonical.isActive || ["queued", "active_processing", "verifying_captcha", "invoice_recovery_pending"].includes(status)) {
    return {
      kind: "processing",
      badgeLabel: "EN PROCESO",
      title: "Estamos solicitando tu factura",
      message: "Recibimos tu ticket. Te avisaremos cuando haya un resultado.",
      tone: "info",
      canEdit: false,
      requiresCaptcha: false,
      canonical
    };
  }

  return {
    kind: "unavailable",
    badgeLabel: "EN REVISIÓN",
    title: "Estamos revisando tu ticket",
    message: "Conservamos tu ticket y te avisaremos cuando podamos continuar. No necesitas enviarlo de nuevo.",
    tone: "warning",
    canEdit: false,
    requiresCaptcha: false,
    canonical
  };
};
