import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/context/AuthContext";
import { ToastProvider } from "@/shared/feedback/Toast";
import { Toaster } from "sonner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

export const AppProviders = ({ children }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          {children}
          <Toaster richColors position="top-right" />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default AppProviders;
