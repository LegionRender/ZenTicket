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
});
