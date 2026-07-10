import React, { useState, useEffect } from "react";
import { compactId, formatDate } from "../utils/diagnosticFormatters";
import { ConnectorLearningPanel } from "./ConnectorLearningPanel";
import { getStatusLabelAndDot } from "./DiagnosticsTable";
import { getBillingStatusVisual } from "@/shared/billing/billingStatusVisuals";
import { diagnosticsApi } from "../services/diagnosticsApi";
import { 
  X, ShieldAlert, Check, AlertTriangle, AlertOctagon, CheckCircle, 
  Sparkles, Archive, ChevronDown, ChevronUp, FileText, Terminal, 
  Image, AlertCircle, Eye, HelpCircle, Play, Info
} from "lucide-react";

interface DiagnosticDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  detail: any | null;
  proposal?: any | null;
  ticketId: string | null;
  actionLoading: string | null;
  actionSuccess: string | null;
  actionError: string | null;
  clearActionStatus: () => void;
  onRetry: () => Promise<void>;
  onMarkReviewed: (note?: string) => Promise<void>;
  onCreateConnectorTask: () => Promise<void>;
  onProposeFix: () => Promise<void>;
  onArchive: (reason: string, comment?: string) => Promise<void>;
  onApproveProposalSandbox: (proposalId: string) => Promise<void>;
  onRejectProposal: (proposalId: string) => Promise<void>;
  onRequestRevision?: (proposalId: string, comment: string) => Promise<void>;
}

const mapStageToSpanish = (stage: string | null | undefined): string => {
  if (!stage) return "Inicio del proceso";
  const mapping: { [key: string]: string } = {
    ticket_created: "Ticket Creado en Sistema",
    job_lock: "Reserva del Trabajo de Automatización",
    connector_load: "Carga del Conector del Portal",
    portal_navigate: "Navegación al Portal de Facturación",
    search_ticket: "Búsqueda del Ticket en el Portal",
    fill_billing_data: "Llenado del Formulario de Facturación",
    cfdi_generation: "Generación del CFDI",
    cfdi_validation: "Validación de Estructura de CFDI",
    sat_validation: "Verificación del Comprobante ante el SAT",
    xml_download: "Descarga del Archivo XML",
    pdf_download: "Descarga de la Representación Impresa (PDF)",
    manual_review_required: "Revisión Manual Solicitada",
    automation_failed: "Fallo en el Flujo del Runner",
    failed_blocking: "Bloqueo Crítico detectado",
    completed: "Completado exitosamente"
  };
  return mapping[stage] || stage;
};

