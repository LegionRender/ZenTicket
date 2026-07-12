import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { normalizePortalSteps } from "../../../runner/src/executor/normalizePortalSteps";

describe("Fase 5 - contratos de accion del runner", () => {
  const executionCore = path.resolve(__dirname, "../../../runner/src/engines/automation/executePortalMap.ts");

  it("no usa clics forzados para intentar descargas", () => {
    const source = fs.readFileSync(executionCore, "utf8");
    expect(source).not.toMatch(/\.click\(\{\s*force\s*:\s*true/);
  });

  it("exige una seÃ±al documental despues de un clic de descarga", () => {
    const source = fs.readFileSync(executionCore, "utf8");
    expect(source).toContain("waitForDocumentSignal");
    expect(source).toContain("clickForDocument");
    expect(source).toContain("DOCUMENT_NOT_OBSERVED");
  });

  it("no conserva pausas fijas ni clics silenciosos en la estrategia OXXO", () => {
    const strategyPath = path.resolve(__dirname, "../../../runner/src/engines/connectors/strategies/oxxo.ts");
    const source = fs.readFileSync(strategyPath, "utf8");
    expect(source).not.toContain("waitForTimeout");
    expect(source).not.toMatch(/\.click\(\)\.catch/);
    expect(source).toContain("PORTAL_FIELD_POSTCONDITION_FAILED");
  });

  it("aÃ­sla la recuperaciÃ³n de rutas locales y del modo JIT ejecutable", () => {
    const recoveryPath = path.resolve(__dirname, "../../../runner/src/engines/automation/recoverInvoice.ts");
    const source = fs.readFileSync(recoveryPath, "utf8");
    expect(source).not.toContain("localhost");
    expect(source).not.toContain("waitForTimeout");
    expect(source).not.toContain("jit_recovery_learn");
    expect(source).toContain("RECOVERY_STEP_POSTCONDITION_REQUIRED");
    expect(source).toContain("DOCUMENT_NOT_OBSERVED");
  });

  it("rechaza esperas arbitrarias al normalizar portal maps", () => {
    expect(() => normalizePortalSteps([
      { type: "goto", url: "https://portal.example.test/facturacion" },
      { type: "wait_for_timeout", delay: 1000 },
      { type: "click", selector: "#continuar" }
    ], { extractionContract: { requiredPortalFields: [], fiscalFields: [] } }))
      .toThrow(expect.objectContaining({ code: "PORTAL_MAP_ARBITRARY_WAIT_REJECTED" }));
  });
});
