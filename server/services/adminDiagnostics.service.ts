import { diagnosticsRepository } from "../repositories/diagnostics.repository";
import { getBillingCanonicalState, buildUserTicketsView, isSiblingTicket, selectDiagnosticAttempt, resolveConnectorId } from "../../src/workspace/utils/billingStateHelpers";
import { diagnosticVisibilityService } from "./diagnosticVisibility.service";
import { classifyAdminUser, getUserVisibilityReason } from "./adminUserVisibility.service";
import { diagnosticAiService } from "./diagnosticAi.service";
import { connectorLearningService } from "./connectorLearning.service";
import { aiBudgetService } from "./aiBudget.service";
import { connectorPatchProposalSchema } from "../schemas/connectorPatchProposal.schema";
import crypto from "crypto";
import { IncidentEvidence, EvidenceValue, RunnerTimelineEvent } from "../../shared/diagnostics/diagnostic-types";
import { getStorage } from "firebase-admin/storage";


function buildDerivedSummaryFromTicket(ticket: any, job?: any, invoice?: any, canonicalState?: any): any {
  const status = ticket.status;
  const connectorId = ticket.connectorId || "unknown";
  
  const cState = canonicalState || getBillingCanonicalState({ ticket, job, invoice });
  const canonicalStatus = cState.canonicalStatus;
  
  // plainLanguageProblem selection
  let plainLanguageProblem = ticket.portalMessage || ticket.errorMsg || cState.message || "El ticket requiere revisión manual porque el proceso de facturación no se completó.";
  
  // severity selection
  let severity = "error";
  if (canonicalStatus === "already_invoiced_unverified" || canonicalStatus === "sat_validation_failed" || canonicalStatus === "cfdi_validation_failed") {
    severity = "critical";
  } else if (canonicalStatus === "invoice_recovery_pending" || canonicalStatus === "invoice_recovery_retrying") {
    severity = "warning";
  }
  
  // failedStage and currentStage
  let failedStage = ticket.reviewReasonCode || ticket.errorCode || "manual_review_required";
  let currentStage = "manual_review_required";
  if (canonicalStatus === "invoice_recovery_pending" || canonicalStatus === "invoice_recovery_retrying") {
    currentStage = "invoice_recovery_pending";
    failedStage = "invoice_recovery_pending";
  } else if (canonicalStatus === "sat_validation_failed" || canonicalStatus === "cfdi_validation_failed") {
    currentStage = "sat_validation_failed";
    failedStage = "sat_validation_failed";
  }
  
  const errorCode = ticket.errorCode || ticket.reviewReasonCode || "unknown_error";
  const normalizedMessage = plainLanguageProblem.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 30);
  const problemSignature = `${connectorId}::${failedStage}::${normalizedMessage}::none::${errorCode}`;
  
  // suggestedAction
  let suggestedAction = "Verificar fecha, ITU y folio. Si son correctos, revisar manualmente el portal o crear mejora de recoveryFlow.";
  if (canonicalStatus === "already_invoiced_unverified") {
    suggestedAction = "Intentar recuperar el XML fiscal del portal usando el RFC y folio.";
  } else if (canonicalStatus === "sat_validation_failed" || canonicalStatus === "cfdi_validation_failed") {
    suggestedAction = "Verificar validez ante el SAT o reintentar validación fiscal.";
  }

  const retryable = cState.retryable || ["invoice_recovery_pending", "invoice_recovery_retrying", "automation_failed"].includes(status) || (job ? (job.attempts < job.maxAttempts) : false);

  const createdAt = ticket.createdAt || ticket.updatedAt || new Date().toISOString();
  const updatedAt = ticket.updatedAt || ticket.createdAt || new Date().toISOString();

  return {
    id: ticket.id,
    ticketId: ticket.id,
    ticketReference: ticket.folio || ticket.reference || ticket.billingReference || "S/D",
    userId: ticket.userId || null,
    affectedPortal: ticket.nombreEmisor || ticket.portalName || "OXXO CADENA",
    connectorId,
    currentStage,
    failedStage,
    errorCode,
    reviewReasonCode: ticket.reviewReasonCode || null,
    canonicalStatus: canonicalStatus,
    plainLanguageProblem,
    technicalCause: ticket.errorMsg || "Detenido en etapa " + currentStage,
    suggestedAction,
    severity,
    retryable,
    requiresManualReview: cState.requiresManualReview || ["requires_manual_review", "requires_field_correction"].includes(status),
    problemSignature,
    createdAt,
    updatedAt,
    failedAt: createdAt,
    sourceType: "derived_from_ticket",
    isMaterialized: false,
    isFiscalDocument: false
  };
}

function buildDerivedSummaryFromJob(job: any): any {
  const status = job.status;
  const connectorId = job.connectorId || "unknown";
  
  let plainLanguageProblem = job.lastError || "El job de facturación falló durante el procesamiento.";
  
  let failedStage = "failed_blocking";
  let currentStage = "failed_blocking";
  
  const errorCode = job.lastErrorCode || "unknown_error";
  const normalizedMessage = plainLanguageProblem.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 30);
  const problemSignature = `${connectorId}::${failedStage}::${normalizedMessage}::none::${errorCode}`;
  
  let suggestedAction = "Revisar los logs del runner o reintentar el procesamiento del job.";
  const retryable = job.attempts !== undefined && job.maxAttempts !== undefined ? (job.attempts < job.maxAttempts) : false;

  const createdAt = job.createdAt || job.updatedAt || new Date().toISOString();
  const updatedAt = job.updatedAt || job.createdAt || new Date().toISOString();

  return {
    id: job.ticketId || job.id,
    ticketId: job.ticketId || job.id,
    ticketReference: job.ticketReference || job.folio || "S/D",
    userId: job.userId || null,
    affectedPortal: job.portalName || job.connectorId || "Portal Desconocido",
    connectorId,
    currentStage,
    failedStage,
    errorCode,
    reviewReasonCode: null,
    canonicalStatus: status,
    plainLanguageProblem,
    technicalCause: job.lastError || "Error en ejecución del Job",
    suggestedAction,
    severity: "error",
    retryable,
    requiresManualReview: ["requires_manual_review", "manual_review_required"].includes(status),
    problemSignature,
    createdAt,
    updatedAt,
    failedAt: createdAt,
    sourceType: "derived_from_job",
    isMaterialized: false,
    isFiscalDocument: false
  };
}

