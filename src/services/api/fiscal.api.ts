import { getApiUrl, fetchWithAuth } from "./api-client";

export interface ParseConstanciaParams {
  fileBase64: string;
  mimeType: string;
  personalGeminiKey?: string;
}

const createErrorResponse = (data: any, status = 503): Response => {
  return {
    ok: false,
    status,
    statusText: "Service Unavailable",
    headers: new Headers({ "Content-Type": "application/json" }),
    json: async () => data,
    text: async () => JSON.stringify(data),
    clone: () => createErrorResponse(data, status),
  } as Response;
};

/**
 * Sends a PDF/Image of the Constancia de Situacion Fiscal (CSF) for structured OCR parsing.
 * This client intentionally never fabricates fiscal data.
 */
export const parseConstancia = async ({
  fileBase64,
  mimeType,
  personalGeminiKey
}: ParseConstanciaParams): Promise<Response> => {
  const headers: Record<string, string> = {};
  if (personalGeminiKey) {
    headers["x-gemini-api-key"] = personalGeminiKey;
  }

  try {
    return await fetchWithAuth("/api/fiscal/parse-constancia", {
      method: "POST",
      headers,
      body: JSON.stringify({ file: fileBase64, mimeType }),
    });
  } catch (err) {
    console.warn("Backend API endpoint not available for constancia parsing.", err);
    return createErrorResponse({
      error: "No se pudo conectar con el lector de constancia. Ingresa los datos manualmente.",
      ocrFailed: true
    });
  }
};

