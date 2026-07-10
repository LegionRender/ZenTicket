import { vi, describe, it, expect, beforeEach } from "vitest";
import { isBypassForbidden, authenticateFirebaseToken } from "../../../server/middleware/auth.middleware";
import { requireAdmin } from "../../../server/middleware/admin.middleware";
import { getAuth } from "firebase-admin/auth";

vi.mock("firebase-admin/auth", () => {
  const verifyIdTokenMock = vi.fn();
  return {
    getAuth: () => ({
      verifyIdToken: verifyIdTokenMock
    })
  };
});

describe("isBypassForbidden", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it("permite bypass en entorno local de desarrollo sin credenciales reales", () => {
    process.env.NODE_ENV = "development";
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.VERCEL;
    delete process.env.RENDER;
    delete process.env.STRIPE_SECRET_KEY;
    
    expect(isBypassForbidden()).toBe(false);
  });

  it("bloquea bypass si NODE_ENV es production", () => {
    process.env.NODE_ENV = "production";
    expect(isBypassForbidden()).toBe(true);
  });

  it("bloquea bypass si tiene credenciales reales (FIREBASE_SERVICE_ACCOUNT)", () => {
    process.env.NODE_ENV = "development";
    process.env.FIREBASE_SERVICE_ACCOUNT = "{}";
    expect(isBypassForbidden()).toBe(true);
  });

  it("bloquea bypass si corre en cloud host (VERCEL)", () => {
    process.env.NODE_ENV = "development";
    process.env.VERCEL = "true";
    expect(isBypassForbidden()).toBe(true);
  });

  it("bloquea bypass si se detecta sk_live en STRIPE_SECRET_KEY", () => {
    process.env.NODE_ENV = "development";
    process.env.STRIPE_SECRET_KEY = "sk_live_test_key";
    expect(isBypassForbidden()).toBe(true);
  });
});

describe("authenticateFirebaseToken", () => {
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    next = vi.fn();
    process.env.DEV_BILLING_AUTH_BYPASS = "false";
  });

  it("retorna 401 si no hay Authorization header", async () => {
    await authenticateFirebaseToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining("Falta") });
    expect(next).not.toHaveBeenCalled();
  });

  it("retorna 401 si Authorization está mal formado", async () => {
    req.headers.authorization = "InvalidFormat abc";
    await authenticateFirebaseToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("retorna 401 si el token es inválido y falla la verificación", async () => {
    req.headers.authorization = "Bearer invalid-token";
    process.env.FIREBASE_SERVICE_ACCOUNT = "mock-account";

    const mockVerify = getAuth().verifyIdToken as any;
    mockVerify.mockRejectedValueOnce(new Error("Token expired"));

    await authenticateFirebaseToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining("inválido o expirado") });
    expect(next).not.toHaveBeenCalled();
  });

  it("inyecta uid, email y claims si el token es válido mock", async () => {
    req.headers.authorization = "Bearer valid-token";
    process.env.FIREBASE_SERVICE_ACCOUNT = "mock-account";

    const mockVerify = getAuth().verifyIdToken as any;
    const mockClaims = {
      uid: "user-123",
      email: "test@example.com",
      email_verified: true,
      customClaim: "hello"
    };
    mockVerify.mockResolvedValueOnce(mockClaims);

    await authenticateFirebaseToken(req, res, next);
    expect(req.user.uid).toBe("user-123");
    expect(req.user.email).toBe("test@example.com");
    expect(req.user.claims).toEqual(mockClaims);
    expect(next).toHaveBeenCalled();
  });
});

describe("requireAdmin", () => {
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    req = {};
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    next = vi.fn();
  });

  it("retorna 401 si no hay usuario en request", async () => {
    await requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("retorna 403 si el usuario no es admin", async () => {
    req.user = { email: "user@example.com", role: "user" };
    await requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("permite acceso a admin por correo específico", async () => {
    req.user = { email: "ricardo@zenticket.mx", role: "user" };
    await requireAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("permite acceso a admin por custom claim admin == true", async () => {
    req.user = { email: "someone@example.com", claims: { admin: true } };
    await requireAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("permite acceso a admin por role == 'admin'", async () => {
    req.user = { email: "someone@example.com", role: "admin" };
    await requireAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
