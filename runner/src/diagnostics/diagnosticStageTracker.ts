import { DiagnosticEvent } from "../../../shared/diagnostics/diagnostic-types";
import { DiagnosticStage } from "../../../shared/diagnostics/diagnostic-stages";

export class DiagnosticStageTracker {
  private events: DiagnosticEvent[] = [];
  private currentStage: DiagnosticStage = 'ticket_created';
  private ticketId: string;
  private jobId: string;
  private userId: string;
  private connectorId: string;
  private portalName: string;
  private ticketReference: string;
  private normalizedFields: any;
  private attemptId?: string;

  constructor(ticketId: string, jobId: string, userId: string, connectorId: string, portalName: string, ticketReference: string, normalizedFields: any, attemptId?: string) {
    this.ticketId = ticketId;
    this.jobId = jobId;
    this.userId = userId;
    this.connectorId = connectorId;
    this.portalName = portalName;
    this.ticketReference = ticketReference;
    this.normalizedFields = normalizedFields;
    this.attemptId = attemptId;
  }

  public getEvents(): DiagnosticEvent[] {
    return this.events;
  }

  public trackStage(
    stage: DiagnosticStage,
    status: 'started' | 'success' | 'warning' | 'failed' | 'skipped',
    options?: Partial<DiagnosticEvent>
  ): DiagnosticEvent {
    this.currentStage = stage;
    
    let severity: 'info' | 'warning' | 'error' | 'critical' = 'info';
    if (status === 'failed') {
      severity = ['failed_blocking', 'manual_review_required', 'xml_download_failed', 'xml_validation_failed', 'sat_validation_failed'].includes(stage) ? 'critical' : 'error';
    } else if (status === 'warning') {
      severity = 'warning';
    }

    const event: DiagnosticEvent = {
      userId: this.userId,
      userEmailMasked: "S/D",
      ticketId: this.ticketId,
      jobId: this.jobId,
      attemptId: this.attemptId,
      connectorId: this.connectorId,
      portalName: this.portalName,
      ticketReference: this.ticketReference,
      normalizedFields: {
        folio: this.normalizedFields?.folio || null,
        itu: this.normalizedFields?.itu || null,
        total: this.normalizedFields?.total || null,
        fechaCompra: this.normalizedFields?.fechaCompra || null,
        rfcReceptorMasked: "S/D",
        emailMasked: "S/D"
      },
      stage,
      status,
      severity,
      createdAt: new Date().toISOString(),
      retryable: options?.retryable ?? false,
      requiresManualReview: options?.requiresManualReview ?? false,
      problemSignature: "",
      safeForAdmin: true,
      recoveryAttemptCount: options?.recoveryAttemptCount ?? 0,
      maxRecoveryAttempts: options?.maxRecoveryAttempts ?? 3,
      ...options
    };

    this.events.push(event);
    return event;
  }
}
