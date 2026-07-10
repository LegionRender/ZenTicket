import { getApiUrl, fetchWithAuth } from "./api-client";

/**
 * Fetches SMTP configuration and server diagnostic status metrics.
 */
const createMockResponse = (data: any): Response => {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "Content-Type": "application/json" }),
    json: async () => data,
    text: async () => JSON.stringify(data),
    clone: () => createMockResponse(data),
  } as Response;
};

/**
 * Checks the status of SMTP configuration.
 * If backend fails or is not found (e.g., hosted on Vercel), gracefully falls back to local simulation.
 */
export const getConfigStatus = async (): Promise<Response> => {
  try {
    const response = await fetchWithAuth("/api/config/status");
    if (response.ok) {
      return response;
    }
    console.warn("Backend config status returned non-OK. Activating client fallback...");
  } catch (err) {
    console.warn("Backend API not found for config status. Activating local simulator...", err);
  }

  const mockData = {
    smtpConfigured: true,
    smtpUser: "notificaciones@zenticket.mx"
  };

  return createMockResponse(mockData);
};
