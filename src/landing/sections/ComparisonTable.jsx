import React from "react";
import {
  Search,
  Camera,
  Clock,
  AlertTriangle,
  ListChecks,
  Folder,
  Check,
  Star,
} from "lucide-react";
import { TID } from "@/lib/testIds";

const rows = [
  {
    icon: Search,
    label: "Buscar portal",
    tradBold: "Tomas 5–15 minutos",
    tradRegular: " buscando el portal correcto.",
    zen: "Automático",
    zenDesc: "Detecta automáticamente el portal de facturación.",
  },
  {
    icon: Camera,
    label: "Captura manual",
    tradBold: "Muchos datos",
    tradRegular: " y repetir información.",
    zen: "100% automático",
    zenDesc: "La IA extrae y completa los datos automáticamente.",
  },
  {
    icon: Clock,
    label: "Tiempo invertido",
    tradBold: "15–30 minutos",
    tradRegular: " por factura.",
    zen: "Menos de 1 minuto",
    zenDesc: "Ahorra horas cada día.",
  },
  {
    icon: AlertTriangle,
    label: "Errores",
    tradBold: "Altos y frecuentes.",
    tradRegular: "",
    zen: "Mínimos",
    zenDesc: "Datos precisos siempre.",
  },
  {
    icon: ListChecks,
    label: "Seguimiento",
    tradBold: "Difícil y",
    tradRegular: " desorganizado.",
    zen: "Todo en un solo lugar",
    zenDesc: "Control total y claro.",
  },
  {
    icon: Folder,
    label: "Organización",
    tradBold: "Archivos",
    tradRegular: " dispersos.",
    zen: "Historial centralizado",
    zenDesc: "Siempre disponible.",
  },
];

