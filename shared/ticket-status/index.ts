export const TicketStatus = {
  PENDING_OCR: "pending_ocr",
  PROCESSING: "processing",
  OCR_FAILED: "ocr_failed",
  OCR_COMPLETED: "ocr_completed",
  PENDING_BILLING: "pending_billing",
  BILLING_IN_PROGRESS: "billing_in_progress",
  BILLED: "billed",
  BILLING_FAILED: "billing_failed",
  
  // Estados críticos adicionales requeridos
  PENDING_PORTAL_SUBMISSION: "pending_portal_submission",
  QUEUED_FOR_RUNNER: "queued_for_runner",
  RUNNER_PROCESSING: "runner_processing",
  WAITING_USER_CAPTCHA: "waiting_user_captcha",
  REQUIRES_MANUAL_REVIEW: "requires_manual_review",
  CFDI_VALIDATED: "cfdi_validated"
};
