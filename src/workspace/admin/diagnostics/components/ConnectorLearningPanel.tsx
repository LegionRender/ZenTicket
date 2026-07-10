import React, { useEffect, useState } from "react";
import { diagnosticsApi } from "../services/diagnosticsApi";

interface Proposal {
  proposalId: string;
  connectorId: string;
  problemSignature: string;
  affectedPortal: string;
  stoppedAtStage: string;
  summary: string;
  plainLanguageProblem: string;
  status: "pending_review" | "rejected" | "approved_for_sandbox" | "approved_for_observation" | "active" | "superseded";
  confidence: number;
  riskLevel: "low" | "medium" | "high";
  createdAt: string;
}

interface ConnectorLearningPanelProps {
  connectorId: string;
  problemSignature: string;
  portal: string;
  failedStage: string;
}

export const ConnectorLearningPanel: React.FC<ConnectorLearningPanelProps> = ({
  connectorId,
  problemSignature,
  portal,
  failedStage
}) => {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const list = await diagnosticsApi.listProposals(connectorId);
        if (active) {
          setProposals(list || []);
        }
      } catch (err) {
        console.error("Error loading learning proposals:", err);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [connectorId]);

  // Filter proposals by problem signature
  const matchingProposals = proposals.filter(
    p => p.problemSignature === problemSignature
  );

  const totalOccurrences = matchingProposals.length;

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "active": return "zt-badge-ok";
      case "approved_for_sandbox": return "zt-badge-process";
      case "approved_for_observation": return "zt-badge-attention";
      case "rejected": return "zt-badge-error";
      default: return "zt-badge-secondary";
    }
  };

  return (
    <div className="bg-[var(--zt-bg-surface)] p-5 rounded-2xl border border-[var(--zt-border-subtle)] shadow-sm space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h4 className="font-bold text-[var(--zt-text-primary)] text-sm">Biblioteca de Aprendizaje JIT</h4>
          <span className="text-[10px] text-[var(--zt-text-muted)] font-mono uppercase">
            Connector: {connectorId} | Portal: {portal}
          </span>
        </div>
        {totalOccurrences > 0 && (
          <span className="bg-[var(--zt-bg-surface-soft)] text-[var(--zt-accent-secondary)] text-[10px] font-bold px-2 py-1 rounded-md border border-[var(--zt-border-subtle)]">
            Este problema apareció {totalOccurrences} {totalOccurrences === 1 ? "vez" : "veces"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-6">
          <div className="w-5 h-5 border-2 border-[var(--zt-accent-secondary)] border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : matchingProposals.length === 0 ? (
        <div className="text-xs text-[var(--zt-text-muted)] italic text-center py-4 bg-[var(--zt-bg-surface-soft)] rounded-xl border border-dashed border-[var(--zt-border-subtle)]">
          No hay propuestas de parches JIT registradas para esta firma de error.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs font-semibold text-[var(--zt-text-secondary)]">Historial de parches asociados a esta firma:</div>
          <div className="space-y-2">
            {matchingProposals.map((p) => (
              <div key={p.proposalId} className="bg-[var(--zt-bg-surface-soft)] border border-[var(--zt-border-subtle)] rounded-xl p-3.5 space-y-2 text-xs">
                <div className="flex justify-between items-start">
                  <span className="font-bold text-[var(--zt-text-primary)] truncate max-w-[70%]">
                    {p.summary}
                  </span>
                  <span className={`zt-badge ${getStatusBadgeClass(p.status)} text-[8px] uppercase px-1.5 py-0.5`}>
                    {p.status.replace("_", " ")}
                  </span>
                </div>
                <p className="text-[var(--zt-text-secondary)] leading-relaxed">
                  {p.plainLanguageProblem}
                </p>
                <div className="flex justify-between items-center text-[10px] text-[var(--zt-text-muted)] pt-1 border-t border-[var(--zt-border-subtle)]">
                  <span>Confianza: {(p.confidence * 100).toFixed(0)}%</span>
                  <span>Riesgo: {p.riskLevel}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
