import { apiRequest } from "./client";

export interface AnalyzeTicketImagePayload {
  image: string;
  mimeType: string;
  personalGeminiKey?: string;
}

export function analyzeTicketImage({
  image,
  mimeType,
  personalGeminiKey,
}: AnalyzeTicketImagePayload) {
  const headers: Record<string, string> = {};
  if (personalGeminiKey) {
    headers["x-gemini-api-key"] = personalGeminiKey;
  }

  return apiRequest<unknown>("/api/tickets/analyze", {
    method: "POST",
    headers,
    body: { image, mimeType },
  });
}
