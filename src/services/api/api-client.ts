import { auth } from "../firebase/firebase";

/**
 * Resolves the final API endpoint URL based on environment configuration or hostname detection.
 */
export const getApiUrl = (path: string): string => {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  // 1. Try to read from Vite environment variable (VITE_API_URL)
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    const base = envUrl.endsWith("/") ? envUrl.slice(0, -1) : envUrl;
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${base}${cleanPath}`;
  }

  // 2. Automatically detect if running on production custom domain or staging on Vercel
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  if (hostname && (hostname.includes("zenticket.mx") || hostname.endsWith(".vercel.app"))) {
    // Target the 2nd Gen Firebase Function Cloud Run service URL directly
    const base = "https://api-2yeoxrnita-uc.a.run.app";
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${base}${cleanPath}`;
  }

  // 3. Fallback: Use relative URL (default behavior for Firebase Hosting/Proxy setups)
  return path;
};

/**
 * Dynamically resolves headers with Authorization Bearer Firebase ID token if user is signed in.
 */
export const getAuthHeaders = async (customHeaders: Record<string, string> = {}, isFormData: boolean = false): Promise<Record<string, string>> => {
  const headers: Record<string, string> = { ...customHeaders };
  
  if (!isFormData && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }
  
  if (auth.currentUser) {
    try {
      const idToken = await auth.currentUser.getIdToken();
      headers["Authorization"] = `Bearer ${idToken}`;
    } catch (err) {
      console.warn("Could not retrieve Firebase ID token:", err);
    }
  }
  
  return headers;
};

/**
 * Helper to perform fetch requests automatically appending Firebase Auth token and resolving API URL.
 */
export const fetchWithAuth = async (path: string, options: RequestInit = {}): Promise<Response> => {
  const resolvedUrl = getApiUrl(path);
  const isFormData = options.body instanceof FormData;
  const authHeaders = await getAuthHeaders(options.headers as Record<string, string> || {}, isFormData);
  
  try {
    const response = await fetch(resolvedUrl, {
      ...options,
      headers: authHeaders
    });
    
    if (response.status === 401) {
      console.warn("[API Client] 401 Unauthorized: La sesión de usuario ha expirado o no es válida. Vuelve a iniciar sesión.");
    } else if (response.status === 403) {
      console.warn("[API Client] 403 Forbidden: No tienes privilegios de administrador para realizar esta acción.");
    } else if (response.status >= 500) {
      console.error(`[API Client] ${response.status} Internal Server Error: Error en el servidor de ZenTicket.`);
    }
    
    return response;
  } catch (err: any) {
    console.error("[API Client] Error de red al conectar con el servidor:", err);
    throw new Error("No se pudo conectar con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.");
  }
};