const ComparisonTable = () => {
  return (
    <section
      data-testid={TID.comparison.root}
      className="relative bg-white"
    >
      <div className="absolute inset-0 zt-soft-bg opacity-60 pointer-events-none" />
      <div className="relative max-w-[920px] mx-auto px-3 sm:px-6 lg:px-8 py-10 sm:py-16 md:py-24">
        {/* Header Section */}
        <div className="flex flex-col items-center text-center mb-8 sm:mb-16 pb-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-widest text-[#0B53F4] bg-blue-50 border border-blue-100">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
            Comparación
          </span>
          <h2 className="font-display font-extrabold mt-4 text-[28px] sm:text-[44px] lg:text-[48px] leading-[1.1] tracking-tight text-slate-900 max-w-[700px]">
            <span className="text-[#0B53F4]">ZenTicket</span> hace todo más rápido y mejor
          </h2>
          <p className="mt-3 text-slate-500 text-[13.5px] sm:text-[16px] max-w-[550px] leading-relaxed">
            Compara el método tradicional con la automatización inteligente de <span className="text-[#0B53F4] font-bold">ZenTicket</span>.
          </p>
        </div>

        {/* Unified Responsive Table Container */}
        <div className="relative max-w-[850px] mx-auto">
          
          {/* COLUMN HEADERS ROW */}
          <div className="grid grid-cols-2 items-stretch relative">
            
            {/* Left Header: Método tradicional */}
            <div className="bg-[#F8FAFC]/90 py-5 sm:py-8 px-4 border-t border-l border-b border-slate-200/80 rounded-tl-[24px] sm:rounded-tl-[32px] flex items-center justify-center">
              <span className="text-[11px] sm:text-[14px] font-bold text-slate-500 uppercase tracking-widest text-center">
                Método tradicional
              </span>
            </div>
            
            {/* Right Header: ZenTicket (Highlighted with Blue Container) */}
            <div className="relative bg-[#F4F7FF] px-2 sm:px-10 py-5 sm:py-8 border-t-2 border-x-2 border-[#0B53F4] rounded-tr-[24px] sm:rounded-tr-[32px] flex flex-col items-center justify-center shadow-[0_-15px_30px_-5px_rgba(37,99,235,0.03)] min-h-[70px] sm:min-h-[96px]">
              {/* ✨ HAZLO ZEN badge */}
              <div className="absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2 bg-[#0B53F4] text-white text-[8px] sm:text-[10.5px] font-black uppercase tracking-widest px-3 sm:px-5 py-1 sm:py-1.5 rounded-full shadow-md shadow-blue-500/25 flex items-center gap-1 sm:gap-1.5 z-10 whitespace-nowrap">
                <Star size={9} className="fill-current text-white sm:w-[11px] sm:h-[11px]" /> Hazlo Zen
              </div>
              
              {/* Brand Logo and Title */}
              <div className="flex items-center gap-1.5 sm:gap-2.5">
                <div className="w-6 h-6 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[#0B53F4] flex items-center justify-center text-white font-black text-[11px] sm:text-lg shadow-sm shadow-blue-500/20">
                  Z
                </div>
                <span className="font-display font-extrabold text-[15px] sm:text-[24px] text-[#0B53F4] tracking-tight uppercase">ZenTicket</span>
              </div>
            </div>
          </div>

          {/* TABLE ROWS OF CONTENT */}
          <div className="divide-y-0">
            {rows.map((row, idx) => {
              const isLast = idx === rows.length - 1;
              return (
                <div key={row.label} className="grid grid-cols-2 items-stretch relative">
                  
                  {/* Left Cell: Traditional Method Row Details */}
                  <div
                    className={`bg-white pl-2 pr-4 sm:pl-8 sm:pr-12 py-4 sm:py-6 border-l border-slate-200/60 flex items-center gap-2 sm:gap-4 relative min-h-[90px] sm:min-h-[110px] ${
                      isLast
                        ? "border-b border-slate-200/80 rounded-bl-[24px] sm:rounded-bl-[32px]"
                        : "border-b border-slate-200/40"
                    }`}
                  >
                    <div className="flex flex-col gap-1.5 sm:gap-2 text-left h-full justify-center w-full">
                      {/* Sub-Header: Icon + Concept Label */}
                      <div className="flex items-center gap-1.5 sm:gap-3">
                        <div className="w-6.5 h-6.5 sm:w-11 sm:h-11 rounded-[6px] sm:rounded-[12px] bg-slate-100 flex items-center justify-center text-slate-500 shrink-0 border border-slate-200/30">
                          <row.icon size={13} className="sm:size-[20px] stroke-[2.2]" />
                        </div>
                        <h3 className="font-extrabold text-[12px] sm:text-[16px] text-slate-800 leading-tight">
                          {row.label}
                        </h3>
                      </div>

                      {/* Red cross with description */}
                      <div className="flex items-start gap-1 sm:gap-2 pl-0.5 text-[10px] sm:text-[13px] leading-snug">
                        <span className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 rounded-full bg-[#EF4444] text-white font-black text-[8px] sm:text-[9px] flex items-center justify-center shrink-0 mt-0.5">
                          ✕
                        </span>
                        <div className="text-slate-500 font-medium">
                          <strong className="text-[#EF4444] font-extrabold">{row.tradBold}</strong>
                          {row.tradRegular && (
                            <span className="text-slate-500 font-medium">{row.tradRegular}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Cell: ZenTicket Automated Advantage */}
                  <div
                    className={`bg-[#F4F7FF] pl-4 pr-2 sm:px-10 py-4 sm:py-6 border-x-2 border-[#0B53F4] flex items-center gap-1.5 sm:gap-3.5 relative min-h-[90px] sm:min-h-[110px] ${
                      isLast
                        ? "border-b-2 rounded-br-[24px] sm:rounded-br-[32px] shadow-[0_20px_50px_rgba(37,99,235,0.08)]"
                        : "border-b border-blue-100/60"
                    }`}
                  >
                    {/* Bold High Contrast Green Checkbox */}
                    <div className="w-4.5 h-4.5 sm:w-6 sm:h-6 rounded-full bg-[#10B981] flex items-center justify-center text-white shrink-0 shadow-sm shadow-emerald-500/10">
                      <Check size={10} className="sm:size-[12px] stroke-[3.5]" />
                    </div>

                    {/* Advantage Description */}
                    <div className="flex-1 text-left">
                      <h4 className="font-extrabold text-[12px] sm:text-[16.5px] text-slate-950 leading-tight">
                        {row.zen}
                      </h4>
                      <p className="text-[10px] sm:text-[13px] text-slate-500 font-medium mt-0.5 leading-snug">
                        {row.zenDesc}
                      </p>
                    </div>
                  </div>

                  {/* VS Badge: Placed exactly on the card dividing line */}
                  <div className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 z-30 w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center font-bold text-[9px] sm:text-[11px] text-slate-400 select-none">
                    VS
                  </div>

                </div>
              );
            })}
          </div>

        </div>
      </div>
    </section>
  );
};

export default ComparisonTable;