function filterSummary(summary: any, filters: any): boolean {
  if (filters.userId && summary.userId !== filters.userId) return false;
  if (filters.connectorId && summary.connectorId !== filters.connectorId) return false;
  if (filters.portalName && summary.affectedPortal !== filters.portalName) return false;
  if (filters.ticketId && summary.ticketId !== filters.ticketId) return false;
  if (filters.ticketReference) {
    const ref = filters.ticketReference.toLowerCase();
    const tRef = (summary.ticketReference || "").toLowerCase();
    const tId = (summary.ticketId || "").toLowerCase();
    if (!tRef.includes(ref) && !tId.includes(ref)) return false;
  }
  if (filters.jobId && summary.jobId !== filters.jobId) return false;
  if (filters.stage && summary.currentStage !== filters.stage) return false;
  if (filters.failedStage && summary.failedStage !== filters.failedStage) return false;
  if (filters.errorCode && summary.errorCode !== filters.errorCode) return false;
  if (filters.severity && summary.severity !== filters.severity) return false;
  
  if (filters.requiresManualReview !== undefined) {
    const filterBool = String(filters.requiresManualReview) === "true";
    if (summary.requiresManualReview !== filterBool) return false;
  }
  if (filters.retryable !== undefined) {
    const filterBool = String(filters.retryable) === "true";
    if (summary.retryable !== filterBool) return false;
  }
  if (filters.problemSignature && summary.problemSignature !== filters.problemSignature) return false;
  
  if (filters.dateFrom) {
    const failedDate = summary.failedAt ? new Date(summary.failedAt) : new Date(summary.createdAt);
    if (failedDate < new Date(filters.dateFrom)) return false;
  }
  if (filters.dateTo) {
    const failedDate = summary.failedAt ? new Date(summary.failedAt) : new Date(summary.createdAt);
    if (failedDate > new Date(filters.dateTo)) return false;
  }
  
  return true;
}

