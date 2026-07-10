import React, { useState, useEffect } from "react";
import { useDiagnostics } from "../hooks/useDiagnostics";
import { useDiagnosticDetail } from "../hooks/useDiagnosticDetail";
import { DiagnosticFilters } from "../components/DiagnosticFilters";
import { DiagnosticsTable } from "../components/DiagnosticsTable";
import { DiagnosticCard } from "../components/DiagnosticCard";
import { DiagnosticDetailDrawer } from "../components/DiagnosticDetailDrawer";
import { UsersMasterDetail } from "../components/UsersMasterDetail";
import { lastRequestDebug } from "../services/diagnosticsApi";
import { HelpCircle, AlertOctagon, Clock, AlertTriangle, CheckCircle, Sliders, Sparkles } from "lucide-react";

export const DiagnosticsPage: React.FC = () => {
  const {
    items,
    users,
    metrics,
    loading,
    error,
    filters,
    applyFilters,
    clearFilters,
    refresh
  } = useDiagnostics();

  const {
    isOpen,
    loading: detailLoading,
    error: detailError,
    detail,
    proposal,
    selectedTicketId,
    openDrawer,
    closeDrawer,
    actionLoading,
    actionSuccess,
    actionError,
    clearActionStatus,
    handleRetry,
    handleMarkReviewed,
    handleCreateConnectorTask,
    handleProposeFix,
    handleArchive,
    handleApproveProposalSandbox,
    handleRejectProposal,
    handleRequestRevision
  } = useDiagnosticDetail();

  // Local state for user selection in "Por usuario" view
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  // Extract counts for metrics cards
  const failedCount = metrics?.failedTickets ?? 0;
  const inProcessCount = metrics?.inProcessTickets ?? 0;
  const attentionCount = metrics?.attentionTickets ?? 0;
  const readyCount = metrics?.readyTickets ?? 0;

  // Resolve currently active userId
  const activeUserId = users.some(u => u.userId === selectedUserId)
    ? selectedUserId
    : (users[0]?.userId || null);

  // Set default selected user once loaded
  useEffect(() => {
    if (users.length > 0 && !selectedUserId) {
      setSelectedUserId(users[0].userId);
    }
  }, [users, selectedUserId]);

  // Unique users & portals list for dropdown options
  const uniqueUsers = users.map(u => ({ id: u.userId, name: u.userDisplayName || u.displayName || "Usuario" }));
  
  // Extract all unique portals from flat items list or user items list
  const allPortalNames = new Set<string>();
  items.forEach(item => {
    if (item.portal) allPortalNames.add(item.portal);
    if (item.portalName) allPortalNames.add(item.portalName);
  });
  users.forEach(u => {
    (u.items || []).forEach((item: any) => {
      if (item.portal) allPortalNames.add(item.portal);
      if (item.portalName) allPortalNames.add(item.portalName);
    });
  });
  const uniquePortals = Array.from(allPortalNames);

  // Helper to resolve specific empty state text based on view tab
  const getEmptyStateText = () => {
    const view = filters.view || "by_user";
    switch (view) {
      case "by_user":
        return "No se encontraron usuarios con los filtros aplicados.";
      case "ready":
        return "No hay tickets listos con los filtros aplicados.";
      case "archived":
        return "No hay tickets archivados u ocultos con los filtros aplicados.";
      default:
        return "No se encontraron tickets con los filtros aplicados.";
    }
  };

  const activeTab = filters.view || "by_user";

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex justify-between items-center pb-2.5 border-b border-[var(--zt-border-subtle)]">
        <div>
          <h1 className="zt-title-page">Diagnóstico de Facturación</h1>
          <p className="zt-page-subtitle mt-0.5">
            Supervisa incidencias, seguimiento y tickets listos por usuario.
          </p>
        </div>
        <button
          onClick={() => alert("Centro de control administrativo de ZenTicket. Utiliza este panel para revisar problemas de automatización, reintentar descargas y supervisar tickets listos.")}
          className="zt-btn zt-btn-secondary text-xs flex items-center gap-1.5"
        >
          <HelpCircle className="w-4 h-4 text-[var(--zt-text-secondary)]" />
          <span>Ayuda</span>
        </button>
      </div>

      {/* Metrics Cards (Exactly 4 cards) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* Errores Activos */}
        <div className="zt-metric-card zt-metric-card-error">
          <div className="flex justify-between items-start">
            <span className="zt-metric-title">Errores activos</span>
            <AlertOctagon className="zt-metric-icon" />
          </div>
          <div className="zt-metric-value">
            {failedCount}
          </div>
          <div className="zt-metric-description">
            Incidencias que requieren acción
          </div>
        </div>

        {/* En Proceso */}
        <div className="zt-metric-card zt-metric-card-process">
          <div className="flex justify-between items-start">
            <span className="zt-metric-title">En proceso</span>
            <Clock className="zt-metric-icon" />
          </div>
          <div className="zt-metric-value">
            {inProcessCount}
          </div>
          <div className="zt-metric-description">
            En seguimiento
          </div>
        </div>

        {/* Requieren Atención */}
        <div className="zt-metric-card zt-metric-card-attention">
          <div className="flex justify-between items-start">
            <span className="zt-metric-title">Requieren atención</span>
            <AlertTriangle className="zt-metric-icon" />
          </div>
          <div className="zt-metric-value">
            {attentionCount}
          </div>
          <div className="zt-metric-description">
            Revisión recomendada
          </div>
        </div>

        {/* Listos */}
        <div className="zt-metric-card zt-metric-card-ok">
          <div className="flex justify-between items-start">
            <span className="zt-metric-title">Listos</span>
            <CheckCircle className="zt-metric-icon" />
          </div>
          <div className="zt-metric-value">
            {readyCount}
          </div>
          <div className="zt-metric-description">
            Validados correctamente
          </div>
        </div>
      </div>

      {/* Simplified Filters */}
      <DiagnosticFilters
        filters={filters}
        onApply={applyFilters}
        onClear={clearFilters}
        uniqueUsers={uniqueUsers}
        uniquePortals={uniquePortals}
      />

      {/* View Toggle Tabs */}
      <div className="zt-tabs overflow-x-auto scrollbar-none">
        {[
          { key: "by_user", label: "Por usuario" },
          { key: "all", label: "Tickets" },
          { key: "ready", label: "Listos" },
          { key: "archived", label: "Archivados" }
        ].map(tab => {
          const isActive = (filters.view || "by_user") === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                applyFilters({ view: tab.key as any });
                if (tab.key !== "by_user") {
                  setSelectedUserId(null);
                }
              }}
              className={`zt-tab ${isActive ? "zt-tab-active" : ""}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Debug Panel (Development only) */}
      {import.meta.env.DEV === true && (
        <div className="flex flex-col items-start gap-2 mb-4 shrink-0">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="zt-btn zt-btn-secondary zt-btn-sm !py-1 !px-2.5 !h-[26px] text-[10px] font-bold tracking-wider uppercase opacity-60 hover:opacity-100 rounded-md"
          >
            {showDebug ? "Ocultar debug" : "Mostrar debug"}
          </button>
          
          {showDebug && (
            <div className="w-full bg-[var(--zt-bg-surface)] border border-[var(--zt-border-default)] p-4 rounded-xl text-xs font-mono text-[var(--zt-text-secondary)] space-y-1 shadow-inner animate-fade-in">
              <div className="font-bold text-[var(--zt-accent-secondary)] mb-1 flex items-center gap-1.5">
                <Sliders className="w-4 h-4" />
                <span>Admin Diagnostics Debug Panel:</span>
              </div>
              <div><span className="zt-caption">activeTab:</span> {activeTab}</div>
              <div><span className="zt-caption">requestedUrl:</span> {lastRequestDebug.requestedUrl || "—"}</div>
              <div><span className="zt-caption">apiBaseUrl:</span> {lastRequestDebug.apiBaseUrl || "—"}</div>
              <div><span className="zt-caption">status:</span> {lastRequestDebug.status ?? "—"}</div>
              <div><span className="zt-caption">contentType:</span> {lastRequestDebug.contentType || "—"}</div>
              <div><span className="zt-caption">hasUsers:</span> {String(users.length > 0)}</div>
              <div><span className="zt-caption">usersLength:</span> {users.length}</div>
              <div><span className="zt-caption">metrics keys:</span> {Object.keys(metrics || {}).join(", ") || "—"}</div>
              <div><span className="zt-caption">errorCode:</span> {error || "None"}</div>
              <div><span className="zt-caption">isHtmlResponse:</span> {String(lastRequestDebug.isHtmlResponse)}</div>
              <div><span className="zt-caption">selectedUserId:</span> {activeUserId || "None"}</div>
            </div>
          )}
        </div>
      )}

      {/* Main Layout Area */}
      {loading && items.length === 0 && users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-[var(--zt-bg-surface-soft)] border border-[var(--zt-border-subtle)] rounded-3xl shadow-sm">
          <div className="w-8 h-8 border-2 border-[var(--zt-accent-secondary)] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-[var(--zt-text-secondary)] font-medium mt-3">Cargando datos...</span>
        </div>
      ) : error ? (
        <div className="zt-alert zt-alert-error text-center block shadow-sm flex flex-col items-center gap-1">
          <span className="font-bold flex items-center justify-center gap-1.5 mb-1">
            <AlertOctagon className="w-4 h-4 text-[var(--zt-error-text)]" />
            <span>Error al cargar diagnósticos</span>
          </span>
          <span>{error}</span>
        </div>
      ) : activeTab === "by_user" && users.length > 0 ? (
        <UsersMasterDetail
          users={users}
          selectedUserId={activeUserId}
          onSelectUser={setSelectedUserId}
          onOpenTicketDetail={openDrawer}
          userVisibility={filters.userVisibility || "real"}
          onUserVisibilityChange={(vis) => applyFilters({ userVisibility: vis })}
        />
      ) : activeTab === "by_user" ? (
        <div className="bg-[var(--zt-bg-surface-soft)] border border-[var(--zt-border-subtle)] rounded-3xl p-12 text-center shadow-sm space-y-2">
          <Sparkles className="w-8 h-8 text-[var(--zt-accent-secondary)] mx-auto animate-pulse" />
          <h3 className="text-sm font-bold text-[var(--zt-text-primary)]">{getEmptyStateText()}</h3>
          <p className="text-xs text-[var(--zt-text-secondary)] max-w-sm mx-auto">
            No se encontraron registros activos para los criterios seleccionados.
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-[var(--zt-bg-surface-soft)] border border-[var(--zt-border-subtle)] rounded-3xl p-12 text-center shadow-sm space-y-2">
          <Sparkles className="w-8 h-8 text-[var(--zt-accent-secondary)] mx-auto animate-pulse" />
          <h3 className="text-sm font-bold text-[var(--zt-text-primary)]">{getEmptyStateText()}</h3>
          <p className="text-xs text-[var(--zt-text-secondary)] max-w-sm mx-auto">
            No se encontraron registros activos para los criterios seleccionados.
          </p>
        </div>
      ) : (
        /* Flat items view for other tabs (Tickets, Listos, Archivados) */
        <div className="bg-[var(--zt-bg-surface-soft)] border border-[var(--zt-border-subtle)] rounded-3xl p-5 shadow-sm space-y-4 overflow-hidden">
          
          {/* Table for Desktop */}
          <div className="hidden md:block">
            <DiagnosticsTable items={items} onSelect={openDrawer} />
          </div>

          {/* Cards for Mobile */}
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {items.map((item) => (
              <DiagnosticCard key={item.visualKey || item.id} item={item} onSelect={openDrawer} />
            ))}
          </div>

          {/* Footer / Pagination */}
          <div className="flex justify-between items-center text-[var(--zt-text-muted)] text-[10px] font-bold uppercase tracking-wider pt-2 border-t border-[var(--zt-border-subtle)]">
            <span>Mostrando 1-{items.length} de {items.length} tickets</span>
            <div className="flex items-center gap-1">
              <button className="zt-btn zt-btn-secondary zt-btn-sm !py-1 !px-2 rounded opacity-50 cursor-not-allowed">‹</button>
              <button className="zt-btn zt-btn-primary py-1 px-3 text-xs">1</button>
              <button className="zt-btn zt-btn-secondary zt-btn-sm !py-1 !px-2 rounded opacity-50 cursor-not-allowed">›</button>
            </div>
          </div>

        </div>
      )}

      {/* Detail Drawer overlay */}
      <DiagnosticDetailDrawer
        isOpen={isOpen}
        onClose={closeDrawer}
        loading={detailLoading}
        error={detailError}
        detail={detail}
        proposal={proposal}
        ticketId={selectedTicketId}
        actionLoading={actionLoading}
        actionSuccess={actionSuccess}
        actionError={actionError}
        clearActionStatus={clearActionStatus}
        onRetry={handleRetry}
        onMarkReviewed={handleMarkReviewed}
        onCreateConnectorTask={handleCreateConnectorTask}
        onProposeFix={handleProposeFix}
        onArchive={handleArchive}
        onApproveProposalSandbox={handleApproveProposalSandbox}
        onRejectProposal={handleRejectProposal}
        onRequestRevision={handleRequestRevision}
      />
    </div>
  );
};
