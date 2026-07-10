import { beforeAll, vi } from "vitest";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Guardar referencia sincrónica al existsSync original
const originalExistsSync = fs.existsSync;

// Interceptar existsSync para serviceAccountKey.json
vi.spyOn(fs, "existsSync").mockImplementation((p: any) => {
  if (typeof p === "string" && p.includes("serviceAccountKey.json")) {
    return false;
  }
  return originalExistsSync(p);
});

// Cargar .env.test y sobreescribir variables de entorno de producción
dotenv.config({
  path: path.resolve(__dirname, "../.env.test"),
  override: true
});

beforeAll(() => {
  // Cargar entorno de test obligatoriamente
  process.env.NODE_ENV = "test";

  const stripeKey = process.env.STRIPE_SECRET_KEY || "";
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || "";
  const firebaseCreds = process.env.FIREBASE_SERVICE_ACCOUNT || "";
  const googleCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS || "";

  if (stripeKey.includes("sk_live") || publishableKey.includes("pk_live")) {
    throw new Error("SEGURIDAD: ¡Se detectó una clave de Stripe LIVE en el entorno de pruebas! Abortando.");
  }

  if (firebaseCreds || googleCreds) {
    // Si hay credenciales cargadas de GCP/Firebase reales
    if (process.env.ALLOW_REAL_FIREBASE_IN_TESTS !== "true") {
      throw new Error("SEGURIDAD: ¡Se detectaron credenciales reales de Firebase/GCP en las pruebas! Abortando. Key: " + googleCreds);
    }
  }
});