export class AdminDiagnosticsService {
  async listDiagnostics(filters: any) {
    const view = filters.view || "by_user";
    
    // 1. Fetch all data needed for in-memory pairing
    const authUsers = await diagnosticsRepository.getAllAuthUsers();
    const firestoreUsers = await diagnosticsRepository.getAllUsers();
    const fiscalProfiles = await diagnosticsRepository.getAllFiscalProfiles();
    const allTickets = await diagnosticsRepository.getAllTickets();
    const allJobs = await diagnosticsRepository.getAllJobs();
    const allInvoices = await diagnosticsRepository.getAllInvoices();

    // Helper: mask email safely
    const maskEmail = (email?: string): string => {
      if (!email) return "S/D";
      const parts = email.split("@");
      if (parts.length !== 2) return email;
      const [local, domain] = parts;
      if (local.length <= 2) return `${local[0]}***@${domain}`;
      return `${local[0]}***${local[local.length - 1]}@${domain}`;
    };

    // Combine all unique user IDs
    const allUserIds = new Set<string>();
    authUsers.forEach(u => allUserIds.add(u.uid));
    firestoreUsers.forEach(u => allUserIds.add(u.id));
    fiscalProfiles.forEach(u => allUserIds.add(u.id));

    // 2. Process each user group
    const processedUsers = Array.from(allUserIds).map(userId => {
      const authUser = authUsers.find(u => u.uid === userId);
      const userDoc = firestoreUsers.find(u => u.id === userId);
      const fiscalProfile = fiscalProfiles.find(u => u.id === userId);

      const displayName = userDoc?.displayName || userDoc?.name || authUser?.displayName || "Usuario " + userId.slice(0, 5);
      const email = authUser?.email || userDoc?.email || fiscalProfile?.email || "";
      const emailMasked = maskEmail(email);
      const emailHashOrPartial = email ? email.split("@")[0].slice(0, 3) + "..." : "S/D";

      const userTickets = allTickets.filter(t => t.userId === userId);
      const userInvoices = allInvoices.filter(i => i.userId === userId);
      const userJobs = allJobs.filter(j => j.userId === userId);

      const userView = buildUserTicketsView({
        tickets: userTickets,
        invoices: userInvoices,
        jobs: userJobs,
        userId: userId,
        userDisplayName: displayName,
        userEmailMasked: emailMasked
      });

      // Filter out archived items/counts for active read model list
      const activeItems = userView.items.filter((item: any) => item.bucket !== "archived" && item.canonicalStatus !== "archived");
      const activeCounts = {
        totalVisible: activeItems.length,
        inProcess: activeItems.filter(x => x.bucket === "in_process").length,
        ready: activeItems.filter(x => x.bucket === "ready").length,
        attention: activeItems.filter(x => x.bucket === "attention").length,
        failed: activeItems.filter(x => x.bucket === "failed").length,
        correctionRequired: activeItems.filter(x => x.bucket === "correction_required").length
      };

      const userViewFiltered = {
        ...userView,
        items: activeItems,
        counts: activeCounts
      };

      // Find latest activity time among user items
      let latestActivityAt = null;
      if (userViewFiltered.items.length > 0) {
        const dates = userViewFiltered.items
          .map(item => item.date)
          .filter(d => !!d)
          .map(d => new Date(d).getTime());
        if (dates.length > 0) {
          latestActivityAt = new Date(Math.max(...dates)).toISOString();
        }
      }

      const source = {
        auth: !!authUser,
        firestoreProfile: !!userDoc,
        fiscalProfile: !!fiscalProfile,
        tickets: userTickets.length > 0
      };

      const userVisibilityStatus = classifyAdminUser({
        userId,
        userDisplayName: displayName,
        email,
        source
      });
      const userVisibilityReason = getUserVisibilityReason({
        userId,
        userDisplayName: displayName,
        email,
        source
      });

      const isProtected = userVisibilityStatus === "protected_user";
      let isRecentSignupProtected = false;
      if (authUser?.metadata?.creationTime) {
        const creationDate = new Date(authUser.metadata.creationTime);
        const NOW_MS = new Date("2026-07-09T23:15:28Z").getTime();
        if (NOW_MS - creationDate.getTime() <= 48 * 60 * 60 * 1000) {
          isRecentSignupProtected = true;
        }
      }

      const deletionCandidate = (userVisibilityStatus === "incomplete_profile" || userVisibilityStatus === "mock_or_debug") &&
        !isProtected &&
        !isRecentSignupProtected &&
        userTickets.length === 0 &&
        userInvoices.length === 0 &&
        userJobs.length === 0;

      // Determine user status
      let userStatus: "with_activity" | "without_tickets" | "incomplete_profile" | "with_issues" | "ready_only" = "without_tickets";
      const counts = userViewFiltered.counts;
      if (counts.failed > 0 || counts.correctionRequired > 0 || counts.attention > 0) {
        userStatus = "with_issues";
      } else if (counts.totalVisible > 0) {
        if (counts.ready === counts.totalVisible) {
          userStatus = "ready_only";
        } else {
          userStatus = "with_activity";
        }
      } else if (!userDoc || !fiscalProfile) {
        userStatus = "incomplete_profile";
      }

      return {
        ...userViewFiltered,
        userStatus,
        source,
        emailHashOrPartial,
        latestActivityAt,
        metadata: authUser?.metadata || null,
        email: email,
        userVisibilityStatus,
        userVisibilityReason,
        deletionCandidate,
        protectedUser: isProtected
      };
    });

    // 3. Filter users/items based on query filters
    let filteredUsers = processedUsers.map(u => {
      let items = u.items;

      // Filter by ticketReference
      if (filters.ticketReference) {
        items = items.filter(item => item.ticketReference === filters.ticketReference);
      }
      // Filter by ticketId
      if (filters.ticketId) {
        items = items.filter(item => item.ticketId === filters.ticketId);
      }
      // Filter by connectorId
      if (filters.connectorId) {
        items = items.filter(item => item.connectorId === filters.connectorId);
      }
      // Filter by portalName
      if (filters.portalName) {
        items = items.filter(item => item.portal.toLowerCase().includes(filters.portalName.toLowerCase()));
      }
      // Filter by canonicalStatus
      if (filters.canonicalStatus) {
        items = items.filter(item => item.canonicalStatus === filters.canonicalStatus);
      }
      // Filter by bucket
      if (filters.bucket) {
        items = items.filter(item => item.bucket === filters.bucket);
      }
      // Filter by date range
      if (filters.dateFrom) {
        const fromTime = new Date(filters.dateFrom).getTime();
        items = items.filter(item => item.date && new Date(item.date).getTime() >= fromTime);
      }
      if (filters.dateTo) {
        const toTime = new Date(filters.dateTo).getTime();
        items = items.filter(item => item.date && new Date(item.date).getTime() <= toTime);
      }

      // Re-calculate user counts after item-level filtering
      const counts = {
        totalVisible: items.length,
        inProcess: items.filter(x => x.bucket === "in_process").length,
        ready: items.filter(x => x.bucket === "ready").length,
        attention: items.filter(x => x.bucket === "attention").length,
        failed: items.filter(x => x.bucket === "failed").length,
        correctionRequired: items.filter(x => x.bucket === "correction_required").length
      };

      return {
        ...u,
        items,
        counts
      };
    });

    // If userId or userEmail is filtered, filter at user level
    if (filters.userId) {
      filteredUsers = filteredUsers.filter(u => u.userId === filters.userId);
    }
    if (filters.userEmail) {
      filteredUsers = filteredUsers.filter(u => u.userEmailMasked.toLowerCase().includes(filters.userEmail.toLowerCase()));
    }

    // Filter by userVisibility (default: real)
    const userVisibility = filters.userVisibility || "real";
    if (userVisibility === "real") {
      filteredUsers = filteredUsers.filter(u => u.userVisibilityStatus === "real_user" || u.userVisibilityStatus === "protected_user");
    } else if (userVisibility === "incomplete") {
      filteredUsers = filteredUsers.filter(u => u.userVisibilityStatus === "incomplete_profile");
    } else if (userVisibility === "mock") {
      filteredUsers = filteredUsers.filter(u => u.userVisibilityStatus === "mock_or_debug" || u.userVisibilityStatus === "orphan_activity");
    } // If "all", we keep all users

    // Always exclude users with 0 visible items if a ticket-level search is active
    const hasTicketFilter = !!(
      filters.ticketReference ||
      filters.ticketId ||
      filters.connectorId ||
      filters.portalName ||
      filters.canonicalStatus ||
      filters.bucket ||
      filters.dateFrom ||
      filters.dateTo
    );

    if (hasTicketFilter || view !== "by_user") {
      filteredUsers = filteredUsers.filter(u => u.items.length > 0);
    }

    // Sort items within each user
    filteredUsers.forEach(u => {
      u.items.sort((a, b) => {
        const scoreA = getItemSortScore(a);
        const scoreB = getItemSortScore(b);
        if (scoreA !== scoreB) return scoreB - scoreA;
        const timeA = a.date ? new Date(a.date).getTime() : 0;
        const timeB = b.date ? new Date(b.date).getTime() : 0;
        return timeB - timeA;
      });
    });

    function getItemSortScore(item: any): number {
      switch (item.bucket) {
        case "attention": return 6;
        case "failed": return 5;
        case "in_process": return 4;
        case "correction_required": return 3;
        case "ready": return 2;
        default: return 1;
      }
    }

    // 4. Compute metrics across the filtered user dataset BEFORE pagination
    let totalUsers = filteredUsers.length;
    let usersWithIssues = 0;
    let usersWithTickets = 0;
    let usersWithoutTickets = 0;
    let usersIncompleteProfile = 0;
    let inProcessTickets = 0;
    let attentionTickets = 0;
    let failedTickets = 0;
    let readyTickets = 0;
    let pendingRetries = 0;
    let last24h = 0;

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    filteredUsers.forEach(u => {
      if (u.userStatus === "with_issues") {
        usersWithIssues++;
      }
      if (u.userStatus === "incomplete_profile") {
        usersIncompleteProfile++;
      }
      if (u.counts.totalVisible > 0) {
        usersWithTickets++;
      } else {
        usersWithoutTickets++;
      }
      
      inProcessTickets += u.counts.inProcess;
      attentionTickets += u.counts.attention;
      failedTickets += u.counts.failed + u.counts.correctionRequired;
      readyTickets += u.counts.ready;
      
      u.items.forEach(item => {
        if (["invoice_recovery_pending", "invoice_recovery_retrying", "automation_failed"].includes(item.canonicalStatus)) {
          pendingRetries++;
        }
        if (item.bucket !== "ready" && item.bucket !== "archived" && item.date) {
          const itemDate = new Date(item.date);
          if (itemDate >= twentyFourHoursAgo) {
            last24h++;
          }
        }
      });
    });

    const metrics = {
      totalUsers,
      usersWithIssues,
      usersWithTickets,
      usersWithoutTickets,
      usersIncompleteProfile,
      inProcessTickets,
      attentionTickets,
      failedTickets,
      readyTickets,
      pendingRetries,
      last24h
    };

    // 5. Paginate and return view
    const limit = filters.limit || 20;

    if (view === "by_user") {
      // Sort users based on priorityScore formula
      filteredUsers.sort((a, b) => {
        const scoreA = getUserSortScore(a);
        const scoreB = getUserSortScore(b);
        return scoreB - scoreA;
      });

      function getUserSortScore(u: any): number {
        let statusScore = 0;
        switch (u.userStatus) {
          case "with_issues": statusScore = 10000000000000; break;
          case "with_activity": statusScore = 8000000000000; break;
          case "ready_only": statusScore = 6000000000000; break;
          case "incomplete_profile": statusScore = 4000000000000; break;
          case "without_tickets": statusScore = 2000000000000; break;
          default: statusScore = 0;
        }
        
        const activityTime = u.latestActivityAt ? new Date(u.latestActivityAt).getTime() : 0;
        return statusScore + activityTime;
      }

      let paginatedUsers = [];
      if (filters.cursor) {
        const idx = filteredUsers.findIndex(u => u.userId === filters.cursor);
        if (idx !== -1) {
          paginatedUsers = filteredUsers.slice(idx + 1, idx + 1 + limit);
        } else {
          paginatedUsers = filteredUsers.slice(0, limit);
        }
      } else {
        paginatedUsers = filteredUsers.slice(0, limit);
      }

      const nextCursor = paginatedUsers.length === limit ? paginatedUsers[paginatedUsers.length - 1].userId : null;

      return {
        users: paginatedUsers,
        items: [],
        metrics,
        nextCursor
      };
    } else {
      // Flatten items according to requested view/bucket
      const flatItems: any[] = [];
      filteredUsers.forEach(u => {
        u.items.forEach(item => {
          let keep = false;
          if (view === "all") {
            keep = true;
          } else if (view === "in_process" && item.bucket === "in_process") {
            keep = true;
          } else if (view === "attention" && item.bucket === "attention") {
            keep = true;
          } else if (view === "failed" && (item.bucket === "failed" || item.bucket === "correction_required")) {
            keep = true;
          } else if (view === "ready" && item.bucket === "ready") {
            keep = true;
          } else if (view === "archived" && item.bucket === "archived") {
            keep = true;
          }

          if (keep) {
            flatItems.push({
              ...item,
              userId: u.userId,
              userDisplayName: u.userDisplayName,
              userEmailMasked: u.userEmailMasked
            });
          }
        });
      });

      // Sort flat items by date (descending)
      flatItems.sort((a, b) => {
        const timeA = a.date ? new Date(a.date).getTime() : 0;
        const timeB = b.date ? new Date(b.date).getTime() : 0;
        return timeB - timeA;
      });

      let paginatedItems = [];
      if (filters.cursor) {
        const idx = flatItems.findIndex(x => x.visualKey === filters.cursor);
        if (idx !== -1) {
          paginatedItems = flatItems.slice(idx + 1, idx + 1 + limit);
        } else {
          paginatedItems = flatItems.slice(0, limit);
        }
      } else {
        paginatedItems = flatItems.slice(0, limit);
      }

      const nextCursor = paginatedItems.length === limit ? paginatedItems[paginatedItems.length - 1].visualKey : null;

      return {
        users: [],
        items: paginatedItems,
        metrics,
        nextCursor
      };
    }
  }

