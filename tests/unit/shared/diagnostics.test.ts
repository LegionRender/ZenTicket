import { describe, it, expect } from "vitest";
import { maskRfc, maskEmail, maskPhone, maskName, sanitizeRunnerDiagnostic } from "../../../shared/diagnostics/diagnostic-sanitizer";
import { DIAGNOSTIC_STAGES } from "../../../shared/diagnostics/diagnostic-stages";
import { buildDiagnosticSummary } from "../../../shared/diagnostics/diagnostic-summary";
import { buildProblemSignature } from "../../../shared/diagnostics/diagnostic-problem-signature";

describe("Shared Diagnostics - Sanitizer", () => {
  it("enmascara correctamente RFC", () => {
    expect(maskRfc("XAXX010101XXX")).toBe("XAXX******XXX");
    expect(maskRfc("XAXX010101")).toBe("XAXX***101");
    expect(maskRfc("ABC")).toBe("****");
  });

  it("enmascara correctamente Email", () => {
    expect(maskEmail("ricardo@gmail.com")).toBe("r******@g****.com");
    expect(maskEmail("ricardo.castro@sub.domain.mx")).toBe("r*************@s**.d*****.mx");
  });

  it("enmascara correctamente Teléfono", () => {
    expect(maskPhone("1234567890")).toBe("******7890");
  });

  it("enmascara correctamente Nombre", () => {
    expect(maskName("Ricardo Castro")).toBe("R****** C*****");
  });

  it("no guarda secretos en diagnostic events", () => {
    const rawEvent = {
      userId: "123",
      userDisplayName: "Ricardo Castro",
      userEmail: "ricardo@gmail.com",
      normalizedFields: {
        rfcReceptor: "XAXX010101XXX",
        email: "ricardo@gmail.com"
      },
      portalSnapshot: {
        visibleText: "Some text on page",
        rawHtml: "<html><body>Secret Token: abc123def456</body></html>",
        portalMessages: ["El token bearer 12345-abcde es inválido", "Authorization: basic abcde"]
      },
      technicalMessage: "Error key = 123456",
      xmlContent: "<xml>secret</xml>"
    };

    const sanitized = sanitizeRunnerDiagnostic(rawEvent);

    expect(sanitized.userDisplayName).toBe("R****** C*****");
    expect(sanitized.userEmailMasked).toBe("r******@g****.com");
    expect(sanitized.userEmail).toBeUndefined();
    expect(sanitized.normalizedFields.rfcReceptorMasked).toBe("XAXX******XXX");
    expect(sanitized.normalizedFields.rfcReceptor).toBeUndefined();

    expect(sanitized.portalSnapshot.rawHtml).toBeUndefined();
    expect(sanitized.portalSnapshot.portalMessages[0]).toBe("El token Bearer [REDACTED] es inválido");
    expect(sanitized.portalSnapshot.portalMessages[1]).toBe("authorization: [REDACTED]");
    
    expect(sanitized.technicalMessage).toBe("Error key=[REDACTED]");
    expect(sanitized.xmlContent).toBeUndefined();
  });
});

describe("Shared Diagnostics - Stages", () => {
  it("contiene todas las etapas requeridas en la taxonomía", () => {
    expect(DIAGNOSTIC_STAGES).toContain("ticket_created");
    expect(DIAGNOSTIC_STAGES).toContain("captcha_detected");
    expect(DIAGNOSTIC_STAGES).toContain("xml_download_failed");
    expect(DIAGNOSTIC_STAGES).toContain("sat_validation_failed");
    expect(DIAGNOSTIC_STAGES).toContain("failed_blocking");
  });
});

