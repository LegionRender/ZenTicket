import React from "react";
import { formatDate } from "../utils/diagnosticFormatters";

interface DiagnosticTimelineProps {
  timeline: any[];
}

export const DiagnosticTimeline: React.FC<DiagnosticTimelineProps> = ({ timeline }) => {
  if (!timeline || timeline.length === 0) {
    return (
      <div className="text-xs text-[var(--zt-text-muted)] py-6 text-center border border-dashed border-[var(--zt-border-subtle)] rounded-xl">
        No hay eventos registrados en la línea de tiempo.
      </div>
    );
  }

  return (
    <div className="zt-panel space-y-4">
      <h4 className="zt-title-card mb-3">Línea de Tiempo del Procesamiento</h4>
      
      <div className="relative pl-6 border-l-2 border-[var(--zt-border-subtle)] space-y-6">
        {timeline.map((event, index) => {
          const isFailed = event.status === "failed";
          const isSuccess = event.status === "success";
          
          let markerClass = "bg-[var(--zt-border-default)]";
          if (isFailed) markerClass = "zt-dot-error ring-2 ring-[var(--zt-error-border)]/20";
          if (isSuccess) markerClass = "zt-dot-ok ring-2 ring-[var(--zt-ok-border)]/20";

          return (
            <div key={event.id || index} className="relative">
              {/* Dot */}
              <span className={`absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full border-2 border-[var(--zt-bg-surface)] ${markerClass}`}></span>

              <div>
                <div className="flex justify-between items-center">
                  <span className="font-mono text-xs font-semibold text-[var(--zt-text-primary)] bg-[var(--zt-bg-surface-soft)] px-1.5 py-0.5 rounded border border-[var(--zt-border-subtle)]">
                    {event.stage}
                  </span>
                  <span className="text-[10px] text-[var(--zt-text-muted)] font-mono">{formatDate(event.createdAt)}</span>
                </div>

                <div className="mt-1 text-xs text-[var(--zt-text-secondary)]">
                  {event.technicalMessage || event.userMessage || `Etapa completada con estado: ${event.status}`}
                </div>

                {event.errorCode && (
                  <div className="mt-1 zt-badge zt-badge-error font-mono text-[10px] w-max">
                    Error Code: {event.errorCode}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
