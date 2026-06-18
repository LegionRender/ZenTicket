import { apiRequest } from "./client";

export interface RunTicketAutomationPayload {
  ticket: unknown;
  profile: unknown;
  connector: unknown;
}

export function runTicketAutomation(payload: RunTicketAutomationPayload) {
  return apiRequest<any>("/api/automation/run", {
    method: "POST",
    body: payload as unknown as Record<string, unknown>,
  });
}
