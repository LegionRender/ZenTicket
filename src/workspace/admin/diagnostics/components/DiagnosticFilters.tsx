import React, { useState, useEffect } from "react";
import { DiagnosticsFilters } from "../services/diagnosticsApi";
import { Search, Calendar } from "lucide-react";

interface DiagnosticFiltersProps {
  filters: DiagnosticsFilters;
  onApply: (filters: DiagnosticsFilters) => void;
  onClear: () => void;
  uniqueUsers?: Array<{ id: string; name: string }>;
  uniquePortals?: string[];
}

export const DiagnosticFilters: React.FC<DiagnosticFiltersProps> = ({
  filters,
  onApply,
  onClear,
  uniqueUsers = [],
  uniquePortals = []
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [userId, setUserId] = useState(filters.userId || "");
  const [portalName, setPortalName] = useState(filters.portalName || "");
  const [status, setStatus] = useState(filters.status || "");
  const [dateFrom, setDateFrom] = useState(filters.dateFrom ? filters.dateFrom.slice(0, 10) : "");
  const [dateTo, setDateTo] = useState(filters.dateTo ? filters.dateTo.slice(0, 10) : "");
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Advanced filters state
  const [problemSignature, setProblemSignature] = useState(filters.problemSignature || "");
  const [stage, setStage] = useState(filters.stage || "");
  const [errorCode, setErrorCode] = useState(filters.errorCode || "");
  const [connectorId, setConnectorId] = useState(filters.connectorId || "");
  const [ticketId, setTicketId] = useState(filters.ticketId || "");

  // Sync state with filters prop
  useEffect(() => {
    setUserId(filters.userId || "");
    setPortalName(filters.portalName || "");
    setStatus(filters.status || "");
    setDateFrom(filters.dateFrom ? filters.dateFrom.slice(0, 10) : "");
    setDateTo(filters.dateTo ? filters.dateTo.slice(0, 10) : "");
    setProblemSignature(filters.problemSignature || "");
    setStage(filters.stage || "");
    setErrorCode(filters.errorCode || "");
    setConnectorId(filters.connectorId || "");
    setTicketId(filters.ticketId || "");
  }, [filters]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApply({
      userId: userId || undefined,
      portalName: portalName || undefined,
      status: status || undefined,
      dateFrom: dateFrom ? new Date(dateFrom + "T00:00:00Z").toISOString() : undefined,
      dateTo: dateTo ? new Date(dateTo + "T23:59:59Z").toISOString() : undefined,
      problemSignature: problemSignature || undefined,
      stage: stage || undefined,
      errorCode: errorCode || undefined,
      connectorId: connectorId || undefined,
      ticketId: ticketId || undefined,
      // Map search term to ticketReference if numeric, or let frontend use it locally
      ticketReference: /^\d+$/.test(searchTerm) ? searchTerm : undefined
    });
  };

  const handleClear = () => {
    setSearchTerm("");
    setUserId("");
    setPortalName("");
    setStatus("");
    setDateFrom("");
    setDateTo("");
    setProblemSignature("");
    setStage("");
    setErrorCode("");
    setConnectorId("");
    setTicketId("");
    onClear();
  };

  return (
    <div className="space-y-3 mb-6">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3 bg-[var(--zt-bg-surface)] p-3 rounded-2xl border border-[var(--zt-border-subtle)] shadow-xs">
        
        {/* Buscador */}
        <div className="relative flex-1 min-w-[240px]">
          <span className="absolute inset-y-0 left-3 flex items-center text-[var(--zt-text-muted)]">
            <Search className="w-3.5 h-3.5" />
          </span>
          <input
            type="text"
            placeholder="Buscar por ticket, usuario o referencia"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="zt-input pl-9 text-xs h-9 py-1.5 px-3 !rounded-xl w-full"
          />
        </div>

        {/* Usuario Select */}
        <div className="min-w-[130px]">
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="zt-input text-xs h-9 py-1.5 px-3 !rounded-xl w-full cursor-pointer"
          >
            <option value="">Usuario: Todos</option>
            {uniqueUsers.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        {/* Portal Select */}
        <div className="min-w-[130px]">
          <select
            value={portalName}
            onChange={(e) => setPortalName(e.target.value)}
            className="zt-input text-xs h-9 py-1.5 px-3 !rounded-xl w-full cursor-pointer"
          >
            <option value="">Portal: Todos</option>
            {uniquePortals.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Estado Select */}
        <div className="min-w-[130px]">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="zt-input text-xs h-9 py-1.5 px-3 !rounded-xl w-full cursor-pointer"
          >
            <option value="">Estado: Todos</option>
            <option value="in_process">En proceso</option>
            <option value="attention">Requieren atención</option>
            <option value="failed">Fallidos</option>
            <option value="ready">Listos</option>
            <option value="archived">Archivados</option>
          </select>
        </div>

        {/* Date Range Compact */}
        <div className="flex items-center gap-1.5 bg-[var(--zt-bg-surface-soft)] border border-[var(--zt-border-default)] rounded-xl px-3 h-9 text-xs text-[var(--zt-text-primary)]">
          <Calendar className="w-3.5 h-3.5 text-[var(--zt-text-muted)]" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-transparent text-[var(--zt-text-primary)] focus:outline-none w-[100px]"
          />
          <span className="text-[var(--zt-text-muted)] opacity-50">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-transparent text-[var(--zt-text-primary)] focus:outline-none w-[100px]"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            type="submit"
            className="zt-btn zt-btn-primary zt-btn-sm text-xs"
          >
            Filtrar
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="zt-btn zt-btn-secondary zt-btn-sm text-xs"
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`zt-btn zt-btn-sm text-xs ${
              showAdvanced
                ? "zt-btn-primary"
                : "zt-btn-secondary"
            }`}
          >
            Filtros avanzados
          </button>
        </div>
      </form>

      {/* Advanced Filters Dropdown */}
      {showAdvanced && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 bg-[var(--zt-bg-surface)] p-4 rounded-2xl border border-[var(--zt-border-subtle)] text-xs shadow-xs animate-fade-in">
          <div>
            <label className="zt-label block mb-1">Firma de Problema</label>
            <input
              type="text"
              placeholder="problemSignature..."
              value={problemSignature}
              onChange={(e) => setProblemSignature(e.target.value)}
              className="zt-input text-xs h-9 py-1.5 px-3 !rounded-xl w-full"
            />
          </div>
          <div>
            <label className="zt-label block mb-1">Etapa Fallida</label>
            <input
              type="text"
              placeholder="Ej: xml_download_failed"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="zt-input text-xs h-9 py-1.5 px-3 !rounded-xl w-full"
            />
          </div>
          <div>
            <label className="zt-label block mb-1">Código de Error</label>
            <input
              type="text"
              placeholder="Ej: CFDI_TOTAL_MISMATCH"
              value={errorCode}
              onChange={(e) => setErrorCode(e.target.value)}
              className="zt-input text-xs h-9 py-1.5 px-3 !rounded-xl w-full"
            />
          </div>
          <div>
            <label className="zt-label block mb-1">Connector ID</label>
            <input
              type="text"
              placeholder="Ej: oxxo"
              value={connectorId}
              onChange={(e) => setConnectorId(e.target.value)}
              className="zt-input text-xs h-9 py-1.5 px-3 !rounded-xl w-full"
            />
          </div>
          <div>
            <label className="zt-label block mb-1">ID Interno de Ticket</label>
            <input
              type="text"
              placeholder="Ej: ticket_vl1f..."
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
              className="zt-input text-xs h-9 py-1.5 px-3 !rounded-xl w-full"
            />
          </div>
        </div>
      )}
    </div>
  );
};
