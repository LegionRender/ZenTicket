import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { getConnectorStrategy } from "../../../runner/src/engines/connectors/registry";
import { collectDocuments } from "../../../runner/src/executor/documentSniffer";

describe("Fase 13 — Hacks Cleanup in Runner", () => {
  it("should ensure executePortalMap.ts does not contain hardcoded references to OXXO, GOGAS, etc.", () => {
    const filePath = path.resolve(__dirname, "../../../runner/src/engines/automation/executePortalMap.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    // Case-insensitive checks for specific merchants or connection strings hardcoded in core logic
    const forbidden = ["oxxo", "gogas", "starbucks", "walmart", "costco", "chedraui", "soriana"];
    for (const merchant of forbidden) {
      // Must not appear in code statements (excluding strategy/registry imports/comments if any,
      // but since we imported getConnectorStrategy, let's check that the specific strings are not used in logic)
      const regex = new RegExp(`\\b${merchant}\\b`, "i");
      expect(content).not.toMatch(regex);
    }
  });

  it("should ensure documentSniffer.ts does not contain hardcoded references to OXXO, GOGAS, etc. and does not parse PDF to XML", () => {
    const filePath = path.resolve(__dirname, "../../../runner/src/executor/documentSniffer.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    const forbidden = ["oxxo", "gogas", "starbucks", "walmart", "costco", "pdf-parse", "pdf-fallback-cfdi.xml"];
    for (const word of forbidden) {
      const regex = new RegExp(`\\b${word.replace(".", "\\.")}\\b`, "i");
      expect(content).not.toMatch(regex);
    }
  });

  it("should verify that documentSniffer does not generate XML dummy when XML is missing", async () => {
    const mockPage: any = {
      locator: () => ({
        evaluateAll: async () => []
      }),
      evaluate: async () => []
    };
    const mockContext: any = {};
    const mockSniffer: any = {
      captures: [],
      dispose: () => {}
    };

    const tempDir = path.resolve(__dirname, "../../../temp-test-sniffer-" + Date.now());
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
      const result = await collectDocuments(
        mockPage,
        mockContext,
        tempDir,
        [], // no downloaded files
        mockSniffer,
        100,
        "AAA010101AAA",
        "BBB010101BBB"
      );

      expect(result.xmlPath).toBeUndefined();
      expect(result.pdfPath).toBeUndefined();
      expect(result.source).toBeUndefined();
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it("should verify that connector strategy registry works and oxxo strategy returns correct business violation", () => {
    const strategy = getConnectorStrategy("oxxo");
    expect(strategy).not.toBeNull();
    expect(strategy?.connectorId).toBe("oxxo");
    expect(strategy?.detectBusinessRuleViolation).toBeTypeOf("function");
    expect(strategy?.selfHealFields).toBeTypeOf("function");
    expect(strategy?.detectDownloadLinks).toBeTypeOf("function");

    const violationWithoutDate = strategy?.detectBusinessRuleViolation?.("TICKET_TOO_NEW");
    expect(violationWithoutDate).toEqual({
      errorCode: "TICKET_TOO_NEW",
      errorMsg: "OXXO puede tardar hasta 24 horas en sincronizar tickets nuevos. Reintentaremos automáticamente más tarde."
    });

    const violationWithDate = strategy?.detectBusinessRuleViolation?.("TICKET_TOO_NEW", "2026-07-09");
    expect(violationWithDate).toEqual({
      errorCode: "TICKET_TOO_NEW",
      errorMsg: "El ticket es reciente (2026-07-09). OXXO puede tardar hasta 24 horas en sincronizar. Reintentaremos automáticamente más tarde."
    });

    const nonExistentViolation = strategy?.detectBusinessRuleViolation?.("SOME_OTHER_ERROR");
    expect(nonExistentViolation).toBeNull();
  });
});
