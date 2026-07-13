import { describe, it, expect } from "vitest";
import { 
  isSiblingTicket, 
  resolveConnectorId, 
  buildTransactionKey 
} from "../../../src/workspace/utils/billingStateHelpers";

describe("Ticket Identity - resolveConnectorId", () => {
  it("should resolve Oxxo name and RFC to oxxocadena", () => {
    expect(resolveConnectorId("OXXO")).toBe("oxxocadena");
    expect(resolveConnectorId("OXXO Cadena")).toBe("oxxocadena");
    expect(resolveConnectorId("Cadena Comercial OXXO")).toBe("oxxocadena");
    expect(resolveConnectorId("CCO8605231N4")).toBe("oxxocadena");
    expect(resolveConnectorId("cco-860523-1n4")).toBe("oxxocadena");
  });

  it("should resolve Walmart names to walmart", () => {
    expect(resolveConnectorId("Walmart")).toBe("walmart");
    expect(resolveConnectorId("Bodega Aurrera")).toBe("walmart");
    expect(resolveConnectorId("Sam's Club")).toBe("walmart");
  });
});

describe("Ticket Identity - buildTransactionKey", () => {
  it("should build correct key for oxxocadena with all identity fields", () => {
    const key = buildTransactionKey({
      connectorId: "oxxocadena",
      portalFields: {
        billingReference: "486259",
        total: 345.50,
        fecha: "2026-07-03"
      },
      identityFields: ["billingReference", "total", "fecha"]
    });
    expect(key).toBe("oxxocadena|billingReference:486259|total:345.50|fecha:2026-07-03");
  });

  it("should return null if any identity field is missing", () => {
    const key = buildTransactionKey({
      connectorId: "oxxocadena",
      portalFields: {
        billingReference: "486259",
        total: 345.50
      },
      identityFields: ["billingReference", "total", "fecha"]
    });
    expect(key).toBeNull();
  });
});

describe("Ticket Identity - isSiblingTicket Hierarchy", () => {
  const userId = "user-123";

  describe("Nivel 1 - Relación explícita (sourceTicketId)", () => {
    it("should match when sharing sourceTicketId", () => {
      const t1 = { id: "T1", userId, sourceTicketId: "T_PARENT" };
      const t2 = { id: "T2", userId, sourceTicketId: "T_PARENT" };
      expect(isSiblingTicket(t1, t2)).toBe(true);
    });

    it("should match when one ticket's ticketId matches parent id", () => {
      const t1 = { id: "T_PARENT", userId };
      const t2 = { id: "T2", userId, sourceTicketId: "T_PARENT" };
      expect(isSiblingTicket(t1, t2)).toBe(true);
    });
  });

  describe("Nivel 2 - Clave de transacción (transactionKey)", () => {
    it("should match when transactionKey is identical", () => {
      const key = "oxxocadena|billingReference:486259|total:345.50|fecha:2026-07-03";
      const t1 = { id: "T1", userId, transactionKey: key };
      const t2 = { id: "T2", userId, transactionKey: key };
      expect(isSiblingTicket(t1, t2)).toBe(true);
    });
  });

  describe("Nivel 3 - Compatibilidad heredada estricta", () => {
    it("should match legacy tickets with matching connector, folio, total, and date", () => {
      const t1 = { 
        id: "T1", 
        userId, 
        rfcEmisor: "CCO8605231N4", 
        folio: "486259", 
        total: 345.5, 
        fecha: "2026-07-03" 
      };
      const t2 = { 
        id: "T2", 
        userId, 
        comercio: "OXXO Cadena", 
        portalFields: { 
          billingReference: "486259", 
          total: 345.5, 
          fecha: "2026-07-03" 
        } 
      };
      expect(isSiblingTicket(t1, t2)).toBe(true);
    });

    it("should NOT match if date is required by connector but differs (different years)", () => {
      const t1 = { 
        id: "T1", 
        userId, 
        rfcEmisor: "CCO8605231N4", 
        folio: "486259", 
        total: 345.5, 
        fecha: "2024-07-03" 
      };
      const t2 = { 
        id: "T2", 
        userId, 
        rfcEmisor: "CCO8605231N4", 
        folio: "486259", 
        total: 345.5, 
        fecha: "2026-07-03" 
      };
      expect(isSiblingTicket(t1, t2)).toBe(false);
    });

    it("should NOT match if dates differ by 10 days (no loose date tolerance)", () => {
      const t1 = { 
        id: "T1", 
        userId, 
        rfcEmisor: "CCO8605231N4", 
        folio: "486259", 
        total: 345.5, 
        fecha: "2026-07-03" 
      };
      const t2 = { 
        id: "T2", 
        userId, 
        rfcEmisor: "CCO8605231N4", 
        folio: "486259", 
        total: 345.5, 
        fecha: "2026-07-08" 
      };
      expect(isSiblingTicket(t1, t2)).toBe(false);
    });

    it("should NOT match if total differs", () => {
      const t1 = { id: "T1", userId, rfcEmisor: "CCO8605231N4", folio: "486259", total: 345.5 };
      const t2 = { id: "T2", userId, rfcEmisor: "CCO8605231N4", folio: "486259", total: 100.0 };
      expect(isSiblingTicket(t1, t2)).toBe(false);
    });

    it("should NOT match if folio/reference differs", () => {
      const t1 = { id: "T1", userId, rfcEmisor: "CCO8605231N4", folio: "486259", total: 345.5 };
      const t2 = { id: "T2", userId, rfcEmisor: "CCO8605231N4", folio: "999999", total: 345.5 };
      expect(isSiblingTicket(t1, t2)).toBe(false);
    });
  });
});
