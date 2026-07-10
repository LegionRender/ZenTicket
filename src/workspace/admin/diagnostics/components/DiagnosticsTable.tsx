import React from "react";
import { formatDate } from "../utils/diagnosticFormatters";
import { getBillingStatusVisual } from "@/shared/billing/billingStatusVisuals";
import { ChevronRight } from "lucide-react";

export function getStatusLabelAndDot(item: any): { label: string; dotClass: string; textClass: string } {
  const canonical = item.canonicalStatus || item.status || "";
  const bucket = item.bucket || canonical;
  const visual = getBillingStatusVisual(bucket);

  return {
    label: visual.label,
    dotClass: visual.dotClassName,
    textClass: `${visual.iconClassName} font-bold`
  };
}

export function renderDateTwoLines(dateString: string | undefined | null): React.ReactNode {
  if (!dateString) return "—";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    const datePart = d.toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
    const timePart = d.toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }).toLowerCase();
    
    return (
      <div className="flex flex-col text-[12px] leading-snug text-[var(--zt-text-muted)] font-medium">
        <span className="font-semibold text-[var(--zt-text-secondary)]">{datePart}</span>
        <span>{timePart}</span>
      </div>
    );
  } catch (e) {
    return dateString;
  }
}

interface DiagnosticsTableProps {
  items: any[];
  onSelect: (ticketId: string) => void;
}

export const DiagnosticsTable: React.FC<DiagnosticsTableProps> = ({ items, onSelect }) => {
  if (items.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Desktop Table View */}
      <div className="hidden md:block zt-table-container">
        <table className="zt-table">
          <thead className="zt-table-header">
            <tr>
              <th className="w-[18%]">Ticket</th>
              <th className="w-[28%]">Portal</th>
              <th className="w-[16%]">Estado</th>
              <th className="w-[20%]">Última actualización</th>
              <th className="w-[18%] text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const ticketRef = item.ticketReference || "—";
              const ticketId = item.canonicalTicketId || item.ticketId || item.id;
              const portalName = item.portal || item.portalName || "OXXO Cadena";
              const statusInfo = getStatusLabelAndDot(item);
              
              return (
                <tr key={item.visualKey || item.id} className="zt-table-row">
                  <td className="zt-table-cell zt-mono text-[var(--zt-accent-secondary)] font-semibold text-[12px] leading-[1.35]">
                    #{ticketRef}
                  </td>
                  <td className="zt-table-cell text-[13px] font-semibold text-[var(--zt-text-primary)] leading-[1.3]">
                    <span className="line-clamp-2 text-[var(--zt-text-secondary)]" title={portalName}>
                      {portalName}
                    </span>
                  </td>
                  <td className="zt-table-cell">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusInfo.dotClass}`}></span>
                      <span className={`${statusInfo.textClass} text-[12px] font-bold`}>{statusInfo.label}</span>
                    </div>
                  </td>
                  <td className="zt-table-cell">
                    {renderDateTwoLines(item.updatedAt || item.date || item.createdAt)}
                  </td>
                  <td className="zt-table-cell text-right">
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => onSelect(ticketId)}
                        className="zt-btn zt-btn-secondary zt-btn-sm"
                      >
                        <span>Ver detalle</span>
                        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards View */}
      <div className="block md:hidden space-y-3">
        {items.map((item) => {
          const ticketRef = item.ticketReference || "—";
          const ticketId = item.canonicalTicketId || item.ticketId || item.id;
          const portalName = item.portal || item.portalName || "OXXO Cadena";
          const statusInfo = getStatusLabelAndDot(item);
          
          return (
            <div key={item.visualKey || item.id} className="zt-card p-4 rounded-xl border border-[var(--zt-border-subtle)] space-y-3">
              <div className="flex justify-between items-start">
                <span className="zt-mono text-[var(--zt-accent-secondary)] font-bold text-[13px]">
                  #{ticketRef}
                </span>
                <div className="flex items-center gap-1.5 bg-[var(--zt-bg-surface-soft)] px-2 py-1 rounded-full text-[11px] font-bold border border-[var(--zt-border-subtle)]">
                  <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass}`}></span>
                  <span className={statusInfo.textClass}>{statusInfo.label}</span>
                </div>
              </div>
              <div>
                <div className="zt-label uppercase tracking-wider text-[9px] mb-0.5">Portal</div>
                <div className="text-sm font-bold text-[var(--zt-text-primary)] leading-tight">{portalName}</div>
              </div>
              <div className="flex justify-between items-end pt-2 border-t border-[var(--zt-border-subtle)]">
                <div>
                  <div className="zt-label uppercase tracking-wider text-[9px]">Última actualización</div>
                  <div className="text-[11px] text-[var(--zt-text-muted)] font-medium mt-0.5">
                    {formatDate(item.updatedAt || item.date || item.createdAt)}
                  </div>
                </div>
                <button
                  onClick={() => onSelect(ticketId)}
                  className="zt-btn zt-btn-secondary zt-btn-sm"
                >
                  <span>Detalle</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
