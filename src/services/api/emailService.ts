import { apiRequest } from "./client";

export interface SendInvoiceEmailPayload {
  to: string;
  invoice: unknown;
}

export interface SendInvoiceEmailResponse {
  success: boolean;
  simulated?: boolean;
  message?: string;
}

export function sendInvoiceEmail(payload: SendInvoiceEmailPayload) {
  return apiRequest<SendInvoiceEmailResponse>("/api/email/send", {
    method: "POST",
    body: payload as unknown as Record<string, unknown>,
  });
}
