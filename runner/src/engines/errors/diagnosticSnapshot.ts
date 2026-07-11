import { RunnerStage } from "./runnerStages";

export interface DiagnosticSnapshot {
  userId: string;
  ticketId: string;
  jobId: string;
  attemptId?: string;
  connectorId: string;
  portalMapId: string;
  stage: RunnerStage;
  errorCode: string;
  friendlyMessage: string;
  technicalMessage: string;
  rawMessage: string;
  retryable: boolean;
  blocking: boolean;
  shouldAutoRetry: boolean;
  attemptNumber: number;
  satAttemptCount?: number;
  wasAlreadyInvoiced?: boolean;
  captchaDetected?: boolean;
  xmlDownloaded: boolean;
  pdfDownloaded: boolean;
  cfdiValidated: boolean;
  satValidated: boolean;
  timestamp: string;
  sourceFile?: string;
  functionName?: string;
}

export function createDiagnosticSnapshot(params: Partial<DiagnosticSnapshot> & {
  userId: string;
  ticketId: string;
  jobId: string;
  stage: RunnerStage;
  errorCode: string;
  friendlyMessage: string;
}): DiagnosticSnapshot {
  return {
    userId: params.userId,
    ticketId: params.ticketId,
    jobId: params.jobId,
    attemptId: params.attemptId,
    connectorId: params.connectorId || "",
    portalMapId: params.portalMapId || "",
    stage: params.stage,
    errorCode: params.errorCode,
    friendlyMessage: params.friendlyMessage,
    technicalMessage: params.technicalMessage || params.friendlyMessage,
    rawMessage: params.rawMessage || "",
    retryable: params.retryable ?? false,
    blocking: params.blocking ?? true,
    shouldAutoRetry: params.shouldAutoRetry ?? false,
    attemptNumber: params.attemptNumber ?? 1,
    satAttemptCount: params.satAttemptCount,
    wasAlreadyInvoiced: params.wasAlreadyInvoiced,
    captchaDetected: params.captchaDetected,
    xmlDownloaded: params.xmlDownloaded ?? false,
    pdfDownloaded: params.pdfDownloaded ?? false,
    cfdiValidated: params.cfdiValidated ?? false,
    satValidated: params.satValidated ?? false,
    timestamp: params.timestamp || new Date().toISOString(),
    sourceFile: params.sourceFile,
    functionName: params.functionName
  };
}
