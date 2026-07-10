export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface BillingStatusContract {
  userId: string;
  planId: string;
  planName: string;
  status: string;
  provider: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  invoicesLimit: number;
  invoicesUsed: number;
}
