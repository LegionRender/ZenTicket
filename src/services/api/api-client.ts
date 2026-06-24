/**
 * Resolves the final API endpoint URL based on environment configuration or hostname detection.
 */
export const getApiUrl = (path: string): string => {
  // 1. Try to read from Vite environment variable (VITE_API_URL)
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    const base = envUrl.endsWith("/") ? envUrl.slice(0, -1) : envUrl;
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${base}${cleanPath}`;
  }

  // 2. Automatically detect if running on production custom domain on Vercel
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  if (hostname && hostname.includes("zenticket.mx")) {
    // Target the 2nd Gen Firebase Function Cloud Run service URL directly
    const base = "https://api-2yeoxrnita-uc.a.run.app";
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${base}${cleanPath}`;
  }

  // 3. Fallback: Use relative URL (default behavior for Firebase Hosting/Proxy setups)
  return path;
};
