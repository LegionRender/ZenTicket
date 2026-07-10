import { describe, it, expect } from "vitest";
import { ErrorCodes } from "../../../shared/error-codes";
import { TicketStatus } from "../../../shared/ticket-status";
import { PlanLimits, PlanNames } from "../../../shared/billing-types";
import { CfdiTypes } from "../../../shared/cfdi-types";
import { ConnectorTypes } from "../../../shared/connector-types";

describe("Shared Contracts & Consts", () => {
  it("exporta códigos de error correctamente sin duplicados", () => {
    expect(ErrorCodes).toBeDefined();
    expect(ErrorCodes.XML_NOT_DOWNLOADED).toBe("XML_NOT_DOWNLOADED");
    expect(ErrorCodes.CAPTCHA_DETECTED).toBe("CAPTCHA_DETECTED");

    // Verificar duplicados de valor
    const values = Object.values(ErrorCodes);
    const uniqueValues = new Set(values);
    expect(values.length).toBe(uniqueValues.size);
  });

  it("exporta estados de ticket críticos obligatorios", () => {
    expect(TicketStatus).toBeDefined();
    expect(TicketStatus.PENDING_PORTAL_SUBMISSION).toBe("pending_portal_submission");
    expect(TicketStatus.QUEUED_FOR_RUNNER).toBe("queued_for_runner");
    expect(TicketStatus.RUNNER_PROCESSING).toBe("runner_processing");
    expect(TicketStatus.WAITING_USER_CAPTCHA).toBe("waiting_user_captcha");
    expect(TicketStatus.REQUIRES_MANUAL_REVIEW).toBe("requires_manual_review");
    expect(TicketStatus.CFDI_VALIDATED).toBe("cfdi_validated");

    // Verificar duplicados
    const values = Object.values(TicketStatus);
    const uniqueValues = new Set(values);
    expect(values.length).toBe(uniqueValues.size);
  });

  it("exporta límites y nombres de plan de facturación", () => {
    expect(PlanLimits).toBeDefined();
    expect(PlanLimits.gratuito).toBe(5);
    expect(PlanNames.gratuito).toBe("Plan Gratuito");
  });

  it("exporta tipos CFDI permitidos", () => {
    expect(CfdiTypes).toBeDefined();
    expect(CfdiTypes.G03).toBe("Gastos en general");
  });

  it("exporta tipos de conector", () => {
    expect(ConnectorTypes).toBeDefined();
    expect(ConnectorTypes.JIT).toBe("jit");
  });
});
