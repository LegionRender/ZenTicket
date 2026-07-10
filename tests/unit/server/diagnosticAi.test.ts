import { vi, describe, it, expect, beforeEach } from "vitest";
import { initializeApp, getApps } from "firebase-admin/app";
import { adminDiagnosticsService } from "../../../server/services/adminDiagnostics.service";
import { diagnosticsRepository } from "../../../server/repositories/diagnostics.repository";
import { diagnosticAiService } from "../../../server/services/diagnosticAi.service";
import { aiBudgetService } from "../../../server/services/aiBudget.service";
import { connectorLearningService } from "../../../server/services/connectorLearning.service";
import { sanitizeRunnerDiagnostic } from "../../../shared/diagnostics/diagnostic-sanitizer";

if (getApps().length === 0) {
  initializeApp({ projectId: "factubolt" });
}

vi.mock("../../../server/repositories/diagnostics.repository", () => {
  return {
    diagnosticsRepository: {
      getTicket: vi.fn(),
      getJobByTicketId: vi.fn(),
      getInvoice: vi.fn()
    }
  };
});

// Mock services to avoid Firebase Admin GCP credentials lookup
vi.mock("../../../server/services/aiBudget.service", () => {
  return {
    aiBudgetService: {
      checkBudgetAndCache: vi.fn().mockResolvedValue({ cacheHit: false }),
      checkCacheOnly: vi.fn().mockResolvedValue(null),
      logUsage: vi.fn().mockResolvedValue(undefined),
      releaseQuota: vi.fn().mockResolvedValue(undefined),
      reserveQuota: vi.fn().mockResolvedValue(["some_quota_key"])
    }
  };
});

vi.mock("../../../server/services/connectorLearning.service", () => {
  return {
    connectorLearningService: {
      createPatchProposal: vi.fn().mockImplementation((data) => {
        return Promise.resolve({
          proposalId: "prop_123",
          status: "pending_review",
          ...data
        });
      })
    }
  };
});

// Mock @google/genai
vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: class {
      models = {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            summary: "OXXO JIT selector issue",
            plainLanguageProblem: "Selector failed",
            stoppedAtStage: "search_ticket",
            likelyCause: "Structure change",
            portalSpecificObservations: [],
            suggestedFix: "Update JIT selector",
            recommendedActions: [],
            proposedConnectorChanges: {
              connectorId: "oxxo",
              type: "selector_update",
              description: "Update billing button xpath",
              riskLevel: "low",
              filesLikelyAffected: [],
              testPlan: []
            },
            confidence: 0.9,
            requiresHumanReview: true,
            forbiddenActionsDetected: []
          })
        })
      };
    }
  };
});

describe("Fase 15D - Gemini Diagnostics API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_DIAGNOSTIC_ENABLED = "true";
    process.env.GEMINI_API_KEY = "test_gemini_api_key_long_enough_to_pass_validation";
  });

  it("propose-fix devuelves 503 si Gemini está deshabilitado", async () => {
    process.env.GEMINI_DIAGNOSTIC_ENABLED = "false";
    await expect(
      adminDiagnosticsService.prepareFixProposal("ticket_123", { uid: "admin" })
    ).rejects.toThrow("GEMINI_DIAGNOSTIC_DISABLED");
  });

  it("sanitizador enmascara RFC/email/token y remueve XML/PDF", () => {
    const rawData = {
      ticketId: "T1",
      userEmail: "ricardo@legionrender.com",
      normalizedFields: {
        rfcReceptor: "XAXX010101000",
        email: "ricardo@legionrender.com"
      },
      xmlContent: "<xml>sensitive data</xml>",
      pdfContent: "pdf binary data",
      cookies: "session_cookie=abc",
      tokens: ["token123"]
    };

    const sanitized = sanitizeRunnerDiagnostic(rawData);
    expect(sanitized.userEmail).toBeUndefined();
    expect(sanitized.userEmailMasked).toBe("r******@l***********.com");
    expect(sanitized.normalizedFields.rfcReceptor).toBeUndefined();
    expect(sanitized.normalizedFields.rfcReceptorMasked).toBe("XAXX******000");
    expect(sanitized.xmlContent).toBeUndefined();
    expect(sanitized.pdfContent).toBeUndefined();
    expect(sanitized.cookies).toBeUndefined();
    expect(sanitized.tokens).toBeUndefined();
  });

  it("proposals no modifican tickets/invoices ni marcan SAT", async () => {
    const ticketMock = {
      id: "ticket_123",
      userId: "user_456",
      connectorId: "oxxo",
      portal: "OXXO",
      status: "requires_manual_review",
      isCfdiValidated: false,
      satValidated: false
    };

    vi.mocked(diagnosticsRepository.getTicket).mockResolvedValue(ticketMock);
    vi.mocked(diagnosticsRepository.getJobByTicketId).mockResolvedValue(null);
    vi.mocked(diagnosticsRepository.getInvoice).mockResolvedValue(null);

    const result = await adminDiagnosticsService.prepareFixProposal("ticket_123", { uid: "admin" });
    expect(result.proposal).toBeDefined();
    expect(result.proposal.status).toBe("pending_review");

    // Verificar que el ticket original no se modificó
    expect(ticketMock.status).toBe("requires_manual_review");
    expect(ticketMock.isCfdiValidated).toBe(false);
    expect(ticketMock.satValidated).toBe(false);
  });
});
