import { DiagnosticEvent, DiagnosticSummary } from "./diagnostic-types";
import { getFriendlyErrorMsg } from "./diagnostic-error-map";
import { buildProblemSignature } from "./diagnostic-problem-signature";

export const buildDiagnosticSummary = (
  ticketId: string,
  jobId: string,
  events: DiagnosticEvent[]
): DiagnosticSummary => {
  const latestEvent = events.length > 0 ? events[events.length - 1] : null;
  
  let currentStage = "unknown";
  let lastSuccessfulStage = "unknown";
  let failedStage = "none";
  let failedAt: string | null = null;
  let severity: "info" | "warning" | "error" | "critical" = "info";
  let errorCode = null;
  let portalMessage = null;
  let connectorId = "unknown";
  let portalName = "unknown";
  let userId = "unknown";

  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  sortedEvents.forEach(e => {
    currentStage = e.stage;
    if (e.status === "success") {
      lastSuccessfulStage = e.stage;
    } else if (e.status === "failed") {
      failedStage = e.stage;
      failedAt = e.createdAt;
      severity = e.severity;
      errorCode = e.errorCode;
      portalMessage = e.portalMessage;
    }
    connectorId = e.connectorId;
    portalName = e.portalName;
    userId = e.userId;
  });

  const problemSignature = buildProblemSignature(
    connectorId,
    failedStage !== "none" ? failedStage : currentStage,
    portalMessage,
    null,
    errorCode
  );

  const headline = `Incidencia en facturación de ${portalName}`;
  const plainLanguageProblem = getFriendlyErrorMsg(errorCode || (failedStage !== "none" ? failedStage : null));
  const technicalCause = portalMessage || `El runner se detuvo en la etapa ${failedStage !== "none" ? failedStage : currentStage} con estado ${latestEvent?.status || "desconocido"}.`;
  
  let suggestedAction = "Revisar los datos del ticket e intentar rellenar los datos manualmente en el portal oficial.";
  if (errorCode === "ALREADY_INVOICED_XML_NOT_RECOVERED") {
    suggestedAction = "Verificar fecha, ITU y folio. Si son correctos, revisar manualmente el portal o crear recoveryFlow de consulta/reimpresión para el conector.";
  } else if (errorCode === "CFDI_RFC_RECEPTOR_MISMATCH") {
    suggestedAction = "El RFC emisor o receptor del CFDI obtenido no coincide con el perfil fiscal. Corregir perfil fiscal del usuario.";
  } else if (errorCode === "CFDI_TOTAL_MISMATCH") {
    suggestedAction = "El total de la factura no coincide con el total esperado. Corregir campos de montos.";
  }

  return {
    latestEvent,
    currentStage,
    lastSuccessfulStage,
    failedStage,
    failedAt,
    headline,
    plainLanguageProblem,
    technicalCause,
    suggestedAction,
    confidence: 1.0,
    severity,
    problemSignature,
    affectedPortal: portalName,
    userId,
    ticketId,
    jobId,
    connectorId,
    reviewed: false,
    diagnosticStatus: "pending"
  };
};
