import { StructuredError, ERROR_CATALOG } from "./errorCatalog";
import { RunnerStage, mapErrorCodeToStage } from "./runnerStages";
import { DiagnosticSnapshot, createDiagnosticSnapshot } from "./diagnosticSnapshot";
import { getFriendlyMessage } from "./friendlyMessages";
import { classifyAutomationError, AutomationClassification } from "./classifyAutomationError";

export {
  ERROR_CATALOG,
  mapErrorCodeToStage,
  createDiagnosticSnapshot,
  getFriendlyMessage,
  classifyAutomationError
};

export type {
  StructuredError,
  RunnerStage,
  DiagnosticSnapshot,
  AutomationClassification
};


export class RunnerError extends Error {
  public code: string;
  public userMessage: string;
  public probableCause: string;
  public severity: "info" | "warning" | "critical";
  public recommendedAction: string;
  public technicalMessage?: string;
  public retryable?: boolean;
  public requiresHumanReview?: boolean;
  public category?: string;
  public screenshotPath?: string;
  public stepIndex?: number;
  public module?: string;
  public context?: any;
  public rawPortalMessage?: string;
  public currentUrl?: string;
  public selector?: string;
  public portalMessageSource?: string;
  public portalMessageSelector?: string;
  public classificationConfidence?: number;

  constructor(struct: StructuredError, customMessage?: string) {
    super(customMessage || struct.userMessage);
    this.name = "RunnerError";
    this.code = struct.code;
    this.userMessage = struct.userMessage;
    this.probableCause = struct.probableCause;
    this.severity = struct.severity;
    this.recommendedAction = struct.recommendedAction;
    this.technicalMessage = struct.technicalMessage || customMessage || struct.userMessage;
    this.retryable = struct.retryable !== undefined ? struct.retryable : true;
    this.requiresHumanReview = struct.requiresHumanReview !== undefined ? struct.requiresHumanReview : true;
    this.category = struct.category || "runner";
  }
}


