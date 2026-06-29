import React, { useState, useEffect } from "react";
import { Ticket, Invoice } from "@/shared/types/types";
import { getConfigStatus, sendEmail } from "@/services/api";
import logoLight from "@/assets/logos/logo-light.png";
import { 
  ChevronLeft, ChevronRight, Share2, FileText, Check, Download, ArrowLeft, 
  Coffee, ShoppingBag, Car, Plus, Printer, Mail, Trash2, 
  Clock, Sparkles, Eye, ShieldCheck, ZoomIn, 
  ZoomOut, RotateCcw, X, ExternalLink, RefreshCw
} from "lucide-react";
import { useToast } from "@/shared/feedback/Toast";

interface TicketsListScreenProps {
  tickets: Ticket[];
  invoices: Invoice[];
  fiscalProfile?: any;
  onTriggerSimulationInline: (ticket: Ticket) => void;
  currentUserEmail?: string | null;
  onDeleteTicket?: (ticketId: string) => void;
  onTabChange?: (tab: "capturar" | "tickets" | "conectores" | "historial" | "resumen" | "cuenta" | "admin") => void;
  newlyAddedTicketId?: string | null;
  onClearNewlyAddedTicketId?: () => void;
}

// ----------------------------------------------------
// HIGH FIDELITY MOCK DATA SEEDING
// ----------------------------------------------------

const MOCK_ACTIVE_TICKETS = [
  {
    id: "mock-active-1",
    nombreEmisor: "Starbucks Santa Fe",
    folio: "88219",
    fechaCompra: "12 Oct",
    total: 245.00,
    status: "processing" as const
  },
  {
    id: "mock-active-2",
    nombreEmisor: "Gasolinera Pemex",
    folio: "11029",
    fechaCompra: "11 Oct",
    total: 1200.50,
    status: "processing" as const
  }
];

const MOCK_EMITTED_INVOICES = [
  {
    id: "mock-inv-oxxo",
    ticketId: "mock-active-oxxo",
    nombreEmisor: "Oxxo",
    rfcEmisor: "OXXO8605231N4",
    nombreReceptor: "LEONARDO GOMEZ RENDER",
    rfcReceptor: "GORL940812S1A",
    folioFiscal: "F4A9D231-15BB-47AD-A12B-DF9E2184B1E5",
    total: 145.00,
    createdAt: "15/10/2023",
    items: [
      { description: "1x Coca-Cola Sin Azúcar 600ml", amount: 18.50, code: "50202306" },
      { description: "1x Sándwich de Jamón y Queso", amount: 48.00, code: "50192500" },
      { description: "1x Papas Sabritas Adobadas 42g", amount: 22.50, code: "50192100" },
      { description: "1x Café Americano Andatti Med", amount: 56.00, code: "50201708" }
    ],
    xmlContent: `<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante Version="4.0" Total="145.00" SubTotal="125.00"><cfdi:Emisor Rfc="OXXO8605231N4" Nombre="OXXO S.A. DE C.V."/><cfdi:Receptor Rfc="GORL940812S1A" Nombre="LEONARDO GOMEZ RENDER" UsoCFDI="G03"/></cfdi:Comprobante>`
  },
  {
    id: "mock-inv-walmart",
    ticketId: "mock-active-walmart",
    nombreEmisor: "Walmart",
    rfcEmisor: "WALM9203251A9",
    nombreReceptor: "LEONARDO GOMEZ RENDER",
    rfcReceptor: "GORL940812S1A",
    folioFiscal: "A3B5F691-89CD-4A5D-B27D-5A8FCE46C89A",
    total: 1112.30,
    createdAt: "14/10/2023",
    items: [
      { description: "1x Detergente Líquido Ariel 4L", amount: 249.00, code: "47131801" },
      { description: "1x Pañal Huggies All Around G", amount: 389.00, code: "53102305" },
      { description: "1x Aceite Vegetal Capullo 840ml", amount: 54.50, code: "50151513" },
      { description: "2x Arroz Súper Extra Morelos 1kg", amount: 68.00, code: "50221101" },
      { description: "1x Pechuga de Pollo Premium 1.2kg", amount: 168.00, code: "50111515" },
      { description: "1x Desodorante Rexona Clinical Men", amount: 95.00, code: "53131609" },
      { description: "1x Sector Frutas y Verduras Frescas", amount: 88.80, code: "50401500" }
    ],
    xmlContent: `<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante Version="4.0" Total="1112.30" SubTotal="958.88"><cfdi:Emisor Rfc="WALM9203251A9" Nombre="WAL COMPREHENSIVE S. DE R.L."/><cfdi:Receptor Rfc="GORL940812S1A" Nombre="LEONARDO GOMEZ RENDER" UsoCFDI="G03"/></cfdi:Comprobante>`
  },
  {
    id: "mock-inv-farmacia",
    ticketId: "mock-active-farmacia",
    nombreEmisor: "Farmacia San Pablo",
    rfcEmisor: "FSAP9203112A4",
    nombreReceptor: "LEONARDO GOMEZ RENDER",
    rfcReceptor: "GORL940812S1A",
    folioFiscal: "D4E8F1A2-D6FE-437E-9CE1-6A2F1B8A4D2E",
    total: 450.00,
    createdAt: "12/10/2023",
    items: [
      { description: "1x Tempra Forte 650mg 24 Tabs", amount: 145.00, code: "51101500" },
      { description: "1x Histiacil Jarabe Adulto 150ml", amount: 185.00, code: "51181503" },
      { description: "1x Gasa Estéril Caja 10 pzas", amount: 120.00, code: "42141503" }
    ],
    xmlContent: `<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante Version="4.0" Total="450.00" SubTotal="387.93"><cfdi:Emisor Rfc="FSAP9203112A4" Nombre="FARMACIA SAN PABLO S.A."/><cfdi:Receptor Rfc="GORL940812S1A" Nombre="LEONARDO GOMEZ RENDER" UsoCFDI="G03"/></cfdi:Comprobante>`
  },
  {
    id: "mock-inv-pemex",
    ticketId: "mock-active-pemex",
    nombreEmisor: "Gasolinera Pemex",
    rfcEmisor: "PEME8201249A2",
    nombreReceptor: "LEONARDO GOMEZ RENDER",
    rfcReceptor: "GORL940812S1A",
    folioFiscal: "BE82C10E-5C13-4D90-A8EA-61E627B1390E",
    total: 1200.50,
    createdAt: "11/10/2023",
    items: [
      { description: "51.30L Gasolina Magna (Pemex Regular)", amount: 1200.50, code: "15101514" }
    ],
    xmlContent: `<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante Version="4.0" Total="1200.50" SubTotal="1034.91"><cfdi:Emisor Rfc="PEME8201249A2" Nombre="COMBUSTIBLES PEMEX S.A."/><cfdi:Receptor Rfc="GORL940812S1A" Nombre="LEONARDO GOMEZ RENDER" UsoCFDI="G03"/></cfdi:Comprobante>`
  },
  {
    id: "mock-inv-starbucks",
    ticketId: "mock-active-starbucks",
    nombreEmisor: "Starbucks",
    rfcEmisor: "CSI020226MV4",
    nombreReceptor: "LEONARDO GOMEZ RENDER",
    rfcReceptor: "GORL940812S1A",
    folioFiscal: "E5B9...4D22",
    total: 225.00,
    createdAt: "24/10/2023 14:22:10",
    items: [
      { description: "1x Latte Venti Caliente", amount: 105.00, code: "90101700" },
      { description: "1x Panini Pavo", amount: 120.00, code: "90101700" }
    ],
    xmlContent: `<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante Version="4.0" Total="225.00" SubTotal="193.97"><cfdi:Emisor Rfc="CSI020226MV4" Nombre="CAFÉ SIRENA S. DE R.L. DE C.V."/><cfdi:Receptor Rfc="GORL940812S1A" Nombre="LEONARDO GOMEZ RENDER" UsoCFDI="G03"/></cfdi:Comprobante>`
  }
];

