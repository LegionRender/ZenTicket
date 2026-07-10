import { describe, it, expect } from "vitest";
import { getBillingStatusVisual } from "@/shared/billing/billingStatusVisuals";
import { getStatusLabelAndDot } from "@/workspace/admin/diagnostics/components/DiagnosticsTable";
import { getDiagnosticTone } from "@/workspace/admin/diagnostics/utils/diagnosticTone";
import { getBillingCanonicalState } from "@/workspace/utils/billingStateHelpers";

describe("ZenTicket Billing Status Visuals & Canonical States", () => {
  
  it("getBillingStatusVisual('requires_manual_review') devuelve grupo ALERTAS y colores correctos", () => {
    const visual = getBillingStatusVisual("requires_manual_review");
    expect(visual.statusGroup).toBe("ALERTAS");
    expect(visual.tone).toBe("amber");
    expect(visual.bgColor).toBe("#1F1A0B");
    expect(visual.borderColor).toBe("#4A3510");
    expect(visual.textColor).toBe("#F59E0B");
    expect(visual.badgeClassName).toBe("zt-badge-alert");
    expect(visual.className).toBe("zt-status-alert");
  });

  it("getBillingStatusVisual para proceso devuelve grupo COLA y colores correctos", () => {
    const visual = getBillingStatusVisual("processing");
    expect(visual.statusGroup).toBe("COLA");
    expect(visual.tone).toBe("blue");
    expect(visual.bgColor).toBe("#0B162E");
    expect(visual.borderColor).toBe("#1D3B7A");
    expect(visual.textColor).toBe("#3B82F6");
    expect(visual.badgeClassName).toBe("zt-badge-queue");
  });

  it("getBillingStatusVisual para error devuelve grupo FALLOS y colores correctos", () => {
    const visual = getBillingStatusVisual("failed");
    expect(visual.statusGroup).toBe("FALLOS");
    expect(visual.tone).toBe("red");
    expect(visual.bgColor).toBe("#221220");
    expect(visual.borderColor).toBe("#41182A");
    expect(visual.textColor).toBe("#C70036");
    expect(visual.badgeClassName).toBe("zt-badge-error");
  });

  it("getBillingStatusVisual para ok devuelve grupo OK y colores correctos", () => {
    const visual = getBillingStatusVisual("ready");
    expect(visual.statusGroup).toBe("OK");
    expect(visual.tone).toBe("green");
    expect(visual.bgColor).toBe("#0B1F23");
    expect(visual.borderColor).toBe("#0C3631");
    expect(visual.textColor).toBe("#007A55");
    expect(visual.badgeClassName).toBe("zt-badge-ok");
  });

  it("Ticket #486259 (requires_manual_review) se mapea con zt-badge-alert", () => {
    const mockTicket = {
      id: "ticket_486259",
      ticketReference: "486259",
      status: "requires_manual_review",
      userId: "u1"
    };

    const state = getBillingCanonicalState({ ticket: mockTicket });
    expect(state.canonicalStatus).toBe("requires_manual_review");
    expect(state.badgeTone).toBe("zt-badge-alert");
  });

  it("getStatusLabelAndDot devuelve label de helper y clases correctas para requires_manual_review", () => {
    const mockItem = {
      canonicalStatus: "requires_manual_review"
    };

    const info = getStatusLabelAndDot(mockItem);
    expect(info.label).toBe("Atención");
    expect(info.dotClass).toBe("zt-dot-alert");
    expect(info.textClass).toContain("zt-alert-text");
  });

  it("getDiagnosticTone devuelve toneStyle correcto para severidades info, warning y critical", () => {
    const toneInfo = getDiagnosticTone("info");
    expect(toneInfo.tone).toBe("blue");
    expect(toneInfo.badgeClass).toBe("zt-badge-queue");

    const toneWarning = getDiagnosticTone("warning");
    expect(toneWarning.tone).toBe("amber");
    expect(toneWarning.badgeClass).toBe("zt-badge-alert");

    const toneCritical = getDiagnosticTone("critical");
    expect(toneCritical.tone).toBe("red");
    expect(toneCritical.badgeClass).toBe("zt-badge-error");
  });

  it("El módulo Admin Diagnóstico no usa border-white, border-slate-100, border-slate-200 ni text-white", () => {
    const fs = require("fs");
    const path = require("path");
    const files = [
      "src/workspace/admin/diagnostics/pages/DiagnosticsPage.tsx",
      "src/workspace/admin/diagnostics/components/UsersMasterDetail.tsx",
      "src/workspace/admin/diagnostics/components/DiagnosticsTable.tsx",
      "src/workspace/admin/diagnostics/components/DiagnosticFilters.tsx",
      "src/workspace/admin/diagnostics/components/DiagnosticDetailDrawer.tsx",
      "src/workspace/admin/diagnostics/components/DiagnosticSummaryBox.tsx",
      "src/workspace/admin/diagnostics/components/DiagnosticEvidencePanel.tsx",
      "src/workspace/admin/diagnostics/components/DiagnosticActions.tsx"
    ];
    for (const f of files) {
      const fullPath = path.resolve(__dirname, "../../../", f);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf8");
        expect(content).not.toContain("border-white");
        expect(content).not.toContain("border-slate-100");
        expect(content).not.toContain("border-slate-200");
        expect(content).not.toContain("border-[#fff]");
        expect(content).not.toContain("border-[#ffffff]");
        expect(content).not.toContain("rgba(255,255,255");
        expect(content).not.toContain("rgba(255, 255, 255");
        expect(content).not.toContain("bg-white");
        
        // Exclude lines with comments or permitted bg tags
        const lines = content.split("\n");
        for (const line of lines) {
          if (line.trim().startsWith("//") || line.trim().startsWith("/*")) continue;
          if (line.includes("text-white")) {
            const isPermitted = line.includes("bg-[var(--zt-accent-primary)]") || line.includes("zt-btn-primary") || line.includes("bg-indigo-600");
            expect(isPermitted).toBe(true);
          }
        }
      }
    }
  });

  it("Las cards superiores de DiagnosticsPage usan las clases de zt-metric-card y los tokens de estado coinciden exactamente", () => {
    const fs = require("fs");
    const path = require("path");
    const filePath = path.resolve(__dirname, "../../../src/workspace/admin/diagnostics/pages/DiagnosticsPage.tsx");
    const content = fs.readFileSync(filePath, "utf8");
    expect(content).toContain("zt-metric-card zt-metric-card-error");
    expect(content).toContain("zt-metric-card zt-metric-card-process");
    expect(content).toContain("zt-metric-card zt-metric-card-attention");
    expect(content).toContain("zt-metric-card zt-metric-card-ok");

    // Verificar tokens exactos
    const statusTokensPath = path.resolve(__dirname, "../../../src/styles/status-tokens.css");
    const tokensContent = fs.readFileSync(statusTokensPath, "utf8");
    expect(tokensContent).toContain("--zt-error-bg: #221220;");
    expect(tokensContent).toContain("--zt-error-border: #41182A;");
    expect(tokensContent).toContain("--zt-error-text: #C70036;");

    expect(tokensContent).toContain("--zt-process-bg: #0B162E;");
    expect(tokensContent).toContain("--zt-process-border: #1D3B7A;");
    expect(tokensContent).toContain("--zt-process-text: #3B82F6;");

    expect(tokensContent).toContain("--zt-attention-bg: #1F1A0B;");
    expect(tokensContent).toContain("--zt-attention-border: #4A3510;");
    expect(tokensContent).toContain("--zt-attention-text: #F59E0B;");

    expect(tokensContent).toContain("--zt-ok-bg: #0B1F23;");
    expect(tokensContent).toContain("--zt-ok-border: #0C3631;");
    expect(tokensContent).toContain("--zt-ok-text: #007A55;");
  });

});