export function mapToRunnerError(error: any): RunnerError {
  if (error instanceof RunnerError) {
    return error;
  }

  const code = error?.code || "UNKNOWN_RUNNER_ERROR";
  const message = error?.message || String(error);

  let runnerError: RunnerError;

  // Map known string messages to structured catalogs
  if (message.includes("facturado previamente") || message.includes("ya fue facturado")) {
    runnerError = new RunnerError(ERROR_CATALOG.TICKET_ALREADY_INVOICED, message);
  } else if (message.includes("no se localizo para completar la informacion") || message.includes("rfc no se localizo")) {
    runnerError = new RunnerError(ERROR_CATALOG.SAT_RFC_NOT_FOUND, message);
  } else if (message.includes("pendiente de validar") || message.includes("pendiente por validar")) {
    runnerError = new RunnerError(ERROR_CATALOG.TICKET_TOO_NEW, message);
  } else if (message.includes("plazo") && (message.includes("expirado") || message.includes("vencido") || message.includes("mes"))) {
    runnerError = new RunnerError(ERROR_CATALOG.PERIOD_EXPIRED, message);
  } else if (message.includes("inválido") || message.includes("invalido") || message.includes("incorrecto") || message.includes("no coincide")) {
    runnerError = new RunnerError(ERROR_CATALOG.INVALID_PORTAL_FIELD_VALUE, message);
  } else if (code === "PORTAL_TIMEOUT" && message.includes("continuar")) {
    runnerError = new RunnerError(ERROR_CATALOG.PORTAL_STRUCTURE_CHANGED, message);
  } else if (code === "XML_NOT_DOWNLOADED") {
    runnerError = new RunnerError(ERROR_CATALOG.PORTAL_STRUCTURE_CHANGED, "No se localizó la descarga del archivo XML de la factura.");
  } else if (code === "OPTION_NOT_FOUND" || code === "DROPDOWN_SELECTION_FAILED") {
    runnerError = new RunnerError(ERROR_CATALOG.PRIMEFACES_DROPDOWN_ERROR, message);
  } else {
    const catalogEntry = ERROR_CATALOG[code];
    if (catalogEntry) {
      runnerError = new RunnerError(catalogEntry, message);
    } else {
      // Fallbacks based on generic error codes
      if (code === "CAPTCHA_DETECTED") {
        runnerError = new RunnerError(ERROR_CATALOG.CAPTCHA_DETECTED, message);
      } else if (code === "TICKET_TOO_NEW") {
        runnerError = new RunnerError(ERROR_CATALOG.TICKET_TOO_NEW, message);
      } else if (code === "PERIOD_EXPIRED") {
        runnerError = new RunnerError(ERROR_CATALOG.PERIOD_EXPIRED, message);
      } else if (code === "INVALID_PORTAL_FIELD_VALUE") {
        runnerError = new RunnerError(ERROR_CATALOG.INVALID_PORTAL_FIELD_VALUE, message);
      } else {
        runnerError = new RunnerError(ERROR_CATALOG.UNKNOWN_RUNNER_ERROR, message);
      }
    }
  }

  // Copy any extra properties if they exist on the input error
  if (error && typeof error === "object") {
    if (error.stepIndex !== undefined) runnerError.stepIndex = error.stepIndex;
    if (error.selector !== undefined) runnerError.selector = error.selector;
    if (error.screenshotPath !== undefined) runnerError.screenshotPath = error.screenshotPath;
    if (error.currentUrl !== undefined) runnerError.currentUrl = error.currentUrl;
    if (error.context !== undefined) runnerError.context = error.context;
    if (error.module !== undefined) runnerError.module = error.module;
    if (error.rawPortalMessage !== undefined) {
      runnerError.rawPortalMessage = error.rawPortalMessage;
    } else if (error.message !== undefined) {
      runnerError.rawPortalMessage = error.message;
    }
    // Copy the new classification metadata if present
    if (error.portalMessageSource !== undefined) runnerError.portalMessageSource = error.portalMessageSource;
    if (error.portalMessageSelector !== undefined) runnerError.portalMessageSelector = error.portalMessageSelector;
    if (error.classificationConfidence !== undefined) runnerError.classificationConfidence = error.classificationConfidence;
  }

  return runnerError;
}

export interface PortalClassificationInput {
  rawPortalMessage: string;
  source?: "growl" | "modal" | "alert" | "inline" | "field_validation" | "body_scan";
  selector?: string;
  merchant?: string;
  currentUrl?: string;
  stepIndex?: number;
  module?: string;
  context?: Record<string, unknown>;
}

