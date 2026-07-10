import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";
import { verifyStripeSignature } from "../../../server/utils/crypto.utils";
import { getSafeBaseUrl } from "../../../server/utils/url.utils";

describe("verifyStripeSignature", () => {
  const webhookSecret = "whsec_test_secret";

  it("acepta firma válida con payload y timestamp correcto", () => {
    const rawBody = JSON.stringify({ id: "evt_123", object: "event" });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedPayload = `${timestamp}.${rawBody}`;
    const signature = crypto
      .createHmac("sha256", webhookSecret)
      .update(signedPayload)
      .digest("hex");

    const signatureHeader = `t=${timestamp},v1=${signature}`;
    expect(verifyStripeSignature(rawBody, signatureHeader, webhookSecret)).toBe(true);
  });

  it("rechaza firma si el webhookSecret está vacío", () => {
    const rawBody = "{}";
    expect(verifyStripeSignature(rawBody, "t=123,v1=abc", "")).toBe(false);
  });

  it("rechaza si la firma en el header no coincide", () => {
    const rawBody = "{}";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signatureHeader = `t=${timestamp},v1=wrongsignature`;
    expect(verifyStripeSignature(rawBody, signatureHeader, webhookSecret)).toBe(false);
  });

  it("rechaza si el payload fue modificado", () => {
    const rawBody = JSON.stringify({ original: true });
    const modifiedBody = JSON.stringify({ original: false });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedPayload = `${timestamp}.${rawBody}`;
    const signature = crypto
      .createHmac("sha256", webhookSecret)
      .update(signedPayload)
      .digest("hex");

    const signatureHeader = `t=${timestamp},v1=${signature}`;
    // Intentar verificar con el payload modificado
    expect(verifyStripeSignature(modifiedBody, signatureHeader, webhookSecret)).toBe(false);
  });

  it("rechaza si el timestamp es muy viejo (mayor a 5 minutos)", () => {
    const rawBody = "{}";
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString(); // 400 segundos atrás (> 300)
    const signedPayload = `${oldTimestamp}.${rawBody}`;
    const signature = crypto
      .createHmac("sha256", webhookSecret)
      .update(signedPayload)
      .digest("hex");

    const signatureHeader = `t=${oldTimestamp},v1=${signature}`;
    expect(verifyStripeSignature(rawBody, signatureHeader, webhookSecret)).toBe(false);
  });
});

describe("getSafeBaseUrl", () => {
  it("acepta referer correcto de localhost", () => {
    const mockReq = {
      headers: {
        referer: "http://localhost:3000/account"
      }
    } as any;
    expect(getSafeBaseUrl(mockReq)).toBe("http://localhost:3000");
  });

  it("acepta dominio permitido en referer", () => {
    const mockReq = {
      headers: {
        referer: "https://zenticket.mx/dashboard"
      }
    } as any;
    expect(getSafeBaseUrl(mockReq)).toBe("https://zenticket.mx");
  });

  it("maneja proxy headers (x-forwarded-proto y host)", () => {
    const mockReq = {
      headers: {
        "x-forwarded-proto": "https"
      },
      protocol: "http",
      get: (headerName: string) => {
        if (headerName === "host") return "app.zenticket.mx";
        return "";
      }
    } as any;
    expect(getSafeBaseUrl(mockReq)).toBe("https://app.zenticket.mx");
  });

  it("retorna localhost por defecto si no hay referer ni origin ni host", () => {
    const mockReq = {
      headers: {},
      protocol: "http",
      get: () => null
    } as any;
    expect(getSafeBaseUrl(mockReq)).toBe("http://localhost:3000");
  });
});
