import { vi, describe, it, expect, beforeEach } from "vitest";
import { adminDiagnosticsService } from "../../../server/services/adminDiagnostics.service";
import { diagnosticsRepository } from "../../../server/repositories/diagnostics.repository";
import { getBillingStatusVisual } from "../../../src/shared/billing/billingStatusVisuals";

vi.mock("../../../server/repositories/diagnostics.repository", () => {
  return {
    diagnosticsRepository: {
      listSummaries: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      listProblematicTickets: vi.fn().mockResolvedValue([]),
      listProblematicJobs: vi.fn().mockResolvedValue([]),
      getSummary: vi.fn().mockResolvedValue(null),
      getTimeline: vi.fn().mockResolvedValue([]),
      getTicket: vi.fn().mockResolvedValue(null),
      getJobByTicketId: vi.fn().mockResolvedValue(null),
      getJob: vi.fn().mockResolvedValue(null),
      getUser: vi.fn().mockResolvedValue({ id: "u1", displayName: "Ricardo Castro" }),
      createConnectorTask: vi.fn().mockResolvedValue("task_id"),
      getSimilarProblems: vi.fn().mockResolvedValue([]),
      getInvoice: vi.fn().mockResolvedValue(null),
      getDiagnosticSummariesCount: vi.fn().mockResolvedValue(0),
      updateSummary: vi.fn().mockResolvedValue(undefined),
      createSummary: vi.fn().mockResolvedValue(undefined),
      updateTicket: vi.fn().mockResolvedValue(undefined),
      updateJob: vi.fn().mockResolvedValue(undefined),
      archiveRunnerDiagnostics: vi.fn().mockResolvedValue(undefined),
      writeAuditLog: vi.fn().mockResolvedValue(undefined),
      writeAdminAuditLog: vi.fn().mockResolvedValue(undefined),
      getCredentialsMetadata: vi.fn().mockReturnValue({
        projectId: "factubolt",
        credentialMode: "service_account",
        emulatorHostEnabled: false
      }),
      getAllUsers: vi.fn().mockResolvedValue([]),
      getAllAuthUsers: vi.fn().mockResolvedValue([]),
      getAllFiscalProfiles: vi.fn().mockResolvedValue([]),
      getAllTickets: vi.fn().mockResolvedValue([]),
      getAllJobs: vi.fn().mockResolvedValue([]),
      getAllInvoices: vi.fn().mockResolvedValue([])
    }
  };
});