export function classifyPortalMessage(input: PortalClassificationInput): StructuredError & {
  portalMessageSource?: string;
  portalMessageSelector?: string;
  classificationConfidence?: number;
} {
  const msg = (input.rawPortalMessage || "").toLowerCase();
  const merchant = (input.merchant || "").toLowerCase();

  // Confidence mapping based on the message source
  const sourceConfidenceMap = {
    growl: 1.0,
    modal: 0.95,
    alert: 0.90,
    inline: 0.85,
    field_validation: 0.80,
    body_scan: 0.60
  };
  const confidence = sourceConfidenceMap[input.source || "body_scan"] || 0.60;

  // Order of priority classification:
  // 1. Explicit message from portal or SAT / Fiscal errors
  if (
    msg.includes("no se localizó") ||
    msg.includes("no se localizo") ||
    msg.includes("no registrado") ||
    msg.includes("rfc no existe") ||
    msg.includes("lista de rfc") ||
    msg.includes("autorizados por el sat") ||
    msg.includes("rfc receptor")
  ) {
    return {
      ...ERROR_CATALOG.RFC_NOT_FOUND_IN_SAT,
      technicalMessage: `El RFC receptor no fue localizado en el SAT por el portal. Mensaje original: "${input.rawPortalMessage}"`,
      portalMessageSource: input.source,
      portalMessageSelector: input.selector,
      classificationConfidence: confidence,
      retryable: false,
      requiresHumanReview: true
    };
  }

  if (
    msg.includes("datos fiscales inválidos") ||
    msg.includes("datos fiscales invalidos") ||
    msg.includes("régimen fiscal incorrecto") ||
    msg.includes("regimen fiscal incorrecto") ||
    msg.includes("perfil fiscal") ||
    msg.includes("código postal") ||
    msg.includes("codigo postal")
  ) {
    return {
      ...ERROR_CATALOG.INVALID_FISCAL_PROFILE_DATA,
      technicalMessage: `Error de perfil fiscal: "${input.rawPortalMessage}"`,
      portalMessageSource: input.source,
      portalMessageSelector: input.selector,
      classificationConfidence: confidence,
      retryable: false,
      requiresHumanReview: true
    };
  }

  // 2. Ticket already invoiced
  if (
    msg.includes("facturado previamente") ||
    msg.includes("ya fue facturado") ||
    msg.includes("ya se facturó") ||
    msg.includes("ya cuenta con factura") ||
    msg.includes("factura previamente generada") ||
    msg.includes("ya existe una factura")
  ) {
    return {
      ...ERROR_CATALOG.TICKET_ALREADY_INVOICED,
      technicalMessage: `Ticket duplicado: "${input.rawPortalMessage}"`,
      portalMessageSource: input.source,
      portalMessageSelector: input.selector,
      classificationConfidence: confidence,
      retryable: false,
      requiresHumanReview: false
    };
  }

  // 3. Period expired
  if (
    msg.includes("plazo permitido") ||
    msg.includes("expirado") ||
    msg.includes("vencido") ||
    msg.includes("mes anterior") ||
    msg.includes("mes fiscal") ||
    msg.includes("fuera de fecha") ||
    msg.includes("límite de facturación")
  ) {
    return {
      ...ERROR_CATALOG.PERIOD_EXPIRED,
      technicalMessage: `Periodo de facturación expirado: "${input.rawPortalMessage}"`,
      portalMessageSource: input.source,
      portalMessageSelector: input.selector,
      classificationConfidence: confidence,
      retryable: false,
      requiresHumanReview: false
    };
  }

  // 4. Ticket or purchase data validation error
  if (
    msg.includes("folio inválido") ||
    msg.includes("folio invalido") ||
    msg.includes("id de venta incorrecto") ||
    msg.includes("referencia inválida") ||
    msg.includes("referencia invalida") ||
    msg.includes("datos del ticket inválidos") ||
    msg.includes("datos del ticket invalidos") ||
    msg.includes("no se encontró el ticket") ||
    msg.includes("no se encontro el ticket") ||
    msg.includes("ticket no válido") ||
    msg.includes("ticket no valido") ||
    msg.includes("no coincide") ||
    msg.includes("importe incorrecto") ||
    msg.includes("total incorrecto")
  ) {
    return {
      ...ERROR_CATALOG.PORTAL_FIELD_VALIDATION_ERROR,
      technicalMessage: `Fallo de validación de campos de compra: "${input.rawPortalMessage}"`,
      portalMessageSource: input.source,
      portalMessageSelector: input.selector,
      classificationConfidence: confidence,
      retryable: false,
      requiresHumanReview: true
    };
  }

  // 5. Captcha required
  if (
    msg.includes("captcha") ||
    msg.includes("verificación de seguridad") ||
    msg.includes("verificacion de seguridad") ||
    msg.includes("código de seguridad") ||
    msg.includes("codigo de seguridad")
  ) {
    return {
      ...ERROR_CATALOG.CAPTCHA_REQUIRED,
      technicalMessage: `Requerimiento de CAPTCHA interactivo: "${input.rawPortalMessage}"`,
      portalMessageSource: input.source,
      portalMessageSelector: input.selector,
      classificationConfidence: confidence,
      retryable: true,
      requiresHumanReview: true
    };
  }

  // 6. Ticket pending / merchant sync
  if (
    msg.includes("pendiente de validar") ||
    msg.includes("pendiente por validar") ||
    msg.includes("validando en comercio") ||
    msg.includes("intente más tarde") ||
    msg.includes("intente mas tarde") ||
    msg.includes("sincronizar") ||
    msg.includes("sincronizando") ||
    msg.includes("en proceso de validación") ||
    msg.includes("en proceso de validacion")
  ) {
    return {
      ...ERROR_CATALOG.MERCHANT_SYNC_PENDING,
      technicalMessage: `Sincronización de ticket pendiente en comercio: "${input.rawPortalMessage}"`,
      portalMessageSource: input.source,
      portalMessageSelector: input.selector,
      classificationConfidence: confidence,
      retryable: true,
      requiresHumanReview: false
    };
  }

  // 7. Campo obligatorio / faltante
  if (msg.includes("campo obligatorio") || msg.includes("este campo es obligatorio") || msg.includes("requerido") || msg.includes("obligatorio")) {
    return {
      ...ERROR_CATALOG.PORTAL_FIELD_VALIDATION_ERROR,
      userMessage: "Faltan datos obligatorios requeridos por el portal.",
      technicalMessage: `Campo obligatorio faltante: "${input.rawPortalMessage}"`,
      portalMessageSource: input.source,
      portalMessageSelector: input.selector,
      classificationConfidence: confidence,
      retryable: false,
      requiresHumanReview: true
    };
  }

  // 8. Dropdown disabled / Primefaces selection error / Selector not found
  if (msg.includes("dropdown") || msg.includes("desplegable") || msg.includes("seleccionar opción") || msg.includes("seleccionar opcion")) {
    return {
      ...ERROR_CATALOG.PORTAL_PRIMEFACES_SELECTION_FAILED,
      technicalMessage: `Fallo al seleccionar opción interactiva: "${input.rawPortalMessage}"`,
      portalMessageSource: input.source,
      portalMessageSelector: input.selector,
      classificationConfidence: confidence,
      retryable: true,
      requiresHumanReview: true
    };
  }

  if (msg.includes("selector no encontrado") || msg.includes("elemento no encontrado") || msg.includes("no pudimos localizar")) {
    return {
      ...ERROR_CATALOG.PORTAL_SELECTOR_NOT_FOUND,
      technicalMessage: `Selector CSS no localizado en pantalla actual: "${input.rawPortalMessage}"`,
      portalMessageSource: input.source,
      portalMessageSelector: input.selector,
      classificationConfidence: confidence,
      retryable: true,
      requiresHumanReview: true
    };
  }

  // 9. Timeout real
  if (msg.includes("timeout") || msg.includes("tiempo de espera") || msg.includes("tardó demasiado") || msg.includes("tardo demasiado")) {
    return {
      ...ERROR_CATALOG.PORTAL_AJAX_TIMEOUT,
      technicalMessage: `Timeout de AJAX o de carga del portal: "${input.rawPortalMessage}"`,
      portalMessageSource: input.source,
      portalMessageSelector: input.selector,
      classificationConfidence: confidence,
      retryable: true,
      requiresHumanReview: true
    };
  }

  // 11. Fallback: Check if message is non-empty, classify it as general portal validation
  if (input.rawPortalMessage && input.rawPortalMessage.trim().length > 0) {
    return {
      ...ERROR_CATALOG.PORTAL_FIELD_VALIDATION_ERROR,
      userMessage: input.rawPortalMessage,
      technicalMessage: `Error devuelto en el formulario del portal: "${input.rawPortalMessage}"`,
      portalMessageSource: input.source,
      portalMessageSelector: input.selector,
      classificationConfidence: confidence,
      retryable: false,
      requiresHumanReview: true
    };
  }

  // 12. Default: unknown error
  return {
    ...ERROR_CATALOG.UNKNOWN_RUNNER_ERROR,
    technicalMessage: `Error desconocido: "${input.rawPortalMessage}"`,
    portalMessageSource: input.source,
    portalMessageSelector: input.selector,
    classificationConfidence: confidence,
    retryable: true,
    requiresHumanReview: true
  };
}
