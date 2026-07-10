import { fetchWithAuth } from "@/services/api/api-client";

export interface DiagnosticsFilters {
  userId?: string;
  connectorId?: string;
  portalName?: string;
  ticketId?: string;
  ticketReference?: string;
  jobId?: string;
  stage?: string;
  errorCode?: string;
  severity?: "info" | "warning" | "error" | "critical";
  status?: string;
  requiresManualReview?: boolean;
  retryable?: boolean;
  problemSignature?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  cursor?: string;
  visibility?: "active" | "archived" | "all";
  view?: "by_user" | "in_process" | "attention" | "failed" | "ready" | "archived" | "all";
  userVisibility?: "real" | "incomplete" | "mock" | "all";
}

export const getApiBaseUrl = (): string => {
  // 1. Check for custom base URL in env
  const envBaseUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;
  if (envBaseUrl) {
    return envBaseUrl.endsWith("/") ? envBaseUrl.slice(0, -1) : envBaseUrl;
  }

  // 2. If running locally (detected via localhost/127.0.0.1/::1)
  const isLocal = typeof window !== "undefined" && 
    (window.location.hostname === "localhost" || 
     window.location.hostname === "127.0.0.1" || 
     window.location.hostname === "[::1]");
     
  if (isLocal) {
    const port = window.location.port === "5173" || window.location.port === "5174" ? "3000" : (window.location.port || "3000");
    return `http://localhost:${port}`;
  }

  // 3. Fallback relative /api (if proxy is configured)
  return "";
};

export const buildUrl = (path: string): string => {
  const base = getApiBaseUrl();
  if (!base) {
    return path.startsWith("/") ? path : `/${path}`;
  }

  // Prevent double slash/api duplication if base already ends with /api
  let cleanPath = path;
  if (base.endsWith("/api") && path.startsWith("/api")) {
    cleanPath = path.slice(4); // Remove /api
  } else if (base.endsWith("/api/") && path.startsWith("/api/")) {
    cleanPath = path.slice(5); // Remove /api/
  }

  const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const finalPath = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;

  return `${cleanBase}${finalPath}`;
};

export const lastRequestDebug = {
  requestedUrl: "",
  apiBaseUrl: "",
  status: null as number | null,
  contentType: null as string | null,
  isHtmlResponse: false
};

const handleResponse = async (response: Response) => {
  const contentType = response.headers.get("content-type") || "";
  
  lastRequestDebug.status = response.status;
  lastRequestDebug.contentType = contentType;
  lastRequestDebug.isHtmlResponse = contentType.includes("text/html");
  
  if (contentType.includes("text/html")) {
    throw new Error("ADMIN_DIAGNOSTICS_API_RETURNED_HTML");
  }
  
  if (!response.ok) {
    if (!contentType.includes("application/json")) {
      throw new Error(
        "No se pudo conectar con el backend de diagnósticos. Verifica que el servidor API esté activo y que /api/admin/diagnostics esté configurado."
      );
    }
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.error || `HTTP error ${response.status}`);
  }

  if (!contentType.includes("application/json")) {
    throw new Error(
      "No se pudo conectar con el backend de diagnósticos. Verifica que el servidor API esté activo y que /api/admin/diagnostics esté configurado."
    );
  }

  return response.json();
};

export const diagnosticsApi = {
  listDiagnostics: async (filters: DiagnosticsFilters) => {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== "") {
        queryParams.append(key, String(val));
      }
    });

    const url = buildUrl(`/api/admin/diagnostics?${queryParams.toString()}`);
    
    lastRequestDebug.requestedUrl = url;
    lastRequestDebug.apiBaseUrl = getApiBaseUrl();
    
    try {
      const response = await fetchWithAuth(url);
      return await handleResponse(response);
    } catch (err: any) {
      if (err.message !== "ADMIN_DIAGNOSTICS_API_RETURNED_HTML") {
        // If fetch failed due to network / CORS
        if (!lastRequestDebug.status) {
          lastRequestDebug.status = 0;
          lastRequestDebug.contentType = "network_error";
        }
      }
      throw err;
    }
  },

  getDiagnosticDetail: async (ticketId: string) => {
    const url = buildUrl(`/api/admin/diagnostics/${ticketId}`);
    const response = await fetchWithAuth(url);
    return handleResponse(response);
  },

  getScreenshotUrl: async (ticketId: string) => {
    const url = buildUrl(`/api/admin/diagnostics/${ticketId}/screenshot`);
    const response = await fetchWithAuth(url);
    const data = await handleResponse(response);
    return data.url;
  },

  retryDiagnostic: async (ticketId: string) => {
    const url = buildUrl(`/api/admin/diagnostics/${ticketId}/retry`);
    const response = await fetchWithAuth(url, {
      method: "POST"
    });
    return handleResponse(response);
  },

  markDiagnosticReviewed: async (ticketId: string, note?: string) => {
    const url = buildUrl(`/api/admin/diagnostics/${ticketId}/mark-reviewed`);
    const response = await fetchWithAuth(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ note })
    });
    return handleResponse(response);
  },

  createConnectorTask: async (ticketId: string) => {
    const url = buildUrl(`/api/admin/diagnostics/${ticketId}/create-connector-task`);
    const response = await fetchWithAuth(url, {
      method: "POST"
    });
    return handleResponse(response);
  },

  archiveDiagnostic: async (ticketId: string, reason: string, comment?: string) => {
    const url = buildUrl(`/api/admin/diagnostics/${ticketId}/archive`);
    const response = await fetchWithAuth(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ reason, comment })
    });
    return handleResponse(response);
  },

  proposeFix: async (ticketId: string) => {
    const url = buildUrl(`/api/admin/diagnostics/${ticketId}/propose-fix`);
    const response = await fetchWithAuth(url, {
      method: "POST"
    });
    return handleResponse(response);
  },

  listProposals: async (connectorId?: string, status?: string) => {
    const queryParams = new URLSearchParams();
    if (connectorId) queryParams.append("connectorId", connectorId);
    if (status) queryParams.append("status", status);
    
    const url = buildUrl(`/api/admin/diagnostics/proposals?${queryParams.toString()}`);
    const response = await fetchWithAuth(url);
    return handleResponse(response);
  },

  approveProposalSandbox: async (proposalId: string) => {
    const url = buildUrl(`/api/admin/diagnostics/proposals/${proposalId}/approve-sandbox`);
    const response = await fetchWithAuth(url, {
      method: "POST"
    });
    return handleResponse(response);
  },

  rejectProposal: async (proposalId: string) => {
    const url = buildUrl(`/api/admin/diagnostics/proposals/${proposalId}/reject`);
    const response = await fetchWithAuth(url, {
      method: "POST"
    });
    return handleResponse(response);
  },

  requestRevisionProposal: async (proposalId: string, comment: string) => {
    const url = buildUrl(`/api/admin/diagnostics/proposals/${proposalId}/request-revision`);
    const response = await fetchWithAuth(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ comment })
    });
    return handleResponse(response);
  },

  promoteProposalObservation: async (proposalId: string) => {
    const url = buildUrl(`/api/admin/diagnostics/proposals/${proposalId}/promote-observation`);
    const response = await fetchWithAuth(url, {
      method: "POST"
    });
    return handleResponse(response);
  },

  promoteProposalActive: async (proposalId: string) => {
    const url = buildUrl(`/api/admin/diagnostics/proposals/${proposalId}/promote-active`);
    const response = await fetchWithAuth(url, {
      method: "POST"
    });
    return handleResponse(response);
  }
};