describe("AdminDiagnosticsService - Fallback & Backfill Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(diagnosticsRepository.listSummaries).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(diagnosticsRepository.listProblematicTickets).mockResolvedValue([]);
    vi.mocked(diagnosticsRepository.listProblematicJobs).mockResolvedValue([]);
    vi.mocked(diagnosticsRepository.getSummary).mockResolvedValue(null);
    vi.mocked(diagnosticsRepository.getTimeline).mockResolvedValue([]);
    vi.mocked(diagnosticsRepository.getTicket).mockResolvedValue(null);
    vi.mocked(diagnosticsRepository.getJobByTicketId).mockResolvedValue(null);
    vi.mocked(diagnosticsRepository.getJob).mockResolvedValue(null);
    vi.mocked(diagnosticsRepository.getSimilarProblems).mockResolvedValue([]);
    vi.mocked(diagnosticsRepository.getInvoice).mockResolvedValue(null);
    vi.mocked(diagnosticsRepository.getDiagnosticSummariesCount).mockResolvedValue(0);
    vi.mocked(diagnosticsRepository.getAllUsers).mockResolvedValue([{ id: "u1", displayName: "Ricardo Castro", email: "ricardo@gmail.com" }]);
    vi.mocked(diagnosticsRepository.getAllAuthUsers).mockResolvedValue([{ uid: "u1", email: "ricardo@gmail.com", displayName: "Ricardo Castro" }]);
    vi.mocked(diagnosticsRepository.getAllFiscalProfiles).mockResolvedValue([{ id: "u1", email: "ricardo@gmail.com" }]);
    vi.mocked(diagnosticsRepository.getAllTickets).mockResolvedValue([]);
    vi.mocked(diagnosticsRepository.getAllJobs).mockResolvedValue([]);
    vi.mocked(diagnosticsRepository.getAllInvoices).mockResolvedValue([]);
  });

  it("listDiagnostics agrupa por usuario y retorna counts adecuados", async () => {
    vi.mocked(diagnosticsRepository.getAllTickets).mockResolvedValue([
      {
        id: "ticket_vl1fykkpi",
        folio: "486259",
        status: "requires_manual_review",
        userId: "u1",
        connectorId: "oxxo",
        nombreEmisor: "OXXO CADENA",
        errorMsg: "Ocurrió un inconveniente con el procesamiento en el portal.",
        createdAt: "2026-07-09T19:10:00.000Z"
      }
    ]);

    const res = await adminDiagnosticsService.listDiagnostics({ view: "by_user" });
    expect(res.users.length).toBe(1);
    expect(res.users[0].userId).toBe("u1");
    expect(res.users[0].counts.totalVisible).toBe(1);
    expect(res.users[0].counts.attention).toBe(1);
    expect(res.users[0].items[0].ticketReference).toBe("486259");
  });

  it("extracted sano no tiene incidencias pero aparece en proceso", async () => {
    vi.mocked(diagnosticsRepository.getAllTickets).mockResolvedValue([
      {
        id: "ticket_extracted_sano",
        folio: "123456",
        status: "extracted",
        userId: "u1",
        connectorId: "oxxo"
      }
    ]);
    vi.mocked(diagnosticsRepository.getAllJobs).mockResolvedValue([
      {
        id: "job_active",
        ticketId: "ticket_extracted_sano",
        status: "pending",
        userId: "u1"
      }
    ]);

    const res = await adminDiagnosticsService.listDiagnostics({ view: "by_user" });
    expect(res.users.length).toBe(1);
    expect(res.users[0].counts.inProcess).toBe(1);
    expect(res.users[0].counts.attention).toBe(0);
  });

  it("extracted con controlFields y requires_manual_review sí aparece", async () => {
    vi.mocked(diagnosticsRepository.getAllTickets).mockResolvedValue([
      {
        id: "ticket_k67lvsyzg",
        folio: "486259",
        status: "extracted",
        userId: "u1",
        connectorId: "oxxo",
        portalFields: { billingReference: "486259", venta: "10MEX50X141", total: 345.5 }
      }
    ]);

    const res = await adminDiagnosticsService.listDiagnostics({ view: "by_user" });
    expect(res.users.length).toBe(1);
    expect(res.users[0].items[0].ticketId).toBe("ticket_k67lvsyzg");
    expect(res.users[0].items[0].canonicalStatus).toBe("requires_manual_review");
  });

  it("deleted extracted no aparece", async () => {
    vi.mocked(diagnosticsRepository.getAllTickets).mockResolvedValue([
      {
        id: "ticket_deleted",
        folio: "486259",
        status: "deleted",
        userId: "u1",
        deletedAt: "2026-07-09T19:10:00.000Z"
      }
    ]);

    const res = await adminDiagnosticsService.listDiagnostics({ view: "by_user" });
    expect(res.users.length).toBe(1);
    expect(res.users[0].items.length).toBe(0);
  });

  it("hiddenFromUser true no aparece en items pero el usuario si es listado", async () => {
    vi.mocked(diagnosticsRepository.getAllTickets).mockResolvedValue([
      {
        id: "ticket_hidden",
        folio: "486259",
        status: "extracted",
        userId: "u1",
        hiddenFromUser: true
      }
    ]);

    const res = await adminDiagnosticsService.listDiagnostics({ view: "by_user" });
    expect(res.users.length).toBe(1);
    expect(res.users[0].items.length).toBe(0);
  });

  it("debug/sources devuelve counts sanitizados y candidate count", async () => {
    vi.mocked(diagnosticsRepository.getAllTickets).mockResolvedValue([
      {
        id: "ticket_k67lvsyzg",
        folio: "486259",
        status: "extracted",
        userId: "u1",
        connectorId: "oxxo",
        portalFields: { billingReference: "486259" }
      }
    ]);
    vi.mocked(diagnosticsRepository.listProblematicTickets).mockResolvedValue([
      {
        id: "ticket_k67lvsyzg",
        folio: "486259",
        status: "extracted",
        userId: "u1",
        connectorId: "oxxo",
        portalFields: { billingReference: "486259" }
      }
    ]);

    const res = await adminDiagnosticsService.getDebugSources({});
    expect(res.projectId).toBe("factubolt");
    expect(res.candidateTicketsCanonicalCount).toBe(1);
  });

  it("backend metrics calcula correctamente counts combinando materialized y derived", async () => {
    vi.mocked(diagnosticsRepository.getAllTickets).mockResolvedValue([
      {
        id: "ticket_k67lvsyzg",
        folio: "486259",
        status: "requires_manual_review",
        userId: "u1",
        connectorId: "oxxo",
        portalFields: { billingReference: "486259", total: 100 }
      }
    ]);

    const res = await adminDiagnosticsService.listDiagnostics({ view: "all" });
    expect(res.metrics.attentionTickets).toBe(1);
  });

  describe("Fase 15C.5 - Reglas de Visibilidad y Filtros", () => {
    it("visibility=active excluye hiddenFromUser", async () => {
      vi.mocked(diagnosticsRepository.getAllTickets).mockResolvedValue([
        {
          id: "ticket_hidden",
          folio: "123",
          status: "requires_manual_review",
          userId: "u1",
          connectorId: "oxxo",
          hiddenFromUser: true
        }
      ]);
      const res = await adminDiagnosticsService.listDiagnostics({ view: "in_process" });
      expect(res.items.length).toBe(0);
      expect(res.metrics.inProcessTickets).toBe(0);
    });

    it("visibility=active excluye deletedAt", async () => {
      vi.mocked(diagnosticsRepository.getAllTickets).mockResolvedValue([
        {
          id: "ticket_deleted",
          folio: "123",
          status: "requires_manual_review",
          userId: "u1",
          connectorId: "oxxo",
          deletedAt: "2026-07-09T12:00:00.000Z"
        }
      ]);
      const res = await adminDiagnosticsService.listDiagnostics({ view: "in_process" });
      expect(res.items.length).toBe(0);
    });

    it("visibility=active excluye status deleted", async () => {
      vi.mocked(diagnosticsRepository.getAllTickets).mockResolvedValue([
        {
          id: "ticket_deleted",
          folio: "123",
          status: "deleted",
          userId: "u1",
          connectorId: "oxxo"
        }
      ]);
      const res = await adminDiagnosticsService.listDiagnostics({ view: "in_process" });
      expect(res.items.length).toBe(0);
    });

    it("archiveDiagnostic crea/actualiza summary, actualiza job y archiva runner diagnostics", async () => {
      vi.mocked(diagnosticsRepository.getSummary).mockResolvedValue(null);
      vi.mocked(diagnosticsRepository.getTicket).mockResolvedValue({
        id: "ticket_123",
        status: "requires_manual_review",
        userId: "u1",
        connectorId: "oxxo"
      });
      vi.mocked(diagnosticsRepository.getJobByTicketId).mockResolvedValue({
        id: "job_123"
      });

      const res = await adminDiagnosticsService.archiveDiagnostic("ticket_123", "portal_change", "Comentario de prueba", { email: "admin@zenticket.com" });
      expect(res.success).toBe(true);

      expect(diagnosticsRepository.createSummary).toHaveBeenCalled();
      expect(diagnosticsRepository.updateSummary).toHaveBeenCalledWith("ticket_123", expect.objectContaining({
        visibility: "archived",
        archivedReason: "portal_change: Comentario de prueba"
      }));
      expect(diagnosticsRepository.updateJob).toHaveBeenCalledWith("job_123", expect.objectContaining({
        archivedReason: "portal_change: Comentario de prueba"
      }));
      expect(diagnosticsRepository.archiveRunnerDiagnostics).toHaveBeenCalledWith("ticket_123", expect.objectContaining({
        visibility: "archived"
      }));
    });

    it("view=by_user incluye email completo para admin y mantiene emailMasked", async () => {
      vi.mocked(diagnosticsRepository.getAllUsers).mockResolvedValue([
        { id: "u_test", displayName: "Test User", email: "test@gmail.com" }
      ]);
      vi.mocked(diagnosticsRepository.getAllAuthUsers).mockResolvedValue([
        { uid: "u_test", email: "test@gmail.com", displayName: "Test User" }
      ]);
      vi.mocked(diagnosticsRepository.getAllFiscalProfiles).mockResolvedValue([
        { id: "u_test", email: "test@gmail.com" }
      ]);

      const res = await adminDiagnosticsService.listDiagnostics({ view: "by_user", userVisibility: "all" });
      expect(res.users.length).toBe(1);
      expect(res.users[0].email).toBe("test@gmail.com");
      expect(res.users[0].userEmailMasked).toBe("t***t@gmail.com");
    });

    it("evaluacion de deletionCandidates filtra protegidos, recientes y usuarios con actividad", () => {
      const PROTECTED_EMAILS = ["1985fama@gmail.com", "fluczer.dg@gmail.com"];
      const NOW_MS = new Date("2026-07-09T23:15:28Z").getTime();
      const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

      const evalCandidate = (user: any) => {
        const isProtectedEmail = PROTECTED_EMAILS.includes(user.email.toLowerCase());
        let isRecentSignupProtected = false;
        if (user.creationTime) {
          const creationDate = new Date(user.creationTime);
          if (NOW_MS - creationDate.getTime() <= FORTY_EIGHT_HOURS_MS) {
            isRecentSignupProtected = true;
          }
        }

        const isCandidate = user.userStatus === "incomplete_profile" &&
          !isProtectedEmail &&
          !isRecentSignupProtected &&
          user.ticketCount === 0 &&
          user.invoiceCount === 0 &&
          user.jobCount === 0 &&
          !user.hasStripeCustomer;

        return { isCandidate, isProtectedEmail, isRecentSignupProtected };
      };

      // 1. Incompleto sin actividad ni proteccion: CANDIDATE
      const res1 = evalCandidate({
        email: "junk@test.com",
        userStatus: "incomplete_profile",
        creationTime: "2026-07-01T00:00:00Z",
        ticketCount: 0,
        invoiceCount: 0,
        jobCount: 0,
        hasStripeCustomer: false
      });
      expect(res1.isCandidate).toBe(true);

      // 2. Protegido: NOT CANDIDATE
      const res2 = evalCandidate({
        email: "fluczer.dg@gmail.com",
        userStatus: "incomplete_profile",
        creationTime: "2026-07-01T00:00:00Z",
        ticketCount: 0,
        invoiceCount: 0,
        jobCount: 0,
        hasStripeCustomer: false
      });
      expect(res2.isCandidate).toBe(false);
      expect(res2.isProtectedEmail).toBe(true);

      // 3. Reciente (dentro de 48h): NOT CANDIDATE
      const res3 = evalCandidate({
        email: "newuser@test.com",
        userStatus: "incomplete_profile",
        creationTime: "2026-07-09T12:00:00Z",
        ticketCount: 0,
        invoiceCount: 0,
        jobCount: 0,
        hasStripeCustomer: false
      });
      expect(res3.isCandidate).toBe(false);
      expect(res3.isRecentSignupProtected).toBe(true);

      // 4. Con tickets/invoices: NOT CANDIDATE
      const res4 = evalCandidate({
        email: "active@test.com",
        userStatus: "incomplete_profile",
        creationTime: "2026-07-01T00:00:00Z",
        ticketCount: 1,
        invoiceCount: 0,
        jobCount: 0,
        hasStripeCustomer: false
      });
      expect(res4.isCandidate).toBe(false);
    });
  });

  describe("Fase 15C.6: userVisibility parameters & color mapping", () => {
    it("diagnostics filtering by userVisibility matches expectations", async () => {
      // Mock repository with different kinds of users
      vi.mocked(diagnosticsRepository.getAllUsers).mockResolvedValue([
        { id: "u_real", displayName: "Real User", email: "real@gmail.com" },
        { id: "u_incomplete", displayName: "Incomplete User", email: "incomplete@gmail.com" },
        { id: "u_mock", displayName: "User Mock", email: "mock_user@gmail.com" }
      ]);
      vi.mocked(diagnosticsRepository.getAllAuthUsers).mockResolvedValue([
        { uid: "u_real", email: "real@gmail.com", displayName: "Real User" },
        { uid: "u_incomplete", email: "incomplete@gmail.com", displayName: "Incomplete User" },
        { uid: "u_mock", email: "mock_user@gmail.com", displayName: "User Mock" }
      ]);
      // Real user has profiles, incomplete lacks fiscalProfile
      vi.mocked(diagnosticsRepository.getAllFiscalProfiles).mockResolvedValue([
        { id: "u_real", email: "real@gmail.com" }
        // missing u_incomplete and u_mock
      ]);

      // 1. Default (real)
      const resReal = await adminDiagnosticsService.listDiagnostics({ view: "by_user", userVisibility: "real" });
      // Only u_real is returned (u_incomplete is incomplete_profile, u_mock is mock_or_debug)
      expect(resReal.users.find(u => u.userId === "u_real")).toBeDefined();
      expect(resReal.users.find(u => u.userId === "u_incomplete")).toBeUndefined();
      expect(resReal.users.find(u => u.userId === "u_mock")).toBeUndefined();

      // 2. Incomplete
      const resIncomplete = await adminDiagnosticsService.listDiagnostics({ view: "by_user", userVisibility: "incomplete" });
      expect(resIncomplete.users.find(u => u.userId === "u_incomplete")).toBeDefined();
      expect(resIncomplete.users.find(u => u.userId === "u_real")).toBeUndefined();

      // 3. Mock
      const resMock = await adminDiagnosticsService.listDiagnostics({ view: "by_user", userVisibility: "mock" });
      expect(resMock.users.find(u => u.userId === "u_mock")).toBeDefined();
      expect(resMock.users.find(u => u.userId === "u_real")).toBeUndefined();
    });

    it("requires_manual_review maps to tone amber and failed to tone red", () => {
      const amberRes = getBillingStatusVisual("requires_manual_review");
      expect(amberRes.tone).toBe("amber");
      expect(amberRes.statusGroup).toBe("ALERTAS");
      expect(amberRes.bgColor).toBe("#1F1A0B");
      expect(amberRes.borderColor).toBe("#4A3510");
      expect(amberRes.textColor).toBe("#F59E0B");
      expect(amberRes.className).toBe("zt-status-alert");

      const redRes = getBillingStatusVisual("failed");
      expect(redRes.tone).toBe("red");
      expect(redRes.statusGroup).toBe("FALLOS");
      expect(redRes.bgColor).toBe("#221220");
      expect(redRes.borderColor).toBe("#41182A");
      expect(redRes.textColor).toBe("#C70036");
      expect(redRes.className).toBe("zt-status-error");

      const greenRes = getBillingStatusVisual("cfdi_validated");
      expect(greenRes.tone).toBe("green");
      expect(greenRes.statusGroup).toBe("OK");
      expect(greenRes.bgColor).toBe("#0B1F23");
      expect(greenRes.borderColor).toBe("#0C3631");
      expect(greenRes.textColor).toBe("#007A55");
      expect(greenRes.className).toBe("zt-status-ok");

      const blueRes = getBillingStatusVisual("invoice_recovery_pending");
      expect(blueRes.tone).toBe("blue");
      expect(blueRes.statusGroup).toBe("COLA");
      expect(blueRes.bgColor).toBe("#0B162E");
      expect(blueRes.borderColor).toBe("#1D3B7A");
      expect(blueRes.textColor).toBe("#3B82F6");
      expect(blueRes.className).toBe("zt-status-queue");
    });
  });

  describe("Idempotencia y Resolución de Hermano Canónico", () => {
    it("getDiagnosticDetail hereda datos de hermano canónico si ticket actual no tiene jobs", async () => {
      const SIBLING_TICKET = {
        id: "ticket_qc7836o9q",
        userId: "u1",
        rfcEmisor: "EMISOR_RFC",
        portalFields: { billingReference: "486259" },
        fechaCompra: "2026-07-09",
        total: 150,
        status: "requires_manual_review"
      };

      const CURRENT_TICKET = {
        id: "ticket_ldpla0k4v",
        userId: "u1",
        rfcEmisor: "EMISOR_RFC",
        portalFields: { billingReference: "486259" },
        fechaCompra: "2026-07-09",
        total: 150,
        status: "extracted"
      };

      const ACTIVE_JOB = {
        id: "job_val_486259",
        ticketId: "ticket_qc7836o9q",
        status: "failed",
        lastError: "El portal de facturación cambió y el conector necesita actualizar su navegación.",
        portalSnapshot: {
          portalMessages: ["Portal changed error!"],
          timeline: [
            { id: "e1", stage: "navigation", status: "success", createdAt: "2026-07-09T05:38:00.000Z" },
            { id: "e2", stage: "fill_form", status: "failed", createdAt: "2026-07-09T05:39:00.000Z" }
          ]
        }
      };

      vi.mocked(diagnosticsRepository.getTicket).mockImplementation(async (id) => {
        if (id === "ticket_ldpla0k4v") return CURRENT_TICKET;
        if (id === "ticket_qc7836o9q") return SIBLING_TICKET;
        return null;
      });

      vi.mocked(diagnosticsRepository.getAllTickets).mockResolvedValue([SIBLING_TICKET, CURRENT_TICKET]);
      vi.mocked(diagnosticsRepository.getAllJobs).mockResolvedValue([ACTIVE_JOB]);
      vi.mocked(diagnosticsRepository.getJobByTicketId).mockImplementation(async (id) => {
        if (id === "ticket_qc7836o9q") return ACTIVE_JOB;
        return null;
      });

      const res = await adminDiagnosticsService.getDiagnosticDetail("ticket_ldpla0k4v");
      expect(res).not.toBeNull();
      expect(res.summary.isDuplicate).toBe(true);
      expect(res.summary.siblingTicketId).toBe("ticket_qc7836o9q");
      expect(res.summary.technicalCause).toBe(ACTIVE_JOB.lastError);
      expect(res.timeline.length).toBe(2);
      expect(res.timeline[0].stage).toBe("navigation");
      expect(res.evidence.screenshotReason).toBe("screenshot_not_captured");
      expect(res.evidence.provenance.ticketId).toBe("ticket_qc7836o9q");
    });
  });
});
