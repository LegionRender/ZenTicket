import { getAuth } from "firebase-admin/auth";

export const isBypassForbidden = (): boolean => {
  const isProdEnv = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "prod";
  const isCloudHost = !!(process.env.VERCEL || process.env.RENDER || process.env.GAE_INSTANCE || process.env.K_SERVICE);
  const hasLiveStripe = (process.env.STRIPE_SECRET_KEY || "").includes("sk_live");
  
  if (process.env.DEV_BILLING_AUTH_BYPASS === "true" && !isProdEnv && !isCloudHost && !hasLiveStripe && process.env.VITEST !== "true") {
    return false;
  }
  
  const hasRealCreds = !!(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS);
  return isProdEnv || hasRealCreds || isCloudHost || hasLiveStripe;
};

// Middleware de Autenticación de Firebase para Billing
export const authenticateFirebaseToken = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  const hasRealCredentials = 
    !!(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS) ||
    process.env.NODE_ENV === "production" ||
    process.env.NODE_ENV === "prod" ||
    !!process.env.K_SERVICE ||
    !!process.env.FUNCTION_NAME;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // Modo desarrollo local con bypass habilitado
    if (process.env.DEV_BILLING_AUTH_BYPASS === "true") {
      if (isBypassForbidden()) {
        console.error("CRITICAL SECURITY WARNING: Blocked DEV_BILLING_AUTH_BYPASS execution in a non-local or production environment.");
        res.status(401).json({ error: "Falta el token de autorización o es inválido" });
        return;
      }
      const mockUid = req.headers["x-mock-user-id"];
      const mockEmail = req.headers["x-mock-user-email"];
      if (mockUid) {
        req.user = { 
          uid: mockUid, 
          email: mockEmail || "mock@example.com",
          email_verified: true,
          role: mockEmail && (mockEmail.toLowerCase().includes("ricardo") || mockEmail.toLowerCase().includes("legionrender")) ? "admin" : "user",
          claims: {}
        };
        next();
        return;
      }
    }
    res.status(401).json({ error: "Falta el token de autorización o es inválido" });
    return;
  }

  const token = authHeader.split("Bearer ")[1];
  try {
    // Si no hay credenciales reales de Firebase inicializadas
    if (!hasRealCredentials) {
      if (process.env.DEV_BILLING_AUTH_BYPASS === "true") {
        if (isBypassForbidden()) {
          console.error("CRITICAL SECURITY WARNING: Blocked DEV_BILLING_AUTH_BYPASS execution in a non-local or production environment.");
          res.status(401).json({ error: "Desarrollo local: Habilite DEV_BILLING_AUTH_BYPASS para pruebas" });
          return;
        }
        const mockUid = req.headers["x-mock-user-id"] || "mock-local-uid";
        const mockEmail = req.headers["x-mock-user-email"] || "mock@example.com";
        req.user = { 
          uid: mockUid, 
          email: mockEmail,
          email_verified: true,
          role: mockEmail && (mockEmail.toLowerCase().includes("ricardo") || mockEmail.toLowerCase().includes("legionrender")) ? "admin" : "user",
          claims: {}
        };
        next();
        return;
      }
      res.status(401).json({ error: "Desarrollo local: Habilite DEV_BILLING_AUTH_BYPASS para pruebas" });
      return;
    }

    const decodedToken = await getAuth().verifyIdToken(token);
    req.user = { 
      uid: decodedToken.uid, 
      email: decodedToken.email || "",
      email_verified: decodedToken.email_verified === true,
      claims: decodedToken,
      role: decodedToken.role || (decodedToken.email && (decodedToken.email.toLowerCase().includes("ricardo") || decodedToken.email.toLowerCase().includes("legionrender")) ? "admin" : "user")
    };
    next();
  } catch (error: any) {
    console.error("Error al verificar token de Firebase:", error.message);
    res.status(401).json({ error: "Token de Firebase inválido o expirado" });
  }
};