const renderEvidenceValueCard = (title: string, evVal: any, isCode: boolean = false) => {
  if (!evVal || !evVal.value || evVal.value.trim() === "" || evVal.value.toLowerCase() === "unknown") {
    return (
      <div className="space-y-0.5">
        <span className="zt-caption block">{title}:</span>
        <span className="italic text-[var(--zt-text-muted)] text-[11px] block">No registrado por el runner</span>
      </div>
    );
  }

  const sourceLabels: { [key: string]: string } = {
    runner_event: "Evento del runner",
    playwright_error: "Error de Playwright",
    portal_dom: "DOM del portal",
    deterministic_classifier: "Clasificador determinista",
    gemini_analysis: "Hipótesis de Gemini"
  };

  return (
    <div className="space-y-1">
      <span className="zt-caption block">{title}:</span>
      <div className="space-y-0.5">
        <span className={isCode ? "font-mono bg-[var(--zt-bg-surface)] border border-[var(--zt-border-subtle)] px-1.5 py-0.5 rounded text-[11px] text-[var(--zt-text-primary)] block w-fit" : "font-semibold text-[var(--zt-text-primary)] text-xs block"}>
          {evVal.value}
        </span>
        <div className="flex items-center gap-1.5 text-[9px] text-[var(--zt-text-muted)] font-sans">
          <span>Origen: {sourceLabels[evVal.source] || evVal.source}</span>
          {evVal.capturedAt && (
            <>
              <span>•</span>
              <span>{new Date(evVal.capturedAt).toLocaleTimeString()}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const DiagnosticDetailDrawer: React.FC<DiagnosticDetailDrawerProps> = ({
  isOpen,
  onClose,
  loading,
  error,
  detail,
  proposal,
  ticketId,
  actionLoading,
  actionSuccess,
  actionError,
  clearActionStatus,
  onMarkReviewed,
  onProposeFix,
  onArchive,
  onApproveProposalSandbox,
  onRejectProposal,
  onRequestRevision
}) => {
  const [isTechnicalOpen, setIsTechnicalOpen] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveComment, setArchiveComment] = useState("");
  const [viewerTab, setViewerTab] = useState<"screenshot" | "timeline" | "messages" | "dom" | "errors">("screenshot");
  const [revisionComment, setRevisionComment] = useState("");
  const [isRevisionOpen, setIsRevisionOpen] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [loadingScreenshot, setLoadingScreenshot] = useState(false);

  const handleRequestRevisionConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onRequestRevision && proposal && revisionComment.trim()) {
      await onRequestRevision(proposal.proposalId, revisionComment);
      setIsRevisionOpen(false);
      setRevisionComment("");
    }
  };

  useEffect(() => {
    if (isOpen && ticketId) {
      setScreenshotUrl(null);
      setScreenshotError(null);
      const hasScreenshot = detail?.evidence?.screenshot?.storagePath || 
                            detail?.jobSnapshot?.evidenceScreenshotPath || 
                            detail?.jobSnapshot?.portalSnapshot?.screenshotPath;
      if (hasScreenshot) {
        setLoadingScreenshot(true);
        diagnosticsApi.getScreenshotUrl(ticketId)
          .then(url => {
            setScreenshotUrl(url);
          })
          .catch(err => {
            console.error("Error loading screenshot:", err);
            setScreenshotError("La captura no se pudo cargar desde Storage o no existe.");
          })
          .finally(() => {
            setLoadingScreenshot(false);
          });
      }
    }
  }, [isOpen, ticketId, detail]);

  if (!isOpen) return null;

  const summary = detail?.summary;
  const isReady = summary?.bucket === "ready";
  const statusInfo = summary ? getStatusLabelAndDot(summary) : null;
  const isLegacy = summary?.legacyRootInvoice === true;

  // Resolve dynamic alert class from global helper
  const alertClass = summary
    ? getBillingStatusVisual(summary.bucket || summary.canonicalStatus || summary.status || "").alertClassName
    : "zt-alert-attention";

  const handleArchiveConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archiveReason) return;
    await onArchive(archiveReason, archiveComment);
    setIsArchiveOpen(false);
    setArchiveReason("");
    setArchiveComment("");
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[rgba(0,0,0,0.45)] backdrop-blur-xs transition-opacity animate-fade-in" onClick={onClose}></div>

      {/* Drawer Container */}
      <div className="relative w-full max-w-2xl zt-drawer h-full shadow-2xl flex flex-col z-10 animate-slide-in">
        
        {/* Header */}
        <div className="zt-drawer-header shrink-0">
          <div>
            <h3 className="zt-drawer-title">Centro de Resolución de Incidencias</h3>
            <p className="zt-page-subtitle font-mono mt-0.5">Ticket: #{summary?.ticketReference || ticketId}</p>
          </div>
          <button
            onClick={onClose}
            className="zt-btn zt-btn-ghost p-1.5 font-bold flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <div className="w-8 h-8 border-2 border-[var(--zt-accent-secondary)] border-t-transparent rounded-full animate-spin"></div>
              <span className="zt-caption font-medium">Analizando datos del runner...</span>
            </div>
          )}

          {error && (
            <div className="zt-alert zt-alert-error text-center block">
              <span className="font-bold flex items-center justify-center gap-1 mb-1">
                <ShieldAlert className="w-4 h-4 text-[var(--zt-error-text)]" />
                <span>Error al cargar diagnóstico</span>
              </span>
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && detail && (
            <div className="space-y-6">
              
              {/* Alert banner for feedback messages */}
              {actionError && (
                <div className="zt-alert zt-alert-error flex justify-between items-start">
                  <span>{actionError}</span>
                  <button onClick={clearActionStatus} className="text-xs font-bold underline ml-2">Cerrar</button>
                </div>
              )}
              {actionSuccess && (
                <div className="zt-alert zt-alert-ok flex justify-between items-start">
                  <span>{actionSuccess}</span>
                  <button onClick={clearActionStatus} className="text-xs font-bold underline ml-2">Cerrar</button>
                </div>
              )}

              {detail.summary.isDuplicate && (
                <div className="zt-alert zt-alert-attention p-4 leading-relaxed block rounded-2xl">
                  <span className="font-bold block mb-1">⚠️ Ticket Duplicado Detectado</span>
                  Este ticket es un duplicado del folio #{detail.summary.ticketReference}. Para facilitar la resolución, se están mostrando de forma ampliada los datos de diagnóstico del ticket hermano activo <span className="font-mono bg-[rgba(0,0,0,0.05)] px-1.5 py-0.5 rounded text-xs font-semibold">{detail.summary.siblingTicketId}</span>.
                </div>
              )}

              {isLegacy ? (
                /* Legacy Root view description */
                <div className="zt-alert zt-alert-attention p-4 leading-relaxed block rounded-2xl">
                  <span className="font-bold block mb-1">Registro de Factura Raíz Huérfana (Legacy)</span>
                  Este diagnóstico representa una factura guardada en la colección raíz global <span className="font-mono bg-[rgba(0,0,0,0.05)] px-1 rounded">invoices/</span> asociada a un ticket que fue eliminado. Este registro se conserva únicamente para fines de auditoría y no afecta las métricas activas de los usuarios.
                </div>
              ) : (
                /* 1. NATURAL LANGUAGE ANALYSIS SECTION */
                <div className="space-y-4">
                  <div className="border border-[var(--zt-border-subtle)] bg-[var(--zt-bg-surface-soft)] rounded-2xl p-4.5 space-y-4">
                    <div className="flex justify-between items-start pb-2 border-b border-[var(--zt-border-subtle)]">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--zt-text-primary)]">
                        Análisis del Incidente en Lenguaje Natural
                      </h4>
                      <span className={`zt-badge ${statusInfo?.dotClass ? "bg-red-500/10 text-red-500" : "bg-gray-500/10 text-gray-500"} text-[9px] font-extrabold uppercase px-2 py-0.5 rounded`}>
                        {summary.canonicalStatus}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      {renderEvidenceValueCard("Dónde se detuvo la automatización", detail.evidence?.failureStage)}
                      {renderEvidenceValueCard("Último paso completado", detail.evidence?.lastCompletedAction)}
                      {renderEvidenceValueCard("Acción que estaba intentando ejecutar", detail.evidence?.attemptedAction, true)}
                      <div>
                        <span className="zt-caption block mb-1">Causa probable del bloqueo:</span>
                        <span className="font-semibold text-[var(--zt-error-text)] text-xs block">
                          {summary.blockCause || "Desconocida"}
                        </span>
                        <span className="block text-[9px] text-[var(--zt-text-muted)] font-sans mt-0.5">
                          Origen: Clasificador determinista del backend
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2 border-t border-[var(--zt-border-subtle)] text-xs">
                      {renderEvidenceValueCard("Qué esperaba encontrar", detail.evidence?.expectedCondition)}
                      <div>
                        <span className="zt-caption block mb-0.5">Qué encontró realmente:</span>
                        {detail.evidence?.observedCondition ? (
                          <div className="space-y-1">
                            <p className="font-medium text-[var(--zt-text-primary)] bg-[var(--zt-bg-surface)] border border-[var(--zt-border-subtle)] p-2.5 rounded-xl max-h-24 overflow-y-auto leading-relaxed text-xs">
                              {detail.evidence.observedCondition.value}
                            </p>
                            <div className="flex items-center gap-1.5 text-[9px] text-[var(--zt-text-muted)] font-sans">
                              <span>Origen: {detail.evidence.observedCondition.source === "portal_dom" ? "DOM del portal" : "Error de Playwright"}</span>
                              {detail.evidence.observedCondition.capturedAt && (
                                <>
                                  <span>•</span>
                                  <span>{new Date(detail.evidence.observedCondition.capturedAt).toLocaleTimeString()}</span>
                                </>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="italic text-[var(--zt-text-muted)] text-[11px] block">No registrado por el runner</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 2. CENTRAL VISUAL EVIDENCE SECTION */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="zt-label uppercase tracking-wider block">Evidencia Visual del Fallo</span>
                      <button
                        onClick={() => {
                          setViewerTab("screenshot");
                          setIsViewerOpen(true);
                        }}
                        className="text-[11px] font-bold text-[var(--zt-accent-secondary)] flex items-center gap-1 hover:underline"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Ver evidencia técnica completa</span>
                      </button>
                    </div>

                    {loadingScreenshot ? (
                      <div className="border border-[var(--zt-border-subtle)] bg-[var(--zt-bg-surface-soft)] rounded-2xl p-8 text-center text-xs text-[var(--zt-text-secondary)] space-y-2 aspect-video flex flex-col items-center justify-center">
                        <div className="w-6 h-6 border-2 border-[var(--zt-accent-secondary)] border-t-transparent rounded-full animate-spin"></div>
                        <p className="font-bold">Cargando captura segura...</p>
                      </div>
                    ) : screenshotUrl ? (
                      <div className="relative group rounded-2xl overflow-hidden border border-[var(--zt-border-subtle)] bg-[var(--zt-bg-surface-soft)] aspect-video flex items-center justify-center">
                        <img
                          src={screenshotUrl}
                          alt="Captura del fallo en portal"
                          className="w-full h-full object-contain cursor-pointer transition-all group-hover:brightness-95"
                          onClick={() => {
                            setViewerTab("screenshot");
                            setIsViewerOpen(true);
                          }}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all cursor-pointer" onClick={() => {
                          setViewerTab("screenshot");
                          setIsViewerOpen(true);
                        }}>
                          <span className="bg-[var(--zt-bg-surface)] border border-[var(--zt-border-default)] text-[var(--zt-text-primary)] text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                            <Eye className="w-4 h-4" /> Ampliar Captura
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-[var(--zt-border-subtle)] bg-[var(--zt-bg-surface-soft)] rounded-2xl p-8 text-center text-xs text-[var(--zt-text-muted)] space-y-1.5">
                        <Image className="w-6 h-6 mx-auto opacity-50" />
                        <p className="font-bold">Evidencia visual no disponible</p>
                        <p className="text-[10px] max-w-xs mx-auto">
                          {screenshotError || "El navegador del runner se cerró abruptamente o el portal denegó el acceso antes de tomar la captura de pantalla."}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 3. PRIMARY RESOLUTION ACTIONS SECTION */}
              <div className="bg-[var(--zt-bg-surface-soft)] border border-[var(--zt-border-subtle)] p-4.5 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--zt-text-primary)]">
                  Acciones de Resolución
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={onProposeFix}
                    disabled={!!actionLoading}
                    className="zt-btn zt-btn-primary py-2.5 flex items-center justify-center gap-2"
                  >
                    {actionLoading === "propose-fix" ? (
                      <>
                        <div className="w-4 h-4 border-2 border-[var(--zt-bg-surface)] border-t-transparent rounded-full animate-spin"></div>
                        <span>Generando propuesta...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Resolver con Gemini</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => setIsArchiveOpen(true)}
                    disabled={!!actionLoading}
                    className="zt-btn zt-btn-outline py-2.5 flex items-center justify-center gap-2 text-amber-600 border-amber-600/35 hover:bg-amber-50"
                  >
                    <Archive className="w-4 h-4" />
                    <span>Archivar Diagnóstico</span>
                  </button>
                </div>
              </div>

              {/* Gemini loading state indicator */}
              {actionLoading === "propose-fix" && (
                <div className="bg-[var(--zt-bg-surface-soft)] border border-dashed border-[var(--zt-border-subtle)] p-6 rounded-2xl text-center text-xs text-[var(--zt-text-secondary)] space-y-2 animate-pulse">
                  <Sparkles className="w-5 h-5 text-[var(--zt-accent-secondary)] mx-auto animate-spin" />
                  <p className="font-bold">Gemini está analizando la incidencia de facturación...</p>
                  <p className="text-[10px] text-[var(--zt-text-muted)] max-w-sm mx-auto">
                    La IA está consultando el portal, traduciendo el error técnico a lenguaje natural y estructurando un plan de parche para el conector.
                  </p>
                </div>
              )}

              {/* 4. GEMINI GENERATED PROPOSAL DISPLAY */}
              {proposal && actionLoading !== "propose-fix" && (
                <div className="border border-[var(--zt-border-subtle)] bg-[var(--zt-bg-surface-soft)] rounded-2xl p-4.5 space-y-4 animate-fade-in">
                  <div className="flex justify-between items-center pb-2 border-b border-[var(--zt-border-subtle)]">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--zt-text-primary)] flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[var(--zt-accent-secondary)]" />
                      Hipótesis de Gemini (Análisis de IA)
                    </h4>
                    <span className={`zt-badge ${
                      proposal.status === "pending_review" ? "zt-badge-attention" :
                      proposal.status === "approved_for_sandbox" ? "zt-badge-ok bg-green-500/10 text-green-500" :
                      proposal.status === "rejected" ? "bg-red-500/10 text-red-500" :
                      proposal.status === "superseded" ? "bg-gray-500/10 text-gray-500" :
                      "bg-amber-500/10 text-amber-500"
                    } text-[9px] uppercase font-extrabold px-2 py-0.5 rounded`}>
                      {proposal.status === "pending_review" ? "Revisión Pendiente" :
                       proposal.status === "approved_for_sandbox" ? "Aprobada para Sandbox" :
                       proposal.status === "rejected" ? "Rechazada" :
                       proposal.status === "superseded" ? "Reemplazada" :
                       proposal.status === "revision_requested" ? "Revisión Solicitada" :
                       proposal.status}
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <span className="zt-caption block mb-1">Qué ocurrió:</span>
                      <p className="text-xs text-[var(--zt-text-primary)] font-medium leading-relaxed">
                        {proposal.plainLanguageProblem || proposal.summary}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="zt-caption block mb-0.5">Causa probable:</span>
                        <span className="zt-body font-semibold">{proposal.likelyCause || "unknown"}</span>
                      </div>
                      <div>
                        <span className="zt-caption block mb-0.5">Tipo de cambio:</span>
                        <span className="zt-body font-semibold capitalize">
                          {proposal.proposedConnectorChanges?.type === "jit_learning_rule" ? "Motor JIT General" : "Conector Específico"}
                        </span>
                      </div>
                      <div>
                        <span className="zt-caption block mb-0.5">Confianza AI:</span>
                        <span className="zt-body font-semibold">{(proposal.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <div>
                        <span className="zt-caption block mb-0.5">Nivel de riesgo:</span>
                        <span className="zt-body font-semibold capitalize">{proposal.proposedConnectorChanges?.riskLevel || "low"}</span>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs border-t border-b border-[var(--zt-border-subtle)] py-2.5">
                      <div>
                        <span className="zt-caption block">Evidencia utilizada:</span>
                        <p className="text-[11px] text-[var(--zt-text-secondary)] leading-relaxed mt-0.5">
                          Timeline de ejecución, errores técnicos del DOM sanitizado y metadatos del conector. (Nota: Gemini no tiene acceso visual a capturas de pantalla).
                        </p>
                      </div>
                      <div>
                        <span className="zt-caption block">Limitaciones del análisis:</span>
                        <p className="text-[11px] text-[var(--zt-text-muted)] leading-relaxed mt-0.5">
                          Análisis estático basado en el estado final al fallar. Cambios dinámicos posteriores del portal en producción no son observados.
                        </p>
                      </div>
                    </div>

                    <div>
                      <span className="zt-caption block mb-1">Opciones de solución:</span>
                      <p className="text-xs text-[var(--zt-text-secondary)] leading-relaxed">
                        {proposal.suggestedFix}
                      </p>
                    </div>

                    {proposal.proposedConnectorChanges && (
                      <div className="bg-[var(--zt-bg-surface)] border border-[var(--zt-border-subtle)] rounded-xl p-3.5 space-y-2 text-xs">
                        <div className="font-semibold text-[var(--zt-text-primary)]">Modificación Propuesta</div>
                        <div>
                          <span className="zt-caption">Conector ID:</span> <span className="font-mono bg-[var(--zt-bg-surface-soft)] px-1 py-0.5 rounded">{proposal.proposedConnectorChanges.connectorId}</span>
                        </div>
                        <div>
                          <span className="zt-caption">Descripción del cambio:</span> <p className="mt-0.5 text-[var(--zt-text-secondary)] leading-relaxed">{proposal.proposedConnectorChanges.description}</p>
                        </div>
                        {proposal.proposedConnectorChanges.testPlan && proposal.proposedConnectorChanges.testPlan.length > 0 && (
                          <div>
                            <span className="zt-caption block mb-1">Cómo probar en Sandbox:</span>
                            <ul className="list-disc pl-4 space-y-0.5 text-[var(--zt-text-secondary)]">
                              {proposal.proposedConnectorChanges.testPlan.map((step: string, i: number) => (
                                <li key={i}>{step}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {proposal.recoveryFlowProposal?.steps && proposal.recoveryFlowProposal.steps.length > 0 && (
                      <div className="bg-[var(--zt-bg-surface)] border border-[var(--zt-border-subtle)] rounded-xl p-3.5 space-y-2 text-xs">
                        <div className="font-semibold text-[var(--zt-text-primary)]">Flujo de Recuperación Sugerido</div>
                        <div className="space-y-1.5">
                          {proposal.recoveryFlowProposal.steps.map((step: any, idx: number) => (
                            <div key={idx} className="flex gap-2 items-start text-xs border-b border-[var(--zt-border-subtle)] pb-1.5 last:border-0 last:pb-0">
                              <span className="font-bold text-[var(--zt-accent-secondary)] w-4 text-right shrink-0">{idx + 1}.</span>
                              <div className="space-y-0.5">
                                <div>
                                  <span className="font-semibold capitalize text-[var(--zt-text-primary)]">{step.action}</span>
                                  {step.target && <span className="text-[var(--zt-text-muted)]"> en </span>}
                                  <span className="font-mono bg-[var(--zt-bg-surface-soft)] px-1 rounded">{step.target}</span>
                                </div>
                                {step.value && <div className="text-[var(--zt-text-secondary)]">Valor: <span className="font-mono">{step.value}</span></div>}
                                <div className="text-[var(--zt-text-muted)] text-[10px]">Resultado esperado: {step.expectedResult}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Human Review Panel */}
                    <div className="border-t border-[var(--zt-border-subtle)] pt-4 space-y-3">
                      <span className="zt-label uppercase tracking-wider block">Panel de Revisión Humana</span>
                      
                      {proposal.status === "pending_review" ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              onClick={() => onRejectProposal(proposal.proposalId)}
                              disabled={!!actionLoading}
                              className="zt-btn zt-btn-outline text-xs py-2 text-red-600 border-red-600/35 hover:bg-red-50"
                            >
                              {actionLoading === "reject-proposal" ? "Procesando..." : "Rechazar propuesta"}
                            </button>
                            <button
                              onClick={() => onApproveProposalSandbox(proposal.proposalId)}
                              disabled={!!actionLoading}
                              className="zt-btn zt-btn-primary text-xs py-2"
                            >
                              {actionLoading === "approve-sandbox" ? "Aprobando..." : "Aprobar para sandbox"}
                            </button>
                          </div>
                          
                          <div className="pt-1">
                            {!isRevisionOpen ? (
                              <button
                                onClick={() => setIsRevisionOpen(true)}
                                className="w-full text-center text-xs text-[var(--zt-accent-secondary)] font-bold hover:underline py-1.5"
                              >
                                Solicitar revisión / Regenerar propuesta con comentarios
                              </button>
                            ) : (
                              <form onSubmit={handleRequestRevisionConfirm} className="space-y-2.5 bg-[var(--zt-bg-surface)] border border-[var(--zt-border-subtle)] p-3 rounded-xl">
                                <span className="zt-caption block">Comentarios para revisión/regeneración (Gemini):</span>
                                <textarea
                                  value={revisionComment}
                                  onChange={(e) => setRevisionComment(e.target.value)}
                                  placeholder="Explica qué corrección deseas o por qué solicitas revisión..."
                                  className="w-full text-xs p-2 bg-[var(--zt-bg-surface-soft)] border border-[var(--zt-border-subtle)] rounded-lg outline-none focus:border-[var(--zt-accent-secondary)] min-h-[60px]"
                                  maxLength={500}
                                />
                                <div className="flex justify-end gap-2 text-xs">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsRevisionOpen(false);
                                      setRevisionComment("");
                                    }}
                                    className="px-3 py-1.5 rounded-lg border border-[var(--zt-border-subtle)] text-[var(--zt-text-secondary)] hover:bg-[var(--zt-bg-surface-soft)]"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="submit"
                                    disabled={!revisionComment.trim() || actionLoading === "request-revision"}
                                    className="px-3 py-1.5 rounded-lg bg-[var(--zt-accent-primary)] text-white hover:opacity-90 font-semibold disabled:opacity-50"
                                  >
                                    {actionLoading === "request-revision" ? "Enviando..." : "Enviar Solicitud"}
                                  </button>
                                </div>
                              </form>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-[var(--zt-bg-surface)] border border-[var(--zt-border-subtle)] p-3 rounded-xl text-center text-xs text-[var(--zt-text-secondary)]">
                          Esta propuesta se encuentra en estado terminal: <span className="font-bold">{proposal.status}</span>. No se permiten más acciones. Puedes hacer clic en "Resolver con Gemini" en el panel principal para regenerar una nueva propuesta.
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}

              {/* 5. COLLAPSIBLE TECHNICAL INFORMATION SECTION */}
              <div className="border-t border-[var(--zt-border-subtle)] pt-4">
                <button
                  onClick={() => setIsTechnicalOpen(!isTechnicalOpen)}
                  className="w-full flex justify-between items-center text-xs font-bold uppercase tracking-wider text-[var(--zt-text-muted)] py-2 hover:text-[var(--zt-text-primary)] transition-all"
                >
                  <span>Ver información técnica</span>
                  {isTechnicalOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {isTechnicalOpen && (
                  <div className="bg-[var(--zt-bg-surface-soft)] border border-[var(--zt-border-subtle)] rounded-2xl p-4.5 space-y-4 text-xs font-mono mt-2 animate-fade-in">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="zt-caption block font-sans">ID del Diagnóstico:</span>
                        <span className="block break-all select-all font-semibold">{summary.id}</span>
                      </div>
                      <div>
                        <span className="zt-caption block font-sans">ID del Ticket:</span>
                        <span className="block break-all select-all font-semibold">{summary.ticketId}</span>
                      </div>
                      <div>
                        <span className="zt-caption block font-sans">ID de Usuario:</span>
                        <span className="block break-all select-all">{summary.userId || "S/D"}</span>
                      </div>
                      <div>
                        <span className="zt-caption block font-sans">ID de Job de Automatización:</span>
                        <span className="block break-all select-all">{detail.jobSnapshot?.id || "No relacionado"}</span>
                      </div>
                      <div>
                        <span className="zt-caption block font-sans">Portal afectado:</span>
                        <span className="block font-sans font-semibold">{summary.affectedPortal}</span>
                      </div>
                      <div>
                        <span className="zt-caption block font-sans">Conector ID:</span>
                        <span className="block font-semibold">{summary.connectorId}</span>
                      </div>
                      <div>
                        <span className="zt-caption block font-sans">Fecha de creación:</span>
                        <span className="block">{formatDate(summary.createdAt)}</span>
                      </div>
                      <div>
                        <span className="zt-caption block font-sans">Fecha de actualización:</span>
                        <span className="block">{formatDate(summary.updatedAt)}</span>
                      </div>
                    </div>

                    <div className="border-t border-[var(--zt-border-subtle)] pt-3.5 space-y-2">
                      <div className="font-sans font-bold text-[var(--zt-text-primary)] mb-1">Estado Fiscal (SAT)</div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="zt-caption block font-sans">SAT status:</span>
                          <span className="block font-sans font-semibold">{summary.satStatus}</span>
                        </div>
                        <div>
                          <span className="zt-caption block font-sans">Validación factura:</span>
                          <span className="block font-sans font-semibold">{summary.validationStatus}</span>
                        </div>
                        <div>
                          <span className="zt-caption block font-sans">XML en Storage:</span>
                          <span className="block font-sans font-semibold">{summary.hasXml ? "Disponible" : "Faltante"}</span>
                        </div>
                        <div>
                          <span className="zt-caption block font-sans">PDF en Storage:</span>
                          <span className="block font-sans font-semibold">{summary.hasPdf ? "Disponible" : "Faltante"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 6. CONNECTOR LEARNING PANEL */}
              {!isLegacy && (
                <div className="border-t border-[var(--zt-border-subtle)] pt-6">
                  <ConnectorLearningPanel
                    connectorId={summary.connectorId || "unknown"}
                    problemSignature={summary.problemSignature || "unknown"}
                    portal={summary.affectedPortal || "unknown"}
                    failedStage={summary.failedStage || "unknown"}
                  />
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      {/* Logical Archiving Form Modal Overlay */}
      {isArchiveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-xs" onClick={() => setIsArchiveOpen(false)}></div>
          <form onSubmit={handleArchiveConfirm} className="relative bg-[var(--zt-bg-surface)] border border-[var(--zt-border-default)] w-full max-w-md p-6 rounded-3xl shadow-2xl space-y-4 animate-scale-in">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-sm text-[var(--zt-text-primary)]">Archivar Diagnóstico</h3>
                <p className="text-[11px] text-[var(--zt-text-secondary)] mt-0.5">El diagnóstico se removerá de los pendientes de atención sin borrar evidencia ni facturas.</p>
              </div>
              <button type="button" onClick={() => setIsArchiveOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="zt-label block mb-1">Razón de archivado <span className="text-red-500">*</span></label>
                <select
                  required
                  value={archiveReason}
                  onChange={(e) => setArchiveReason(e.target.value)}
                  className="w-full text-xs bg-[var(--zt-bg-surface-soft)] border border-[var(--zt-border-subtle)] rounded-xl px-3 py-2.5 font-sans"
                >
                  <option value="">Selecciona un motivo...</option>
                  <option value="portal_change">Cambio en estructura del portal (Selectores)</option>
                  <option value="user_error">Datos del ticket incorrectos / Error de usuario</option>
                  <option value="captcha_required">Bloqueo por CAPTCHA recurrente</option>
                  <option value="service_down">Portal del emisor fuera de servicio</option>
                  <option value="manual_resolution">Facturado manualmente por administrador</option>
                  <option value="other">Otro motivo</option>
                </select>
              </div>

              <div>
                <label className="zt-label block mb-1">Comentario adicional (Opcional)</label>
                <textarea
                  value={archiveComment}
                  onChange={(e) => setArchiveComment(e.target.value)}
                  placeholder="Detalles sobre por qué se archiva esta incidencia..."
                  rows={3}
                  className="w-full text-xs bg-[var(--zt-bg-surface-soft)] border border-[var(--zt-border-subtle)] rounded-xl p-3 font-sans resize-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsArchiveOpen(false)}
                className="zt-btn zt-btn-outline py-2 text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!archiveReason || actionLoading === "archive"}
                className="zt-btn zt-btn-primary py-2 text-xs"
              >
                {actionLoading === "archive" ? "Archivando..." : "Confirmar Archivación"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Expanded Technical Evidence Overlay Modal */}
      {isViewerOpen && detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/65 backdrop-blur-xs" onClick={() => setIsViewerOpen(false)}></div>
          <div className="relative bg-[var(--zt-bg-surface)] border border-[var(--zt-border-default)] w-full max-w-4xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-scale-in">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-[var(--zt-border-subtle)] flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-sm text-[var(--zt-text-primary)]">Visor de Evidencia Técnica Ampliado</h3>
                <p className="text-[10px] text-[var(--zt-text-muted)] font-mono uppercase mt-0.5">
                  Conector: {summary?.connectorId} | Stage: {summary?.failedStage}
                </p>
              </div>
              <button onClick={() => setIsViewerOpen(false)} className="zt-btn zt-btn-ghost p-1.5 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="px-5 border-b border-[var(--zt-border-subtle)] flex gap-1.5 overflow-x-auto scrollbar-none shrink-0 py-2 bg-[var(--zt-bg-surface-soft)]">
              {[
                { key: "screenshot", label: "Captura de Pantalla", icon: Image },
                { key: "timeline", label: "Eventos de Navegación", icon: Play },
                { key: "messages", label: "Mensajes del Portal", icon: Info },
                { key: "dom", label: "Texto Visible (DOM)", icon: FileText },
                { key: "errors", label: "Error Técnico / Traza", icon: Terminal }
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = viewerTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setViewerTab(tab.key as any)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-wider ${isActive ? "bg-[var(--zt-bg-surface)] border border-[var(--zt-border-subtle)] text-[var(--zt-accent-secondary)]" : "text-[var(--zt-text-muted)] hover:text-[var(--zt-text-primary)]"}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Modal Content */}
            <div className="flex-1 p-6 overflow-y-auto min-h-0 bg-[var(--zt-bg-surface-soft)]">
              
              {/* Tab 1: Screenshot */}
              {viewerTab === "screenshot" && (
                <div className="h-full flex flex-col items-center justify-center">
                  {loadingScreenshot ? (
                    <div className="text-center py-20 text-xs text-[var(--zt-text-secondary)] space-y-2">
                      <div className="w-6 h-6 border-2 border-[var(--zt-accent-secondary)] border-t-transparent rounded-full animate-spin mx-auto"></div>
                      <p className="font-bold">Cargando captura segura...</p>
                    </div>
                  ) : screenshotUrl ? (
                    <div className="h-full w-full max-h-[60vh] flex items-center justify-center bg-black/5 rounded-2xl overflow-hidden border border-[var(--zt-border-subtle)]">
                      <img
                        src={screenshotUrl}
                        alt="Evidencia del portal pantalla completa"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="text-center py-20 text-xs text-[var(--zt-text-muted)] space-y-1">
                      <Image className="w-8 h-8 mx-auto opacity-45" />
                      <p className="font-bold">Captura no registrada por el runner.</p>
                      <p className="text-[10px] max-w-sm mx-auto">{screenshotError || "No se ha capturado evidencia visual para esta ejecución."}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Timeline */}
              {viewerTab === "timeline" && (
                <div className="space-y-4 max-w-xl mx-auto">
                  <div className="text-xs font-semibold text-[var(--zt-text-secondary)]">Pasos ejecutados durante el reintento:</div>
                  <div className="relative border-l border-[var(--zt-border-subtle)] ml-3 pl-5 space-y-5">
                    {detail.timeline && detail.timeline.length > 0 ? (
                      detail.timeline.map((step: any, idx: number) => {
                        const isFailed = step.status === "failed";
                        const isSuccess = step.status === "success";
                        const dotColor = isFailed ? "bg-red-500" : (isSuccess ? "bg-green-500" : "bg-blue-500");
                        return (
                          <div key={step.id || idx} className="relative">
                            <span className={`absolute -left-[25px] top-1 w-2.5 h-2.5 rounded-full ${dotColor} border border-[var(--zt-bg-surface)]`}></span>
                            <div className="text-xs space-y-0.5">
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-[var(--zt-text-primary)]">{mapStageToSpanish(step.stage)}</span>
                                <span className="text-[10px] text-[var(--zt-text-muted)] font-mono">{formatDate(step.createdAt)}</span>
                              </div>
                              <div className="text-[10px] text-[var(--zt-text-muted)] font-mono">{step.stage} ({step.status})</div>
                              {step.technicalMessage && <p className="text-[var(--zt-text-secondary)] mt-1 font-mono text-[10px] bg-[var(--zt-bg-surface)] p-2 rounded-lg border border-[var(--zt-border-subtle)] break-all">{step.technicalMessage}</p>}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs italic text-[var(--zt-text-muted)]">No hay eventos registrados en la traza.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Portal Messages */}
              {viewerTab === "messages" && (
                <div className="space-y-3 max-w-lg mx-auto">
                  <div className="text-xs font-semibold text-[var(--zt-text-secondary)]">Mensajes extraídos directamente de la pantalla:</div>
                  {detail.jobSnapshot?.portalSnapshot?.portalMessages && detail.jobSnapshot.portalSnapshot.portalMessages.length > 0 ? (
                    <ul className="space-y-2">
                      {detail.jobSnapshot.portalSnapshot.portalMessages.map((msg: string, i: number) => (
                        <li key={i} className="bg-red-50 border border-red-200/50 text-[var(--zt-error-text)] text-xs p-3.5 rounded-xl font-medium flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{msg}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-center py-10 bg-[var(--zt-bg-surface)] border border-[var(--zt-border-subtle)] rounded-2xl text-xs text-[var(--zt-text-muted)]">
                      Ningún mensaje de error visible fue extraído por el sniffer de DOM.
                    </div>
                  )}
                </div>
              )}

              {/* Tab 4: DOM Text */}
              {viewerTab === "dom" && (
                <div className="h-full flex flex-col space-y-2">
                  <div className="text-xs font-semibold text-[var(--zt-text-secondary)]">Texto visible en pantalla (Sanitizado de secretos):</div>
                  {detail.jobSnapshot?.portalSnapshot?.visibleText ? (
                    <pre className="flex-1 bg-[var(--zt-bg-surface)] border border-[var(--zt-border-subtle)] p-4 rounded-2xl text-xs text-[var(--zt-text-primary)] font-mono whitespace-pre-wrap overflow-y-auto leading-relaxed select-all">
                      {detail.jobSnapshot.portalSnapshot.visibleText}
                    </pre>
                  ) : (
                    <div className="text-center py-20 bg-[var(--zt-bg-surface)] border border-[var(--zt-border-subtle)] rounded-2xl text-xs text-[var(--zt-text-muted)]">
                      Texto visible no registrado para esta ejecución.
                    </div>
                  )}
                </div>
              )}

              {/* Tab 5: Playwright errors trace */}
              {viewerTab === "errors" && (
                <div className="h-full flex flex-col space-y-2">
                  <div className="text-xs font-semibold text-[var(--zt-text-secondary)]">Traza de error del navegador Playwright:</div>
                  {summary.technicalCause && summary.technicalCause !== "Sin error técnico" ? (
                    <pre className="flex-1 bg-rose-50 border border-rose-100 p-4 rounded-2xl text-xs text-rose-800 font-mono whitespace-pre-wrap overflow-y-auto leading-relaxed select-all">
                      {summary.technicalCause}
                    </pre>
                  ) : (
                    <div className="text-center py-20 bg-[var(--zt-bg-surface)] border border-[var(--zt-border-subtle)] rounded-2xl text-xs text-[var(--zt-text-muted)]">
                      Sin errores de compilación o excepciones arrojadas por Playwright.
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
};
