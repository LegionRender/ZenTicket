import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

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
});
