import type { Dispatch, SetStateAction } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Database, Play, RefreshCw, Shield, Users, X, Zap } from "lucide-react";

import { useToast } from "@/shared/feedback/Toast";
import type { Ticket } from "@/types";
import type { ContingencyStrategy } from "@/workspace/features/scanner/scanner.types";

interface ContingencyPanelProps {
  handleSolveContingency: (ticket: Ticket) => Promise<void>;
  isContingencyModalOpen: boolean;
  isSolvingContingency: boolean;
  selectedContingencyTicket: Ticket | null;
  selectedStrategy: ContingencyStrategy;
  setIsContingencyModalOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedContingencyTicket: Dispatch<SetStateAction<Ticket | null>>;
  setSelectedStrategy: Dispatch<SetStateAction<ContingencyStrategy>>;
  solvingLogs: string[];
  solvingProgress: number;
  tickets: Ticket[];
}

export function ContingencyPanel({
  handleSolveContingency,
  isContingencyModalOpen,
  isSolvingContingency,
  selectedContingencyTicket,
  selectedStrategy,
  setIsContingencyModalOpen,
  setSelectedContingencyTicket,
  setSelectedStrategy,
  solvingLogs,
  solvingProgress,
  tickets
}: ContingencyPanelProps) {
  const toast = useToast();

  return (
    <>
              {/* DETAILED CONTINGENCY CASES DIALOG MODAL */}
              <AnimatePresence>
                {isContingencyModalOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setIsContingencyModalOpen(false)}
                      className="absolute inset-0 bg-slate-900/35 backdrop-blur-md cursor-zoom-out"
                    />

                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 15 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 15 }}
                      className="bg-white border border-slate-200/80 rounded-[1.15rem] p-5 shadow-[var(--shadow-elevated)] relative max-w-2xl w-full z-10 flex flex-col max-h-[85vh]"
                    >
                      {/* Header block */}
                      <div className="flex items-center justify-between border-b border-slate-105 pb-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                            <Shield className="w-5 h-5 stroke-[2.3]" />
                          </div>
                          <div className="text-left">
                            <span className="text-[9px] uppercase font-black text-orange-600 tracking-wider block font-mono">Detalle</span>
                            <h3 className="text-base font-black text-slate-900 leading-tight">Casos en Contingencia (Historial Completo)</h3>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setIsContingencyModalOpen(false)}
                          className="w-8 h-8 rounded-full hover:bg-slate-100/80 flex items-center justify-center text-slate-400 hover:text-slate-700 transition cursor-pointer"
                        >
                          <X className="w-5 h-5 stroke-[2.5]" />
                        </button>
                      </div>

                      {/* Contingency complete scroll list */}
                      <div className="flex-1 overflow-y-auto pt-4 pr-1 space-y-3 max-h-[60vh] scrollbar-none">
                        {(() => {
                          const rawFailedList = tickets.filter(t => t.status === "failed" || t.status === "review");
                          const list = rawFailedList.length > 0 ? rawFailedList : [
                            {
                              id: "demo-tkt-123",
                              nombreEmisor: "Walmart de México S. de R.L. de C.V.",
                              rfcEmisor: "NWM9709244W4",
                              folio: "WM-948271",
                              total: 2351.50,
                              status: "failed",
                              errorMsg: "Error de timbrado: RFC del emisor no existe o tiene discrepancias críticas contra el padrón SAT."
                            },
                            {
                              id: "demo_ticket_4",
                              nombreEmisor: "Liverpool S.A. de C.V.",
                              rfcEmisor: "LIV8402128V1",
                              folio: "LIV-8942-A",
                              total: 1250.00,
                              status: "review",
                              errorMsg: "Límite superado: El portal del emisor requería más de 6 reintentos continuos de OCR por distorsiones."
                            }
                          ];

                          return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                              {list.map(t => {
                                const isCur = selectedContingencyTicket?.id === t.id;
                                return (
                                  <div
                                    key={t.id}
                                    onClick={() => {
                                      if (!isSolvingContingency) {
                                        setSelectedContingencyTicket(t as Ticket);
                                        setIsContingencyModalOpen(false);
                                        toast.info(`Cargado diagnóstico para ${t.nombreEmisor}.`);
                                      }
                                    }}
                                    className={`p-4 rounded-2xl cursor-pointer text-left border transition-all ${
                                      isCur
                                        ? "bg-blue-50/50 border-[#0b53f4] text-[#0b53f4] ring-1 ring-[#0b53f4]/20"
                                        : "bg-slate-50/50 hover:bg-slate-50 border-slate-200 text-slate-800"
                                    }`}
                                  >
                                    <div className="flex justify-between items-start gap-2">
                                      <span className={`text-[11px] font-black uppercase tracking-wide truncate max-w-[170px] ${isCur ? "text-[#0b53f4]" : "text-slate-800"}`}>{t.nombreEmisor}</span>
                                      <span className={`text-[10px] font-extrabold font-mono shrink-0 ${isCur ? "text-[#0b53f4]" : "text-slate-900"}`}>${(t.total || 0).toFixed(2)}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-450 font-mono leading-none mt-1">RFC: {t.rfcEmisor || "S/D"} • Folio: {t.folio || "S/D"}</p>
                                    
                                    <p className="text-[9.5px] font-mono text-rose-605 truncate mt-2.5 leading-tight bg-rose-50 p-1.5 border border-rose-100 rounded">
                                      ⚠️ {t.errorMsg || "Detener en flujo ordinario"}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              {/* ====================================================================== */}
              {/* PANEL DE CONTINGENCIA IA (SOPORTE AVANZADO & AUTOCORRECCIÓN) */}
              {/* ====================================================================== */}
              <div id="ai-contingency-panel-card" className="bg-white text-slate-800 rounded-[1.15rem] p-4 shadow-[var(--shadow-surface)] space-y-4 text-left relative overflow-hidden border border-slate-200/70">
                <div className="absolute top-0 right-0 w-36 h-36 bg-orange-500/5 rounded-full blur-2xl pointer-events-none" />
                
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-orange-55 text-orange-500 flex items-center justify-center">
                      <Shield className="w-5 h-5 stroke-[2.3]" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-black text-[#0B53F4]/80 tracking-wider block font-mono">Soporte</span>
                      <h3 className="text-base font-black text-slate-900 tracking-tight">Panel de Contingencia IA</h3>
                    </div>
                  </div>
                  <span className="bg-orange-50 border border-orange-200 text-orange-700 text-[10.5px] font-bold px-2.5 py-1 rounded-xl">
                    Soporte & Autocorrección
                  </span>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed font-sans font-medium">
                  Rescata automáticamente aquellos tickets y facturas trabadas debido a problemas externos (portales lentos, CAPTCHAs, errores tipográficos o caídas del SAT).
                </p>

                {/* Contingency tickets list selection slider */}
                <div className="space-y-2">
                  <span className="text-[10px] text-slate-450 font-bold uppercase tracking-wider block font-mono">1. Seleccionar Ticket para Diagnóstico</span>
                  
                  {(() => {
                    const rawFailedList = tickets.filter(t => t.status === "failed" || t.status === "review");
                    
                    const listToRender = rawFailedList.length > 0 ? rawFailedList : [
                      {
                        id: "demo-tkt-123",
                        nombreEmisor: "Walmart de México S. de R.L. de C.V.",
                        rfcEmisor: "NWM9709244W4",
                        folio: "WM-948271",
                        total: 2351.50,
                        status: "failed",
                        errorMsg: "Error de timbrado: RFC del emisor no existe o tiene discrepancias críticas contra el padrón SAT."
                      },
                      {
                        id: "demo_ticket_4",
                        nombreEmisor: "Liverpool S.A. de C.V.",
                        rfcEmisor: "LIV8402128V1",
                        folio: "LIV-8942-A",
                        total: 1250.00,
                        status: "review",
                        errorMsg: "Límite superado: El portal del emisor requería más de 6 reintentos continuos de OCR por distorsiones."
                      }
                    ];

                    const slicedToRender = listToRender.slice(0, 3);

                    return (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                          {slicedToRender.map(t => {
                            const isCur = selectedContingencyTicket?.id === t.id;
                            return (
                              <div
                                key={t.id}
                                onClick={() => !isSolvingContingency && setSelectedContingencyTicket(t as Ticket)}
                                className={`p-3.5 rounded-2xl cursor-pointer text-left border transition-all ${
                                  isCur
                                    ? "bg-blue-50/50 border-[#0b53f4] text-[#0b53f4] ring-1 ring-[#0b53f4]/20"
                                    : "bg-slate-50/55 hover:bg-slate-50 border-slate-200 text-slate-705"
                                }`}
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <span className={`text-[11px] font-black uppercase tracking-wide truncate max-w-[170px] ${isCur ? "text-[#0b53f4]" : "text-slate-800"}`}>{t.nombreEmisor}</span>
                                  <span className={`text-[10px] font-extrabold font-mono shrink-0 ${isCur ? "text-[#0b53f4]" : "text-slate-900"}`}>${(t.total || 0).toFixed(2)}</span>
                                </div>
                                <p className="text-[10px] text-slate-400 font-mono leading-none mt-1">RFC: {t.rfcEmisor || "S/D"} • Folio: {t.folio || "S/D"}</p>
                                
                                <p className="text-[9.5px] font-mono text-rose-600 truncate mt-2 leading-tight bg-rose-50 p-1 border border-rose-100">
                                  ⚠️ {t.errorMsg || "Detener en flujo ordinario"}
                                </p>
                              </div>
                            );
                          })}
                        </div>

                        {/* SEE ALL BUTTON */}
                        {listToRender.length > 3 && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => setIsContingencyModalOpen(true)}
                              className="group w-full py-3 px-4.5 bg-slate-50 hover:bg-slate-100/90 active:bg-slate-200 border border-slate-205 text-slate-705 hover:text-[#0B53F4] hover:border-[#0B53F4]/20 font-extrabold text-[11px] uppercase tracking-wider rounded-xl transition-all duration-150 cursor-pointer flex items-center justify-center gap-2"
                            >
                              <span>Ver Todos los Casos de Contingencia ({listToRender.length})</span>
                              <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#0B53F4] group-hover:translate-x-1 transition-transform" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Selected ticket workspace details */}
                {selectedContingencyTicket && (
                  <div className="bg-slate-50 border border-slate-200 rounded-[1.15rem] p-4 space-y-4 animate-fadeIn">
                    {/* Ticket Info header */}
                    <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                      <div>
                        <span className="text-[10px] text-[#0B53F4] font-black uppercase font-mono font-bold tracking-wider">DIAGNÓSTICO COMPLETO</span>
                        <h4 className="text-xs font-black text-slate-805 uppercase mt-0.5">Analizando {selectedContingencyTicket.nombreEmisor}</h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => !isSolvingContingency && setSelectedContingencyTicket(null)}
                        className="text-slate-400 hover:text-slate-700 transition cursor-pointer bg-transparent border-none outline-none"
                      >
                        <X className="w-5.5 h-5.5" />
                      </button>
                    </div>

                    {/* 1. DIAGNÓSTICO DEL FLUJO CRÍTICO (LINEA DE TIEMPO VISUAL) */}
                    <div className="space-y-3.5 text-left">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block font-mono">1. Diagnóstico del Flujo Crítico (¿Dónde se trabó?)</span>
                      
                      <div className="relative pl-5 border-l-2 border-slate-200 space-y-4">
                        {/* Step 1: Captura OCR */}
                        <div className="relative">
                          <div className="absolute -left-[27px] w-4 h-4 rounded-full bg-emerald-500 border-4 border-slate-50 flex items-center justify-center shadow-md">
                            <div className="w-1 h-1 bg-white rounded-full"></div>
                          </div>
                          <div>
                            <h5 className="text-[11px] font-black text-slate-800 flex items-center gap-1.5 leading-none">
                              Captura OCR
                              <span className="text-[8px] bg-emerald-50 text-emerald-700 border border-emerald-250 px-1 py-0.2 rounded font-sans leading-none">Éxito ✔️</span>
                            </h5>
                            <p className="text-[9.5px] text-slate-500 mt-0.5 leading-normal">Imagen del ticket digitalizada correctamente. Datos binarios recuperados en buffer.</p>
                          </div>
                        </div>

                        {/* Step 2: Mapeo Heurístico */}
                        <div className="relative">
                          <div className="absolute -left-[27px] w-4 h-4 rounded-full bg-emerald-500 border-4 border-slate-50 flex items-center justify-center shadow-md">
                            <div className="w-1 h-1 bg-white rounded-full"></div>
                          </div>
                          <div>
                            <h5 className="text-[11px] font-black text-slate-800 flex items-center gap-1.5 leading-none">
                              Mapeo Heurístico
                              <span className="text-[8px] bg-emerald-50 text-emerald-700 border border-emerald-250 px-1 py-0.2 rounded font-sans leading-none">Identificado ✔️</span>
                            </h5>
                            <p className="text-[9.5px] text-slate-500 mt-0.5 leading-normal">
                              Importes, folios y fechas localizados. Total detectado: <span className="text-emerald-700 font-mono font-bold">${(selectedContingencyTicket.total || 0).toFixed(2)} MXN</span>
                            </p>
                          </div>
                        </div>

                        {/* Step 3: Portal Emisor */}
                        <div className="relative">
                          <div className="absolute -left-[27px] w-4 h-4 rounded-full bg-rose-500 border-4 border-slate-50 flex items-center justify-center shadow-md">
                            <div className="w-1 h-1 bg-white rounded-full"></div>
                          </div>
                          <div>
                            <h5 className="text-[11px] font-black text-rose-600 flex items-center gap-1.5 leading-none">
                              Portal Emisor
                              <span className="text-[8px] bg-rose-50 text-rose-700 border border-rose-250 px-1 py-0.2 rounded font-sans leading-none animate-pulse">Bloqueado ❌</span>
                            </h5>
                            <p className="text-[9.5px] text-slate-700 mt-1 leading-relaxed bg-[#FAF9FF] p-2.5 border border-slate-200 rounded-xl font-mono">
                              <b>Causa raíz:</b> {selectedContingencyTicket.errorMsg || "Timeout o bloqueo parcial anti-bot en el robot de Playwright."}
                            </p>
                          </div>
                        </div>

                        {/* Step 4: Emisión CFDI */}
                        <div className="relative">
                          <div className="absolute -left-[27px] w-4 h-4 rounded-full bg-slate-200 border-4 border-slate-50 flex items-center justify-center">
                            <div className="w-1 h-1 bg-slate-400 rounded-full"></div>
                          </div>
                          <div>
                            <h5 className="text-[11px] font-black text-slate-450 flex items-center gap-1.5 leading-none">
                              Emisión CFDI
                              <span className="text-[8px] bg-slate-100 text-slate-550 px-1 py-0.2 rounded font-sans leading-none">En espera ⌛</span>
                            </h5>
                            <p className="text-[9.5px] text-slate-400 mt-0.5 leading-normal">Timbrado pendiente. Esperando resolución de contingencia de portal.</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 2. ESTRATEGIAS DE RESOLUCIÓN INTELIGENTES */}
                    <div className="space-y-3.5 text-left pt-2">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block font-mono">2. Estrategias de Mitigación Inteligentes (Seleccionable)</span>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {/* OCR Recalibration */}
                        <div
                          onClick={() => !isSolvingContingency && setSelectedStrategy("ocr")}
                          className={`p-3 rounded-xl border cursor-pointer transition text-left flex gap-2.5 ${
                            selectedStrategy === "ocr"
                              ? "border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500/10 text-indigo-950"
                              : "border-slate-205 bg-white hover:bg-slate-50/50"
                          }`}
                        >
                          <RefreshCw className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                          <div>
                            <span className={`text-[10.5px] font-black block ${selectedStrategy === "ocr" ? "text-indigo-900" : "text-slate-800"}`}>Recalibración OCR</span>
                            <p className="text-[9px] text-slate-500 leading-tight mt-0.5">Filtros de reducción de ruido e interpretación avanzada para textos pixelados.</p>
                          </div>
                        </div>

                        {/* RFC Enmienda */}
                        <div
                          onClick={() => !isSolvingContingency && setSelectedStrategy("rfc")}
                          className={`p-3 rounded-xl border cursor-pointer transition text-left flex gap-2.5 ${
                            selectedStrategy === "rfc"
                              ? "border-sky-500 bg-sky-50/70 ring-1 ring-sky-500/10 text-sky-950"
                              : "border-slate-205 bg-white hover:bg-slate-50/50"
                          }`}
                        >
                          <Users className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                          <div>
                            <span className={`text-[10.5px] font-black block ${selectedStrategy === "rfc" ? "text-sky-900" : "text-slate-800"}`}>Enmienda de RFC Emisor</span>
                            <p className="text-[9px] text-slate-500 leading-tight mt-0.5">Corrige errores tipográficos comunes cotejando vs padrón oficial del SAT.</p>
                          </div>
                        </div>

                        {/* Forzar RESICO */}
                        <div
                          onClick={() => !isSolvingContingency && setSelectedStrategy("resico")}
                          className={`p-3 rounded-xl border cursor-pointer transition text-left flex gap-2.5 ${
                            selectedStrategy === "resico"
                              ? "border-amber-500 bg-amber-50/70 ring-1 ring-amber-500/10 text-amber-955"
                              : "border-slate-205 bg-white hover:bg-slate-50/50"
                          }`}
                        >
                          <Database className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <span className={`text-[10.5px] font-black block ${selectedStrategy === "resico" ? "text-amber-900" : "text-slate-800"}`}>Forzar RESICO</span>
                            <p className="text-[9px] text-slate-500 leading-tight mt-0.5">Omitir temporalmente validaciones ultraestrictas de régimen fiscal 4.0.</p>
                          </div>
                        </div>

                        {/* Parche Playwright */}
                        <div
                          onClick={() => !isSolvingContingency && setSelectedStrategy("playwright")}
                          className={`p-3 rounded-xl border cursor-pointer transition text-left flex gap-2.5 ${
                            selectedStrategy === "playwright"
                              ? "border-orange-500 bg-orange-50/70 ring-1 ring-orange-500/10 text-orange-955"
                              : "border-slate-205 bg-white hover:bg-slate-50/50"
                          }`}
                        >
                          <Play className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                          <div>
                            <span className={`text-[10.5px] font-black block ${selectedStrategy === "playwright" ? "text-orange-900" : "text-slate-800"}`}>Parche Dinámico Playwright</span>
                            <p className="text-[9px] text-slate-500 leading-tight mt-0.5">Omitirá cargas lentas de la página de facturación externa para evadir anti-bots.</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* PROGRESS MONITOR / LOGS TERMINAL WHEN RUNNING */}
                    {isSolvingContingency && (
                      <div className="space-y-3 pt-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-orange-600 font-extrabold uppercase font-mono animate-pulse">⚙️ Autocorrector Heurístico Activo...</span>
                          <span className="text-xs font-black text-slate-700 font-mono">{solvingProgress}%</span>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden shadow-inner border border-slate-200">
                          <div className="bg-gradient-to-r from-orange-400 to-indigo-500 h-full rounded-full transition-all duration-300" style={{ width: `${solvingProgress}%` }} />
                        </div>

                        {/* Console logs */}
                        <div className="bg-[#050B14] rounded-xl p-3 border border-slate-850 text-left font-mono text-[10px] text-[#38BDF8] max-h-36 overflow-y-auto leading-relaxed space-y-1 scrollbar-none select-text">
                          {solvingLogs.map((log, index) => (
                            <div key={index} className="flex gap-2 text-white/90">
                              <span className="text-[#38BDF8]">[{new Date().toLocaleTimeString()}]</span>
                              <span className={log.startsWith("✅") ? "text-emerald-400 font-bold font-sans text-xs" : "text-indigo-250"}>{log}</span>
                            </div>
                          ))}
                          <div className="animate-pulse inline-block w-1.5 h-3 bg-indigo-400 ml-1"></div>
                        </div>
                      </div>
                    )}

                    {/* Trigger Button */}
                    {!isSolvingContingency && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => handleSolveContingency(selectedContingencyTicket)}
                          className="w-full bg-[#0B53F4] hover:bg-[#0747D1] text-white py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-[#0B53F4]/10 cursor-pointer flex items-center justify-center gap-2 active:scale-98 leading-none"
                        >
                          <Zap className="w-4 h-4 fill-white animate-bounce" />
                          <span>Solucionar Problema Automáticamente</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
    </>
  );
}
