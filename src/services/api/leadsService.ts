import { apiRequest } from "./client";

export interface CreateLeadPayload {
  name: string;
  email: string;
  plan: string;
}

export function createLead(payload: CreateLeadPayload) {
  return apiRequest("/api/leads", {
    method: "POST",
    body: payload as unknown as Record<string, unknown>,
  });
}
