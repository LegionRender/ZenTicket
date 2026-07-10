import { getBillingCanonicalState } from "../../src/workspace/utils/billingStateHelpers";
import { shouldRootInvoiceCountAsActive } from "./billingDocumentRelation.service";

export class DiagnosticVisibilityService {
  /**
   * Determine if a diagnostic should be excluded from the active view.
   */
  shouldExcludeFromActiveDiagnostics(
    summary: any,
    ticket: any,
    job: any,
    invoice: any
  ): boolean {
    // 0. Root invoice exclusion rules
    if (invoice && !shouldRootInvoiceCountAsActive(invoice, ticket)) {
      return true;
    }

    // 1. Ticket-level exclusions
    if (ticket) {
      if (ticket.hiddenFromUser === true) return true;
      if (ticket.deletedAt) return true;
      if (ticket.status === "deleted") return true;
    }

    // 2. Job-level exclusions
    if (job) {
      if (job.linkedTicketDeleted === true) return true;
      if (job.status === "deleted") return true;
      if (job.hiddenFromUser === true) return true;
    }

    // 3. Summary-level exclusions
    if (summary) {
      if (summary.linkedTicketDeleted === true) return true;
      if (summary.archivedAt) return true;
      if (summary.visibility === "archived") return true;
      
      // Marked reviewed and no active error on ticket/job
      if (summary.diagnosticStatus === "reviewed") {
        const hasActiveTicketError = ticket && [
          "requires_manual_review",
          "cfdi_validation_failed",
          "sat_validation_failed",
          "automation_failed",
          "failed_blocking"
        ].includes(ticket.status);
        
        const hasActiveJobError = job && [
          "failed",
          "failed_blocking",
          "requires_manual_review"
        ].includes(job.status);

        if (!hasActiveTicketError && !hasActiveJobError) {
          return true;
        }
      }
    }

    // 4. Source-type derived_from_job without a valid active ticket
    const sourceType = summary?.sourceType || "derived_from_ticket";
    if (sourceType === "derived_from_job" && !ticket) {
      return true;
    }

    // 5. SAT Validated invoice resolves previous failures
    if (invoice && (invoice.satValidated === true || invoice.status === "valid" || invoice.status === "success")) {
      return true;
    }

    return false;
  }

  /**
   * Check if a diagnostic qualifies as active.
   */
  isActiveDiagnostic(
    summary: any,
    ticket: any,
    job: any,
    invoice: any
  ): boolean {
    if (this.shouldExcludeFromActiveDiagnostics(summary, ticket, job, invoice)) {
      return false;
    }

    // Must have a problem status to be active
    const canonicalStatus = summary?.canonicalStatus || 
      (ticket ? getBillingCanonicalState({ ticket, job, invoice }).canonicalStatus : "unknown");

    const problematicCanonicalStatuses = [
      "requires_manual_review",
      "already_invoiced_unverified",
      "invoice_recovery_pending",
      "invoice_recovery_retrying",
      "requires_field_correction",
      "cfdi_validation_failed",
      "sat_validation_failed",
      "automation_failed",
      "failed_blocking"
    ];

    if (problematicCanonicalStatuses.includes(canonicalStatus)) {
      return true;
    }

    if (job && ["failed", "failed_blocking", "requires_manual_review"].includes(job.status)) {
      return true;
    }

    return false;
  }

  /**
   * Get visibility reason description.
   */
  getDiagnosticVisibilityReason(
    summary: any,
    ticket: any,
    job: any,
    invoice: any
  ): { visibility: "active" | "archived" | "purge_candidate"; reason: string } {
    if (ticket) {
      if (ticket.status === "deleted" || ticket.deletedAt) {
        return { visibility: "purge_candidate", reason: "Ticket borrado lógicamente por el usuario" };
      }
      if (ticket.hiddenFromUser === true) {
        return { visibility: "archived", reason: "Ticket oculto de la vista del usuario" };
      }
    }

    if (job) {
      if (job.linkedTicketDeleted === true || job.status === "deleted") {
        return { visibility: "purge_candidate", reason: "Job asociado a ticket borrado" };
      }
    }

    if (summary) {
      if (summary.linkedTicketDeleted === true) {
        return { visibility: "purge_candidate", reason: "Ticket asociado marcado como borrado en summary" };
      }
      if (summary.archivedAt || summary.visibility === "archived") {
        return { visibility: "archived", reason: "Incidencia archivada administrativamente" };
      }
      if (summary.diagnosticStatus === "reviewed") {
        return { visibility: "archived", reason: "Marcado como revisado sin incidencias activas" };
      }
    }

    const sourceType = summary?.sourceType || "derived_from_ticket";
    if (sourceType === "derived_from_job" && !ticket) {
      return { visibility: "purge_candidate", reason: "Job huérfano sin documento de ticket en base de datos" };
    }

    if (invoice && (invoice.satValidated === true || invoice.status === "valid" || invoice.status === "success")) {
      return { visibility: "archived", reason: "Factura recuperada y validada ante el SAT" };
    }

    // Active checks
    const isActive = this.isActiveDiagnostic(summary, ticket, job, invoice);
    if (isActive) {
      const canonicalStatus = summary?.canonicalStatus || 
        (ticket ? getBillingCanonicalState({ ticket, job, invoice }).canonicalStatus : "unknown");
      return { visibility: "active", reason: `Incidencia activa en estado canónico: ${canonicalStatus}` };
    }

    return { visibility: "archived", reason: "Histórico sin incidencias de facturación activas" };
  }
}

export const diagnosticVisibilityService = new DiagnosticVisibilityService();
