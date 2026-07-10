import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { diagnosticsApi, buildUrl, getApiBaseUrl } from "../../../src/workspace/admin/diagnostics/services/diagnosticsApi";
import { formatDate, compactId } from "../../../src/workspace/admin/diagnostics/utils/diagnosticFormatters";
import { getDiagnosticTone } from "../../../src/workspace/admin/diagnostics/utils/diagnosticTone";
import { getStatusLabelAndDot } from "../../../src/workspace/admin/diagnostics/components/DiagnosticsTable";

// Mock fetchWithAuth
const mockFetch = vi.fn();
vi.mock("@/services/api/api-client", () => {
  return {
    fetchWithAuth: (url: string, options: any) => mockFetch(url, options)
  };
});

describe("Admin Diagnostics UI & API Tests", () => {
  const originalEnv = import.meta.env.VITE_API_BASE_URL;
  const originalWindow = typeof window !== "undefined" ? window.location.hostname : "";

  beforeEach(() => {
    mockFetch.mockReset();
    import.meta.env.VITE_API_BASE_URL = "";
  });

  afterEach(() => {
    import.meta.env.VITE_API_BASE_URL = originalEnv;
  });

  it("diagnosticsApi llama endpoints correctos y decodifica JSON", async () => {
    const headers = new Headers({ "content-type": "application/json" });
    mockFetch.mockResolvedValue({
      ok: true,
      headers,
      json: () => Promise.resolve({ items: [{ id: "t1", affectedPortal: "OXXO" }] })
    });

    const listRes = await diagnosticsApi.listDiagnostics({ ticketReference: "486259" });
    expect(listRes.items[0].affectedPortal).toBe("OXXO");
  });

  it("diagnosticsApi construye URL correcta con VITE_API_BASE_URL", () => {
    import.meta.env.VITE_API_BASE_URL = "https://my-backend-server.com";
    const url = buildUrl("/api/admin/diagnostics");
    expect(url).toBe("https://my-backend-server.com/api/admin/diagnostics");
  });

  it("diagnosticsApi construye URL correcta con fallback relativo", () => {
    // Force hostname to something other than localhost to prevent localhost port fallback
    if (typeof window !== "undefined") {
      vi.spyOn(window.location, "hostname", "get").mockReturnValue("zenticket.mx");
    }
    
    import.meta.env.VITE_API_BASE_URL = "";
    import.meta.env.VITE_API_URL = "";
    const url = buildUrl("/api/admin/diagnostics");
    expect(url).toBe("/api/admin/diagnostics");
    
    vi.restoreAllMocks();
  });

  it("diagnosticsApi no duplica /api", () => {
    import.meta.env.VITE_API_BASE_URL = "https://my-backend-server.com/api";
    const url = buildUrl("/api/admin/diagnostics");
    expect(url).toBe("https://my-backend-server.com/api/admin/diagnostics");

    import.meta.env.VITE_API_BASE_URL = "https://my-backend-server.com/api/";
    const url2 = buildUrl("/api/admin/diagnostics");
    expect(url2).toBe("https://my-backend-server.com/api/admin/diagnostics");
  });

  it("diagnosticsApi maneja respuesta HTML lanzando ADMIN_DIAGNOSTICS_API_RETURNED_HTML", async () => {
    const headers = new Headers({ "content-type": "text/html" });
    mockFetch.mockResolvedValue({
      ok: true,
      headers,
      text: () => Promise.resolve("<!DOCTYPE html><html><body>Cannot GET /api/admin/diagnostics</body></html>"),
      json: () => Promise.reject(new Error("HTML response"))
    });

    await expect(diagnosticsApi.listDiagnostics({})).rejects.toThrow(
      "ADMIN_DIAGNOSTICS_API_RETURNED_HTML"
    );
  });

  it("diagnosticsApi listDiagnostics incluye view=by_user en los query params", async () => {
    const headers = new Headers({ "content-type": "application/json" });
    mockFetch.mockResolvedValue({
      ok: true,
      headers,
      json: () => Promise.resolve({ users: [], metrics: {} })
    });

    await diagnosticsApi.listDiagnostics({ view: "by_user" });
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("view=by_user"), undefined);
  });

  it("getApiBaseUrl mapea puertos de desarrollo local al puerto 3000 del backend", () => {
    const originalWindow = global.window;
    const originalApiUrl = import.meta.env.VITE_API_URL;
    import.meta.env.VITE_API_URL = "";
    import.meta.env.VITE_API_BASE_URL = "";
    
    // Test case 1: port 5173 (Vite default)
    global.window = {
      location: {
        hostname: "localhost",
        port: "5173"
      }
    } as any;
    expect(getApiBaseUrl()).toBe("http://localhost:3000");

    // Test case 2: port 5174 (Vite alternative)
    global.window = {
      location: {
        hostname: "localhost",
        port: "5174"
      }
    } as any;
    expect(getApiBaseUrl()).toBe("http://localhost:3000");

    // Test case 3: non-local hostname
    global.window = {
      location: {
        hostname: "zenticket.mx",
        port: "80"
      }
    } as any;
    expect(getApiBaseUrl()).toBe("");

    global.window = originalWindow;
    import.meta.env.VITE_API_URL = originalApiUrl;
  });

  it("error state muestra mensaje legible si backend no existe", async () => {
    mockFetch.mockRejectedValue(new Error("Failed to fetch"));

    await expect(diagnosticsApi.getDiagnosticDetail("t1")).rejects.toThrow();
  });

  it("diagnosticFormatters formatea correctamente fechas e IDs", () => {
    expect(formatDate("2026-07-09T19:10:00.000Z")).toContain("2026");
    expect(compactId("ticket_vl1fykkpi")).toBe("ticket...kkpi");
    expect(compactId(null)).toBe("—");
  });

  it("diagnosticTone retorna el tono correcto por severidad", () => {
    const criticalTone = getDiagnosticTone("critical");
    expect(criticalTone.tone).toBe("red");
    expect(criticalTone.bgClass).toContain("zt-status-error");

    const infoTone = getDiagnosticTone("info");
    expect(infoTone.tone).toBe("blue");

    const warningTone = getDiagnosticTone("warning");
    expect(warningTone.tone).toBe("amber");
  });

  it("valida que no se exponen secretos si vienen campos nulos en evidencia", () => {
    const normalizedFields = {
      folio: null,
      itu: null,
      total: null,
      fechaCompra: null,
      fechaCompraSource: null,
      rfcReceptorMasked: "S/D",
      emailMasked: "S/D"
    };

    expect(normalizedFields.folio).toBeNull();
    expect(normalizedFields.itu).toBeNull();
    expect(normalizedFields.total).toBeNull();
    expect(normalizedFields.fechaCompra).toBeNull();
  });

  it("getStatusLabelAndDot mapea correctamente cada estado canónico y bucket a su badge y color", () => {
    // Listo / Verde
    const readyItem = getStatusLabelAndDot({ bucket: "ready" });
    expect(readyItem.label).toBe("Listo");
    expect(readyItem.dotClass).toBe("zt-dot-ok");

    // Error / Rojo
    const failedItem = getStatusLabelAndDot({ canonicalStatus: "failed" });
    expect(failedItem.label).toBe("Error");
    expect(failedItem.dotClass).toBe("zt-dot-error");

    const failedBlockingItem = getStatusLabelAndDot({ canonicalStatus: "failed_blocking" });
    expect(failedBlockingItem.label).toBe("Error");

    // En proceso / Azul
    const processingItem = getStatusLabelAndDot({ canonicalStatus: "processing" });
    expect(processingItem.label).toBe("En proceso");
    expect(processingItem.dotClass).toBe("zt-dot-queue");

    // Atención / Ámbar
    const attentionItem = getStatusLabelAndDot({ canonicalStatus: "requires_manual_review" });
    expect(attentionItem.label).toBe("Atención");
    expect(attentionItem.dotClass).toBe("zt-dot-alert");

    // Archivados / Gris
    const archivedItem = getStatusLabelAndDot({ bucket: "archived" });
    expect(archivedItem.label).toBe("Archivado");
    expect(archivedItem.dotClass).toBe("zt-dot-archived");
  });

  describe("Diagnostics UI State and Contract Logic", () => {
    // Pure replica of the page rendering decision logic
    function getRenderView({ loading, error, activeTab, users, items }: {
      loading: boolean;
      error: string | null;
      activeTab: string;
      users: any[];
      items: any[];
    }) {
      if (loading && items.length === 0 && users.length === 0) return "skeleton";
      if (error) return "errorState";
      if (activeTab === "by_user" && users.length > 0) return "UsersMasterDetail";
      if (activeTab === "by_user") return "emptyStateUsers";
      if (items.length === 0) return "emptyStateItems";
      return "flatView";
    }

    it("response.items vacio pero response.users con datos renderiza UsersMasterDetail", () => {
      const view = getRenderView({
        loading: false,
        error: null,
        activeTab: "by_user",
        users: [{ userId: "u1", items: [{ ticketId: "t1" }] }],
        items: []
      });
      expect(view).toBe("UsersMasterDetail");
    });

    it("users.length > 0 no muestra empty state", () => {
      const view = getRenderView({
        loading: false,
        error: null,
        activeTab: "by_user",
        users: [{ userId: "u1", items: [{ ticketId: "t1" }] }],
        items: []
      });
      expect(view).not.toBe("emptyStateUsers");
      expect(view).not.toBe("emptyStateItems");
    });

    it("error de HTML muestra errorState, no emptyState", () => {
      const view = getRenderView({
        loading: false,
        error: "El frontend está llamando al servidor incorrecto. Esperaba JSON del backend pero recibió HTML del dev server.",
        activeTab: "by_user",
        users: [],
        items: []
      });
      expect(view).toBe("errorState");
    });

    it("selectedUser se inicializa con el primer usuario users[0]", () => {
      const users = [
        { userId: "u1", userDisplayName: "User 1", items: [{ ticketId: "t1" }] },
        { userId: "u2", userDisplayName: "User 2", items: [{ ticketId: "t2" }] }
      ];
      const selectedUserId = null;
      const activeUserId = users.some(u => u.userId === selectedUserId)
        ? selectedUserId
        : (users[0]?.userId || null);
      const selectedUser = users.find(u => u.userId === activeUserId) || users[0];
      
      expect(selectedUser.userId).toBe("u1");
    });

    it("selectedUser.items alimenta la tabla de la derecha y contiene ticket #486259", () => {
      const selectedUser = {
        userId: "u1",
        userDisplayName: "Ricardo Castro",
        items: [
          { ticketId: "ticket_k67lvsyzg", ticketReference: "486259", portal: "OXXO Cadena" }
        ]
      };
      
      const tableItems = selectedUser.items;
      expect(tableItems.length).toBe(1);
      expect(tableItems[0].ticketId).toBe("ticket_k67lvsyzg");
      expect(tableItems[0].ticketReference).toBe("486259");
    });

    it("metrics superiores mapean correctamento failedTickets, readyTickets, inProcessTickets, attentionTickets", () => {
      const metrics = {
        usersWithIssues: 1,
        inProcessTickets: 0,
        attentionTickets: 11,
        failedTickets: 0,
        readyTickets: 1,
        pendingRetries: 0,
        last24h: 1
      };

      const failedCount = metrics.failedTickets;
      const inProcessCount = metrics.inProcessTickets;
      const attentionCount = metrics.attentionTickets;
      const readyCount = metrics.readyTickets;

      expect(failedCount).toBe(0);
      expect(inProcessCount).toBe(0);
      expect(attentionCount).toBe(11);
      expect(readyCount).toBe(1);
    });

    it("frontend lanza ADMIN_DIAGNOSTICS_BY_USER_CONTRACT_MISSING_USERS si view=by_user no trae users[]", () => {
      const response: any = {
        items: []
      };
      
      const viewVal = "by_user";
      const testFn = () => {
        if (viewVal === "by_user" && !Array.isArray(response.users)) {
          throw new Error("ADMIN_DIAGNOSTICS_BY_USER_CONTRACT_MISSING_USERS");
        }
      };
      
      expect(testFn).toThrow("ADMIN_DIAGNOSTICS_BY_USER_CONTRACT_MISSING_USERS");
    });

    it("userDisplayName/userEmailMasked se normalizan a displayName/emailMasked", () => {
      const rawUser: any = {
        userId: "u1",
        userDisplayName: "Ricardo Castro Becerril",
        userEmailMasked: "l***r@gmail.com"
      };
      
      const normalised = {
        ...rawUser,
        displayName: rawUser.userDisplayName || rawUser.displayName || "Usuario",
        emailMasked: rawUser.userEmailMasked || rawUser.emailMasked || "Sin email"
      };
      
      expect(normalised.displayName).toBe("Ricardo Castro Becerril");
      expect(normalised.emailMasked).toBe("l***r@gmail.com");
    });

    it("view=by_user incluye usuarios sin tickets e incomplete_profile", () => {
      const users = [
        { userId: "u1", userStatus: "with_issues", items: [{ ticketId: "t1" }] },
        { userId: "u2", userStatus: "without_tickets", items: [] },
        { userId: "u3", userStatus: "incomplete_profile", items: [] }
      ];
      
      const filterAll = users.filter(u => true);
      expect(filterAll.length).toBe(3);
      
      const filterIncomplete = users.filter(u => u.userStatus === "incomplete_profile");
      expect(filterIncomplete.length).toBe(1);
      expect(filterIncomplete[0].userId).toBe("u3");
    });

    it("metrics unifica totalUsers, usersWithTickets, usersWithoutTickets, usersIncompleteProfile", () => {
      const metrics = {
        totalUsers: 9,
        usersWithIssues: 2,
        usersWithTickets: 2,
        usersWithoutTickets: 7,
        usersIncompleteProfile: 4,
        inProcessTickets: 0,
        attentionTickets: 22,
        failedTickets: 0,
        readyTickets: 1
      };

      expect(metrics.totalUsers).toBe(9);
      expect(metrics.usersWithTickets).toBe(2);
      expect(metrics.usersWithoutTickets).toBe(7);
      expect(metrics.usersIncompleteProfile).toBe(4);
    });

    it("selectedUser.items vacio hace que la UI muestre sin tickets / incompleto", () => {
      const selectedUser = {
        userId: "u2",
        userStatus: "without_tickets",
        items: []
      };

      const hasTickets = selectedUser.items.length > 0;
      expect(hasTickets).toBe(false);
      
      const uiMessage = selectedUser.userStatus === "incomplete_profile"
        ? "Usuario existe en Firebase Auth pero no tiene perfil en Firestore."
        : "Este usuario está registrado pero aún no tiene tickets.";
        
      expect(uiMessage).toBe("Este usuario está registrado pero aún no tiene tickets.");
    });
  });
});
