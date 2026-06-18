import { apiRequest } from "./client";

export interface ParsedFiscalConstancia {
  rfc?: string;
  razonSocial?: string;
  regimenFiscal?: string;
  codigoPostal?: string;
}

export function parseFiscalConstancia(file: string, mimeType: string, personalGeminiKey?: string) {
  const headers: Record<string, string> = {};
  if (personalGeminiKey) {
    headers["x-gemini-api-key"] = personalGeminiKey;
  }

  return apiRequest<ParsedFiscalConstancia>("/api/fiscal/parse-constancia", {
    method: "POST",
    headers,
    body: { file, mimeType },
  });
}
