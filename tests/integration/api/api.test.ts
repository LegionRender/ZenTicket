import { vi, describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../../server/app";
import { getAuth } from "firebase-admin/auth";

vi.mock("firebase-admin/auth", () => {
  const verifyIdToken = vi.fn(async (token) => {
    if (token === "admin-token") {
      return {
        uid: "mock-admin-uid",
        email: "ricardo@zenticket.mx",
        email_verified: true,
        role: "admin"
      };
    }
    if (token === "user-token") {
      return {
        uid: "mock-user-uid",
        email: "user@example.com",
        email_verified: true,
        role: "user"
      };
    }
    throw new Error("Invalid token");
  });
  return {
    getAuth: () => ({ verifyIdToken })
  };
});

vi.mock("firebase-admin/firestore", () => {
  const mockDoc = {
    get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ stripeCustomerId: "cus_mock123" }) }),
    set: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({})
  };
  const mockCollection = {
    doc: vi.fn().mockReturnValue(mockDoc),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    startAfter: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
    add: vi.fn().mockResolvedValue({ id: "mock-doc-id" })
  };
  const mockDb = {
    collection: vi.fn().mockReturnValue(mockCollection),
    collectionGroup: vi.fn().mockReturnValue(mockCollection),
    runTransaction: vi.fn().mockImplementation(async (cb) => {
      const transactionMock = {
        get: vi.fn().mockImplementation(async (arg) => {
          if (arg && (typeof arg.where === "function" || typeof arg.limit === "function" || !arg.path)) {
            return { docs: [] };
          }
          return { exists: true, data: () => ({ stripeCustomerId: "cus_mock123" }) };
        }),
        set: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({})
      };
      return await cb(transactionMock);
    })
  };
  return {
    getFirestore: () => mockDb,
    FieldValue: {
      serverTimestamp: () => "mock-timestamp"
    }
  };
});

vi.mock("../../../server/services/diagnosticAi.service", () => {
  return {
    diagnosticAiService: {
      generateDiagnosticFixProposal: vi.fn().mockResolvedValue({
        summary: "Mock Proposal",
        plainLanguageProblem: "Selector failed",
        stoppedAtStage: "search_ticket",
        likelyCause: "The billing portal changed its DOM layout.",
        portalSpecificObservations: ["Oxxo portal has a new button"],
        suggestedFix: "Update selector for search_ticket stage.",
        recommendedActions: ["Check selector", "Run integration tests"],
        proposedConnectorChanges: {
          connectorId: "oxxo",
          type: "selector_update",
          description: "Update billingReference selector",
          riskLevel: "low",
          filesLikelyAffected: ["src/connectors/oxxo.ts"],
          testPlan: ["Run oxxo tests"]
        },
        confidence: 0.9,
        requiresHumanReview: true,
        forbiddenActionsDetected: []
      })
    }
  };
});


// Mock Stripe library calls or any HTTP request Stripe makes
vi.mock("axios", () => {
  return {
    default: {
      get: vi.fn().mockImplementation((url) => {
        if (url.includes("/v1/payment_methods")) {
          return Promise.resolve({ data: { data: [] } });
        }
        if (url.includes("/v1/customers")) {
          return Promise.resolve({ data: { invoice_settings: { default_payment_method: null } } });
        }
        return Promise.resolve({ data: {} });
      }),
      post: vi.fn().mockResolvedValue({ data: {} })
    }
  };
});

describe("API HTTP Security & Integration Tests", () => {
  beforeEach(() => {
    process.env.DEV_BILLING_AUTH_BYPASS = "false";
    process.env.FIREBASE_SERVICE_ACCOUNT = "mock-account";
  });

  it("endpoint crítico sin token retorna 401 (ej. /api/billing/payment-methods)", async () => {
    const res = await request(app).get("/api/billing/payment-methods");
    expect(res.status).toBe(401);
  });

  it("endpoint crítico con token de usuario normal permite acceso (ej. /api/billing/payment-methods)", async () => {
    const res = await request(app)
      .get("/api/billing/payment-methods")
      .set("Authorization", "Bearer user-token");
    expect(res.status).toBe(200);
  });

  it("endpoint admin sin token retorna 401 (ej. /api/admin/discover-portal)", async () => {
    const res = await request(app).post("/api/admin/discover-portal");
    expect(res.status).toBe(401);
  });

  it("endpoint admin con usuario normal retorna 403 (ej. /api/admin/discover-portal)", async () => {
    const res = await request(app)
      .post("/api/admin/discover-portal")
      .set("Authorization", "Bearer user-token");
    expect(res.status).toBe(403);
  });

  it("endpoint admin con usuario administrador permite acceso (ej. /api/admin/discover-portal)", async () => {
    const res = await request(app)
      .post("/api/admin/discover-portal")
      .set("Authorization", "Bearer admin-token");
    // Puede retornar 400 u otro status code si faltan parámetros en el body, pero no debe ser 403 o 401
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("webhook de Stripe no requiere Firebase Auth pero falla si no tiene firma válida", async () => {
    const res = await request(app)
      .post("/api/billing/webhooks/stripe")
      .set("stripe-signature", "invalid-signature")
      .send({ id: "evt_test" });
    // Debe fallar la verificación de la firma Stripe y retornar 400
    expect(res.status).toBe(400);
  });

  describe("Admin Diagnostics Endpoint Group", () => {
    it("GET /api/admin/diagnostics sin token retorna 401", async () => {
      const res = await request(app).get("/api/admin/diagnostics");
      expect(res.status).toBe(401);
    });

    it("GET /api/admin/diagnostics con usuario normal retorna 403", async () => {
      const res = await request(app)
        .get("/api/admin/diagnostics")
        .set("Authorization", "Bearer user-token");
      expect(res.status).toBe(403);
    });

    it("GET /api/admin/diagnostics con admin retorna 200", async () => {
      const res = await request(app)
        .get("/api/admin/diagnostics?view=by_user")
        .set("Authorization", "Bearer admin-token");
      console.log("=== DIAGNOSTICS DB RESPONSE STATUS ===", res.status);
      console.log("=== DIAGNOSTICS DB RESPONSE BODY ===");
      console.log(JSON.stringify(res.body, null, 2));
      expect(res.status).toBe(200);
    });

    it("POST /api/admin/diagnostics/:ticketId/retry con admin retorna 200", async () => {
      const res = await request(app)
        .post("/api/admin/diagnostics/486259/retry")
        .set("Authorization", "Bearer admin-token");
      expect(res.status).toBe(200);
    });

    it("POST /api/admin/diagnostics/:ticketId/mark-reviewed con admin", async () => {
      const res = await request(app)
        .post("/api/admin/diagnostics/486259/mark-reviewed")
        .set("Authorization", "Bearer admin-token")
        .send({ note: "Revisado ok" });
      expect(res.status).toBe(200);
    });

    it("POST /api/admin/diagnostics/:ticketId/create-connector-task con admin", async () => {
      const res = await request(app)
        .post("/api/admin/diagnostics/486259/create-connector-task")
        .set("Authorization", "Bearer admin-token");
      expect(res.status).toBe(200);
    });

    it("POST /api/admin/diagnostics/:ticketId/propose-fix con admin", async () => {
      const res = await request(app)
        .post("/api/admin/diagnostics/486259/propose-fix")
        .set("Authorization", "Bearer admin-token");
      expect(res.status).toBe(200);
      expect(res.body.proposal.summary).toBe("Mock Proposal");
    });
  });
});
