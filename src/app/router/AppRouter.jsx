import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/auth/context/AuthContext";

const Landing = lazy(() => import("@/landing/pages/Landing"));
const Dashboard = lazy(() => import("@/workspace/pages/Dashboard"));

function RouteLoader() {
  return (
    <div className="min-h-screen bg-[#070a16] flex flex-col items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
      <p className="text-white/40 text-[12px] mt-4 font-mono">Verificando sesion segura...</p>
    </div>
  );
}

export default function AppRouter() {
  const { user, loading } = useAuth();

  if (loading) {
    return <RouteLoader />;
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/" element={user ? <Dashboard /> : <Landing />} />
          <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
