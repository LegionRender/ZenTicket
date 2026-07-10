import React, { useState } from "react";

interface DiagnosticActionsProps {
  onRetry: () => Promise<void>;
  onMarkReviewed: (note?: string) => Promise<void>;
  onCreateConnectorTask: () => Promise<void>;
  onProposeFix: () => Promise<void>;
  onArchive: () => Promise<void>;
  actionLoading: string | null;
  actionSuccess: string | null;
  actionError: string | null;
  clearStatus: () => void;
  isReady?: boolean;
  hasXml?: boolean;
  hasPdf?: boolean;
  isLegacyRoot?: boolean;
}

export const DiagnosticActions: React.FC<DiagnosticActionsProps> = ({
  onRetry,
  onMarkReviewed,
  onCreateConnectorTask,
  onProposeFix,
  onArchive,
  actionLoading,
  actionSuccess,
  actionError,
  clearStatus,
  isReady = false,
  hasXml = false,
  hasPdf = false,
  isLegacyRoot = false
}) => {
  const [note, setNote] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);

  const handleMarkReviewedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onMarkReviewed(note);
    setNote("");
    setShowNoteInput(false);
  };

  return (
    <div className="space-y-4">
      {isLegacyRoot ? (
        <div className="space-y-4">
          {actionSuccess && (
            <div className="zt-alert zt-alert-ok flex justify-between items-center py-2.5 px-3">
              <span>{actionSuccess}</span>
              <button onClick={clearStatus} className="zt-btn zt-btn-ghost zt-btn-sm font-bold text-[10px] uppercase hover:underline">Cerrar</button>
            </div>
          )}
          {actionError && (
            <div className="zt-alert zt-alert-error flex justify-between items-center py-2.5 px-3">
              <span>{actionError}</span>
              <button onClick={clearStatus} className="zt-btn zt-btn-ghost zt-btn-sm font-bold text-[10px] uppercase hover:underline">Cerrar</button>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              onClick={onArchive}
              disabled={!!actionLoading}
              className="zt-btn zt-btn-primary text-xs py-2"
            >
              {actionLoading === "archive" ? "Archivando..." : "Archivar lógicamente"}
            </button>

            <button
              onClick={() => alert("Mostrando metadata de la factura raíz (Simulado)...")}
              className="zt-btn zt-btn-secondary text-xs py-2"
            >
              Ver metadata
            </button>
          </div>
        </div>
      ) : (
        <>
          {actionSuccess && (
        <div className="zt-alert zt-alert-ok flex justify-between items-center py-2.5 px-3">
          <span>{actionSuccess}</span>
          <button onClick={clearStatus} className="zt-btn zt-btn-ghost zt-btn-sm font-bold text-[10px] uppercase hover:underline">Cerrar</button>
        </div>
      )}
      {actionError && (
        <div className="zt-alert zt-alert-error flex justify-between items-center py-2.5 px-3">
          <span>{actionError}</span>
          <button onClick={clearStatus} className="zt-btn zt-btn-ghost zt-btn-sm font-bold text-[10px] uppercase hover:underline">Cerrar</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {isReady ? (
          <>
            {/* Success Actions */}
            <button
              disabled={!hasXml}
              onClick={() => alert("Descargando XML (Simulado)...")}
              className="zt-btn zt-btn-primary text-xs py-2"
            >
              Descargar XML
            </button>

            <button
              disabled={!hasPdf}
              onClick={() => alert("Descargando PDF (Simulado)...")}
              className="zt-btn zt-btn-primary text-xs py-2"
            >
              Descargar PDF
            </button>

            <button
              onClick={() => alert("Invoice UUID validada correctamente ante el SAT.")}
              className="zt-btn zt-btn-secondary text-xs py-2"
            >
              Ver metadata invoice
            </button>

            <button
              onClick={onArchive}
              disabled={!!actionLoading}
              className="zt-btn zt-btn-outline text-xs py-2 zt-badge-attention"
            >
              {actionLoading === "archive" ? "Archivando..." : "Archivar diagnóstico"}
            </button>

            <button
              onClick={onCreateConnectorTask}
              disabled={!!actionLoading}
              className="zt-btn zt-btn-secondary text-xs py-2 col-span-1 sm:col-span-2"
            >
              Crear reporte de discrepancia
            </button>
          </>
        ) : (
          <>
            {/* Error Actions */}
            <button
              onClick={onRetry}
              disabled={!!actionLoading}
              className="zt-btn zt-btn-primary text-xs py-2"
            >
              {actionLoading === "retry" ? "Procesando..." : "Reintentar recuperación"}
            </button>

            <button
              onClick={onCreateConnectorTask}
              disabled={!!actionLoading}
              className="zt-btn zt-btn-secondary text-xs py-2"
            >
              {actionLoading === "create-task" ? "Creando..." : "Crear tarea de conector"}
            </button>

            <button
              onClick={onProposeFix}
              disabled={!!actionLoading}
              className="zt-btn zt-btn-outline text-xs py-2"
            >
              {actionLoading === "propose-fix" ? "Analizando..." : "Generar propuesta con Gemini"}
            </button>

            <button
              onClick={onArchive}
              disabled={!!actionLoading}
              className="zt-btn zt-btn-outline text-xs py-2"
            >
              {actionLoading === "archive" ? "Archivando..." : "Archivar diagnóstico"}
            </button>
          </>
        )}

        {!showNoteInput && (
          <button
            onClick={() => setShowNoteInput(true)}
            disabled={!!actionLoading}
            className="zt-btn zt-btn-secondary text-xs py-2 col-span-1 sm:col-span-2"
          >
            Marcar como revisado
          </button>
        )}

        {showNoteInput && (
          <form onSubmit={handleMarkReviewedSubmit} className="col-span-1 sm:col-span-2 space-y-2 border border-[var(--zt-border-subtle)] p-3 rounded-xl bg-[var(--zt-bg-surface-soft)]">
            <label className="zt-label block mb-1">Nota de Revisión</label>
            <input
              type="text"
              placeholder="Ej: Folio corregido por admin, o resuelto."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="zt-input text-xs"
            />
            <div className="flex justify-end gap-2 text-[10px]">
              <button
                type="button"
                onClick={() => {
                  setShowNoteInput(false);
                  setNote("");
                }}
                className="zt-btn zt-btn-ghost text-xs py-1 px-3"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!!actionLoading}
                className="zt-btn zt-btn-primary text-xs py-1 px-3"
              >
                {actionLoading === "mark-reviewed" ? "Guardando..." : "Guardar y marcar"}
              </button>
            </div>
          </form>
        )}
      </div>
      </>
      )}
    </div>
  );
};

