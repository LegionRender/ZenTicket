import React from "react";
import { getDiagnosticTone } from "../utils/diagnosticTone";
import { formatDate, compactId } from "../utils/diagnosticFormatters";
import { getBillingStatusVisual } from "@/shared/billing/billingStatusVisuals";

interface DiagnosticSummaryBoxProps {
  summary: any;
  ticketId: string;
}

export const DiagnosticSummaryBox: React.FC<DiagnosticSummaryBoxProps> = ({
  summary,
  ticketId
}) => {
  if (!summary) return null;

  const isReady = summary.bucket === "ready";
  const toneStyle = getDiagnosticTone(isReady ? "info" : summary.severity);

  if (isReady) {
    return (
      <div className="zt-card space-y-4">
        <div className="flex justify-between items-start pb-3 border-b border-[var(--zt-border-subtle)]">
          <div>
            <h4 className="zt-title-card text-[var(--zt-ok-text)]">Factura Validada Exitosamente</h4>
            <p className="zt-caption font-bold tracking-wider uppercase mt-0.5">CFDI Procesado sin incidencias</p>
          </div>
          <span className="zt-badge zt-badge-ok">
            Listo
          </span>
        </div>

        <div className="zt-alert zt-alert-ok p-3.5">
          La factura fue generada y validada correctamente ante el SAT.
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <span className="zt-label block">Portal de Destino</span>
            <span className="zt-body font-bold block">{summary.affectedPortal || "Desconocido"}</span>
          </div>
          <div>
            <span className="zt-label block">Ticket Referencia</span>
            <span className="zt-mono text-[var(--zt-accent-secondary)] font-bold block">#{summary.ticketReference || "—"}</span>
          </div>
          <div>
            <span className="zt-label block">Invoice ID</span>
            <span className="zt-mono block">{compactId(summary.invoiceId) || "—"}</span>
          </div>
          <div>
            <span className="zt-label block">UUID Parcial</span>
            <span className="zt-mono block">{summary.uuid ? compactId(summary.uuid) : "—"}</span>
          </div>
          <div>
            <span className="zt-label block">SAT Status</span>
            <span className="zt-body block">{summary.satStatus || "S/D"}</span>
          </div>
          <div>
            <span className="zt-label block">Validation Status</span>
            <span className="zt-body block">{summary.validationStatus || "S/D"}</span>
          </div>
          <div>
            <span className="zt-label block">Monto Total</span>
            <span className="zt-body font-bold block">${summary.total ?? "0.00"}</span>
          </div>
          <div>
            <span className="zt-label block">Fecha Validación</span>
            <span className="zt-body block">{summary.validationDate ? formatDate(summary.validationDate) : "—"}</span>
          </div>
          <div>
            <span className="zt-label block">Archivos Disponibles</span>
            <span className="zt-body block">
              XML: {summary.hasXml ? "Sí" : "No"} | PDF: {summary.hasPdf ? "Sí" : "No"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Resolve dynamic alert & badge classes using global visual helper
  const visual = getBillingStatusVisual(
    summary.bucket || summary.status || (summary.severity === "critical" ? "failed" : "attention")
  );
  const alertClass = visual.alertClassName;
  const badgeClass = visual.badgeClassName;

  return (
    <div className="zt-card space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="zt-title-card">Resumen del Incidente</h4>
          <p className="zt-mono block mt-0.5">Firma: {summary.problemSignature}</p>
        </div>
        <span className={`zt-badge ${badgeClass}`}>
          {summary.severity === "critical" ? "Error" : summary.severity === "warning" ? "Atención" : summary.severity === "info" ? "En proceso" : summary.severity}
        </span>
      </div>

      <div className={`zt-alert ${alertClass} p-3`}>
        {summary.plainLanguageProblem || "No hay un resumen textual descriptivo disponible para este problema."}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <span className="zt-label block">Portal de Destino</span>
          <span className="zt-body font-bold block">{summary.affectedPortal || "Desconocido"}</span>
        </div>
        <div>
          <span className="zt-label block">Ticket Referencia</span>
          <span className="zt-mono text-[var(--zt-accent-secondary)] font-bold block">#{summary.ticketReference || "—"}</span>
        </div>
        <div>
          <span className="zt-label block">Ticket ID (Interno)</span>
          <span className="zt-mono block">{compactId(summary.ticketId || ticketId)}</span>
        </div>
        <div>
          <span className="zt-label block">Job ID</span>
          <span className="zt-mono block">{compactId(summary.jobId) || "—"}</span>
        </div>
      </div>

      {summary.suggestedAction && (
        <div className="border-t border-[var(--zt-border-subtle)] pt-2.5">
          <span className="zt-label block mb-1">Acción Sugerida</span>
          <p className="zt-body text-[var(--zt-text-secondary)] bg-[var(--zt-bg-surface-soft)] p-2.5 rounded-xl border border-[var(--zt-border-subtle)]">
            {summary.suggestedAction}
          </p>
        </div>
      )}
    </div>
  );
};