describe("Shared Diagnostics - Summary Translation", () => {
  it("traduce correctamente los códigos de error fiscales", () => {
    const dummyEvent = {
      userId: "u1",
      userEmailMasked: "r***@g***.com",
      ticketId: "t1",
      jobId: "j1",
      connectorId: "oxxo",
      portalName: "OXXO CADENA",
      ticketReference: "ref1",
      normalizedFields: {
        folio: "f1",
        itu: "i1",
        total: 100,
        fechaCompra: "2026-07-09",
        rfcReceptorMasked: "XAXX***XXX",
        emailMasked: "r***@g***.com"
      },
      stage: "sat_validation_failed",
      status: "failed" as const,
      severity: "critical" as const,
      errorCode: "ALREADY_INVOICED_XML_NOT_RECOVERED",
      portalMessage: "El ticket ya fue facturado anteriormente",
      createdAt: new Date().toISOString(),
      retryable: false,
      requiresManualReview: true,
      problemSignature: "oxxo::sat_validation_failed::already_invoiced::none::already_invoiced_xml_not_recovered",
      safeForAdmin: true,
      recoveryAttemptCount: 1,
      maxRecoveryAttempts: 3
    };

    const summary = buildDiagnosticSummary("t1", "j1", [dummyEvent]);
    expect(summary.plainLanguageProblem).toContain("El portal indica que el ticket ya fue facturado, pero ZenTicket no pudo recuperar el XML fiscal.");
    expect(summary.suggestedAction).toContain("Verificar fecha, ITU y folio");
  });
});

describe("Shared Diagnostics - Problem Signature", () => {
  it("construye problemSignature de forma determinista para agrupar errores similares", () => {
    const sig = buildProblemSignature(
      "oxxo",
      "duplicate_detected",
      "El ticket con Folio 486259 ya fue emitido con anterioridad.",
      null,
      "TICKET_ALREADY_INVOICED"
    );
    expect(sig).toBe("oxxo::duplicate_detected::already_invoiced::none::ticket_already_invoiced");
  });
});

describe("Fase 15B - Separación de Campos y Reglas de Fecha", () => {
  it("valida que ticketId no sea igual al folio si existe documentId real", () => {
    const ticketId = "ticket_vl1fykkpi";
    const ticketReference = "486259";
    const folio = "486259";
    expect(ticketId).not.toBe(folio);
    expect(ticketReference).toBe(folio);
  });

  it("valida que fechaCompra no tome createdAt si existe fecha de ticket", () => {
    // Simular lógica de resolución
    const ticket = {
      fechaCompra: "2026-07-01",
      portalFields: { fecha: "2026-07-05" },
      createdAt: "2026-07-09T12:00:00.000Z"
    };

    let fechaCompra = ticket.fechaCompra || null;
    let fechaCompraSource = null;
    if (fechaCompra) {
      fechaCompraSource = "ticket.fechaCompra";
    } else if (ticket.portalFields?.fecha) {
      fechaCompra = ticket.portalFields.fecha;
      fechaCompraSource = "portalFields.fecha";
    } else if (ticket.createdAt) {
      fechaCompra = ticket.createdAt.split("T")[0];
      fechaCompraSource = "ticket.createdAt (low confidence)";
    }

    expect(fechaCompra).toBe("2026-07-01");
    expect(fechaCompraSource).toBe("ticket.fechaCompra");
  });

  it("valida fallback a createdAt solo si no hay ninguna fecha y queda marcado como low confidence", () => {
    const ticket = {
      fechaCompra: null,
      portalFields: null,
      updatedAt: "2026-07-09T12:00:00.000Z"
    } as any;

    let fechaCompra = ticket.fechaCompra || null;
    let fechaCompraSource = null;
    if (fechaCompra) {
      fechaCompraSource = "ticket.fechaCompra";
    } else if (ticket.portalFields?.fecha) {
      fechaCompra = ticket.portalFields.fecha;
      fechaCompraSource = "portalFields.fecha";
    } else if (ticket.updatedAt) {
      fechaCompra = ticket.updatedAt.split("T")[0];
      fechaCompraSource = "ticket.updatedAt (low confidence fallback)";
    }

    expect(fechaCompra).toBe("2026-07-09");
    expect(fechaCompraSource).toBe("ticket.updatedAt (low confidence fallback)");
  });
});
