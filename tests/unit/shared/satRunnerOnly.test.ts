import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const readProjectFile = (relativePath: string) =>
  readFileSync(resolve(root, relativePath), "utf8");

describe("SAT validation boundary", () => {
  it("retires public SAT verification endpoints", () => {
    const firebaseApi = readProjectFile("firebase/functions/index.js");
    const legacyApi = readProjectFile("server/app.ts");

    expect(firebaseApi).toContain("SAT_VALIDATION_RUNNER_ONLY");
    expect(legacyApi).toContain("SAT_VALIDATION_RUNNER_ONLY");
    expect(firebaseApi).not.toContain("verifyCfdiWithSat");
    expect(legacyApi).not.toContain("verifyCfdiWithSat");
  });

  it("keeps the browser out of SAT verification", () => {
    const ticketsScreen = readProjectFile(
      "src/workspace/features/tickets/TicketsListScreen.tsx"
    );

    expect(ticketsScreen).not.toContain('/api/cfdi/verify-sat');
  });
});
