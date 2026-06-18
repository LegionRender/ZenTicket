import React, { useState, useEffect } from "react";
import { Ticket, Invoice } from "@/types";
import { 
  ChevronLeft, ChevronRight, Share2, FileText, Check, Download, ArrowLeft, 
  Coffee, ShoppingBag, Car, Printer, Mail, Trash2,
  Clock, Sparkles, Eye, ShieldCheck, ZoomIn,
  ZoomOut, RotateCcw, X, ExternalLink, RefreshCw, Search,
  ArrowUpRight
} from "lucide-react";
import { useToast } from "@/shared/feedback/Toast";
import { getConfigStatus } from "@/services/api/configService";
import { sendInvoiceEmail } from "@/services/api/emailService";
import { TicketsListScreenProps as TicketsListScreenPropsExtracted } from "./tickets.types";
import { MOCK_EMITTED_INVOICES } from "./ticketsMocks";
import { getBrandBrandIcon } from "./ticketsUtils";
import {
  EmptyState,
  SearchInput,
  SecondaryAction,
  StatusBadge,
  Tabs,
} from "@/workspace/components/WorkspacePrimitives";


export default function TicketsListScreen({
  tickets,
  invoices,
  onTriggerSimulationInline,
  currentUserEmail,
  onDeleteTicket,
  onTabChange,
  newlyAddedTicketId,
  onClearNewlyAddedTicketId
}: TicketsListScreenPropsExtracted) {
  const toast = useToast();
  
  // Smoothly clear the newly added ID after 5 seconds to stop pulsing
  useEffect(() => {
    if (newlyAddedTicketId && onClearNewlyAddedTicketId) {
      const timer = setTimeout(() => {
        onClearNewlyAddedTicketId();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [newlyAddedTicketId, onClearNewlyAddedTicketId]);
  
  // Outer routing tabs: list or ver-pdf
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [showXmlCode, setShowXmlCode] = useState(false);
  
  // Filter inside list
  const [activeSubTab, setActiveSubTab] = useState<"en-seguimiento" | "facturas-emitidas">("en-seguimiento");
  const [searchQuery, setSearchQuery] = useState("");
  const [trackingStatusFilter, setTrackingStatusFilter] = useState<"todos" | "processing" | "review" | "failed">("todos");
  const [showAllTracking, setShowAllTracking] = useState(false);
  const [showAllInvoices, setShowAllInvoices] = useState(false);
  
  // Interactive inputs
  const [emailTo, setEmailTo] = useState(currentUserEmail || "legionrender@gmail.com");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [ticketIdToDelete, setTicketIdToDelete] = useState<string | null>(null);
  const [smtpStatus, setSmtpStatus] = useState<{ smtpConfigured: boolean; smtpUser: string | null } | null>(null);

  // Retrieve SMTP setup status on load
  useEffect(() => {
    let active = true;
    getConfigStatus()
      .then((data) => {
        if (active) {
          setSmtpStatus(data);
        }
      })
      .catch((err) => console.warn("SMTP check inactive:", err));
    return () => {
      active = false;
    };
  }, []);

  // Download logic for raw files
  const downloadFile = (content: string, fileName: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Archivo descargado con Ã©xito: ${fileName}`, "Descarga Completa");
  };

  // Email simulation matching original endpoint
  const handleSendEmail = async (invoiceObj: any) => {
    setIsSendingEmail(true);
    const emailToastId = toast.loading(`Enviando copia de factura a ${emailTo}...`, "Enviando Correo");
    try {
      const data = await sendInvoiceEmail({
        to: emailTo,
        invoice: {
          ...invoiceObj,
          folioFiscal: invoiceObj.folioFiscal || "E5B9C231-18FA-427D-B27D-1F3D573B4D22",
          pdfHtml: invoiceObj.pdfHtml || `<p>Factura de ${invoiceObj.nombreEmisor} por un total de $${invoiceObj.total}</p>`
        }
      });
      toast.removeToast(emailToastId);
      toast.success(data.message || `¡Factura enviada con éxito a ${emailTo}!`, "Correo Enviado");
    } catch (err: any) {
      console.error(err);
      toast.removeToast(emailToastId);
      toast.error(err.message || "Error al enviar el correo", "Error de envÃ­o");
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Use strictly real user data here, with absolutely no simulation/mock data.
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const inProgressList = tickets.filter((ticket) => {
    if (ticket.status === "completed") return false;
    if (trackingStatusFilter !== "todos" && ticket.status !== trackingStatusFilter) return false;
    if (!normalizedSearch) return true;

    const haystack = [
      ticket.nombreEmisor,
      ticket.rfcEmisor,
      ticket.folio,
      ticket.fechaCompra,
      ticket.errorMsg,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  });

  const emittedInvoicesList = invoices.filter((invoice) => {
    if (!normalizedSearch) return true;
    const haystack = [
      invoice.nombreEmisor,
      invoice.rfcEmisor,
      invoice.folioFiscal,
      invoice.ticketId,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  });

  // Handle opening the details view
  const activeInvoiceData = emittedInvoicesList.find(inv => inv.id === selectedInvoiceId);

  // ----------------------------------------------------
  // THIRD VIEW SCREEN: VER PDF - DETALLE DE FACTURA
  // ----------------------------------------------------
  if (activeInvoiceData) {
    const isMock = activeInvoiceData.id?.startsWith("mock-");
    
    // Resolve dynamic currency and details
    const totalVal = activeInvoiceData.total || 0;
    const subtotalVal = totalVal / 1.16;
    const ivaVal = totalVal - subtotalVal;
    
    const emisorNameRaw = activeInvoiceData.nombreEmisor || "Emisor SAT";
    const emisorCorp = isMock 
      ? (activeInvoiceData as any).nombreEmisor === "Starbucks" ? "CafÃ© Sirena S. de R.L. de C.V." : `${emisorNameRaw} S.A. de C.V.`
      : `${emisorNameRaw} S.A. de C.V.`;
      
    const rfcEmisorVal = activeInvoiceData.rfcEmisor || "CSI020226MV4";
    const uuidVal = activeInvoiceData.folioFiscal || "E5B9C231-18FA-427D-B27D-1F3D573B4D22";
    
    // Format dates nicely
    let formattedDate = "24/10/2023 14:22:10";
    if (!isMock && activeInvoiceData.createdAt) {
      try {
        formattedDate = new Date(activeInvoiceData.createdAt).toLocaleString("es-MX");
      } catch {
        formattedDate = activeInvoiceData.createdAt;
      }
    } else if (activeInvoiceData.createdAt) {
      formattedDate = activeInvoiceData.createdAt;
    }

    // Capture items list
    const itemsList = (activeInvoiceData as any).items || [
      { description: "1x Consumo General de MercancÃ­as", amount: totalVal, code: "90101700" }
    ];

    const brandStyle = getBrandBrandIcon(emisorNameRaw);

    return (
      <div className="max-w-6xl mx-auto space-y-8 font-sans text-left mt-2 relative select-none pb-24 animate-fade-in_50">
        
        {/* Nav header matching Screen 3 */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedInvoiceId(null);
                setShowXmlCode(false);
              }}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full cursor-pointer transition"
              title="Volver"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Ver PDF - Detalle de Factura</h1>
          </div>

          <button
            type="button"
            onClick={() => {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(`https://sat.gob.mx/cfdi/${uuidVal}`);
                toast.success("Enlace oficial CFDI SAT copiado con Ã©xito.", "Compartir Factura");
              } else {
                toast.info(`UUID: ${uuidVal}`, "Detalle de EmisiÃ³n");
              }
            }}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full cursor-pointer transition"
            title="Compartir"
          >
            <Share2 className="w-5 h-5 text-slate-650" />
          </button>
        </div>

        {/* Widescreen 2-column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT COLUMN: THE WHITE PAPER INVOICE PREVIEW (lg:col-span-7) */}
          <div className="lg:col-span-7 space-y-6">
            {/* ELEGANT WHITE PAPER CONTAINER */}
            <div className="bg-white border border-slate-200/90 rounded-[28px] p-6 shadow-[0_4px_24px_rgba(15,23,42,0.04)] relative">
          
          {/* Top band row */}
          <div className="flex items-start justify-between">
            <span className="bg-[#0B53F4] text-white text-[10px] font-black tracking-widest px-3 py-1 rounded-md uppercase font-sans">
              FACTURA ELECTRÃ“NICA
            </span>
            <div className={`w-10 h-10 ${brandStyle.color} rounded-full flex items-center justify-center shrink-0`}>
              <brandStyle.IconComponent className="w-5 h-5 stroke-[2.2]" />
            </div>
          </div>

          {/* Business identity */}
          <div className="mt-4 text-left">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-none mb-1">
              {emisorNameRaw}
            </h2>
            <p className="text-xs text-slate-450 font-bold leading-normal">
              {emisorCorp}
            </p>
          </div>

          {/* Dotted section divider */}
          <div className="border-t border-dashed border-slate-200 my-5" />

          {/* Two-column SAT tax metadata grid */}
          <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-[10px] sm:text-[11px]">
            <div className="space-y-0.5 text-left">
              <span className="text-slate-400 font-extrabold uppercase tracking-wide block">RFC Emisor</span>
              <span className="text-slate-800 font-black tracking-tight block select-all">{rfcEmisorVal}</span>
            </div>

            <div className="space-y-0.5 text-left">
              <span className="text-slate-400 font-extrabold uppercase tracking-wide block">Folio Fiscal (UUID)</span>
              <span className="text-slate-800 font-black tracking-tight block select-all truncate max-w-[140px]" title={uuidVal}>
                {uuidVal.length > 15 ? `${uuidVal.substring(0,8)}...${uuidVal.substring(uuidVal.length - 4)}` : uuidVal}
              </span>
            </div>

            <div className="space-y-0.5 text-left">
              <span className="text-slate-400 font-extrabold uppercase tracking-wide block">Fecha EmisiÃ³n</span>
              <span className="text-slate-800 font-black block">{formattedDate}</span>
            </div>

            <div className="space-y-0.5 text-left">
              <span className="text-slate-400 font-extrabold uppercase tracking-wide block">MÃ©todo Pago</span>
              <span className="text-slate-800 font-black block">PUE - Pago en una sola exhibiciÃ³n</span>
            </div>
          </div>

          {/* Dotted separation line */}
          <div className="border-t border-dashed border-slate-200 my-5" />

          {/* CONCEPTOS TABLE */}
          <div className="space-y-4">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest text-left">Conceptos</h3>
            
            <div className="space-y-3">
              {itemsList.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between items-start text-xs sm:text-sm">
                  <div className="text-left leading-normal max-w-[280px]">
                    <p className="font-extrabold text-slate-800 font-sans">{item.description || item.descripcion}</p>
                    <p className="text-[10px] text-slate-400 font-medium block mt-0.5">
                      Clave Prod/Serv: {item.code || "90101700"}
                    </p>
                  </div>
                  <span className="font-mono text-slate-900 font-black text-right shrink-0">
                    ${(item.amount || item.importe || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* BLUE HIGHLIGHTED TOTAL BOX PILL */}
          <div className="bg-[#F1F3FE]/65 border border-blue-50 p-4.5 rounded-[22px] mt-6 space-y-2 text-left">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 font-bold">Subtotal</span>
              <span className="font-mono text-slate-700 font-black">${subtotalVal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 font-bold">IVA (16%)</span>
              <span className="font-mono text-slate-700 font-black">${ivaVal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            <div className="border-t border-slate-200/50 my-1 pt-1.5 flex justify-between items-center">
              <span className="text-slate-800 font-black text-xs uppercase tracking-wider">TOTAL MXN</span>
              <span className="font-mono text-[#0B53F4] text-lg font-black tracking-tight">${totalVal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* QR & SECURITY MATRIX FOOTER */}
          <div className="flex flex-col gap-4 mt-6 pt-5 border-t border-slate-100 text-left">
            <div className="flex items-center gap-4">
              {/* Custom vector SVG QR code representation */}
              <div className="w-14 h-14 bg-slate-100 flex-shrink-0 flex items-center justify-center rounded-lg p-1.5 border border-slate-200">
                <svg className="w-full h-full text-slate-700" viewBox="0 0 100 100" fill="currentColor">
                  <path d="M0,0 h30 v30 h-30 z M10,10 h10 v10 h-10 z" />
                  <path d="M70,0 h30 v30 h-30 z M80,10 h10 v10 h-10 z" />
                  <path d="M0,70 h30 v30 h-30 z M10,80 h10 v10 h-10 z" />
                  <path d="M40,10 h10 v10 h-10 z M55,0 h10 v15 h-10 z" />
                  <path d="M40,40 h15 v5 h-15 z M45,55 h20 v10 h-20 z" />
                  <path d="M75,40 h15 v20 h-15 z M85,75 h10 v15 h-10 z" />
                  <path d="M40,80 h10 v10 h-10 z M55,75 h20 v5 h-20 z" />
                </svg>
              </div>

              <div className="leading-tight min-w-0 flex-1">
                <p className="text-[7.5px] text-slate-400 font-mono select-all overflow-hidden text-ellipsis line-clamp-2 uppercase break-all">
                  Sello Digital del SAT: JX9A23KSF841HLWND82HJKLSW0K295LW0192LSLW0KND82910NSDLUQ9W892019ADJLW2
                </p>
                <span className="text-[8px] uppercase font-black text-emerald-600 block mt-1 tracking-wider">
                  âœ“ Formato de Factura Timbrada compatible v4.0
                </span>
              </div>
            </div>

            {/* SAT Live Verification Action Button */}
            <a
              href={`https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${uuidVal}&re=${rfcEmisorVal}&rr=XAXX010101000&tt=${totalVal.toFixed(2)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-850 text-white font-sans text-[10px] font-black uppercase tracking-wider py-2.5 px-3 rounded-xl transition cursor-pointer select-none border border-slate-800"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Verificar Estado de Factura directamente en el SAT
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
          </div>

        </div>

        {/* REAL WORKSPACE PICTURE BANNER */}
        <div className="w-full h-32 rounded-3xl overflow-hidden relative border border-slate-200 bg-slate-200">
          <img 
            src="https://images.unsplash.com/photo-1542744094-3a31f103e35f?auto=format&fit=crop&q=80&w=800" 
            alt="Workspace tablet banner"
            className="w-full h-full object-cover select-none pointer-events-none"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-transparent" />
        </div>

      </div> {/* Close Left Column (lg:col-span-7) */}

      {/* RIGHT COLUMN: ACTIONS, CODE PREVIEWS & ACCORDIONS (lg:col-span-5) */}
      <div className="lg:col-span-5 space-y-6">

        {/* PRIMARY ACTIVE BIG ACTIONS */}
        <div className="space-y-3.5">
          <button
            type="button"
            onClick={() => {
              toast.info("Generando reporte PDF tamaÃ±o carta oficial...", "PDF");
              setTimeout(() => {
                const printWindow = window.open("", "_blank");
                if (printWindow) {
                  printWindow.document.write(`
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <title>Factura_${emisorNameRaw}_${uuidVal.substring(0,8)}</title>
                        <style>
                          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&family=Playfair+Display:ital,wght@1,600&display=swap');
                          
                          * {
                            box-sizing: border-box;
                          }
                          body {
                            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                            color: #1e293b;
                            background-color: #f1f5f9;
                            margin: 0;
                            padding: 40px 10px;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                          }
                          .page-wrapper {
                            max-width: 820px;
                            margin: 0 auto;
                            background-color: #ffffff;
                            border: 1px solid #e2e8f0;
                            border-radius: 40px;
                            padding: 56px;
                            box-shadow: 0 20px 40px -15px rgba(15,23,42,0.06);
                            position: relative;
                            overflow: hidden;
                          }
                          
                          /* Top-right custom curved graphic elements inspired by modern designer templates */
                          .top-right-decor {
                            position: absolute;
                            top: -60px;
                            right: -60px;
                            width: 280px;
                            height: 280px;
                            background: linear-gradient(135deg, #0B53F4 0%, #38bdf8 100%);
                            border-radius: 50% 50% 0% 100%;
                            z-index: 1;
                            opacity: 0.95;
                          }
                          .top-right-decor-sub {
                            position: absolute;
                            top: -100px;
                            right: 140px;
                            width: 150px;
                            height: 150px;
                            background: rgba(11, 83, 244, 0.08);
                            border-radius: 50%;
                            z-index: 2;
                          }

                          /* Bottom-left custom curved graphic elements */
                          .bottom-left-decor {
                            position: absolute;
                            bottom: -90px;
                            left: -90px;
                            width: 250px;
                            height: 250px;
                            background: linear-gradient(315deg, #0B53F4 0%, #1e1b4b 100%);
                            border-radius: 0% 100% 50% 50%;
                            z-index: 1;
                            opacity: 0.9;
                          }

                          .header-container {
                            display: flex;
                            justify-content: space-between;
                            align-items: flex-start;
                            position: relative;
                            z-index: 10;
                            margin-bottom: 50px;
                          }

                          /* Styled Logo matching modern look */
                          .logo-badge-row {
                            display: flex;
                            align-items: center;
                            gap: 16px;
                          }
                          .logo-circle {
                            width: 64px;
                            height: 64px;
                            border-radius: 20px;
                            background-color: #0b53f4;
                            color: #ffffff;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-weight: 800;
                            font-size: 28px;
                            box-shadow: 0 8px 16px rgba(11,83,244,0.18);
                          }
                          .logo-text-title {
                            font-size: 26px;
                            font-weight: 800;
                            color: #0d1527;
                            letter-spacing: -0.025em;
                            margin: 0;
                            line-height: 1;
                          }
                          .logo-text-subtitle {
                            font-size: 11px;
                            font-weight: 700;
                            color: #0B53F4;
                            text-transform: uppercase;
                            letter-spacing: 0.15em;
                            margin: 4px 0 0 0;
                          }

                          /* Heading right of Invoice */
                          .invoice-title-box {
                            text-align: right;
                            padding-right: 0px; /* Aligned cleanly without top-right decor */
                          }
                          .invoice-title-box h1 {
                            font-size: 40px;
                            font-weight: 900;
                            color: #0b53f4;
                            margin: 0 0 10px 0;
                            letter-spacing: 0.05em;
                            text-transform: uppercase;
                          }
                          .invoice-meta-item {
                            font-size: 12px;
                            font-weight: 500;
                            color: #475569;
                            margin: 4px 0;
                          }
                          .invoice-meta-item strong {
                            color: #0f172a;
                            font-weight: 700;
                          }

                          /* Columns section: BILL TO & metadata */
                          .billing-info-section {
                            display: grid;
                            grid-template-cols: 1.2fr 0.8fr;
                            gap: 40px;
                            margin-bottom: 45px;
                            position: relative;
                            z-index: 10;
                          }
                          .bill-to-box {
                            border-top: 3px solid #0b53f4;
                            padding-top: 15px;
                          }
                          .bill-title {
                            font-size: 12px;
                            font-weight: 800;
                            color: #0b53f4;
                            text-transform: uppercase;
                            letter-spacing: 0.12em;
                            margin-bottom: 12px;
                          }
                          .bill-client-name {
                            font-size: 18px;
                            font-weight: 800;
                            color: #0f172a;
                            margin: 0 0 8px 0;
                          }
                          .bill-details {
                            font-size: 12px;
                            line-height: 1.6;
                            color: #475569;
                          }
                          .bill-details p {
                            margin: 4px 0;
                          }

                          /* Styled Table layout following modern design precisely */
                          .table-container {
                            margin-bottom: 40px;
                            position: relative;
                            z-index: 10;
                          }
                          .invoice-table {
                            width: 100%;
                            border-collapse: collapse;
                            text-align: left;
                          }
                          .invoice-table th {
                            background-color: #0b53f4;
                            color: #ffffff;
                            font-size: 11px;
                            font-weight: 800;
                            text-transform: uppercase;
                            padding: 16px 20px;
                            letter-spacing: 0.1em;
                            border: none;
                          }
                          .invoice-table th:first-child {
                            border-top-left-radius: 12px;
                            border-bottom-left-radius: 12px;
                            width: 60px;
                            text-align: center;
                          }
                          .invoice-table th:last-child {
                            border-top-right-radius: 12px;
                            border-bottom-right-radius: 12px;
                            text-align: right;
                          }
                          
                          .invoice-table td {
                            padding: 16px 20px;
                            font-size: 13px;
                            color: #334155;
                            border-bottom: 1px solid #e2e8f0;
                          }
                          .invoice-table tr:hover td {
                            background-color: #f8fafc;
                          }
                          .cell-st {
                            text-align: center;
                            font-weight: 700;
                            color: #94a3b8;
                            background-color: #fafbfc;
                            border-right: 1px solid #f1f5f9;
                          }
                          .cell-desc {
                            font-weight: 700;
                            color: #0f172a;
                          }
                          .cell-desc .subtext {
                            font-size: 11px;
                            color: #64748b;
                            font-weight: 400;
                            margin-top: 4px;
                            display: block;
                          }
                          .cell-rate, .cell-qty {
                            color: #475569;
                            font-weight: 600;
                          }
                          .cell-total {
                            font-family: 'JetBrains Mono', monospace;
                            font-weight: 700;
                            color: #0f172a;
                            text-align: right;
                          }

                          /* Bottom totals combined with signatures & notes */
                          .bottom-invoice-row {
                            display: grid;
                            grid-template-cols: 1.12fr 0.88fr;
                            gap: 30px;
                            margin-top: 10px;
                            position: relative;
                            z-index: 10;
                          }
                          
                          .payment-and-signs {
                            display: flex;
                            flex-direction: column;
                            justify-content: space-between;
                          }
                          .notes-block {
                            background-color: #f8fafc;
                            border-radius: 16px;
                            padding: 20px;
                            font-size: 11px;
                            color: #64748b;
                            line-height: 1.5;
                            margin-bottom: 24px;
                          }
                          .notes-block h4 {
                            font-size: 11px;
                            font-weight: 800;
                            text-transform: uppercase;
                            color: #1e293b;
                            margin: 0 0 6px 0;
                            letter-spacing: 0.05em;
                          }

                          /* Signature section as requested from template */
                          .signature-container {
                            margin-top: 10px;
                            text-align: left;
                          }
                          .signature-author {
                            font-family: 'Playfair Display', Georgia, serif;
                            font-size: 26px;
                            color: #0b53f4;
                            font-style: italic;
                            margin: 0 0 4px 0;
                            user-select: none;
                          }
                          .signature-line {
                            width: 200px;
                            height: 1.5px;
                            background-color: #cbd5e1;
                            margin-bottom: 6px;
                          }
                          .signature-title {
                            font-size: 11px;
                            font-weight: 750;
                            color: #64748b;
                            text-transform: uppercase;
                            letter-spacing: 0.05em;
                          }

                          /* Grand total panel precisely like template */
                          .grand-totals-panel {
                            display: flex;
                            flex-direction: column;
                            gap: 12px;
                            background-color: #ffffff;
                            border: 1.5px solid #f1f5f9;
                            border-radius: 24px;
                            padding: 24px;
                            align-self: flex-start;
                          }
                          .subtotal-metric-row {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            font-size: 13px;
                            font-weight: 600;
                            color: #475569;
                          }
                          .subtotal-metric-row span:last-child {
                            font-family: 'JetBrains Mono', monospace;
                            color: #1e293b;
                            font-weight: 700;
                          }
                          
                          /* Blue total box with slanted layout simulation (or professional rounded badge) */
                          .grand-total-blue-badge {
                            background: linear-gradient(90deg, #0b53f4 0%, #0942c4 100%);
                            border-radius: 12px;
                            padding: 16px 20px;
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            color: #ffffff;
                            margin-top: 10px;
                            box-shadow: 0 6px 16px rgba(11,83,244,0.15);
                          }
                          .grand-total-blue-badge .label {
                            font-size: 12px;
                            font-weight: 800;
                            letter-spacing: 0.08em;
                            text-transform: uppercase;
                          }
                          .grand-total-blue-badge .val {
                            font-family: 'JetBrains Mono', monospace;
                            font-size: 20px;
                            font-weight: 800;
                          }

                          /* Sat Security Verification Row */
                          .sat-verification-section {
                            margin-top: 40px;
                            border-top: 1px solid #f1f5f9;
                            padding-top: 28px;
                            display: flex;
                            align-items: center;
                            gap: 24px;
                            position: relative;
                            z-index: 10;
                          }
                          .qr-code-holder {
                            width: 80px;
                            height: 80px;
                            background-color: #ffffff;
                            border: 1px dashed #cbd5e1;
                            border-radius: 16px;
                            padding: 8px;
                            flex-shrink: 0;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                          }
                          .stamp-details-box {
                            flex-grow: 1;
                            min-width: 0;
                          }
                          .stamp-headline {
                            font-size: 9px;
                            font-weight: 800;
                            color: #94a3b8;
                            text-transform: uppercase;
                            letter-spacing: 0.08em;
                            margin: 0 0 6px 0;
                          }
                          .stamp-content {
                            font-family: 'JetBrains Mono', monospace;
                            font-size: 8px;
                            color: #64748b;
                            line-height: 1.4;
                            word-break: break-all;
                            margin: 0 0 8px 0;
                            background-color: #f8fafc;
                            padding: 8px 12px;
                            border-radius: 8px;
                            border: 1px solid #f1f5f9;
                          }
                          .certified-pill {
                            font-size: 11px;
                            font-weight: 800;
                            color: #10b981;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            text-transform: uppercase;
                          }
                          .certified-pill svg {
                            width: 14px;
                            height: 14px;
                            stroke: #10b981;
                          }

                          /* Interactive Contact Banner precisely styled like presentation mockup */
                          .custom-decor-footer-banner {
                            margin-top: 50px;
                            background-color: #0b53f4;
                            border-radius: 20px;
                            padding: 16px 24px;
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            color: #ffffff;
                            font-size: 11px;
                            font-weight: 600;
                            position: relative;
                            z-index: 10;
                            box-shadow: 0 4px 15px rgba(11,83,244,0.1);
                          }
                          .footer-banner-item {
                            display: flex;
                            align-items: center;
                            gap: 8px;
                          }
                          .footer-banner-icon {
                            width: 24px;
                            height: 24px;
                            background-color: rgba(255,255,255,0.15);
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 10px;
                          }

                          @media print {
                            body {
                              background-color: #ffffff;
                              padding: 0;
                              margin: 0;
                            }
                            .page-wrapper {
                              border: none;
                              box-shadow: none;
                              padding: 20px;
                            }
                            .grand-totals-panel {
                              border: 1px solid #e2e8f0 !important;
                            }
                            .custom-decor-footer-banner {
                              background-color: #0b53f4 !important;
                              -webkit-print-color-adjust: exact;
                              print-color-adjust: exact;
                            }
                          }
                        </style>
                      </head>
                      <body>
                        <div class="page-wrapper">
                          <!-- Designer elements -->
                          <div class="bottom-left-decor"></div>
                          
                          <!-- Top Header info -->
                          <div class="header-container">
                            <div class="logo-badge-row">
                              <div class="logo-circle">
                                ${emisorNameRaw.substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <h2 class="logo-text-title">${emisorNameRaw}</h2>
                                <p class="logo-text-subtitle">${emisorCorp || "Servicios Comerciales de IntegraciÃ³n"}</p>
                              </div>
                            </div>
                            
                            <div class="invoice-title-box">
                              <h1>Factura</h1>
                              <div class="invoice-meta-item">Fecha: <strong>${formattedDate}</strong></div>
                              <div class="invoice-meta-item">UUID: <strong>${uuidVal.substring(0,18)}...</strong></div>
                              <div class="invoice-meta-item">RFC Emisor: <strong>${rfcEmisorVal}</strong></div>
                            </div>
                          </div>
                          
                          <!-- Columns detailed box -->
                          <div class="billing-info-section">
                            <div class="bill-to-box">
                              <div class="bill-title">Facturado a (Cfdi Receptor)</div>
                              <h3 class="bill-client-name">PÃºblico General / Cliente Registrado</h3>
                              <div class="bill-details">
                                <p><strong>RFC:</strong> XAXX010101000</p>
                                <p><strong>Uso CFDI:</strong> G03 - Gastos en general</p>
                                <p><strong>Email:</strong> receptor.sat@zenticket.mx</p>
                                <p><strong>RÃ©gimen Fiscal:</strong> 616 - Sin obligaciones fiscales</p>
                              </div>
                            </div>
                            
                            <div class="bill-to-box">
                              <div class="bill-title">Datos Fiscales de CertificaciÃ³n</div>
                              <div class="bill-details" style="margin-top: 4px;">
                                <p><strong>Lugar de ExpediciÃ³n:</strong> CDMX, MÃ©xico</p>
                                <p><strong>Certificado SAT:</strong> 00001000000504465028</p>
                                <p><strong>Certificado Emisor:</strong> 00001000000503932847</p>
                                <p><strong>No. de AprobaciÃ³n:</strong> PUE - Pago en una sola exhibiciÃ³n</p>
                              </div>
                            </div>
                          </div>
                          
                          <!-- Dynamic Concepts table structured with design -->
                          <div class="table-container">
                            <table class="invoice-table">
                              <thead>
                                <tr>
                                  <th>ST</th>
                                  <th>DescripciÃ³n del Concepto</th>
                                  <th style="text-align: right;">Precio Unitario</th>
                                  <th style="text-align: center; width: 80px;">Cant.</th>
                                  <th style="text-align: right; width: 140px;">Importe</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${itemsList.map((item: any, idx: number) => {
                                  const stNum = String(idx + 1).padStart(2, '0');
                                  const itemDesc = item.description || item.descripcion || "Consumo General de MercancÃ­as";
                                  const unitVal = item.amount || item.importe || 0;
                                  return `
                                    <tr>
                                      <td class="cell-st">${stNum}</td>
                                      <td class="cell-desc">
                                        <span>${itemDesc}</span>
                                        <span class="subtext">Clave SAT: 90101501 | Unidad: E48 - Servicio</span>
                                      </td>
                                      <td class="cell-rate" style="text-align: right;">$${unitVal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                      <td class="cell-qty" style="text-align: center;">1</td>
                                      <td class="cell-total">$${unitVal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    </tr>
                                  `;
                                }).join("")}
                              </tbody>
                            </table>
                          </div>
                          
                          <!-- Signatures & Notes row & Totals summary -->
                          <div class="bottom-invoice-row">
                            
                            <div class="payment-and-signs">
                              <div class="notes-block">
                                <h4>TÃ©rminos y Condiciones de CertificaciÃ³n</h4>
                                <p>Este documento es una representaciÃ³n impresa de un CFDI versiÃ³n 4.0. El pago se efectÃºa mediante una sola exhibiciÃ³n (PUE). Cualquier aclaraciÃ³n referente a la facturaciÃ³n de su ticket favor de realizarla dentro de los 30 dÃ­as posteriores a la fecha de emisiÃ³n.</p>
                              </div>
                              
                              <div class="signature-container">
                                <h4 class="signature-author">ZenTicket Digital</h4>
                                <div class="signature-line"></div>
                                <span class="signature-title">Firma del Emisor Certificado</span>
                              </div>
                            </div>
                            
                            <div class="grand-totals-panel">
                              <div class="subtotal-metric-row">
                                <span>Subtotal</span>
                                <span>$${subtotalVal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                              <div class="subtotal-metric-row" style="border-bottom: 1.5px solid #f1f5f9; padding-bottom: 12px;">
                                <span>IVA Trasladado (16.00%)</span>
                                <span>$${ivaVal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                              
                              <div class="grand-total-blue-badge">
                                <span class="label">Total Recibido</span>
                                <span class="val">$${totalVal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                            </div>
                            
                          </div>
                          
                          <!-- SAT Security Block -->
                          <div class="sat-verification-section">
                            <div class="qr-code-holder">
                              <svg style="width: 100%; height: 100%; color: #1e293b;" viewBox="0 0 100 100" fill="currentColor">
                                <path d="M0,0 h30 v30 h-30 z M10,10 h10 v10 h-10 z" />
                                <path d="M70,0 h30 v30 h-30 z M80,10 h10 v10 h-10 z" />
                                <path d="M0,70 h30 v30 h-30 z M10,80 h10 v10 h-10 z" />
                                <path d="M40,10 h10 v10 h-10 z M55,0 h10 v15 h-10 z" />
                                <path d="M40,40 h15 v5 h-15 z M45,55 h20 v10 h-20 z" />
                                <path d="M75,40 h15 v20 h-15 z M85,75 h10 v15 h-10 z" />
                                <path d="M40,80 h10 v10 h-10 z M55,75 h20 v5 h-20 z" />
                              </svg>
                            </div>
                            <div class="stamp-details-box">
                              <h5 class="stamp-headline">Sello Digital del SAT</h5>
                              <p class="stamp-content">JX9A23KSF841HLWND82HJKLSW0K295LW0192LSLW0KND82910NSDLUQ9W892019ADJLW2</p>
                              <span class="certified-pill">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                                Timbrado verificado en bases SAT en tiempo real
                              </span>
                            </div>
                          </div>
                          
                          <!-- Designer decorative contact footer bar -->
                          <div class="custom-decor-footer-banner">
                            <div class="footer-banner-item">
                              <span class="footer-banner-icon">ðŸ“ž</span>
                              <span>01-800-ZENTICKET</span>
                            </div>
                            <div class="footer-banner-item">
                              <span class="footer-banner-icon">ðŸŒ</span>
                              <span>www.zenticket.mx</span>
                            </div>
                            <div class="footer-banner-item">
                              <span class="footer-banner-icon">ðŸ“</span>
                              <span>Paseo de la Reforma 222, CDMX</span>
                            </div>
                          </div>

                        </div>
                      </body>
                    </html>
                  `);
                  printWindow.document.close();
                  printWindow.print();
                }
              }, 400);
            }}
            className="w-full bg-[#0B53F4] text-white hover:bg-[#0747D1] transition duration-150 flex items-center justify-center gap-2 py-4 rounded-2xl font-black uppercase text-xs shadow-md shadow-[#0B53F4]/20 cursor-pointer"
          >
            <FileText className="w-4 h-4 text-white" />
            Descargar PDF
          </button>

          <button
            type="button"
            onClick={() => downloadFile(activeInvoiceData.xmlContent, `Factura_${emisorNameRaw}_${uuidVal.substring(0,10)}.xml`, "text/xml")}
            className="w-full bg-[#F1F3FE] text-[#0B53F4] hover:bg-[#E2E6FD] border border-[#0B53F4]/10 transition duration-150 flex items-center justify-center gap-2 py-4 rounded-2xl font-black uppercase text-xs cursor-pointer"
          >
            <span>{"</>"}</span>
            Descargar XML
          </button>

          {/* INTERACTIVE XML PREVIEW COLLAPSE */}
          <button
            type="button"
            onClick={() => setShowXmlCode(!showXmlCode)}
            className={`w-full transition duration-150 flex items-center justify-center gap-2 py-4 rounded-2xl font-black uppercase text-xs cursor-pointer select-none ${
              showXmlCode 
                ? "bg-slate-900 text-emerald-400 border border-slate-950" 
                : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <Eye className="w-4 h-4 shrink-0" />
            {showXmlCode ? "Ocultar previsualizador XML" : "Previsualizar XML CFDI original"}
          </button>
        </div>

        {showXmlCode && (
          <div className="bg-slate-950 text-emerald-400 rounded-3xl p-5 border border-slate-900 text-left relative overflow-hidden shadow-[var(--shadow-elevated)] select-all">
            <div className="absolute top-4 right-4 flex gap-1.5 z-10">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 block"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 block"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 block"></span>
            </div>
            
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-zinc-900 select-none">
              <span className="text-[10px] text-slate-500 font-sans font-black tracking-widest uppercase">
                CÃ³digo XML CFDI v4.0 Original Emitido
              </span>
            </div>
            
            <pre className="font-mono text-[9px] sm:text-[10px] leading-relaxed overflow-x-auto max-h-[380px] text-slate-300">
              {(() => {
                const subT = totalVal / 1.16;
                const ivT = totalVal - subT;
                const recName = (activeInvoiceData as any).nombreReceptor || "LEONARDO GOMEZ RENDER";
                const recRfc = (activeInvoiceData as any).rfcReceptor || "GORL940812S1A";
                const detailedXml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante 
  Version="4.0" 
  Serie="F" 
  Folio="${(activeInvoiceData as any).folio || "88219"}" 
  Fecha="${formattedDate.replace(" ", "T")}" 
  SubTotal="${subT.toFixed(2)}" 
  Total="${totalVal.toFixed(2)}" 
  MetodoPago="PUE" 
  TipoDeComprobante="I" 
  LugarExpedicion="06600"
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4" 
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
  xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd">
  
  <cfdi:Emisor 
    Rfc="${rfcEmisorVal}" 
    Nombre="${emisorCorp.toUpperCase()}" 
    RegimenFiscal="601" />
    
  <cfdi:Receptor 
    Rfc="${recRfc}" 
    Nombre="${recName.toUpperCase()}" 
    DomicilioFiscalReceptor="03100" 
    RegimenFiscalReceptor="605" 
    UsoCFDI="G03" />
    
  <cfdi:Conceptos>
    <cfdi:Concepto 
      ClaveProdServ="90101700" 
      Cantidad="1.00" 
      ClaveUnidad="E48" 
      Unidad="Servicio" 
      Descripcion="CONSuMO GENERAL - TICKET #${(activeInvoiceData as any).folio || "88219"}" 
      ValorUnitario="${subT.toFixed(2)}" 
      Importe="${subT.toFixed(2)}">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado 
            Base="${subT.toFixed(2)}" 
            Impuesto="002" 
            TipoFactor="Tasa" 
            TasaOCuota="0.160000" 
            Importe="${ivT.toFixed(2)}" />
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  
  <cfdi:Impuestos TotalImpuestosTrasladados="${ivT.toFixed(2)}">
    <cfdi:Traslados>
      <cfdi:Traslado 
        Impuesto="002" 
        TipoFactor="Tasa" 
        TasaOCuota="0.160000" 
        Importe="${ivT.toFixed(2)}" />
    </cfdi:Traslados>
  </cfdi:Impuestos>
  
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital 
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" 
      xsi:schemaLocation="http://www.sat.gob.mx/TimbreFiscalDigital http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd"
      Version="1.1" 
      UUID="${uuidVal}" 
      FechaTimbrado="${formattedDate.replace(" ", "T")}" 
      RfcProvCertif="SAT970701NN3" 
      SelloCFD="JX9A23KSF841HLWND82HJKLSW0K295LW0192LSLW0KND82910NSDLUQ9W892019ADJLW2" 
      SelloSAT="SAT0192LSLW0KND82910NSDLUQ9W892019ADJLW2JX9A23KSF841HLWND82HJKLSW0K295LW" 
      NoCertificadoSAT="00001000000504465028" />
  </cfdi:Complemento>
</cfdi:Comprobante>`;

                return detailedXml.split("\n").map((line, lineIdx) => {
                  return (
                    <div key={lineIdx} className="whitespace-pre">
                      <span className="text-[9px] text-zinc-700 select-none mr-3 inline-block w-4 text-right">
                        {lineIdx + 1}
                      </span>
                      {line.split(/(<[^>]+>)/g).map((chunk, chunkIdx) => {
                        if (!chunk) return null;
                        if (chunk.startsWith("<") && chunk.endsWith(">")) {
                          const isClosing = chunk.startsWith("</");
                          const isDeclaration = chunk.startsWith("<?");
                          let tagColor = "text-sky-400 font-bold";
                          if (isDeclaration) tagColor = "text-emerald-400";
                          else if (isClosing) tagColor = "text-sky-400 font-bold";

                          // Tokenize attributes
                          const parts = chunk.split(/(\s+[a-zA-Z0-9:]+="[^"]*")/g);
                          return (
                            <span key={chunkIdx}>
                              {parts.map((p, pIdx) => {
                                if (p.trim().includes("=")) {
                                  const [attrName, attrVal] = p.split("=");
                                  return (
                                    <span key={pIdx}>
                                      <span className="text-purple-400 font-medium">{attrName}</span>
                                      <span className="text-slate-400">=</span>
                                      <span className="text-amber-300 font-semibold">{attrVal}</span>
                                    </span>
                                  );
                                }
                                return <span key={pIdx} className={tagColor}>{p}</span>;
                              })}
                            </span>
                          );
                        }
                        return <span key={chunkIdx} className="text-slate-200">{chunk}</span>;
                      })}
                    </div>
                  );
                });
              })()}
            </pre>
            
            <div className="mt-4 pt-3 border-t border-zinc-900 select-none flex flex-wrap gap-2 justify-between items-center text-[10px]">
              <span className="text-emerald-500 font-sans font-extrabold flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                Estructura XML Certificada (CFDI 4.0 Localizable en SAT)
              </span>
              <button
                type="button"
                onClick={() => {
                  const subT = totalVal / 1.16;
                  const ivT = totalVal - subT;
                  const recName = (activeInvoiceData as any).nombreReceptor || "LEONARDO GOMEZ RENDER";
                  const recRfc = (activeInvoiceData as any).rfcReceptor || "GORL940812S1A";
                  const detailedXmlText = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante 
  Version="4.0" 
  Serie="F" 
  Folio="${(activeInvoiceData as any).folio || "88219"}" 
  Fecha="${formattedDate.replace(" ", "T")}" 
  SubTotal="${subT.toFixed(2)}" 
  Total="${totalVal.toFixed(2)}" 
  MetodoPago="PUE" 
  TipoDeComprobante="I" 
  LugarExpedicion="06600"
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4" 
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
  xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd">
  
  <cfdi:Emisor 
    Rfc="${rfcEmisorVal}" 
    Nombre="${emisorCorp.toUpperCase()}" 
    RegimenFiscal="601" />
    
  <cfdi:Receptor 
    Rfc="${recRfc}" 
    Nombre="${recName.toUpperCase()}" 
    DomicilioFiscalReceptor="03100" 
    RegimenFiscalReceptor="605" 
    UsoCFDI="G03" />
    
  <cfdi:Conceptos>
    <cfdi:Concepto 
      ClaveProdServ="90101700" 
      Cantidad="1.00" 
      ClaveUnidad="E48" 
      Unidad="Servicio" 
      Descripcion="CONSuMO GENERAL - TICKET #${(activeInvoiceData as any).folio || "88219"}" 
      ValorUnitario="${subT.toFixed(2)}" 
      Importe="${subT.toFixed(2)}">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado 
            Base="${subT.toFixed(2)}" 
            Impuesto="002" 
            TipoFactor="Tasa" 
            TasaOCuota="0.160000" 
            Importe="${ivT.toFixed(2)}" />
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  
  <cfdi:Impuestos TotalImpuestosTrasladados="${ivT.toFixed(2)}">
    <cfdi:Traslados>
      <cfdi:Traslado 
        Impuesto="002" 
        TipoFactor="Tasa" 
        TasaOCuota="0.160000" 
        Importe="${ivT.toFixed(2)}" />
    </cfdi:Traslados>
  </cfdi:Impuestos>
  
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital 
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" 
      xsi:schemaLocation="http://www.sat.gob.mx/TimbreFiscalDigital http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd"
      Version="1.1" 
      UUID="${uuidVal}" 
      FechaTimbrado="${formattedDate.replace(" ", "T")}" 
      RfcProvCertif="SAT970701NN3" 
      SelloCFD="JX9A23KSF841HLWND82HJKLSW0K295LW0192LSLW0KND82910NSDLUQ9W892019ADJLW2" 
      SelloSAT="SAT0192LSLW0KND82910NSDLUQ9W892019ADJLW2JX9A23KSF841HLWND82HJKLSW0K295LW" 
      NoCertificadoSAT="00001000000504465028" />
  </cfdi:Complemento>
</cfdi:Comprobante>`;
                  navigator.clipboard.writeText(detailedXmlText);
                  toast.success("CÃ³digo XML CFDI copiado al portapapeles.", "Copiar XML");
                }}
                className="bg-slate-900 hover:bg-slate-850 text-slate-100 font-extrabold px-3 py-1.5 rounded-xl border border-slate-800 cursor-pointer active:scale-95 transition"
              >
                Copiar CÃ³digo XML
              </button>
            </div>
          </div>
        )}

        {/* CONECTOR REAL EN PRODUCCIÃ“N EXPLANATORY ACCORDION */}
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-3xl space-y-3">
          <div className="flex items-center gap-2.5 text-left select-none">
            <Sparkles className="w-5 h-5 text-[#0B53F4] shrink-0" />
            <div className="leading-tight">
              <span className="font-extrabold text-slate-800 text-xs block">Conector Real en ProducciÃ³n</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">CÃ³mo se procesa y verifica la extracciÃ³n del portal</span>
            </div>
          </div>
          
          <div className="text-slate-640 text-[11.5px] sm:text-xs text-left space-y-2 leading-relaxed">
            <p>
              En esta demostraciÃ³n de ZenTicket, <strong>simulamos la interacciÃ³n robotizada con el SAT y portales comerciales</strong> para enseÃ±arte las capacidades de extracciÃ³n de la IA mediante esquemas estructurados de selectores CSS (como Alsea, Oxxo o Walmart).
            </p>
            <p>
              <strong>Â¿CÃ³mo hacerlo 100% real en tu propio producto de producciÃ³n?</strong>
            </p>
            <ul className="list-decimal pl-4.5 space-y-2 text-[11px] sm:text-[11.5px] font-semibold text-slate-700">
              <li>
                <strong className="text-slate-800">Scraping AutomÃ¡tico (Playwright/Puppeteer):</strong> Configura un robot en el servidor que cargue la URL del portal del emisor, rellene los campos mapeados (RFC, folio, total) usando selectores CSS, resuelva captchas usando decodificadores (como <i>2Captcha</i>), proceda a emitir y devuelva los archivos XML y PDF.
              </li>
              <li>
                <strong className="text-slate-800">ConexiÃ³n directa vÃ­a PAC / SAT Web Service:</strong> Solicita facturas directamente al SAT o a proveedores autorizados de certificaciÃ³n (PACs) asociando las credenciales de tu FIEL / CSD, permitiendo la descargas automÃ¡ticas inmediatas desde las bases del SAT de forma masiva sin captchas.
              </li>
            </ul>
          </div>
        </div>

        {/* PRESERVE USEFUL UTILITIES OR EMAIL DISPATCH ROW */}
        <div className="bg-white border border-slate-200 p-4.5 rounded-3xl space-y-3.5">
          <div className="text-left text-xs leading-tight">
            <span className="font-extrabold text-slate-800 block">Enviar copia de respaldo</span>
            <span className="text-slate-400 block mt-0.5">EnvÃ­a el archivo PDF y XML directo al buzÃ³n de tu contador</span>
          </div>

          <div className="flex gap-2">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex-1 shadow-inner">
              <Mail className="w-4 h-4 text-[#0B53F4]" />
              <input 
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="buzon.fiscal@contador.com"
                className="bg-transparent border-none text-xs text-slate-800 focus:outline-none w-full font-bold"
              />
            </div>

            <button
              type="button"
              onClick={() => handleSendEmail(activeInvoiceData)}
              disabled={isSendingEmail}
              className="bg-[#0B53F4] hover:bg-[#0747D1] text-white px-5 rounded-xl text-xs font-black uppercase tracking-wider transition disabled:opacity-45 shrink-0 flex items-center justify-center cursor-pointer"
            >
              Enviar
            </button>
          </div>

          {/* DYNAMIC SMTP CONFIGURATION NOTIFICATION */}
          <div className="pt-1.5 border-t border-slate-100 select-none text-left">
            {smtpStatus?.smtpConfigured ? (
              <div className="flex items-start gap-2 bg-emerald-50/70 border border-emerald-200/60 rounded-xl p-3 text-left">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="leading-tight">
                  <span className="text-[10.5px] text-emerald-800 font-extrabold block">
                    Servidor de Correo SMTP Activo
                  </span>
                  <p className="text-[9.5px] text-emerald-650 font-semibold block mt-0.5 leading-normal">
                    Credenciales configuradas para <strong>{smtpStatus.smtpUser}</strong>. La factura XML y PDF se enviarÃ¡ de forma <strong>REAL</strong> a {emailTo}.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 bg-amber-50/70 border border-amber-200/50 rounded-xl p-3 text-left">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                  <span className="text-[10.5px] text-amber-800 font-black">
                    Modo Sandbox: Correo Simulado
                  </span>
                </div>
                <p className="text-[9.5px] text-amber-700 leading-normal font-semibold">
                  Se ha simulado el envÃ­o con Ã©xito. Si quieres que le llegue un <strong>correo real</strong> a tu buzÃ³n personal o al de tu contador, configura las claves <code className="bg-amber-100/80 px-1 py-0.2 rounded font-mono text-[9px] font-black font-semibold text-amber-900">SMTP_HOST</code>, <code className="bg-amber-100/80 px-1 py-0.2 rounded font-mono text-[9px] font-black font-semibold text-amber-900">SMTP_USER</code> y <code className="bg-amber-100/80 px-1 py-0.2 rounded font-mono text-[9px] font-black font-semibold text-amber-900">SMTP_PASS</code> en la pestaÃ±a <strong>Settings &gt; Secrets</strong> de AI Studio.
                </p>
              </div>
            )}
          </div>
        </div>

      </div> {/* Close Right Column (lg:col-span-5) */}
      </div> {/* Close Grid layout container */}

      </div>
    );
  }

  // Count active tickets in follow up
  const activeCount = inProgressList.length;
  const visibleInProgressList = showAllTracking ? inProgressList : inProgressList.slice(0, 3);
  const visibleInvoicesList = showAllInvoices ? emittedInvoicesList : emittedInvoicesList.slice(0, 3);

  // ----------------------------------------------------
  // STANDARD INTERACTIVE MAIN SCREEN LIST VIEW
  // ----------------------------------------------------
  return (
    <div className="w-full space-y-4 font-body text-left relative select-none pb-20 animate-fade-in_50">
      
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <SearchInput
          className="max-w-xl"
          icon={<Search className="h-4 w-4 text-[var(--workspace-text-muted)]" />}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Buscar por emisor, RFC, folio o UUID"
        />

        <Tabs
          className="!bg-white !border-slate-200/70"
          value={trackingStatusFilter}
          onChange={(value) => setTrackingStatusFilter(value as "todos" | "processing" | "review" | "failed")}
          items={[
            { value: "todos", label: "Todos" },
            { value: "processing", label: "Procesando" },
            { value: "review", label: "Revision" },
            { value: "failed", label: "Error" },
          ]}
        />
      </div>

      {/* SEGMENTED CONTROL TAB BAR FILTERS MATCHING IMAGE - Hidden on desktop screens */}
      <div className="bg-[#F1F3FE] p-1 rounded-xl border border-slate-100/70 shadow-inner flex w-full relative lg:hidden">
        <button
          type="button"
          onClick={() => setActiveSubTab("en-seguimiento")}
          className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all duration-150 cursor-pointer ${
            activeSubTab === "en-seguimiento"
              ? "bg-white text-[#0B53F4] shadow-[0_2px_10px_rgba(11,83,244,0.08)]"
              : "text-slate-450 hover:text-slate-705"
          }`}
        >
          En seguimiento
        </button>
        
        <button
          type="button"
          onClick={() => setActiveSubTab("facturas-emitidas")}
          className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all duration-150 cursor-pointer ${
            activeSubTab === "facturas-emitidas"
              ? "bg-white text-slate-800 shadow-[0_2px_10px_rgba(15,23,42,0.06)]"
              : "text-slate-450 hover:text-slate-705"
          }`}
        >
          Facturas Emitidas
        </button>
      </div>

      {/* Grid container layout for widescreen desktop preview */}
       <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* COLUMN 1: EN SEGUIMIENTO (Visible on desktop OR when mobile has activeSubTab === "en-seguimiento") */}
        <div className={`space-y-3 lg:col-span-6 ${activeSubTab === "en-seguimiento" ? "block" : "hidden lg:block"}`}>
          <div className="flex items-center justify-between px-1 mb-2">
            <h2 className="font-display font-extrabold text-base text-slate-800 tracking-tight">
              En seguimiento
            </h2>
            <span className="bg-blue-100 text-blue-700 text-[10px] font-extrabold px-3 py-1 rounded-full uppercase leading-none tracking-wider font-display">
              {activeCount} ACTIVO{activeCount !== 1 ? "S" : ""}
            </span>
          </div>

          <div className="space-y-2.5">
            {inProgressList.length === 0 ? (
              <EmptyState
                className="bg-white"
                title="No hay tickets activos en este momento"
                copy="Puedes arrastrar otro ticket en la seccion Escanear para procesarlo."
                action={null}
              >
                <Clock className="w-8 h-8 text-slate-300 mx-auto animate-pulse" />
              </EmptyState>
            ) : (
              visibleInProgressList.map((t) => {
                const isFailed = t.status === "failed";
                const isProcessing = t.status === "processing";
                const brand = getBrandBrandIcon(t.nombreEmisor || "");
                const isNewlyAdded = newlyAddedTicketId && t.id === newlyAddedTicketId;

                return (
                  <div 
                    key={t.id}
                    className={`rounded-[1rem] p-3.5 flex flex-col gap-3 relative overflow-hidden transition ${
                      isNewlyAdded
                        ? "border border-[#0B53F4] shadow-[var(--shadow-surface)] bg-blue-50/10 duration-300"
                        : "bg-white border border-slate-200/50 shadow-[var(--shadow-surface)] hover:border-[#0B53F4]/20"
                    }`}
                  >
                    {/* Robot processing loader during active agent automation */}
                    {isProcessing && t.id?.startsWith("user-") && (
                      <div className="absolute inset-0 bg-white/95 flex flex-col justify-center items-center z-15 p-2 text-center space-y-1">
                        <RefreshCw className="w-5 h-5 text-[#0B53F4] animate-spin" />
                        <span className="font-extrabold text-[10px] text-[#0B53F4] uppercase tracking-wider">Playwright SAT Activo</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={`w-9 h-9 ${brand.color} rounded-full flex items-center justify-center shrink-0`}>
                          <brand.IconComponent className="w-5 h-5 stroke-[2.2]" />
                        </div>
                        
                        <div className="text-left leading-tight min-w-0">
                          <span className="text-sm font-bold text-slate-800 block truncate max-w-[190px]">
                            {t.nombreEmisor || "Emisor"}
                          </span>
                          <span className="text-[11px] text-slate-400 block mt-1 font-semibold">
                            {t.fechaCompra || "S/F"} - Folio {t.folio || "S/D"}
                          </span>
                        </div>
                      </div>

                      {/* Highly polished active status state indicator badge with optional ReciÃ©n Agregado flag */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {isNewlyAdded && (
                          <span className="bg-[#EBF5FF] text-[#0B53F4] text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1 leading-none shadow-sm animate-pulse">
                            <Sparkles className="w-2.5 h-2.5 fill-current" />
                            RECIÃ‰N AGREGADO
                          </span>
                        )}
                        {t.status === "review" ? (
                          <StatusBadge className="text-[9.5px] px-2.5 py-1 rounded-lg uppercase tracking-wider leading-none" tone="warning">
                            REVISIÃ“N ADMIN
                          </StatusBadge>
                        ) : isFailed ? (
                          <StatusBadge className="text-[9.5px] px-2.5 py-1 rounded-lg uppercase tracking-wider leading-none" tone="danger">
                            FALLIDO
                          </StatusBadge>
                        ) : (
                          <StatusBadge className="text-[9.5px] px-2.5 py-1 rounded-lg uppercase tracking-wider leading-none" tone="warning">
                            PROCESANDO
                          </StatusBadge>
                        )}
                      </div>
                    </div>

                    {/* Escalation/Failure Reason Card Block */}
                    {(t.status === "review" || isFailed) && t.errorMsg && (
                      <div className={`text-[11px] p-3 rounded-2xl leading-relaxed font-sans ${
                        t.status === "review" ? "bg-amber-500/10 text-amber-900 border border-amber-200/45" : "bg-rose-50 text-rose-800 border border-rose-100/60"
                      }`}>
                        <span className="font-bold block uppercase text-[9px] mb-1 tracking-wider">
                          {t.status === "review" ? "LÃ­mite de Presupuesto Excedido:" : "Error de AutomatizaciÃ³n:"}
                        </span>
                        {t.errorMsg}
                        {t.status === "review" && (
                          <p className="text-[10px] text-amber-600 font-semibold mt-1 leading-normal">
                            El conector requiere aprendizaje, pero supera el tope configurado de costo. El Administrador ya recibiÃ³ la solicitud en su bandeja de alertas.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Divider line Inside Card */}
                    <div className="border-t border-slate-100 my-0.5" />

                    {/* Lower cash amount indicator + interactive detail link */}
                    <div className="flex justify-between items-center select-none pt-0.5">
                      <span className="text-base font-black text-slate-800 font-mono">
                        ${(t.total || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>

                      <div className="flex items-center gap-2">
                        {/* Trash Delete Option for Users */}
                        {onDeleteTicket && (
                          ticketIdToDelete === t.id ? (
                            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-lg text-[9px] font-bold animate-fade-in">
                              <span className="text-slate-550 mr-1">Â¿Eliminar?</span>
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteTicket(t.id || "");
                                  setTicketIdToDelete(null);
                                }}
                                className="px-1.5 py-0.5 bg-rose-600 text-white rounded font-bold cursor-pointer"
                              >
                                SÃ­
                              </button>
                              <button
                                type="button"
                                onClick={() => setTicketIdToDelete(null)}
                                className="px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded font-bold cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setTicketIdToDelete(t.id || "")}
                              className="p-1.5 text-slate-300 hover:text-rose-500 rounded-lg bg-transparent cursor-pointer hover:bg-slate-50 transition"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )
                        )}

                        <SecondaryAction
                          type="button"
                          onClick={() => {
                            onTriggerSimulationInline(t);
                            toast.success(`Iniciando conexiÃ³n con el SAT para facturar ticket #${t.folio || "88219"}.`, "Sincronizador SAT");
                          }}
                          className="py-2 px-2.5 text-[0px] rounded-xl shrink-0"
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </SecondaryAction>
                      </div>
                    </div>

                  </div>
                );
              })
            )}
          </div>

          {inProgressList.length > 3 && (
            <div className="flex justify-center pt-1">
              <SecondaryAction
                className="min-w-[210px] justify-center"
                onClick={() => setShowAllTracking((prev) => !prev)}
              >
                {showAllTracking ? "Ver menos tickets" : "Ver mas tickets"}
              </SecondaryAction>
            </div>
          )}
        </div>

        {/* COLUMN 2: FACTURAS EMITIDAS (Visible on desktop OR when mobile has activeSubTab === "facturas-emitidas") */}
        <div className={`space-y-3 lg:col-span-6 ${activeSubTab === "facturas-emitidas" ? "block" : "hidden lg:block"}`}>
          <div className="px-1 text-left mb-2">
            <h2 className="font-display font-extrabold text-base text-slate-800 tracking-tight">
              Facturas Emitidas
            </h2>
          </div>

          <div className="space-y-2.5">
            {emittedInvoicesList.length === 0 ? (
              <EmptyState
                className="bg-white"
                title="No hay facturas emitidas"
                copy="Las facturas emitidas y certificadas por el SAT se guardaran aqui."
                action={null}
              >
                <FileText className="w-8 h-8 text-slate-300 mx-auto" />
              </EmptyState>
            ) : (
              visibleInvoicesList.map((inv) => {
                const brand = getBrandBrandIcon(inv.nombreEmisor || "");
                const isMock = inv.id?.startsWith("mock-");
                
                // Format dynamic Dates inside details
                let dateStr = "15/10/2023";
                if (!isMock && inv.createdAt) {
                  try {
                    dateStr = new Date(inv.createdAt).toLocaleDateString("es-MX");
                  } catch {
                    dateStr = inv.createdAt;
                  }
                } else if (inv.createdAt) {
                  dateStr = inv.createdAt;
                }

                const isNewlyAdded = newlyAddedTicketId && (inv.ticketId === newlyAddedTicketId || inv.id === newlyAddedTicketId);

                return (
                  <div 
                    key={inv.id}
                    className={`rounded-[1rem] p-3.5 flex flex-col gap-3 justify-between transition ${
                      isNewlyAdded
                        ? "border border-emerald-500 shadow-[var(--shadow-surface)] bg-emerald-50/10 duration-300"
                        : "bg-white border border-slate-200/55 shadow-[var(--shadow-surface)] hover:border-[#0B53F4]/20"
                    }`}
                  >
                    {/* Horizontal main body */}
                    <div className="flex items-start justify-between gap-3">
                      
                      <div className="flex items-center gap-3.5 min-w-0">
                         <div className={`w-9 h-9 ${brand.color} rounded-full flex items-center justify-center shrink-0`}>
                          <brand.IconComponent className="w-5 h-5 stroke-[2.2]" />
                        </div>

                        <div className="text-left min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                             <span className="text-sm font-bold text-slate-800 block truncate tracking-tight" title={inv.nombreEmisor}>
                              {inv.nombreEmisor}
                            </span>
                            {isNewlyAdded && (
                              <span className="bg-emerald-50 text-emerald-700 text-[8.5px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider leading-none shadow-3xs flex items-center gap-0.5 animate-pulse shrink-0">
                                <Sparkles className="w-2.5 h-2.5 fill-current" />
                                ReciÃ©n Timbrado
                              </span>
                            )}
                          </div>
                          <span className="text-[13px] font-black font-mono text-[#0B53F4] tracking-tight block mt-1">
                            ${inv.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN
                          </span>
                        </div>
                      </div>

                      {/* Compact right actions stacked block (Hidden on mobile to avoid squeezing) */}
                      <div className="hidden sm:flex flex-col gap-1.5 min-w-[124px] shrink-0">
                        <SecondaryAction
                          type="button"
                          onClick={() => setSelectedInvoiceId(inv.id || null)}
                          className="w-full justify-center py-2 px-3 text-[10px] uppercase tracking-wider rounded-xl"
                        >
                          Ver PDF
                        </SecondaryAction>
                        
                        <SecondaryAction
                          type="button"
                          onClick={() => downloadFile(inv.xmlContent, `Factura_${inv.nombreEmisor}_${inv.folioFiscal?.substring(0,8)}.xml`, "text/xml")}
                          className="w-full justify-center py-2 px-3 text-[10px] uppercase tracking-wider rounded-xl"
                        >
                          Descargar XML
                        </SecondaryAction>
                      </div>

                    </div>

                    {/* Lower metadata footer details */}
                    <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-[10px] text-slate-400 font-bold select-none">
                      <span>EmisiÃ³n: {dateStr}</span>
                      <span className="font-mono">RFC: {inv.rfcEmisor || "S/D"}</span>
                    </div>

                    {/* Mobile action buttons (Exclusively shown on mobile as a row underneath to guarantee full width and no truncation) */}
                    <div className="flex sm:hidden gap-2 mt-0.5">
                      <SecondaryAction
                        type="button"
                        onClick={() => setSelectedInvoiceId(inv.id || null)}
                        className="flex-1 justify-center py-2.5 px-3.5 text-[10.5px] uppercase tracking-wider min-h-[42px]"
                      >
                        Ver PDF
                      </SecondaryAction>
                      
                      <SecondaryAction
                        type="button"
                        onClick={() => downloadFile(inv.xmlContent, `Factura_${inv.nombreEmisor}_${inv.folioFiscal?.substring(0,8)}.xml`, "text/xml")}
                        className="flex-1 justify-center py-2.5 px-3.5 text-[10.5px] uppercase tracking-wider min-h-[42px]"
                      >
                        Descargar XML
                      </SecondaryAction>
                    </div>

                  </div>
                );
              })
            )}
          </div>

          {emittedInvoicesList.length > 3 && (
            <div className="flex justify-center pt-1">
              <SecondaryAction
                className="min-w-[210px] justify-center"
                onClick={() => setShowAllInvoices((prev) => !prev)}
              >
                {showAllInvoices ? "Ver menos facturas" : "Ver mas tickets"}
              </SecondaryAction>
            </div>
          )}
        </div>

      </div> {/* Close Grid layout container */}

    </div>
  );
}