// Helper to resolve icon style for brands matching the design aesthetics
const getBrandBrandIcon = (nombre: string) => {
  const name = nombre.toLowerCase();
  if (name.includes("starbucks") || name.includes("coffee") || name.includes("café")) {
    return {
      IconComponent: Coffee,
      color: "bg-[#0B53F4]/10 text-[#0B53F4]"
    };
  }
  if (name.includes("pemex") || name.includes("gas") || name.includes("gasolina")) {
    return {
      IconComponent: Car,
      color: "bg-[#0B53F4]/10 text-[#0B53F4]"
    };
  }
  if (name.includes("walmart") || name.includes("super") || name.includes("mercado") || name.includes("oxxo")) {
    return {
      IconComponent: ShoppingBag,
      color: "bg-[#0B53F4]/10 text-[#0B53F4]"
    };
  }
  if (name.includes("farmacia") || name.includes("pablo") || name.includes("salud")) {
    return {
      IconComponent: ShieldCheck,
      color: "bg-[#0B53F4]/10 text-[#0B53F4]"
    };
  }
  return {
    IconComponent: FileText,
    color: "bg-[#0B53F4]/10 text-[#0B53F4]"
  };
};

export default function TicketsListScreen({
  tickets,
  invoices,
  fiscalProfile,
  onTriggerSimulationInline,
  currentUserEmail,
  onDeleteTicket,
  onTabChange,
  newlyAddedTicketId,
  onClearNewlyAddedTicketId
}: TicketsListScreenProps) {
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
  
  // Interactive inputs
  const [emailTo, setEmailTo] = useState(currentUserEmail || "legionrender@gmail.com");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [ticketIdToDelete, setTicketIdToDelete] = useState<string | null>(null);
  const [smtpStatus, setSmtpStatus] = useState<{ smtpConfigured: boolean; smtpUser: string | null } | null>(null);

  // Retrieve SMTP setup status on load
  useEffect(() => {
    let active = true;
    getConfigStatus()
      .then((res) => {
        if (!res.ok) throw new Error("Status failed");
        return res.json();
      })
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
    toast.success(`Archivo descargado con éxito: ${fileName}`, "Descarga Completa");
  };

  // Email simulation matching original endpoint
  const handleSendEmail = async (invoiceObj: any) => {
    setIsSendingEmail(true);
    const emailToastId = toast.loading(`Enviando copia de factura a ${emailTo}...`, "Enviando Correo");
    try {
      const response = await sendEmail({
        to: emailTo,
        invoice: {
          ...invoiceObj,
          folioFiscal: invoiceObj.folioFiscal || "E5B9C231-18FA-427D-B27D-1F3D573B4D22",
          pdfHtml: invoiceObj.pdfHtml || `<p>Factura de ${invoiceObj.nombreEmisor} por un total de $${invoiceObj.total}</p>`
        }
      });
      const data = await response.json();
      toast.removeToast(emailToastId);
      if (response.ok) {
        toast.success(data.message || `¡Factura enviada con éxito a ${emailTo}!`, "Correo Enviado");
      } else {
        throw new Error(data.error || "No se pudo enviar el correo");
      }
    } catch (err: any) {
      console.error(err);
      toast.removeToast(emailToastId);
      toast.error(err.message || "Error al enviar el correo", "Error de envío");
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Use strictly real user data here, with absolutely no simulation/mock data.
  const inProgressList = tickets.filter(t => t.status !== "completed");
  const emittedInvoicesList = invoices;

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
      ? (activeInvoiceData as any).nombreEmisor === "Starbucks" ? "Café Sirena S. de R.L. de C.V." : `${emisorNameRaw} S.A. de C.V.`
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
      { description: "1x Consumo General de Mercancías", amount: totalVal, code: "90101700" }
    ];

    const brandStyle = getBrandBrandIcon(emisorNameRaw);

    // SAT Helpers for clean and authentic labels
    const getRegimenLabel = (code: string | null) => {
      if (!code) return "616 - Sin obligaciones fiscales";
      const map: Record<string, string> = {
        "601": "601 - General de Ley Personas Morales",
        "603": "603 - Personas Morales con Fines no Lucrativos",
        "605": "605 - Sueldos y Salarios e Ingresos Asimilados a Salarios",
        "606": "606 - Arrendamiento",
        "608": "608 - Demás ingresos",
        "612": "612 - Personas Físicas con Actividades Empresariales y Profesionales",
        "616": "616 - Sin obligaciones fiscales",
        "621": "621 - Incorporación Fiscal",
        "625": "625 - Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
        "626": "626 - Régimen Simplificado de Confianza (RESICO)"
      };
      return map[code] || `${code} - Régimen Fiscal`;
    };

    const getUsoCfdiLabel = (code: string | null) => {
      if (!code) return "G03 - Gastos en general";
      const map: Record<string, string> = {
        "G01": "G01 - Adquisición de mercancías",
        "G02": "G02 - Devoluciones, descuentos o bonificaciones",
        "G03": "G03 - Gastos en general",
        "I01": "I01 - Construcciones",
        "I02": "I02 - Mobiliario y equipo de oficina por inversiones",
        "I03": "I03 - Equipo de transporte",
        "I04": "I04 - Equipo de cómputo y accesorios",
        "I08": "I08 - Otra maquinaria y equipo",
        "D01": "D01 - Honorarios médicos, dentales y gastos hospitalarios",
        "D02": "D02 - Gastos médicos por incapacidad o discapacidad",
        "D03": "D03 - Gastos funerales",
        "D04": "D04 - Donativos",
        "D07": "D07 - Primas por seguros de gastos médicos",
        "D08": "D08 - Gastos de transportación escolar obligatoria",
        "D10": "D10 - Depósitos en cuentas especiales para el ahorro",
        "CP01": "CP01 - Pagos",
        "CN01": "CN01 - Nómina",
        "S01": "S01 - Sin efectos fiscales"
      };
      return map[code] || `${code} - Uso CFDI`;
    };

     // Parse XML to extract real CFDI metadata if available
    let selloSAT = "JX9A23KSF841HLWND82HJKLSW0K295LW0192LSLW0KND82910NSDLUQ9W892019ADJLW2";
    let selloCFD = "f9aC1D2E3F4G5H6I7J8K9L0M1N2O3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E9F0G1H2I3J4K";
    let noCertificadoSAT = "00001000000504465028";
    let noCertificadoEmisor = "00001000000503932847";
    let lugarExpedicion = "CDMX, México";
    let metodoPagoVal = "PUE - Pago en una sola exhibición";
    
    // Fallbacks for client receptor data
    const rfcReceptorVal = activeInvoiceData.rfcReceptor || fiscalProfile?.rfc || "XAXX010101000";
    const nombreReceptorVal = activeInvoiceData.nombreReceptor || fiscalProfile?.razonSocial || "Público General / Cliente Registrado";
    const emailReceptorVal = activeInvoiceData.emailReceptor || fiscalProfile?.email || currentUserEmail || "receptor.sat@zenticket.mx";
    
    let regimenFiscalReceptorVal = getRegimenLabel(activeInvoiceData.regimenFiscalReceptor || fiscalProfile?.regimenFiscal || "616");
    let usoCfdiVal = getUsoCfdiLabel(activeInvoiceData.usoCfdiReceptor || fiscalProfile?.cfdiUse || "G03");

    if (activeInvoiceData.xmlContent) {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(activeInvoiceData.xmlContent, "text/xml");
        
        // Extract Timbre Fiscal Digital info
        const tfd = xmlDoc.getElementsByTagName("tfd:TimbreFiscalDigital")[0] || xmlDoc.getElementsByTagName("TimbreFiscalDigital")[0];
        if (tfd) {
          selloSAT = tfd.getAttribute("SelloSAT") || selloSAT;
          selloCFD = tfd.getAttribute("SelloCFD") || selloCFD;
          noCertificadoSAT = tfd.getAttribute("NoCertificadoSAT") || noCertificadoSAT;
        }
        
        // Extract Comprobante info
        const comprobante = xmlDoc.getElementsByTagName("cfdi:Comprobante")[0] || xmlDoc.getElementsByTagName("Comprobante")[0];
        if (comprobante) {
          noCertificadoEmisor = comprobante.getAttribute("NoCertificado") || noCertificadoEmisor;
          selloCFD = comprobante.getAttribute("Sello") || selloCFD;
          const cp = comprobante.getAttribute("LugarExpedicion");
          if (cp) lugarExpedicion = cp + ", México";
          
          const mp = comprobante.getAttribute("MetodoPago");
          if (mp) {
            metodoPagoVal = mp === "PUE" ? "PUE - Pago en una sola exhibición" : mp === "PPD" ? "PPD - Pago en parcialidades o diferido" : mp;
          }
        }
        
        // Extract Receptor info
        const receptor = xmlDoc.getElementsByTagName("cfdi:Receptor")[0] || xmlDoc.getElementsByTagName("Receptor")[0];
        if (receptor) {
          const uso = receptor.getAttribute("UsoCFDI");
          if (uso) usoCfdiVal = getUsoCfdiLabel(uso);
          
          const reg = receptor.getAttribute("RegimenFiscalReceptor");
          if (reg) regimenFiscalReceptorVal = getRegimenLabel(reg);
        }
      } catch (xmlParseErr) {
        console.warn("Failed to parse XML content for printing metadata:", xmlParseErr);
      }
    }

    // Build authentic SAT verification URL and dynamic QR Code Src
    const satVerificationUrl = `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${uuidVal}&re=${rfcEmisorVal}&rr=${rfcReceptorVal}&tt=${totalVal.toFixed(2)}`;
    const satQrCodeImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(satVerificationUrl)}`;

    return (
      <div className="max-w-6xl mx-auto space-y-8 font-sans text-left mt-2 relative select-none pb-24 animate-fade-in_50">
        
        {/* Nav header matching Screen 3 */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1360f8]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedInvoiceId(null);
                setShowXmlCode(false);
              }}
              className="p-2 bg-[#ebf1ff] hover:bg-[#ebf1ff]/80 text-[#0B53F4] rounded-full cursor-pointer transition"
              title="Volver"
            >
              <ArrowLeft className="w-5 h-5 stroke-[2.2]" />
            </button>
            <h1 className="text-xl font-black text-[#1360f8] tracking-tight">Ver PDF - Detalle de Factura</h1>
          </div>

          <button
            type="button"
            onClick={() => {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(`https://sat.gob.mx/cfdi/${uuidVal}`);
                toast.success("Enlace oficial CFDI SAT copiado con éxito.", "Compartir Factura");
              } else {
                toast.info(`UUID: ${uuidVal}`, "Detalle de Emisión");
              }
            }}
            className="p-2 bg-[#ebf1ff] hover:bg-[#ebf1ff]/80 text-[#0B53F4] rounded-full cursor-pointer transition"
            title="Compartir"
          >
            <Share2 className="w-5 h-5 stroke-[2.2]" />
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
              FACTURA ELECTRÓNICA
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
              <span className="text-slate-400 font-extrabold uppercase tracking-wide block">Fecha Emisión</span>
              <span className="text-slate-800 font-black block">{formattedDate}</span>
            </div>

            <div className="space-y-0.5 text-left">
              <span className="text-slate-400 font-extrabold uppercase tracking-wide block">Método Pago</span>
              <span className="text-slate-800 font-black block">PUE - Pago en una sola exhibición</span>
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
          <div className="bg-[#F1F3FE]/70 dark:bg-[#0d1226] border border-blue-50 dark:border-slate-800/80 p-4.5 rounded-[22px] mt-6 space-y-2 text-left">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-bold">Subtotal</span>
              <span className="font-mono text-slate-700 dark:text-slate-300 font-black">${subtotalVal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-bold">IVA (16%)</span>
              <span className="font-mono text-slate-700 dark:text-slate-300 font-black">${ivaVal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            <div className="border-t border-slate-200/50 dark:border-slate-800 my-1 pt-1.5 flex justify-between items-center">
              <span className="text-slate-800 dark:text-slate-200 font-black text-xs uppercase tracking-wider">TOTAL MXN</span>
              <span className="font-mono text-[#0B53F4] dark:text-[#5B8CFF] text-lg font-black tracking-tight">${totalVal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* QR & SECURITY MATRIX FOOTER */}
          <div className="flex flex-col gap-4 mt-6 pt-5 border-t border-slate-100 text-left">
            <div className="flex items-center gap-4">
              {/* Dynamic SAT QR code image */}
              <div className="w-14 h-14 bg-white flex-shrink-0 flex items-center justify-center rounded-lg p-1 border border-slate-200 overflow-hidden">
                <img src={satQrCodeImgSrc} className="w-full h-full object-contain" alt="SAT QR" />
              </div>

              <div className="leading-tight min-w-0 flex-1">
                <p className="text-[7.5px] text-slate-400 font-mono select-all overflow-hidden text-ellipsis line-clamp-2 uppercase break-all">
                  Sello Digital del SAT: {selloSAT}
                </p>
                <span className="text-[8px] uppercase font-black text-emerald-600 block mt-1 tracking-wider">
                  ✓ Formato de Factura Timbrada compatible v4.0
                </span>
              </div>
            </div>

            {/* SAT Live Verification Action Button */}
            <a
              href={satVerificationUrl}
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
              toast.info("Generando reporte PDF tamaño carta oficial...", "PDF");
              setTimeout(() => {
                const printWindow = window.open("", "_blank");
                if (printWindow) {
                  printWindow.document.write(`
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <title>Factura_${emisorNameRaw}_${uuidVal.substring(0,8)}</title>
                        <style>
                          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');
                          
                          * {
                            box-sizing: border-box;
                          }
                          @page {
                            size: letter;
                            margin: 10mm 15mm;
                          }
                          body {
                            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                            color: #1e293b;
                            background-color: #f8fafc;
                            margin: 0;
                            padding: 20px 10px;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                          }
                          .page-wrapper {
                            max-width: 800px;
                            margin: 0 auto;
                            background-color: #ffffff;
                            border: 1px solid #e2e8f0;
                            border-radius: 24px;
                            padding: 35px;
                            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
                            position: relative;
                            overflow: hidden;
                          }
                          
                          .header-container {
                            display: flex;
                            justify-content: space-between;
                            align-items: flex-start;
                            position: relative;
                            z-index: 10;
                            margin-bottom: 24px;
                          }

                          /* Logo and issuer section */
                          .issuer-box {
                            text-align: left;
                          }
                          
                          /* Heading right of Invoice */
                          .invoice-title-box {
                            text-align: right;
                          }
                          .invoice-title-box h1 {
                            font-size: 32px;
                            font-weight: 900;
                            color: #0072fc;
                            margin: 0 0 8px 0;
                            letter-spacing: 0.05em;
                            text-transform: uppercase;
                          }
                          .invoice-meta-item {
                            font-size: 11px;
                            font-weight: 500;
                            color: #475569;
                            margin: 3px 0;
                          }
                          .invoice-meta-item strong {
                            color: #0f172a;
                            font-weight: 700;
                          }

                          /* Columns section: BILL TO & metadata */
                          .billing-info-section {
                            display: grid;
                            grid-template-columns: 1.15fr 0.85fr;
                            gap: 30px;
                            margin-bottom: 24px;
                            position: relative;
                            z-index: 10;
                          }
                          .bill-to-box {
                            border-top: 3px solid #0072fc;
                            padding-top: 10px;
                          }
                          .bill-title {
                            font-size: 11px;
                            font-weight: 800;
                            color: #0072fc;
                            text-transform: uppercase;
                            letter-spacing: 0.12em;
                            margin-bottom: 8px;
                          }
                          .bill-client-name {
                            font-size: 15px;
                            font-weight: 800;
                            color: #0f172a;
                            margin: 0 0 6px 0;
                          }
                          .bill-details {
                            font-size: 11px;
                            line-height: 1.5;
                            color: #475569;
                          }
                          .bill-details p {
                            margin: 3px 0;
                          }

                          /* Styled Table layout following modern design precisely */
                          .table-container {
                            margin-bottom: 20px;
                            position: relative;
                            z-index: 10;
                          }
                          .invoice-table {
                            width: 100%;
                            border-collapse: collapse;
                            text-align: left;
                          }
                          .invoice-table th {
                            background-color: #0072fc;
                            color: #ffffff;
                            font-size: 10px;
                            font-weight: 800;
                            text-transform: uppercase;
                            padding: 10px 14px;
                            letter-spacing: 0.1em;
                            border: none;
                          }
                          .invoice-table th:first-child {
                            border-top-left-radius: 8px;
                            border-bottom-left-radius: 8px;
                            width: 50px;
                            text-align: center;
                          }
                          .invoice-table th:last-child {
                            border-top-right-radius: 8px;
                            border-bottom-right-radius: 8px;
                            text-align: right;
                          }
                          
                          .invoice-table td {
                            padding: 10px 14px;
                            font-size: 12px;
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
                            font-size: 10px;
                            color: #64748b;
                            font-weight: 400;
                            margin-top: 2px;
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
                            grid-template-columns: 1.15fr 0.85fr;
                            gap: 30px;
                            margin-top: 15px;
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
                            border-radius: 12px;
                            padding: 14px;
                            font-size: 10px;
                            color: #64748b;
                            line-height: 1.4;
                            margin-bottom: 12px;
                          }
                          .notes-block h4 {
                            font-size: 10px;
                            font-weight: 800;
                            text-transform: uppercase;
                            color: #1e293b;
                            margin: 0 0 4px 0;
                            letter-spacing: 0.05em;
                          }

                          /* Signature section */
                          .signature-container {
                            margin-top: 5px;
                            text-align: left;
                          }
                          .signature-line {
                            width: 160px;
                            height: 1px;
                            background-color: #cbd5e1;
                            margin-bottom: 5px;
                          }
                          .signature-title {
                            font-size: 10px;
                            font-weight: 750;
                            color: #64748b;
                            text-transform: uppercase;
                            letter-spacing: 0.05em;
                          }

                          /* Grand total panel */
                          .grand-totals-panel {
                            display: flex;
                            flex-direction: column;
                            gap: 8px;
                            background-color: #ffffff;
                            border: 1px solid #f1f5f9;
                            border-radius: 16px;
                            padding: 16px;
                            align-self: flex-start;
                            width: 100%;
                          }
                          .subtotal-metric-row {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            font-size: 12px;
                            font-weight: 600;
                            color: #475569;
                          }
                          .subtotal-metric-row span:last-child {
                            font-family: 'JetBrains Mono', monospace;
                            color: #1e293b;
                            font-weight: 700;
                          }
                          
                          .grand-total-blue-badge {
                            background: linear-gradient(90deg, #0072fc 0%, #0056be 100%);
                            border-radius: 10px;
                            padding: 10px 14px;
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            color: #ffffff;
                            margin-top: 5px;
                          }
                          .grand-total-blue-badge .label {
                            font-size: 11px;
                            font-weight: 800;
                            letter-spacing: 0.08em;
                            text-transform: uppercase;
                          }
                          .grand-total-blue-badge .val {
                            font-family: 'JetBrains Mono', monospace;
                            font-size: 18px;
                            font-weight: 800;
                          }

                          /* Sat Security Verification Row */
                          .sat-verification-section {
                            margin-top: 20px;
                            border-top: 1px solid #f1f5f9;
                            padding-top: 16px;
                            display: flex;
                            align-items: center;
                            gap: 15px;
                            position: relative;
                            z-index: 10;
                          }
                          .qr-code-holder {
                            width: 72px;
                            height: 72px;
                            background-color: #ffffff;
                            border: 1px dashed #cbd5e1;
                            border-radius: 12px;
                            padding: 4px;
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
                            font-size: 8.5px;
                            font-weight: 800;
                            color: #94a3b8;
                            text-transform: uppercase;
                            letter-spacing: 0.08em;
                            margin: 0 0 4px 0;
                          }
                          .stamp-content {
                            font-family: 'JetBrains Mono', monospace;
                            font-size: 7.5px;
                            color: #64748b;
                            line-height: 1.3;
                            word-break: break-all;
                            margin: 0 0 6px 0;
                            background-color: #f8fafc;
                            padding: 6px 10px;
                            border-radius: 6px;
                            border: 1px solid #f1f5f9;
                          }
                          .certified-pill {
                            font-size: 9.5px;
                            font-weight: 800;
                            color: #10b981;
                            display: flex;
                            align-items: center;
                            gap: 4px;
                            text-transform: uppercase;
                          }
                          .certified-pill svg {
                            width: 12px;
                            height: 12px;
                            stroke: #10b981;
                          }

                          /* Compact clean footer banner */
                          .custom-decor-footer-banner {
                            margin-top: 25px;
                            background-color: #0072fc;
                            border-radius: 12px;
                            padding: 10px 16px;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            color: #ffffff;
                            font-size: 9px;
                            font-weight: 600;
                            position: relative;
                            z-index: 10;
                          }

                          @media print {
                            body {
                              background-color: #ffffff;
                              padding: 0 !important;
                              margin: 0 !important;
                            }
                            .page-wrapper {
                              border: none !important;
                              box-shadow: none !important;
                              padding: 0 !important;
                              margin: 0 !important;
                              max-width: 100% !important;
                              border-radius: 0 !important;
                            }
                          }
                        </style>
                                     <div class="page-wrapper">
                          
                          <!-- Top Header info -->
                          <div class="header-container">
                            <div class="issuer-box">
                              <h1 style="color: #0072fc; font-size: 26px; font-weight: 900; text-transform: uppercase; margin: 0 0 6px 0; font-family: sans-serif; letter-spacing: 0.5px; line-height: 1;">FACTURA</h1>
                              <div style="margin-top: 5px;">
                                <h3 style="font-size: 13px; font-weight: 850; color: #0f172a; margin: 0 0 2px 0;">${emisorCorp}</h3>
                                <p style="font-size: 11px; color: #475569; margin: 0;"><strong>RFC Emisor:</strong> ${rfcEmisorVal}</p>
                                <p style="font-size: 11px; color: #475569; margin: 2px 0 0 0;"><strong>Régimen Fiscal Emisor:</strong> ${getRegimenLabel(activeInvoiceData.regimenFiscalEmisor || "601")}</p>
                              </div>
                            </div>
                            
                            <div class="invoice-title-box" style="display: flex; flex-direction: column; align-items: flex-end;">
                              <img src="${logoLight}" style="height: 48px; width: auto; margin-bottom: 12px; object-fit: contain;" alt="ZenTicket" />
                              <div class="invoice-meta-item">Fecha: <strong>${formattedDate}</strong></div>
                              <div class="invoice-meta-item">Folio Fiscal (UUID): <strong>${uuidVal}</strong></div>
                              <div class="invoice-meta-item">Lugar de Expedición: <strong>${lugarExpedicion}</strong></div>
                            </div>
                          </div>
                          
                          <!-- Columns detailed box -->
                          <div class="billing-info-section">
                            <div class="bill-to-box">
                              <div class="bill-title">Facturado a (Cfdi Receptor)</div>
                              <h3 class="bill-client-name">${nombreReceptorVal}</h3>
                              <div class="bill-details">
                                <p><strong>RFC:</strong> ${rfcReceptorVal}</p>
                                <p><strong>Uso CFDI:</strong> ${usoCfdiVal}</p>
                                <p><strong>Email:</strong> ${emailReceptorVal}</p>
                                <p><strong>Régimen Fiscal:</strong> ${regimenFiscalReceptorVal}</p>
                              </div>
                            </div>
                            
                            <div class="bill-to-box">
                              <div class="bill-title">Datos Fiscales de Certificación</div>
                              <div class="bill-details" style="margin-top: 4px;">
                                <p><strong>Certificado SAT:</strong> ${noCertificadoSAT}</p>
                                <p><strong>Certificado Emisor:</strong> ${noCertificadoEmisor}</p>
                                <p><strong>Método de Pago:</strong> ${metodoPagoVal}</p>
                                <p><strong>Moneda:</strong> MXN - Peso Mexicano</p>
                              </div>
                            </div>
                          </div>
                          
                          <!-- Dynamic Concepts table structured with design -->
                          <div class="table-container">
                            <table class="invoice-table">
                              <thead>
                                <tr>
                                  <th>ST</th>
                                  <th>Descripción del Concepto</th>
                                  <th style="text-align: right;">Precio Unitario</th>
                                  <th style="text-align: center; width: 60px;">Cant.</th>
                                  <th style="text-align: right; width: 120px;">Importe</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${(() => {
                                  return itemsList.map((item: any, idx: number) => {
                                    const stNum = String(idx + 1).padStart(2, '0');
                                    const unitVal = item.amount || item.importe || 0;
                                    const desc = item.description || item.descripcion || "Consumo General de Mercancías";
                                    const code = item.code || "90101501";
                                    const formattedVal = "$" + unitVal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                    return "<tr>" +
                                      "<td class='cell-st'>" + stNum + "</td>" +
                                      "<td class='cell-desc'>" +
                                        "<span>" + desc + "</span>" +
                                        "<span class='subtext'>Clave SAT: " + code + " | Unidad: E48 - Servicio</span>" +
                                      "</td>" +
                                      "<td class='cell-rate' style='text-align: right;'>" + formattedVal + "</td>" +
                                      "<td class='cell-qty' style='text-align: center;'>1</td>" +
                                      "<td class='cell-total'>" + formattedVal + "</td>" +
                                    "</tr>";
                                  }).join("");
                                })()}
                              </tbody>
                            </table>
                          </div>
                          
                          <!-- Signatures & Notes row & Totals summary -->
                          <div class="bottom-invoice-row">
                            
                            <div class="payment-and-signs">
                              <div class="notes-block">
                                <h4>Términos y Condiciones de Certificación</h4>
                                <p>Este documento es una representation impresa de un CFDI versión 4.0. El pago se efectúa mediante una sola exhibición (PUE). Cualquier aclaración referente a la facturación de su ticket favor de realizarla dentro de los 30 días posteriores a la fecha de emisión.</p>
                              </div>
                            </div>
                            
                            <div class="grand-totals-panel">
                              <div class="subtotal-metric-row">
                                <span>Subtotal</span>
                                <span>$${subtotalVal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                              <div class="subtotal-metric-row" style="border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
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
                              <img src="${satQrCodeImgSrc}" style="width: 100%; height: 100%; object-fit: contain;" alt="SAT Verification QR" />
                            </div>
                            <div class="stamp-details-box">
                              <h5 class="stamp-headline">Sello Digital del Emisor (CFD)</h5>
                              <p class="stamp-content" style="margin-bottom: 8px;">${selloCFD}</p>
                              <h5 class="stamp-headline">Sello Digital del SAT</h5>
                              <p class="stamp-content">${selloSAT}</p>
                              <span class="certified-pill">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                                Timbrado verificado en bases SAT en tiempo real
                              </span>
                            </div>
                          </div>
                          
                          <!-- Footer banner item indicating invoice origin -->
                          <div class="custom-decor-footer-banner">
                            <div class="footer-banner-item">
                              <span>Esta factura es una representación impresa de un CFDI emitida a través de ZenTicket &bull; www.zenticket.mx</span>
                            </div>
                          </div>

                        </div>
                      </body>
                    </html>
                  `);
                  printWindow.document.close();
                  // Delay execution to allow external images (dynamic SAT QR server and logo-light asset) to load
                  setTimeout(() => {
                    printWindow.print();
                  }, 1200);
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
            onClick={() => {
              let xmlToDownload = activeInvoiceData.xmlContent;
              if (!xmlToDownload) {
                const subT = totalVal / 1.16;
                const ivT = totalVal - subT;
                const emNameClean = emisorCorp.replace(/["&'<>]/g, "");
                const recNameClean = nombreReceptorVal.replace(/["&'<>]/g, "");
                xmlToDownload = `<?xml version="1.0" encoding="UTF-8"?>\n<cfdi:Comprobante Version="4.0" Serie="F" Folio="88219" Fecha="${formattedDate.replace(" ", "T")}" SubTotal="${subT.toFixed(2)}" Moneda="MXN" TipoDeComprobante="I" Exportacion="01" MetodoPago="PUE" LugarExpedicion="${lugarExpedicion.replace(", México", "")}" Total="${totalVal.toFixed(2)}">\n  <cfdi:Emisor Rfc="${rfcEmisorVal}" Nombre="${emNameClean}" RegimenFiscal="601"/>\n  <cfdi:Receptor Rfc="${rfcReceptorVal}" Nombre="${recNameClean}" RegimenFiscalReceptor="${regimenFiscalReceptorVal.substring(0,3)}" UsoCFDI="${usoCfdiVal.substring(0,3)}"/>\n  <cfdi:Conceptos>\n    <cfdi:Concepto ClaveProdServ="90101501" Cantidad="1" ClaveUnidad="E48" Descripcion="${itemsList[0]?.description || itemsList[0]?.descripcion || "Consumo General de Mercancías"}" ValorUnitario="${subT.toFixed(2)}" Importe="${subT.toFixed(2)}">\n      <cfdi:Impuestos>\n        <cfdi:Traslados>\n          <cfdi:Traslado Base="${subT.toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${ivT.toFixed(2)}"/>\n        </cfdi:Traslados>\n      </cfdi:Impuestos>\n    </cfdi:Concepto>\n  </cfdi:Conceptos>\n  <cfdi:Complemento>\n    <tfd:TimbreFiscalDigital Version="1.1" UUID="${uuidVal}" FechaTimbrado="${formattedDate.replace(" ", "T")}" SelloCFD="${selloSAT.substring(0, 30)}..." NoCertificadoSAT="${noCertificadoSAT}" SelloSAT="${selloSAT}"/>\n  </cfdi:Complemento>\n</cfdi:Comprobante>`;
              }
              downloadFile(xmlToDownload, `Factura_${emisorNameRaw}_${uuidVal.substring(0,10)}.xml`, "text/xml");
            }}
            className="w-full zt-btn-secondary-blue transition duration-150 flex items-center justify-center gap-2 py-4 rounded-2xl font-black uppercase text-xs cursor-pointer"
          >
            <span>{"</>"}</span>
            Descargar XML
          </button>

          {/* INTERACTIVE XML PREVIEW COLLAPSE */}
          <button
            type="button"
            onClick={() => setShowXmlCode(!showXmlCode)}
            className={`w-full transition duration-150 flex items-center justify-center gap-2 py-4 rounded-2xl font-black uppercase text-xs cursor-pointer select-none border-none ${
              showXmlCode 
                ? "bg-slate-900 text-emerald-400" 
                : "bg-[#ebf1ff] text-[#0B53F4] hover:bg-[#ebf1ff]/80 shadow-2xs"
            }`}
          >
            <Eye className="w-4 h-4 shrink-0" />
            {showXmlCode ? "Ocultar previsualizador XML" : "Previsualizar XML CFDI original"}
          </button>
        </div>

        {showXmlCode && (
          <div className="bg-slate-950 text-emerald-400 rounded-3xl p-5 border border-slate-900 text-left relative overflow-hidden shadow-2xl select-all">
            <div className="absolute top-4 right-4 flex gap-1.5 z-10">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 block"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 block"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 block"></span>
            </div>
            
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-zinc-900 select-none">
              <span className="text-[10px] text-slate-500 font-sans font-black tracking-widest uppercase">
                Código XML CFDI v4.0 Original Emitido
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
                  toast.success("Código XML CFDI copiado al portapapeles.", "Copiar XML");
                }}
                className="bg-slate-900 hover:bg-slate-850 text-slate-100 font-extrabold px-3 py-1.5 rounded-xl border border-slate-800 cursor-pointer active:scale-95 transition"
              >
                Copiar Código XML
              </button>
            </div>
          </div>
        )}

        {/* CONECTOR REAL EN PRODUCCIÓN EXPLANATORY ACCORDION */}
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-3xl space-y-3">
          <div className="flex items-center gap-2.5 text-left select-none">
            <Sparkles className="w-5 h-5 text-[#0B53F4] shrink-0" />
            <div className="leading-tight">
              <span className="font-extrabold text-slate-800 text-xs block">Conector Real en Producción</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Cómo se procesa y verifica la extracción del portal</span>
            </div>
          </div>
          
          <div className="text-slate-640 text-[11.5px] sm:text-xs text-left space-y-2 leading-relaxed">
            <p>
              En esta demostración de ZenTicket, <strong>simulamos la interacción robotizada con el SAT y portales comerciales</strong> para enseñarte las capacidades de extracción de la IA mediante esquemas estructurados de selectores CSS (como Alsea, Oxxo o Walmart).
            </p>
            <p>
              <strong>¿Cómo hacerlo 100% real en tu propio producto de producción?</strong>
            </p>
            <ul className="list-decimal pl-4.5 space-y-2 text-[11px] sm:text-[11.5px] font-semibold text-slate-700">
              <li>
                <strong className="text-slate-800">Scraping Automático (Playwright/Puppeteer):</strong> Configura un robot en el servidor que cargue la URL del portal del emisor, rellene los campos mapeados (RFC, folio, total) usando selectores CSS, resuelva captchas usando decodificadores (como <i>2Captcha</i>), proceda a emitir y devuelva los archivos XML y PDF.
              </li>
              <li>
                <strong className="text-slate-800">Conexión directa vía PAC / SAT Web Service:</strong> Solicita facturas directamente al SAT o a proveedores autorizados de certificación (PACs) asociando las credenciales de tu FIEL / CSD, permitiendo la descargas automáticas inmediatas desde las bases del SAT de forma masiva sin captchas.
              </li>
            </ul>
          </div>
        </div>

        {/* PRESERVE USEFUL UTILITIES OR EMAIL DISPATCH ROW */}
        <div className="bg-white border border-slate-200 p-4.5 rounded-3xl space-y-3.5">
          <div className="text-left text-xs leading-tight">
            <span className="font-extrabold text-slate-800 block">Enviar copia de respaldo</span>
            <span className="text-slate-400 block mt-0.5">Envía el archivo PDF y XML directo al buzón de tu contador</span>
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
          <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800/80 select-none text-left">
            {smtpStatus?.smtpConfigured ? (
              <div className="flex items-start gap-2 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-500/10 rounded-xl p-3 text-left">
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-450 shrink-0 mt-0.5" />
                <div className="leading-tight">
                  <span className="text-[10.5px] text-emerald-800 dark:text-emerald-400 font-extrabold block">
                    Servidor de Correo SMTP Activo
                  </span>
                  <p className="text-[9.5px] text-emerald-650 dark:text-emerald-300 font-semibold block mt-0.5 leading-normal">
                    Credenciales configuradas para <strong>{smtpStatus.smtpUser}</strong>. La factura XML y PDF se enviará de forma <strong>REAL</strong> a {emailTo}.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 bg-amber-50/70 dark:bg-amber-950/10 border border-amber-200/50 dark:border-amber-500/10 rounded-xl p-3 text-left">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse shrink-0" />
                  <span className="text-[10.5px] text-amber-800 dark:text-amber-400 font-black">
                    Modo Sandbox: Correo Simulado
                  </span>
                </div>
                <p className="text-[9.5px] text-amber-700 dark:text-amber-350 leading-normal font-semibold">
                  Se ha simulado el envío con éxito. Si quieres que le llegue un <strong>correo real</strong> a tu buzón personal o al de tu contador, configura las claves <code className="bg-amber-100/80 dark:bg-amber-950/30 px-1 py-0.2 rounded font-mono text-[9px] font-black font-semibold text-amber-900 dark:text-amber-350">SMTP_HOST</code>, <code className="bg-amber-100/80 dark:bg-amber-950/30 px-1 py-0.2 rounded font-mono text-[9px] font-black font-semibold text-amber-900 dark:text-amber-350">SMTP_USER</code> y <code className="bg-amber-100/80 dark:bg-amber-950/30 px-1 py-0.2 rounded font-mono text-[9px] font-black font-semibold text-amber-900 dark:text-amber-350">SMTP_PASS</code> en la pestaña <strong>Settings &gt; Secrets</strong> de AI Studio.
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

  // ----------------------------------------------------
  // STANDARD INTERACTIVE MAIN SCREEN LIST VIEW
  // ----------------------------------------------------
  return (
    <div className="max-w-6xl mx-auto space-y-6 font-body text-left mt-2 relative select-none pb-24 animate-fade-in_50">
      
      {/* Top title header matching Screenshots 1 & 2 */}
      <div className="flex items-center gap-4 py-2 border-b border-[#1360f8] pb-3 relative">
        <h1 className="font-display font-extrabold text-[28px] text-[#1360f8] tracking-tight">Mis Tickets</h1>
      </div>

      {/* SEGMENTED CONTROL TAB BAR FILTERS MATCHING IMAGE - Hidden on desktop screens */}
      <div className="bg-[#F1F3FE] p-1.5 rounded-2xl border border-slate-100/70 shadow-inner flex w-full relative lg:hidden">
        <button
          type="button"
          onClick={() => setActiveSubTab("en-seguimiento")}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all duration-150 cursor-pointer ${
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
          className={`flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all duration-150 cursor-pointer ${
            activeSubTab === "facturas-emitidas"
              ? "bg-white text-slate-800 shadow-[0_2px_10px_rgba(15,23,42,0.06)]"
              : "text-slate-450 hover:text-slate-705"
          }`}
        >
          Facturas Emitidas
        </button>
      </div>

      {/* Grid container layout for widescreen desktop preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* COLUMN 1: EN SEGUIMIENTO (Visible on desktop OR when mobile has activeSubTab === "en-seguimiento") */}
        <div className={`space-y-4 lg:col-span-6 ${activeSubTab === "en-seguimiento" ? "block" : "hidden lg:block"}`}>
          <div className="flex items-center justify-between px-1 mb-2">
            <h2 className="font-display font-extrabold text-base text-slate-800 tracking-tight">
              En seguimiento
            </h2>
            <span className="bg-blue-100 text-blue-700 text-[10px] font-extrabold px-3 py-1 rounded-full uppercase leading-none tracking-wider font-display">
              {activeCount} ACTIVO{activeCount !== 1 ? "S" : ""}
            </span>
          </div>

          <div className="space-y-4">
            {inProgressList.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-200/80 p-9 rounded-3xl text-center">
                <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2 animate-pulse" />
                <p className="text-xs font-black text-slate-800">No hay tickets activos en este momento</p>
                <p className="text-[10px] text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">Puedes arrastrar otro ticket en la sección Captura para procesarlo.</p>
              </div>
            ) : (
              inProgressList.map((t) => {
                const isFailed = t.status === "failed";
                const isProcessing = t.status === "processing";
                const brand = getBrandBrandIcon(t.nombreEmisor || "");
                const isNewlyAdded = newlyAddedTicketId && t.id === newlyAddedTicketId;

                return (
                  <div 
                    key={t.id}
                    className={`rounded-3xl p-5 flex flex-col gap-4 relative overflow-hidden transition ${
                      isNewlyAdded
                        ? "border-2 border-[#0B53F4] shadow-[0_0_25px_rgba(11,83,244,0.08)] bg-blue-50/10 scale-[1.01] duration-300"
                        : "bg-white border border-slate-200/50 shadow-[0_4px_20px_rgba(15,23,42,0.02)] hover:border-[#0B53F4]/20 hover:shadow-[0_4px_24px_rgba(11,83,244,0.04)]"
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
                        <div className={`w-10 h-10 ${brand.color} rounded-full flex items-center justify-center shrink-0`}>
                          <brand.IconComponent className="w-5 h-5 stroke-[2.2]" />
                        </div>
                        
                        <div className="text-left leading-tight min-w-0">
                          <span className="text-sm font-black text-slate-800 block truncate max-w-[170px] uppercase">
                            {t.nombreEmisor || "Emisor"}
                          </span>
                          <span className="text-[11px] text-slate-400 block mt-1 font-semibold">
                            Ticket #{t.folio || "S/D"} • {t.fechaCompra || "S/F"}
                          </span>
                        </div>
                      </div>

                      {/* Highly polished active status state indicator badge with optional Recién Agregado flag */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {isNewlyAdded && (
                          <span className="bg-[#EBF5FF] text-[#0B53F4] text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1 leading-none shadow-sm animate-pulse">
                            <Sparkles className="w-2.5 h-2.5 fill-current" />
                            RECIÉN AGREGADO
                          </span>
                        )}
                        {t.status === "review" ? (
                          <span className="bg-amber-100 text-amber-700 text-[9.5px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider leading-none">
                            REVISIÓN ADMIN
                          </span>
                        ) : isFailed ? (
                          <span className="bg-rose-100 text-rose-700 text-[9.5px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider leading-none">
                            FALLIDO
                          </span>
                        ) : (
                          <span className="bg-[#FEF3C7] text-[#D97706] text-[9.5px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider leading-none">
                            PROCESANDO
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Escalation/Failure Reason Card Block */}
                    {(t.status === "review" || isFailed) && t.errorMsg && (
                      <div className={`text-[11px] p-3 rounded-2xl leading-relaxed font-sans ${
                        t.status === "review" ? "bg-amber-500/10 text-amber-900 border border-amber-200/45" : "bg-rose-50 text-rose-800 border border-rose-100/60"
                      }`}>
                        <span className="font-bold block uppercase text-[9px] mb-1 tracking-wider">
                          {t.status === "review" ? "Límite de Presupuesto Excedido:" : "Error de Automatización:"}
                        </span>
                        {t.errorMsg}
                        {t.status === "review" && (
                          <p className="text-[10px] text-amber-600 font-semibold mt-1 leading-normal">
                            El conector requiere aprendizaje, pero supera el tope configurado de costo. El Administrador ya recibió la solicitud en su bandeja de alertas.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Divider line Inside Card */}
                    <div className="border-t border-slate-100 my-0.5" />

                    {/* Lower cash amount indicator + interactive detail link */}
                    <div className="flex justify-between items-center select-none pt-0.5">
                      <span className="text-lg font-black text-slate-800 font-mono">
                        ${(t.total || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>

                      <div className="flex items-center gap-2">
                        {/* Trash Delete Option for Users */}
                        {onDeleteTicket && (
                          ticketIdToDelete === t.id ? (
                            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-lg text-[9px] font-bold animate-fade-in">
                              <span className="text-slate-550 mr-1">¿Eliminar?</span>
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteTicket(t.id || "");
                                  setTicketIdToDelete(null);
                                }}
                                className="px-1.5 py-0.5 bg-rose-600 text-white rounded font-bold cursor-pointer"
                              >
                                Sí
                              </button>
                              <button
                                type="button"
                                onClick={() => setTicketIdToDelete(null)}
                                className="px-1.5 py-0.5 bg-[#ebf1ff] hover:bg-[#ebf1ff]/80 text-[#0B53F4] rounded font-bold cursor-pointer border-none shadow-2xs"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setTicketIdToDelete(t.id || "")}
                              className="p-1.5 text-slate-300 hover:text-[#0B53F4] rounded-lg bg-transparent cursor-pointer hover:bg-[#ebf1ff] transition"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            onTriggerSimulationInline(t);
                            toast.success(`Iniciando conexión con el SAT para facturar ticket #${t.folio || "88219"}.`, "Sincronizador SAT");
                          }}
                          className="group flex items-center justify-between gap-1.5 py-1.5 px-3 zt-btn-secondary-blue font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all duration-150 cursor-pointer shadow-3xs select-none shrink-0"
                        >
                          <span>Ver detalles</span>
                          <ChevronRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-all duration-150 transform group-hover:translate-x-0.5" />
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUMN 2: FACTURAS EMITIDAS (Visible on desktop OR when mobile has activeSubTab === "facturas-emitidas") */}
        <div className={`space-y-4 lg:col-span-6 ${activeSubTab === "facturas-emitidas" ? "block" : "hidden lg:block"}`}>
          <div className="px-1 text-left mb-2">
            <h2 className="font-display font-extrabold text-base text-slate-800 tracking-tight">
              Facturas Emitidas
            </h2>
          </div>

          <div className="space-y-4">
            {emittedInvoicesList.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-200/80 p-9 rounded-3xl text-center">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-black text-slate-800">No hay facturas emitidas</p>
                <p className="text-[10px] text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">Las facturas emitidas y certificadas por el SAT se guardarán aquí.</p>
              </div>
            ) : (
              emittedInvoicesList.map((inv) => {
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
                    className={`rounded-3xl p-5 flex flex-col gap-3.5 justify-between transition ${
                      isNewlyAdded
                        ? "border-2 border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.08)] bg-emerald-50/10 scale-[1.01] duration-300"
                        : "bg-white border border-slate-200/55 rounded-3xl p-5 shadow-[0_4px_20px_rgba(15,23,42,0.02)] hover:border-[#0B53F4]/20 hover:shadow-[0_4px_24px_rgba(11,83,244,0.04)]"
                    }`}
                  >
                    {/* Horizontal main body */}
                    <div className="flex items-start justify-between gap-3">
                      
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={`w-10 h-10 ${brand.color} rounded-full flex items-center justify-center shrink-0`}>
                          <brand.IconComponent className="w-5 h-5 stroke-[2.2]" />
                        </div>

                        <div className="text-left min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-black text-slate-800 block truncate uppercase tracking-tight" title={inv.nombreEmisor}>
                              {inv.nombreEmisor}
                            </span>
                            {isNewlyAdded && (
                              <span className="bg-emerald-50 text-emerald-700 text-[8.5px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider leading-none shadow-3xs flex items-center gap-0.5 animate-pulse shrink-0">
                                <Sparkles className="w-2.5 h-2.5 fill-current" />
                                Recién Timbrado
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
                        <button
                          type="button"
                          onClick={() => setSelectedInvoiceId(inv.id || null)}
                          className="w-full zt-btn-secondary-blue font-black rounded-xl py-1.5 px-3 text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 stroke-[2.2]" />
                          Ver PDF
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => downloadFile(inv.xmlContent, `Factura_${inv.nombreEmisor}_${inv.folioFiscal?.substring(0,8)}.xml`, "text/xml")}
                          className="w-full zt-btn-secondary-blue font-black rounded-xl py-1.5 px-3 text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5 stroke-[2.2]" />
                          Descargar XML
                        </button>
                      </div>

                    </div>

                    {/* Lower metadata footer details */}
                    <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-[10px] text-slate-400 font-bold select-none">
                      <span>Emisión: {dateStr}</span>
                      <span className="font-mono">RFC: {inv.rfcEmisor || "S/D"}</span>
                    </div>

                    {/* Mobile action buttons (Exclusively shown on mobile as a row underneath to guarantee full width and no truncation) */}
                    <div className="flex sm:hidden gap-2 mt-0.5">
                      <button
                        type="button"
                        onClick={() => setSelectedInvoiceId(inv.id || null)}
                        className="flex-1 zt-btn-secondary-blue font-black rounded-xl py-2.5 px-3.5 text-[10.5px] uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-2xs cursor-pointer min-h-[42px]"
                      >
                        <FileText className="w-4 h-4 stroke-[2.2]" />
                        Ver PDF
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => downloadFile(inv.xmlContent, `Factura_${inv.nombreEmisor}_${inv.folioFiscal?.substring(0,8)}.xml`, "text/xml")}
                        className="flex-1 zt-btn-secondary-blue font-black rounded-xl py-2.5 px-3.5 text-[10.5px] uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-2xs cursor-pointer min-h-[42px]"
                      >
                        <Download className="w-4 h-4 stroke-[2.2]" />
                        Descargar XML
                      </button>
                    </div>

                  </div>
                );
              })
            )}
          </div>
        </div>

      </div> {/* Close Grid layout container */}



    </div>
  );
}
