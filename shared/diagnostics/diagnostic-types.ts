export interface DiagnosticEvent {
  id?: string;
  userId: string;
  userDisplayName?: string;
  userEmailMasked: string;
  ticketId: string;
  jobId: string;
  connectorId: string;
  portalName: string;
  ticketReference: string;
  normalizedFields: {
    folio: string | null;
    itu: string | null;
    total: number | null;
    fechaCompra: string | null;
    fechaCompraSource?: string | null;
    rawDateCandidates?: {
      portalFieldsFecha?: string | null;
      purchaseDate?: string | null;
      ticketDate?: string | null;
      createdAt?: string | null;
      [key: string]: any;
    } | null;
    rfcReceptorMasked: string;
    emailMasked: string;
  };
  stage: string;
  status: 'started' | 'success' | 'warning' | 'failed' | 'skipped';
  severity: 'info' | 'warning' | 'error' | 'critical';
  errorCode?: string | null;
  reviewReasonCode?: string | null;
  technicalMessage?: string | null;
  userMessage?: string | null;
  adminMessage?: string | null;
  portalMessage?: string | null;
  portalSnapshot?: PortalSnapshot | null;
  recoveryAttemptCount: number;
  maxRecoveryAttempts: number;
  recoveryPathsTried?: string[];
  recoveryButtonsClicked?: string[];
  recoveryFormsDetected?: string[];
  screenshotPath?: string | null;
  createdAt: string;
  retryable: boolean;
  requiresManualReview: boolean;
  suggestedAction?: string | null;
  problemSignature: string;
  safeForAdmin: boolean;
}

export interface PortalSnapshot {
  visibleText?: string | null;
  portalMessages?: string[];
  buttonsDetected?: string[];
  linksDetected?: string[];
  formsDetected?: string[];
  inputsDetected?: string[];
  labelsDetected?: string[];
  downloadCandidates?: string[];
  activeModalText?: string | null;
  currentUrlSanitized: string;
  screenshotPath?: string | null;
  timestamp: string;
}

export interface DiagnosticSummary {
  id?: string; // ticketId_or_jobId
  latestEvent: DiagnosticEvent | null;
  currentStage: string;
  lastSuccessfulStage: string;
  failedStage: string;
  failedAt: string | null;
  headline: string;
  plainLanguageProblem: string;
  technicalCause: string;
  suggestedAction: string;
  confidence: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  problemSignature: string;
  affectedPortal: string;
  userId: string;
  ticketId: string;
  jobId: string;
  connectorId: string;
  reviewed: boolean;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  reviewedNote?: string | null;
  diagnosticStatus?: 'pending' | 'reviewed';
}

export interface ConnectorLearningEntry {
  id?: string;
  connectorId: string;
  portalName: string;
  problemSignature: string;
  portalMessagePattern: string;
  failedStage: string;
  solutionType: 'recoveryFlow' | 'fieldMapping' | 'selectorFix' | 'connectorStrategyHook' | 'captchaHandling' | 'manualReviewOnly';
  proposedRecoveryFlow?: any | null;
  proposedFieldMapping?: any | null;
  proposedSelectorFix?: any | null;
  proposedStrategyHook?: any | null;
  approvalStatus: 'pending_review' | 'approved_for_sandbox' | 'approved_for_observation' | 'active' | 'disabled' | 'deprecated';
  testStatus?: 'untested' | 'passed' | 'failed';
  successRate?: number;
  usedCount: number;
  successCount: number;
  failCount: number;
  lastUsedAt?: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  createdAt: string;
  createdBy: string;
  approvedBy?: string | null;
}

export interface ConnectorPatchProposal {
  id?: string;
  connectorId: string;
  portalName: string;
  problemSignature: string;
  proposalType: 'recoveryFlow' | 'fieldMapping' | 'selectorFix' | 'connectorStrategyHook' | 'captchaHandling' | 'manualReviewOnly';
  proposedPatch: string;
  explanation: string;
  riskLevel: 'low' | 'medium' | 'high';
  requiredTests: string[];
  status: 'pending_review' | 'approved' | 'rejected';
  createdAt: string;
  createdBy: string;
  basedOnDiagnosticId?: string | null;
  basedOnTicketId?: string | null;
}

export interface RunnerTimelineEvent {
  id?: string;
  stage: string;
  status: 'started' | 'success' | 'warning' | 'failed' | 'skipped';
  createdAt: string;
  technicalMessage?: string | null;
}

export type SanitizedPortalMessage = string;
export type SanitizedTechnicalError = string;

export interface EvidenceValue {
  value: string;
  source:
    | "runner_event"
    | "playwright_error"
    | "portal_dom"
    | "deterministic_classifier"
    | "gemini_analysis";
  capturedAt: string | null;
  confidence: "low" | "medium" | "high" | null;
}

export interface IncidentEvidence {
  failureStage: EvidenceValue | null;
  lastCompletedAction: EvidenceValue | null;
  attemptedAction: EvidenceValue | null;
  expectedCondition: EvidenceValue | null;
  observedCondition: EvidenceValue | null;

  screenshot: {
    storagePath: string;
    capturedAt: string;
    source: "runner";
  } | null;

  timeline: RunnerTimelineEvent[];
  portalMessages: SanitizedPortalMessage[];
  visibleDomText: string | null;
  technicalError: SanitizedTechnicalError | null;

  connectorId: string | null;
  connectorVersion: string | null;
  jitVersion: string | null;
  attemptNumber: number | null;
}
