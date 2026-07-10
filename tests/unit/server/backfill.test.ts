import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import path from "path";

describe("Diagnostics Backfill Script Tests", () => {
  it("backfill dry-run no escribe y reporta resumen correcto", () => {
    const scriptPath = path.resolve(__dirname, "../../../scripts/diagnostics/backfill_diagnostic_summaries.cjs");
    const output = execSync(`node "${scriptPath}" --dry-run`, { encoding: "utf8" });

    expect(output).toContain("BACKFILL: Generador Seguro de Diagnósticos para Tickets Activos");
    expect(output).toContain("Modo de ejecución: DRY-RUN");
    expect(output).toContain("Simulación completada. No se han escrito cambios en la base de datos.");
    expect(output).toContain("Summaries creados: 0");
    expect(output).not.toContain("[OK] Creado diagnostic_summary");
  });
});
