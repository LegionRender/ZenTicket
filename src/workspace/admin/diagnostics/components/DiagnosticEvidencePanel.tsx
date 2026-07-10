import React from "react";
import { AlertTriangle } from "lucide-react";

interface DiagnosticEvidencePanelProps {
  portalSnapshot: any;
  normalizedFields: any;
  jobSnapshot: any;
  ticketSnapshot: any;
}

export const DiagnosticEvidencePanel: React.FC<DiagnosticEvidencePanelProps> = ({
  portalSnapshot,
  normalizedFields,
  jobSnapshot,
  ticketSnapshot
}) => {
  const hasLowConfidenceDate = 
    normalizedFields?.fechaCompraSource?.includes("createdAt") || 
    normalizedFields?.fechaCompraSource?.includes("updatedAt") ||
    normalizedFields?.fechaCompraSource?.includes("low confidence");

  return (
    <div className="zt-card space-y-4">
      <h4 className="zt-title-card">Evidencia y Datos Técnicos</h4>

      {/* Warning for low confidence date */}
      {hasLowConfidenceDate && (
        <div className="zt-alert zt-alert-attention flex flex-col items-start gap-1">
          <span className="font-bold flex items-center gap-1.5 mb-0.5">
            <AlertTriangle className="w-4 h-4 text-[var(--zt-alert-text)] shrink-0" />
            <span>Advertencia de Fecha de Compra</span>
          </span>
          <span>La fecha usada proviene de un fallback de baja confianza ({normalizedFields.fechaCompraSource}). Revisar manualmente la fecha del ticket.</span>
        </div>
      )}

      {/* Normalized fields section */}
      {normalizedFields && (
        <div className="space-y-2">
          <h5 className="zt-label uppercase tracking-wider block">Campos Normalizados</h5>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-[var(--zt-bg-surface)] p-3 rounded-2xl border border-[var(--zt-border-subtle)]">
            <div>
              <span className="zt-caption block">Folio</span>
              <span className="zt-mono font-semibold block">{normalizedFields.folio || "—"}</span>
            </div>
            <div>
              <span className="zt-caption block">ITU</span>
              <span className="zt-mono font-semibold block">{normalizedFields.itu || "—"}</span>
            </div>
            <div>
              <span className="zt-caption block">Total</span>
              <span className="zt-body font-semibold block">{normalizedFields.total ? `$${normalizedFields.total.toFixed(2)}` : "—"}</span>
            </div>
            <div>
              <span className="zt-caption block">Fecha de Compra</span>
              <span className="zt-body font-semibold block">{normalizedFields.fechaCompra || "—"}</span>
            </div>
            <div>
              <span className="zt-caption block">Origen de Fecha</span>
              <span className="zt-mono text-[10px] font-semibold block">{normalizedFields.fechaCompraSource || "Desconocido"}</span>
            </div>
            <div>
              <span className="zt-caption block">RFC Receptor</span>
              <span className="zt-mono font-semibold block">{normalizedFields.rfcReceptorMasked || "—"}</span>
            </div>
            <div className="col-span-2">
              <span className="zt-caption block">Correo Receptor</span>
              <span className="zt-mono font-semibold block">{normalizedFields.emailMasked || "—"}</span>
            </div>
          </div>

          {/* Date candidates section */}
          {normalizedFields.rawDateCandidates && (
            <div className="pt-2 space-y-1">
              <span className="zt-label uppercase block">Candidatos de fecha detectados</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-[var(--zt-bg-surface)] p-2.5 rounded-2xl border border-[var(--zt-border-subtle)] font-mono text-xs">
                <div>
                  <span className="zt-muted">portalFieldsFecha:</span> {normalizedFields.rawDateCandidates.portalFieldsFecha || "—"}
                </div>
                <div>
                  <span className="zt-muted">purchaseDate:</span> {normalizedFields.rawDateCandidates.purchaseDate || "—"}
                </div>
                <div>
                  <span className="zt-muted">ticketDate:</span> {normalizedFields.rawDateCandidates.ticketDate || "—"}
                </div>
                <div>
                  <span className="zt-muted">createdAt:</span> {normalizedFields.rawDateCandidates.createdAt || "—"}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Portal page snapshot */}
      {portalSnapshot && (
        <div className="space-y-2 pt-2">
          <h5 className="zt-label uppercase tracking-wider block">Evidencia del Portal</h5>
          <div className="space-y-3 bg-[var(--zt-bg-surface)] text-[var(--zt-text-secondary)] p-3 rounded-2xl border border-[var(--zt-border-subtle)] font-mono text-xs max-h-72 overflow-y-auto">
            {portalSnapshot.currentUrlSanitized && (
              <div>
                <span className="text-[var(--zt-text-muted)] font-sans font-semibold">URL del Portal:</span>
                <div className="text-[var(--zt-accent-secondary)] break-all select-all">{portalSnapshot.currentUrlSanitized}</div>
              </div>
            )}
            
            {portalSnapshot.visibleText && (
              <div>
                <span className="text-[var(--zt-text-muted)] font-sans font-semibold">Texto Visible en Pantalla:</span>
                <p className="bg-[var(--zt-bg-surface-soft)] p-2 rounded-xl text-[var(--zt-text-primary)] whitespace-pre-wrap max-h-24 overflow-y-auto mt-1 border border-[var(--zt-border-subtle)]">
                  {portalSnapshot.visibleText}
                </p>
              </div>
            )}

            {portalSnapshot.portalMessages && portalSnapshot.portalMessages.length > 0 && (
              <div>
                <span className="text-[var(--zt-text-muted)] font-sans font-semibold">Mensajes Extraídos:</span>
                <ul className="list-disc pl-4 space-y-0.5 mt-1">
                  {portalSnapshot.portalMessages.map((msg: string, i: number) => (
                    <li key={i} className="text-[var(--zt-error-text)]">{msg}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-[10px]">
              <div>
                <span className="text-[var(--zt-text-muted)] font-sans font-semibold block">Botones Detectados</span>
                <div className="bg-[var(--zt-bg-surface-soft)] p-1.5 rounded-lg mt-0.5 max-h-16 overflow-y-auto border border-[var(--zt-border-subtle)]">
                  {portalSnapshot.buttonsDetected?.join(", ") || "Ninguno"}
                </div>
              </div>
              <div>
                <span className="text-[var(--zt-text-muted)] font-sans font-semibold block">Campos Detectados</span>
                <div className="bg-[var(--zt-bg-surface-soft)] p-1.5 rounded-lg mt-0.5 max-h-16 overflow-y-auto border border-[var(--zt-border-subtle)]">
                  {portalSnapshot.inputsDetected?.join(", ") || "Ninguno"}
                </div>
              </div>
              <div>
                <span className="text-[var(--zt-text-muted)] font-sans font-semibold block">Formularios Detectados</span>
                <div className="bg-[var(--zt-bg-surface-soft)] p-1.5 rounded-lg mt-0.5 max-h-16 overflow-y-auto border border-[var(--zt-border-subtle)]">
                  {portalSnapshot.formsDetected?.join(", ") || "Ninguno"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recovery stats */}
      {ticketSnapshot && (
        <div className="grid grid-cols-2 gap-3 border-t border-[var(--zt-border-subtle)] pt-3">
          <div>
            <span className="zt-caption block">Reintentos de Recuperación</span>
            <span className="zt-body font-bold block">
              {ticketSnapshot.recoveryAttemptCount || 0} / {jobSnapshot?.maxRecoveryAttempts || 3}
            </span>
          </div>
          {ticketSnapshot.status && (
            <div>
              <span className="zt-caption block">Estado Final del Ticket</span>
              <span className="zt-badge zt-badge-archived font-mono text-[10px] block mt-0.5">
                {ticketSnapshot.status}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
