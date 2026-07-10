import React from "react";
import { formatDate, compactId } from "../utils/diagnosticFormatters";

interface SimilarProblemsPanelProps {
  similarProblems: any[];
  problemSignature: string;
}

export const SimilarProblemsPanel: React.FC<SimilarProblemsPanelProps> = ({
  similarProblems,
  problemSignature
}) => {
  return (
    <div className="bg-[var(--zt-bg-surface)] p-5 rounded-2xl border border-[var(--zt-border-subtle)] shadow-sm space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-bold text-[var(--zt-text-primary)] text-sm">Problemas Similares</h4>
        <span className="text-xs bg-[var(--zt-bg-surface-soft)] text-[var(--zt-text-secondary)] px-2 py-0.5 rounded border border-[var(--zt-border-subtle)] font-mono">
          {similarProblems?.length || 0} casos
        </span>
      </div>

      <p className="text-xs text-[var(--zt-text-secondary)] font-mono break-all leading-normal bg-[var(--zt-bg-surface-soft)] p-2 rounded border border-[var(--zt-border-subtle)]">
        Firma: {problemSignature || "Desconocida"}
      </p>

      {(!similarProblems || similarProblems.length === 0) ? (
        <p className="text-xs text-[var(--zt-text-muted)] italic text-center py-4">
          No se encontraron otros incidentes con la misma firma de problema.
        </p>
      ) : (
        <div className="space-y-2.5 divide-y divide-[var(--zt-border-subtle)]">
          {similarProblems.map((prob, idx) => (
            <div key={prob.id || idx} className="text-xs pt-2 first:pt-0 space-y-1">
              <div className="flex justify-between">
                <span className="font-mono text-[var(--zt-accent-secondary)] font-bold">#{prob.ticketReference || prob.folio || "—"}</span>
                <span className="text-[10px] text-[var(--zt-text-muted)]">{formatDate(prob.failedAt)}</span>
              </div>
              <div className="text-[var(--zt-text-secondary)]">
                <span className="font-semibold text-[var(--zt-text-muted)]">Portal:</span> {prob.affectedPortal}
              </div>
              <div className="text-[var(--zt-text-secondary)] truncate" title={prob.plainLanguageProblem}>
                <span className="font-semibold text-[var(--zt-text-muted)]">Detalle:</span> {prob.plainLanguageProblem}
              </div>
              <div className="flex gap-2 text-[10px] pt-0.5">
                <span className="font-mono text-[var(--zt-text-muted)]">ID: {compactId(prob.id)}</span>
                <span className="text-[var(--zt-text-muted)]">|</span>
                <span className="font-mono text-[var(--zt-text-muted)]">Job: {compactId(prob.jobId)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
