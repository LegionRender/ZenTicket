import { ERROR_CATALOG } from "./errorCatalog";

export interface AutomationClassification {
  retryable: boolean;
  blocking: boolean;
  requiresHumanReview: boolean;
}

export function classifyAutomationError(
  code: string,
  context?: {
    wasXmlDownloaded?: boolean;
    attemptNumber?: number;
  }
): AutomationClassification {
  const catalogEntry = ERROR_CATALOG[code] || ERROR_CATALOG.UNKNOWN_RUNNER_ERROR;
  
  let retryable = catalogEntry.retryable ?? true;
  // By default, critical errors are blocking
  let blocking = catalogEntry.severity === "critical" || catalogEntry.severity === "warning";
  let requiresHumanReview = catalogEntry.requiresHumanReview ?? true;

  // Specific dynamic rules
  if (code === "CAPTCHA_DETECTED" || code === "CAPTCHA_REQUIRED") {
    retryable = true;
    blocking = true;
    requiresHumanReview = true;
  } else if (
    code === "CFDI_TOTAL_MISMATCH" ||
    code === "CFDI_RFC_RECEPTOR_MISMATCH" ||
    code === "CFDI_RFC_EMISOR_MISMATCH" ||
    code === "CFDI_INVALID_XML" ||
    code === "CFDI_UUID_MISSING" ||
    code === "CFDI_MISSING_UUID" ||
    code === "XML_STRUCTURE_INVALID" ||
    code === "DUPLICATE_PROCESSING_BLOCKED"
  ) {
    retryable = false;
    blocking = true;
    requiresHumanReview = true;
  } else if (code === "SAT_VALIDATION_TIMEOUT") {
    retryable = (context?.attemptNumber ?? 1) < 5;
    blocking = false;
  } else if (code === "TICKET_ALREADY_INVOICED") {
    const hasXml = context?.wasXmlDownloaded ?? false;
    retryable = false;
    blocking = !hasXml;
    requiresHumanReview = !hasXml;
  } else if (code === "UNKNOWN_RUNNER_ERROR") {
    retryable = true;
    blocking = true;
    requiresHumanReview = true;
  }

  return {
    retryable,
    blocking,
    requiresHumanReview
  };
}
