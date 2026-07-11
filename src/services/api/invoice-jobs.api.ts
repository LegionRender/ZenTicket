import { fetchWithAuth } from "./api-client";

export interface InvoiceJobEnqueueResult {
  jobId: string;
  status: string;
  idempotent: boolean;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `invoice-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function parseApiResponse(response: Response): Promise<any> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "No fue posible completar la solicitud.");
  return data;
}

export async function enqueueInvoiceJob(ticketId: string): Promise<InvoiceJobEnqueueResult> {
  const response = await fetchWithAuth("/api/invoice-jobs", {
    method: "POST",
    body: JSON.stringify({ ticketId, idempotencyKey: newIdempotencyKey() })
  });
  return parseApiResponse(response);
}

export async function submitInvoiceJobCaptcha(jobId: string, solution: string, captchaAttemptId?: string | null): Promise<{ jobId: string; status: string }> {
  const response = await fetchWithAuth(`/api/invoice-jobs/${encodeURIComponent(jobId)}/captcha`, {
    method: "POST",
    body: JSON.stringify({ solution, captchaAttemptId: captchaAttemptId || null })
  });
  return parseApiResponse(response);
}