  private buildIncidentEvidence(ticket: any, job: any, timeline: any[]): IncidentEvidence {
  const now = new Date().toISOString();
  
  const makeVal = (
    value: string | null | undefined,
    source: EvidenceValue["source"],
    capturedAt: string | null = null,
    confidence: EvidenceValue["confidence"] = "high"
  ): EvidenceValue | null => {
    if (value === undefined || value === null || String(value).trim() === "" || String(value).toLowerCase() === "unknown") {
      return null;
    }
    return {
      value: String(value),
      source,
      capturedAt: capturedAt || (ticket?.createdAt || now),
      confidence
    };
  };

  const failureStage = makeVal(
    ticket?.failedStage || job?.lastFailedStage,
    "runner_event",
    ticket?.updatedAt || job?.updatedAt
  );

  let lastCompleted: string | null = null;
  let lastCompletedAt: string | null = null;
  if (timeline && timeline.length > 0) {
    for (let i = timeline.length - 1; i >= 0; i--) {
      const ev = timeline[i];
      if (ev.status === "success" && ev.stage !== "failed_blocking") {
        lastCompleted = ev.stage;
        lastCompletedAt = ev.createdAt;
        break;
      }
    }
  }
  const lastCompletedAction = makeVal(lastCompleted, "runner_event", lastCompletedAt);

  let attempted: string | null = null;
  let attemptedAt: string | null = null;
  if (timeline && timeline.length > 0) {
    const failedEvent = timeline.find(ev => ev.status === "failed");
    if (failedEvent) {
      attempted = failedEvent.stage;
      attemptedAt = failedEvent.createdAt;
    }
  }
  if (!attempted) {
    attempted = ticket?.failedStage || job?.lastFailedStage || null;
  }
  const attemptedAction = makeVal(attempted, "runner_event", attemptedAt || ticket?.updatedAt);

  const techErrorMsg = ticket?.errorMsg || job?.lastError || null;
  let expected: string | null = null;
  if (techErrorMsg) {
    const match = techErrorMsg.match(/waiting for selector\s+["']([^"']+)["']/i) || 
                  techErrorMsg.match(/selector\s+["']([^"']+)["']\s+to be/i);
    if (match) {
      expected = `Elemento selector: ${match[1]}`;
    } else if (techErrorMsg.toLowerCase().includes("timeout")) {
      expected = "Elemento selector en pantalla del portal";
    }
  }
  const expectedCondition = makeVal(expected, "playwright_error", ticket?.updatedAt);

  const portalMessages = job?.portalSnapshot?.portalMessages || [];
  let observed: string | null = null;
  let observedSource: EvidenceValue["source"] = "playwright_error";
  if (portalMessages.length > 0) {
    observed = portalMessages.join("\n");
    observedSource = "portal_dom";
  } else if (techErrorMsg) {
    observed = techErrorMsg;
  }
  const observedCondition = makeVal(observed, observedSource, ticket?.updatedAt);

  let screenshot = null;
  const sPath = job?.evidenceScreenshotPath || job?.portalSnapshot?.screenshotPath || (timeline && timeline.find((t: any) => t.screenshotPath)?.screenshotPath);
  if (sPath) {
    screenshot = {
      storagePath: sPath,
      capturedAt: job?.updatedAt || ticket?.updatedAt || now,
      source: "runner" as const
    };
  }

  const timelineEvents: RunnerTimelineEvent[] = (timeline || []).map(ev => ({
    id: ev.id || "",
    stage: ev.stage || "unknown",
    status: ev.status || "started",
    createdAt: ev.createdAt || now,
    technicalMessage: ev.technicalMessage || null
  }));

  const visibleDomText = job?.portalSnapshot?.visibleText || null;
  const technicalError = techErrorMsg || null;

  return {
    failureStage,
    lastCompletedAction,
    attemptedAction,
    expectedCondition,
    observedCondition,
    screenshot,
    timeline: timelineEvents,
    portalMessages: portalMessages,
    visibleDomText,
    technicalError,
    connectorId: ticket?.connectorId || job?.connectorId || null,
    connectorVersion: ticket?.connectorVersion || job?.connectorVersion || null,
    jitVersion: ticket?.jitVersion || job?.jitVersion || null,
    attemptNumber: job?.attempts || 1
  };
}

