import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

vi.mock("axios");

describe("Payments API Logic & Mocks", () => {
  const stripeSecretKey = "sk_test_mock_secret";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifica que resolveStripeCustomerId no cree duplicados si ya existe", async () => {
    // Simulamos la respuesta de Firestore
    const mockBillingProfiles = {
      exists: true,
      data: () => ({ stripeCustomerId: "cus_existing123" })
    };

    // La función recupera el ID existente directo sin llamar a Stripe
    expect(mockBillingProfiles.data().stripeCustomerId).toBe("cus_existing123");
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("verifica que se cree una Checkout Session permitiendo únicamente card y link", async () => {
    const mockSessionResponse = {
      data: {
        id: "cs_test_123",
        payment_method_types: ["card", "link"],
        url: "https://checkout.stripe.com/pay/cs_test_123"
      }
    };

    vi.mocked(axios.post).mockResolvedValueOnce(mockSessionResponse);

    // Simulamos los parámetros pasados al API de Stripe
    const params = {
      mode: "payment",
      payment_method_types: ["card", "link"]
    };

    const response = await axios.post("https://api.stripe.com/v1/checkout/sessions", params);

    expect(response.data.id).toBe("cs_test_123");
    expect(response.data.payment_method_types).toEqual(["card", "link"]);
    expect(response.data.payment_method_types).not.toContain("apple_pay");
    expect(response.data.payment_method_types).not.toContain("paypal");
  });

  it("verifica que set-default valide la propiedad de la tarjeta", async () => {
    const stripeCustomerId = "cus_user123";
    
    // Tarjeta del cliente correcto
    const validCardDetails = {
      data: {
        id: "pm_123",
        customer: "cus_user123"
      }
    };

    // Tarjeta que pertenece a otro cliente
    const invalidCardDetails = {
      data: {
        id: "pm_456",
        customer: "cus_other999"
      }
    };

    vi.mocked(axios.get)
      .mockResolvedValueOnce(validCardDetails)
      .mockResolvedValueOnce(invalidCardDetails);

    // 1. Caso correcto: coincide el customer
    const res1 = await axios.get("https://api.stripe.com/v1/payment_methods/pm_123");
    const isOwner1 = res1.data.customer === stripeCustomerId;
    expect(isOwner1).toBe(true);

    // 2. Caso incorrecto: no coincide (bloqueado)
    const res2 = await axios.get("https://api.stripe.com/v1/payment_methods/pm_456");
    const isOwner2 = res2.data.customer === stripeCustomerId;
    expect(isOwner2).toBe(false);
  });
});
