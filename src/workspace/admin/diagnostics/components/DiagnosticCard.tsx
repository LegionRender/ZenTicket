import React from "react";
import { formatDate } from "../utils/diagnosticFormatters";
import { getStatusLabelAndDot } from "./DiagnosticsTable";

interface DiagnosticCardProps {
  item: any;
  onSelect: (ticketId: string) => void;
}

export const DiagnosticCard: React.FC<DiagnosticCardProps> = ({ item, onSelect }) => {
  const ticketRef = item.ticketReference || "—";
  const ticketId = item.ticketId || item.id;
  const statusInfo = getStatusLabelAndDot(item);

  return (
    <div className="zt-card flex flex-col justify-between transition hover:shadow-md">
      <div className="flex justify-between items-start mb-3">
        <div>
          <span className="zt-caption font-mono block">
            {formatDate(item.updatedAt || item.date || item.createdAt)}
          </span>
          <div className="zt-mono font-bold text-sm">
            #{ticketRef}
          </div>
          <div className="zt-body font-semibold">
            {item.portal || item.portalName || "OXXO Cadena"}
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--zt-bg-surface-soft)] px-2 py-1 rounded-lg border border-[var(--zt-border-subtle)]">
          <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass}`}></span>
          <span className={`text-[10px] ${statusInfo.textClass}`}>{statusInfo.label}</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-[var(--zt-border-subtle)]">
        <span className="zt-caption font-medium">ID: {ticketId.slice(0, 10)}...</span>
        <button
          onClick={() => onSelect(ticketId)}
          className="zt-btn zt-btn-secondary zt-btn-sm"
        >
          Ver detalle
        </button>
      </div>
    </div>
  );
};