  async getDiagnosticDetail(ticketId: string) {
    let ticket = await diagnosticsRepository.getTicket(ticketId);
    let invoice = null;
    let userId = null;

    if (!ticket) {
      const allInvoices = await diagnosticsRepository.getAllInvoices();
      invoice = allInvoices.find(i => i.id === ticketId || i.ticketId === ticketId || i.sourceTicketId === ticketId);
      if (invoice) {
        userId = invoice.userId;
      }
    } else {
      userId = ticket.userId;
      if (ticket.invoiceId) {
        invoice = await diagnosticsRepository.getInvoice(ticket.userId, ticket.invoiceId);
      }
    }

    if (!ticket && !invoice) return null;

    // Fetch all active tickets to resolve siblings
    const allTickets = await diagnosticsRepository.getAllTickets();
    const userTickets = allTickets.filter(t => 
      t.userId === userId && 
      t.status !== "deleted" && 
      !t.deletedAt
    );

    const targetDoc = ticket || { id: ticketId, userId, ...invoice };
    const siblings = userTickets.filter(t => isSiblingTicket(t, targetDoc) || t.id === targetDoc.id);

    let canonicalTicket = siblings.find(t => t.canonicalTicketId && t.canonicalTicketId === t.id);
    if (!canonicalTicket) {
      const allJobs = await diagnosticsRepository.getAllJobs();
      canonicalTicket = siblings.find(t => allJobs.some(j => j.ticketId === t.id));
    }
    if (!canonicalTicket) {
      canonicalTicket = [...siblings].sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeA - timeB;
      })[0] || targetDoc;
    }

    const canonicalTicketId = canonicalTicket.id;
    const memberTicketIds = siblings.map(t => t.id);

    const allJobs = await diagnosticsRepository.getAllJobs();
    const activeJob = selectDiagnosticAttempt({
      canonicalTicketId,
      memberTicketIds,
      jobs: allJobs
    });

    let timeline = [];
    if (activeJob) {
      timeline = activeJob.portalSnapshot?.timeline || activeJob.timeline || await diagnosticsRepository.getTimeline(activeJob.ticketId) || [];
    }
    if (timeline.length === 0) {
      timeline = await diagnosticsRepository.getTimeline(canonicalTicketId) || [];
    }

    const getLastCompletedAction = (events: any[]) => {
      if (!events || events.length === 0) return null;
      for (let i = events.length - 1; i >= 0; i--) {
        const ev = events[i];
        if (ev.status === "success" && ev.stage !== "failed_blocking") {
          return ev.stage;
        }
      }
      return null;
    };

    const getAttemptedAction = (events: any[]) => {
      if (!events || events.length === 0) return null;
      const failedEvent = events.find(ev => ev.status === "failed");
      if (failedEvent) return failedEvent.stage;
      return null;
    };

    const getExpectedFinding = (technicalMessage: string | null | undefined) => {
      if (!technicalMessage) return null;
      const match = technicalMessage.match(/waiting for selector\s+["']([^"']+)["']/i) || 
                    technicalMessage.match(/selector\s+["']([^"']+)["']\s+to be/i);
      if (match) {
        return `Elemento selector: ${match[1]}`;
      }
      if (technicalMessage.toLowerCase().includes("timeout")) {
        return "Elemento selector en pantalla del portal";
      }
      return null;
    };

    const getActualFinding = (portalMessage: string | null | undefined, errorMsg: string | null | undefined) => {
      if (portalMessage && portalMessage.trim().length > 0) {
        return portalMessage;
      }
      if (errorMsg) {
        if (errorMsg.includes("Timeout")) return "Límite de tiempo agotado (Timeout) sin respuesta del elemento.";
        return errorMsg;
      }
      return null;
    };

    const getBlockCause = (problemSignature: string | null | undefined, errorMsg: string | null | undefined) => {
      if (problemSignature && problemSignature !== "unknown") {
        return problemSignature;
      }
      if (errorMsg) {
        const lowerMsg = errorMsg.toLowerCase();
        if (lowerMsg.includes("captcha")) return "Se requiere resolución manual de CAPTCHA.";
        if (lowerMsg.includes("session") || lowerMsg.includes("expirada")) return "Sesión del portal expirada.";
        if (lowerMsg.includes("selector") || lowerMsg.includes("timeout")) return "Cambio en la estructura del portal (selector no encontrado).";
      }
      return "Situación de bloqueo no clasificada previamente.";
    };

    const techCause = canonicalTicket?.errorMsg || activeJob?.lastError || null;
    const portalMsg = canonicalTicket?.portalMessage || (activeJob?.portalSnapshot?.portalMessages && activeJob.portalSnapshot.portalMessages.join("\n")) || null;
    const probSignature = canonicalTicket?.problemSignature || canonicalTicket?.reviewReasonCode || activeJob?.lastErrorCode || "unknown";

    const lastActionCompleted = getLastCompletedAction(timeline);
    const attemptedAction = getAttemptedAction(timeline) || canonicalTicket?.failedStage || activeJob?.lastFailedStage || null;
    const expectedFinding = getExpectedFinding(techCause);
    const actualFinding = getActualFinding(portalMsg, techCause);
    const blockCause = getBlockCause(probSignature, techCause);

    const canonicalState = getBillingCanonicalState({ ticket: canonicalTicket, job: activeJob, invoice });
    const user = userId ? await diagnosticsRepository.getUser(userId) : null;

    const isLegacy = invoice ? (invoice._path ? invoice._path.split("/").length === 2 : false) : false;
    
    const isDuplicate = canonicalTicketId !== ticketId;
    const siblingTicketId = isDuplicate ? canonicalTicketId : null;

    const summary = {
      id: ticketId,
      ticketId: ticketId,
      ticketReference: canonicalTicket?.folio || canonicalTicket?.portalFields?.billingReference || invoice?.ticketReference || "S/D",
      userId: userId || invoice?.userId,
      affectedPortal: canonicalTicket?.nombreEmisor || invoice?.nombreEmisor || "OXXO CADENA",
      connectorId: canonicalTicket?.connectorId || invoice?.connectorId || resolveConnectorId(canonicalTicket?.nombreEmisor || invoice?.nombreEmisor || ""),
      canonicalStatus: canonicalState.canonicalStatus,
      plainLanguageProblem: canonicalState.message,
      technicalCause: techCause || "Sin error técnico",
      suggestedAction: canonicalState.message,
      severity: canonicalState.badgeTone === "bg-red-500" ? "critical" : "error",
      retryable: ["invoice_recovery_pending", "invoice_recovery_retrying", "automation_failed"].includes(canonicalState.canonicalStatus),
      createdAt: ticket?.createdAt || invoice?.createdAt || null,
      updatedAt: ticket?.updatedAt || invoice?.updatedAt || null,
      bucket: canonicalState.shouldAppearInReady && canonicalState.isValidInvoice ? "ready" : "in_process",
      failedStage: canonicalTicket?.failedStage || activeJob?.lastFailedStage || "unknown",
      problemSignature: probSignature,
      invoiceId: invoice?.id || null,
      uuid: invoice?.uuid || invoice?.folioFiscal || null,
      satStatus: invoice?.satStatus || invoice?.estadoCfdi || "S/D",
      validationStatus: invoice?.validationStatus || "S/D",
      total: canonicalState.displayTotal,
      validationDate: invoice?.updatedAt || invoice?.createdAt || null,
      hasXml: !!((invoice?.xmlContent && invoice.xmlContent.trim().length > 0) || (invoice?.xmlStoragePath && invoice.xmlStoragePath.trim().length > 0)),
      hasPdf: !!((invoice?.pdfHtml && invoice.pdfHtml.trim().length > 0) || (invoice?.pdfStoragePath && invoice.pdfStoragePath.trim().length > 0)),
      legacyRootInvoice: isLegacy,
      linkedTicketDeleted: invoice ? (invoice.linkedTicketDeleted === true) : false,
      lastActionCompleted,
      attemptedAction,
      expectedFinding,
      actualFinding,
      blockCause,
      isDuplicate,
      siblingTicketId
    };

    const finalTimeline = timeline.length > 0 ? timeline : [
      {
        id: "created",
        ticketId,
        createdAt: ticket?.createdAt || invoice?.createdAt || new Date().toISOString(),
        type: "info",
        message: "Ticket creado en sistema",
        stage: "created"
      }
    ];

    const rawDateCandidates = {
      portalFieldsFecha: canonicalTicket?.portalFields?.fecha || null,
      purchaseDate: canonicalTicket?.purchaseDate || null,
      ticketDate: canonicalTicket?.fechaCompra || null,
      createdAt: canonicalTicket?.createdAt || null
    };

    const normalizedFields = {
      folio: canonicalTicket?.portalFields?.billingReference || canonicalTicket?.reference || null,
      itu: canonicalTicket?.portalFields?.itu || null,
      total: canonicalTicket?.expectedTicketTotal || null,
      fechaCompra: canonicalTicket?.fechaCompra || null,
      fechaCompraSource: canonicalTicket?.fechaCompra ? "ticket.fechaCompra" : "unknown",
      rawDateCandidates,
      rfcReceptorMasked: "S/D",
      emailMasked: "S/D"
    };

    const rawEvidence = this.buildIncidentEvidence(canonicalTicket, activeJob, finalTimeline);
    
    const evidence = {
      ...rawEvidence,
      screenshotReason: rawEvidence.screenshot ? "OK" : (activeJob ? "screenshot_not_captured" : "runner_job_not_found"),
      timelineReason: rawEvidence.timeline && rawEvidence.timeline.length > 1 ? "OK" : (activeJob ? "runner_events_not_persisted" : "runner_job_not_found"),
      technicalCauseReason: rawEvidence.observedCondition ? "OK" : (activeJob ? "runner_events_not_persisted" : "runner_job_not_found"),
      connectorReason: (canonicalTicket?.connectorId || activeJob?.connectorId) ? "OK" : "connector_relation_missing",
      provenance: {
        ticketId: canonicalTicketId,
        jobId: activeJob?.id || null,
        isCanonical: canonicalTicketId === ticketId,
        legacyRecord: (!canonicalTicket && invoice) ? "legacy_record_without_job" : null
      }
    };

    return {
      summary,
      timeline: finalTimeline,
      ticketSnapshot: canonicalTicket,
      jobSnapshot: activeJob,
      userSnapshot: user,
      normalizedFields,
      portalSnapshot: activeJob?.portalSnapshot || null,
      suggestedActions: [canonicalState.message],
      similarProblems: [],
      evidence,
      canonicalTicketId,
      memberTicketIds,
      selectedJobId: activeJob?.id || null
    };
  }

  async retryDiagnostic(ticketId: string, adminUser: any) {
    const ticketData = await diagnosticsRepository.getTicket(ticketId);
    if (!ticketData) {
      throw new Error("TICKET_NOT_FOUND");
    }

    const invoiceId = ticketData.invoiceId || "";
    if (invoiceId) {
      const invData = await diagnosticsRepository.getInvoiceByUserIdAndId(ticketData.userId, invoiceId);
      if (invData && (invData.validationStatus === "sat_validated" || invData.isCfdiValidated)) {
        throw new Error("ALREADY_SAT_VALIDATED");
      }
    }

    const recoveryAttemptCount = 0;
    const nextRecoveryAt = new Date().toISOString();

    await diagnosticsRepository.updateTicket(ticketId, {
      status: "invoice_recovery_pending",
      recoveryAttemptCount,
      nextRecoveryAt,
      manualRecoveryRequested: true,
      manualRecoveryRequestedAt: nextRecoveryAt,
      manualRecoveryRequestedBy: adminUser.uid || adminUser.id,
      errorCode: null,
      reviewReasonCode: null,
      errorMsg: "Recuperación de factura solicitada manualmente por el Admin.",
      updatedAt: nextRecoveryAt
    });

    const jobDoc = await diagnosticsRepository.getJobByTicketId(ticketId);
    let jobId = "";
    if (jobDoc) {
      jobId = jobDoc.id;
      await diagnosticsRepository.updateJob(jobId, {
        status: "pending_local",
        recoveryAttemptCount,
        nextRecoveryAt,
        manualRecoveryRequested: true,
        manualRecoveryRequestedAt: nextRecoveryAt,
        manualRecoveryRequestedBy: adminUser.uid || adminUser.id,
        retryCount: 0,
        attempts: 0,
        lastError: null,
        lastErrorCode: null,
        updatedAt: nextRecoveryAt
      });
    } else {
      jobId = await diagnosticsRepository.createJob({
        ticketId,
        userId: ticketData.userId,
        status: "pending_local",
        connectorId: ticketData.connectorId || "oxxo",
        portalMapId: ticketData.connectorId || "oxxo",
        attempts: 0,
        retryCount: 0,
        recoveryAttemptCount,
        nextRecoveryAt,
        manualRecoveryRequested: true,
        manualRecoveryRequestedAt: nextRecoveryAt,
        manualRecoveryRequestedBy: adminUser.uid || adminUser.id,
        createdAt: nextRecoveryAt,
        updatedAt: nextRecoveryAt
      });
    }

    const adminEmailMasked = adminUser.email ? adminUser.email[0] + "***@" + adminUser.email.split("@")[1] : "admin@zenticket.com";
    const event = {
      userId: ticketData.userId,
      userEmailMasked: adminEmailMasked,
      ticketId,
      jobId,
      connectorId: ticketData.connectorId || "unknown",
      portalName: (ticketData.connectorId || "unknown").split("_")[0],
      ticketReference: ticketData.reference || "S/D",
      normalizedFields: {
        folio: ticketData.portalFields?.billingReference || null,
        itu: ticketData.portalFields?.itu || null,
        total: ticketData.expectedTicketTotal || null,
        fechaCompra: ticketData.fechaCompra || null,
        rfcReceptorMasked: "XAXX******XXX",
        emailMasked: adminEmailMasked
      },
      stage: "admin_action_retry_requested",
      status: "started",
      extraStatus: "started",
      severity: "info",
      createdAt: new Date().toISOString(),
      retryable: true,
      requiresManualReview: false,
      problemSignature: "admin_retry",
      safeForAdmin: true,
      recoveryAttemptCount: 0,
      maxRecoveryAttempts: 3
    };
    await diagnosticsRepository.addRunnerDiagnostic(event);

    return { jobId };
  }

  async markReviewed(ticketId: string, note: string | undefined, adminUser: any) {
    const timestamp = new Date().toISOString();
    const adminEmail = adminUser.email || "admin@zenticket.com";

    const summarySnap = await diagnosticsRepository.getSummary(ticketId);
    if (!summarySnap) {
      const detail = await this.getDiagnosticDetail(ticketId);
      if (detail && detail.summary) {
        const derivedSummary = { ...detail.summary, id: ticketId };
        await diagnosticsRepository.createSummary(ticketId, derivedSummary);
      } else {
        await diagnosticsRepository.createSummary(ticketId, {
          ticketId,
          createdAt: timestamp,
          updatedAt: timestamp
        });
      }
    }
    
    await diagnosticsRepository.updateSummary(ticketId, {
      reviewed: true,
      reviewedAt: timestamp,
      reviewedBy: adminEmail,
      reviewedNote: note || null,
      diagnosticStatus: "reviewed"
    });

    return { success: true };
  }

  async archiveDiagnostic(ticketId: string, reason: string, comment: string | undefined, adminUser: any) {
    const timestamp = new Date().toISOString();
    const adminEmail = adminUser.email || adminUser.uid || "admin@zenticket.com";
    const archivedReasonText = `${reason}${comment ? `: ${comment}` : ""}`;

    const detail = await this.getDiagnosticDetail(ticketId);
    if (!detail) {
      throw new Error("TICKET_NOT_FOUND");
    }

    const summarySnap = detail.summary;
    if (summarySnap && (summarySnap.diagnosticStatus === "archived" || summarySnap.canonicalStatus === "archived")) {
      return { success: true };
    }

    const ticketIds = (detail.memberTicketIds && detail.memberTicketIds.length > 0) ? detail.memberTicketIds : [ticketId];

    for (const tid of ticketIds) {
      const summary = await diagnosticsRepository.getSummary(tid);
      const previousDiagnosticStatus = summary?.diagnosticStatus || "pending";

      if (!summary) {
        const tkt = await diagnosticsRepository.getTicket(tid);
        if (tkt) {
          await diagnosticsRepository.createSummary(tid, {
            ticketId: tid,
            createdAt: tkt.createdAt || timestamp,
            updatedAt: timestamp
          });
        } else {
          await diagnosticsRepository.createSummary(tid, {
            ticketId: tid,
            createdAt: timestamp,
            updatedAt: timestamp
          });
        }
      }

      await diagnosticsRepository.updateTicket(tid, {
        archived: true,
        archivedAt: timestamp,
        archivedBy: adminEmail,
        archivedReason: reason,
        archivedComment: comment || null,
        hiddenFromActiveDiagnostics: true,
        status: "archived",
        updatedAt: timestamp
      });

      await diagnosticsRepository.updateSummary(tid, {
        archivedAt: timestamp,
        archiveReason: reason,
        archiveComment: comment || null,
        archivedReason: archivedReasonText,
        archivedBy: adminEmail,
        visibility: "archived",
        diagnosticStatus: "archived",
        previousDiagnosticStatus,
        updatedAt: timestamp
      });

      const job = await diagnosticsRepository.getJobByTicketId(tid);
      if (job) {
        await diagnosticsRepository.updateJob(job.id, {
          archivedAt: timestamp,
          archivedReason: archivedReasonText
        });
      }

      await diagnosticsRepository.archiveRunnerDiagnostics(tid, {
        archivedAt: timestamp,
        archivedReason: archivedReasonText,
        archivedBy: adminEmail,
        visibility: "archived"
      });

      await diagnosticsRepository.writeAuditLog({
        adminUserId: adminUser?.uid || adminUser?.userId || "admin",
        ticketId: tid,
        action: "archive_diagnostic",
        reason,
        comment: comment || null,
        createdAt: timestamp,
        previousDiagnosticStatus
      });

      await diagnosticsRepository.writeAdminAuditLog({
        adminUserId: adminUser?.uid || adminUser?.userId || "admin",
        ticketId: tid,
        action: "archive_diagnostic",
        reason,
        comment: comment || null,
        createdAt: timestamp,
        previousDiagnosticStatus
      });
    }

    return { success: true };
  }

  async createConnectorTask(ticketId: string, adminUser: any) {
    const detail = await this.getDiagnosticDetail(ticketId);
    if (!detail) throw new Error("TICKET_NOT_FOUND");

    const summary = detail.summary;
    const ticket = detail.ticketSnapshot;
    const job = detail.jobSnapshot;

    const task = {
      connectorId: ticket.connectorId || "unknown",
      portalName: (ticket.connectorId || "unknown").split("_")[0],
      ticketId,
      jobId: job?.id || "unknown",
      errorCode: ticket.reviewReasonCode || ticket.errorCode || "unknown",
      failedStage: summary?.failedStage || "unknown",
      problemSignature: summary?.problemSignature || "unknown",
      summary: summary?.plainLanguageProblem || "Incidencia de facturación",
      evidence: {
        portalMessage: summary?.technicalCause || null,
        lastFailedStage: summary?.failedStage || null
      },
      status: "open",
      createdAt: new Date().toISOString(),
      createdBy: adminUser.email || "admin@zenticket.com"
    };

    const taskId = await diagnosticsRepository.createConnectorTask(task);
    return { taskId };
  }

  async prepareFixProposal(ticketId: string, adminUser: any) {
    if (process.env.GEMINI_DIAGNOSTIC_ENABLED !== "true") {
      throw new Error("GEMINI_DIAGNOSTIC_DISABLED");
    }

    // 1. Fetch data
    const ticket = await diagnosticsRepository.getTicket(ticketId);
    if (!ticket) {
      throw new Error("TICKET_NOT_FOUND");
    }

    const job = await diagnosticsRepository.getJobByTicketId(ticketId);
    let invoice = null;
    if (ticket.invoiceId) {
      invoice = await diagnosticsRepository.getInvoice(ticket.userId, ticket.invoiceId);
    }
    const cState = getBillingCanonicalState({ ticket, job, invoice });

    // 2. Map payload parameters for Gemini
    const params = {
      ticketId: ticket.id,
      userId: ticket.userId,
      connectorId: ticket.connectorId || "unknown",
      affectedPortal: ticket.portal || "unknown",
      canonicalStatus: cState.canonicalStatus,
      failedStage: ticket.failedStage || job?.lastFailedStage || "unknown",
      problemSignature: ticket.problemSignature || "unknown",
      sanitizedTimeline: ticket.timeline || [],
      sanitizedPortalSnapshot: job?.portalSnapshot || ticket.portalSnapshot || {},
      normalizedFields: ticket.normalizedFields || {},
      currentConnectorMetadata: job?.metadata || {},
      knownLearningEntries: [],
      runnerErrorCode: ticket.errorCode || job?.lastError || "",
      portalMessage: ticket.portalMessage || "",
      missingArtifacts: ticket.missingArtifacts || [],
      technicalMessage: ticket.technicalMessage || ""
    };

    // Calculate sanitized input hash
    const jsonStr = JSON.stringify(params);
    const sanitizedInputHash = crypto.createHash("sha256").update(jsonStr).digest("hex");

    // 3. Cache Check
    const cachedProposal = await aiBudgetService.checkCacheOnly(sanitizedInputHash);
    if (cachedProposal) {
      return { proposal: cachedProposal };
    }

    // 4. Reserve Quota Transactionally
    const quotaKeys = await aiBudgetService.reserveQuota(ticketId);

    let result: any;
    try {
      // 5. Generate proposal using Gemini
      try {
        result = await diagnosticAiService.generateDiagnosticFixProposal(params);
      } catch (err: any) {
        await aiBudgetService.logUsage({
          adminUserId: adminUser?.uid || adminUser?.userId || "admin",
          ticketId: ticket.id,
          connectorId: ticket.connectorId || "unknown",
          model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
          status: "failed",
          error: err.message || err.toString()
        });
        throw err;
      }

      // Validate using Zod schema
      let validated: any;
      try {
        validated = connectorPatchProposalSchema.parse(result);
      } catch (err: any) {
        await aiBudgetService.logUsage({
          adminUserId: adminUser?.uid || adminUser?.userId || "admin",
          ticketId: ticket.id,
          connectorId: ticket.connectorId || "unknown",
          model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
          status: "invalid_output",
          error: "Zod validation failed: " + err.message
        });
        throw new Error("INVALID_AI_OUTPUT");
      }

      // Check for forbidden actions
      if (validated.forbiddenActionsDetected && validated.forbiddenActionsDetected.length > 0) {
        const db = (diagnosticsRepository as any).getDbSafe();
        const rejectRef = db.collection("rejected_ai_output").doc();
        await rejectRef.set({
          requestId: rejectRef.id,
          ticketId: ticket.id,
          userId: ticket.userId,
          connectorId: ticket.connectorId || "unknown",
          sanitizedInputHash,
          output: validated,
          createdAt: new Date().toISOString(),
          createdBy: "gemini",
          reason: "FORBIDDEN_ACTIONS_DETECTED"
        });

        await aiBudgetService.logUsage({
          adminUserId: adminUser?.uid || adminUser?.userId || "admin",
          ticketId: ticket.id,
          connectorId: ticket.connectorId || "unknown",
          model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
          status: "rejected_forbidden_actions"
        });

        throw new Error("AI_PROPOSAL_REJECTED_FORBIDDEN_ACTIONS");
      }

      // 6. Persist the proposal
      const proposalData = {
        ticketId: ticket.id,
        jobId: job?.id || null,
        userId: ticket.userId,
        connectorId: ticket.connectorId || "unknown",
        affectedPortal: ticket.portal || "unknown",
        problemSignature: ticket.problemSignature || "unknown",
        summary: validated.summary,
        plainLanguageProblem: validated.plainLanguageProblem,
        stoppedAtStage: validated.stoppedAtStage,
        likelyCause: validated.likelyCause,
        proposedConnectorChanges: validated.proposedConnectorChanges,
        recoveryFlowProposal: validated.recoveryFlowProposal || null,
        confidence: validated.confidence,
        riskLevel: validated.proposedConnectorChanges.riskLevel,
        sanitizedInputHash
      };

      const savedProposal = await connectorLearningService.createPatchProposal(proposalData);

      // 7. Log success usage
      await aiBudgetService.logUsage({
        adminUserId: adminUser?.uid || adminUser?.userId || "admin",
        ticketId: ticket.id,
        connectorId: ticket.connectorId || "unknown",
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        status: "success"
      });

      return { proposal: savedProposal };
    } catch (finalErr: any) {
      // Release quota in case of failure so contadores are consistent
      await aiBudgetService.releaseQuota(quotaKeys).catch((releaseErr) => {
        console.error("Error releasing budget quota:", releaseErr);
      });
      throw finalErr;
    }
  }

  async getScreenshotSignedUrl(ticketId: string): Promise<string> {
    const detail = await this.getDiagnosticDetail(ticketId);
    if (!detail) {
      throw new Error("TICKET_NOT_FOUND");
    }
    const screenshotPath = detail.evidence?.screenshot?.storagePath ||
                           detail.jobSnapshot?.evidenceScreenshotPath || 
                           detail.jobSnapshot?.portalSnapshot?.screenshotPath || 
                           (detail.timeline && detail.timeline.find((t: any) => t.screenshotPath)?.screenshotPath);
                           
    if (!screenshotPath) {
      throw new Error("SCREENSHOT_NOT_FOUND");
    }

    let cleanPath = screenshotPath;
    if (cleanPath.startsWith("gs://")) {
      const parts = cleanPath.replace("gs://", "").split("/");
      parts.shift(); // remove bucket name
      cleanPath = parts.join("/");
    }

    try {
      const bucket = getStorage().bucket();
      const fileRef = bucket.file(cleanPath);
      
      const [exists] = await fileRef.exists();
      if (!exists) {
        throw new Error("SCREENSHOT_FILE_DOES_NOT_EXIST");
      }

      const [url] = await fileRef.getSignedUrl({
        action: "read",
        expires: Date.now() + 15 * 60 * 1000 // 15 minutes expiration
      });
      
      return url;
    } catch (err: any) {
      if (err.message === "SCREENSHOT_FILE_DOES_NOT_EXIST") {
        throw err;
      }
      console.error("Error generating signed URL for screenshot:", err);
      throw new Error("FAILED_TO_GENERATE_SIGNED_URL");
    }
  }

  async getDebugSources(filters: any) {
    const creds = diagnosticsRepository.getCredentialsMetadata();
    const diagnosticSummariesCount = await diagnosticsRepository.getDiagnosticSummariesCount();
    
    const problematicTickets = await diagnosticsRepository.listProblematicTickets(filters);
    const problematicTicketsPhysicalCount = problematicTickets.length;

    const problematicJobs = await diagnosticsRepository.listProblematicJobs(filters);
    const problematicJobsCount = problematicJobs.length;

    let candidateTicketsCanonicalCount = 0;
    const sampleProblematicTickets: any[] = [];

    for (const ticket of problematicTickets) {
      if (ticket.hiddenFromUser === true || ticket.deletedAt || ticket.status === "deleted" || ticket.linkedTicketDeleted === true) {
        continue;
      }

      let job = problematicJobs.find((j: any) => j.ticketId === ticket.id) || null;
      if (!job) {
        job = await diagnosticsRepository.getJobByTicketId(ticket.id);
      }
      
      let invoice = null;
      if (ticket.invoiceId) {
        invoice = await diagnosticsRepository.getInvoice(ticket.userId, ticket.invoiceId);
      }

      const canonicalState = getBillingCanonicalState({ ticket, job, invoice });
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

      if (problematicCanonicalStatuses.includes(canonicalState.canonicalStatus)) {
        candidateTicketsCanonicalCount++;
        if (sampleProblematicTickets.length < 5) {
          sampleProblematicTickets.push({
            ticketId: ticket.id,
            ticketReference: ticket.folio || ticket.reference || ticket.billingReference || "S/D",
            physicalStatus: ticket.status,
            canonicalStatus: canonicalState.canonicalStatus,
            connectorId: ticket.connectorId || "unknown",
            hiddenFromUser: ticket.hiddenFromUser || false,
            hasDeletedAt: !!ticket.deletedAt
          });
        }
      }
    }

    const listRes = await this.listDiagnostics(filters);
    const mergedCount = listRes.items.length;

    return {
      projectId: creds.projectId,
      credentialMode: creds.credentialMode,
      emulatorHostEnabled: creds.emulatorHostEnabled,
      diagnosticSummariesCount,
      problematicTicketsPhysicalCount,
      candidateTicketsCanonicalCount,
      problematicJobsCount,
      mergedCount,
      filtersApplied: filters,
      sampleProblematicTickets
    };
  }
}
export const adminDiagnosticsService = new AdminDiagnosticsService();
