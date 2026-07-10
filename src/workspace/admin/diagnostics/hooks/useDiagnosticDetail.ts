import { useState, useCallback } from "react";
import { diagnosticsApi } from "../services/diagnosticsApi";

export const useDiagnosticDetail = () => {
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [proposal, setProposal] = useState<any | null>(null);

  const fetchDetail = useCallback(async (ticketId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await diagnosticsApi.getDiagnosticDetail(ticketId);
      setDetail(res);
    } catch (err: any) {
      setError(err.message || "Error al cargar detalle de diagnóstico");
    } finally {
      setLoading(false);
    }
  }, []);

  const openDrawer = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setIsOpen(true);
    setDetail(null);
    setProposal(null);
    setActionError(null);
    setActionSuccess(null);
    fetchDetail(ticketId);
  };

  const closeDrawer = () => {
    setIsOpen(false);
    setSelectedTicketId(null);
    setDetail(null);
    setProposal(null);
  };

  const refreshDetail = () => {
    if (selectedTicketId) {
      fetchDetail(selectedTicketId);
    }
  };

  const handleRetry = async () => {
    if (!selectedTicketId) return;
    setActionLoading("retry");
    setActionError(null);
    setActionSuccess(null);
    try {
      await diagnosticsApi.retryDiagnostic(selectedTicketId);
      setActionSuccess("Reintento programado exitosamente");
      refreshDetail();
    } catch (err: any) {
      setActionError(err.message || "Error al solicitar reintento");
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkReviewed = async (note?: string) => {
    if (!selectedTicketId) return;
    setActionLoading("mark-reviewed");
    setActionError(null);
    setActionSuccess(null);
    try {
      await diagnosticsApi.markDiagnosticReviewed(selectedTicketId, note);
      setActionSuccess("Diagnóstico marcado como revisado");
      refreshDetail();
    } catch (err: any) {
      setActionError(err.message || "Error al marcar como revisado");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateConnectorTask = async () => {
    if (!selectedTicketId) return;
    setActionLoading("create-task");
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await diagnosticsApi.createConnectorTask(selectedTicketId);
      setActionSuccess(`Tarea de conector creada: ${res.taskId}`);
      refreshDetail();
    } catch (err: any) {
      setActionError(err.message || "Error al crear tarea de conector");
    } finally {
      setActionLoading(null);
    }
  };

  const handleProposeFix = async () => {
    if (!selectedTicketId) return;
    setActionLoading("propose-fix");
    setActionError(null);
    setActionSuccess(null);
    setProposal(null);
    try {
      const res = await diagnosticsApi.proposeFix(selectedTicketId);
      if (res.proposal === "AI_PROPOSAL_NOT_ENABLED_YET") {
        setActionError("Las propuestas con IA estarán disponibles en la Fase 15D.");
      } else {
        setProposal(res.proposal);
        setActionSuccess("Propuesta generada.");
      }
    } catch (err: any) {
      setActionError(err.message || "Error al generar propuesta");
    } finally {
      setActionLoading(null);
    }
  };

  const handleArchive = async (reason: string, comment?: string) => {
    if (!selectedTicketId) return;
    setActionLoading("archive");
    setActionError(null);
    setActionSuccess(null);
    try {
      await diagnosticsApi.archiveDiagnostic(selectedTicketId, reason, comment);
      setActionSuccess("Diagnóstico archivado lógicamente con éxito");
      refreshDetail();
    } catch (err: any) {
      setActionError(err.message || "Error al archivar diagnóstico");
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveProposalSandbox = async (proposalId: string) => {
    setActionLoading("approve-sandbox");
    setActionError(null);
    setActionSuccess(null);
    try {
      await diagnosticsApi.approveProposalSandbox(proposalId);
      setActionSuccess("Propuesta aprobada para Sandbox con éxito.");
      refreshDetail();
    } catch (err: any) {
      setActionError(err.message || "Error al aprobar para sandbox");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectProposal = async (proposalId: string) => {
    setActionLoading("reject-proposal");
    setActionError(null);
    setActionSuccess(null);
    try {
      await diagnosticsApi.rejectProposal(proposalId);
      setActionSuccess("Propuesta rechazada con éxito.");
      refreshDetail();
    } catch (err: any) {
      setActionError(err.message || "Error al rechazar propuesta");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestRevision = async (proposalId: string, comment: string) => {
    setActionLoading("request-revision");
    setActionError(null);
    setActionSuccess(null);
    try {
      await diagnosticsApi.requestRevisionProposal(proposalId, comment);
      setActionSuccess("Revisión solicitada con éxito.");
      refreshDetail();
    } catch (err: any) {
      setActionError(err.message || "Error al solicitar revisión");
    } finally {
      setActionLoading(null);
    }
  };

  return {
    isOpen,
    loading,
    error,
    detail,
    proposal,
    selectedTicketId,
    openDrawer,
    closeDrawer,
    refreshDetail,
    actionLoading,
    actionError,
    actionSuccess,
    clearActionStatus: () => {
      setActionError(null);
      setActionSuccess(null);
    },
    handleRetry,
    handleMarkReviewed,
    handleCreateConnectorTask,
    handleProposeFix,
    handleArchive,
    handleApproveProposalSandbox,
    handleRejectProposal,
    handleRequestRevision
  };
};
