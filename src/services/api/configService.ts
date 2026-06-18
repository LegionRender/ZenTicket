import { apiRequest } from "./client";

export interface ConfigStatus {
  smtpConfigured: boolean;
  smtpUser: string | null;
}

export function getConfigStatus() {
  return apiRequest<ConfigStatus>("/api/config/status");
}
