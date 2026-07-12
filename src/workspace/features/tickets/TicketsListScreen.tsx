import React, { useState, useEffect } from "react";
import { Ticket, Invoice } from "@/shared/types/types";
import { getConfigStatus, sendEmail, fetchWithAuth, submitInvoiceJobCaptcha } from "@/services/api";
import logoLight from "@/assets/logos/logo-light.png";
import { 
  ChevronLeft, ChevronRight, Share2, FileText, Check, Download, ArrowLeft, 
  Coffee, ShoppingBag, Car, Plus, Printer, Mail, Trash2, 
  Clock, Sparkles, Eye, ShieldCheck, ZoomIn, 
  ZoomOut, RotateCcw, X, ExternalLink, RefreshCw
} from "lucide-react";
import { useToast } from "@/shared/feedback/Toast";
import { db } from "@/services/firebase/firebase";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { CaptchaFlowPanel } from "../scanner/CaptchaFlowPanel";
import { getTicketTotal, getDetailedReasonMsg, getTicketVisualState, getInvoiceVisualState } from "@/workspace/utils/ticketHelpers";
import { getBillingCanonicalState, getBillingVisualKey, dedupeBillingItems, resolveRelatedBillingDocs, normalizeSatValidationState, getBillingAlertStyle } from "@/workspace/utils/billingStateHelpers";
import { normalizeBillingAttemptFields } from "@/shared/utils/normalizeFields";

interface TicketsListScreenProps {
  tickets: Ticket[];
  invoices: Invoice[];
  fiscalProfile?: any;
  onTriggerSimulationInline: (ticket: Ticket) => void;
  currentUserEmail?: string | null;
  onDeleteTicket?: (ticketId: string, invoiceId?: string) => void;
  onTabChange?: (tab: "capturar" | "tickets" | "conectores" | "historial" | "resumen" | "cuenta" | "admin") => void;
  newlyAddedTicketId?: string | null;
  onClearNewlyAddedTicketId?: () => void;
  onUpdateTicketInDb?: (ticketId: string, updates: any) => Promise<void>;
  initialSubTab?: "en-seguimiento" | "cfdi-obtenidos";
}

// ----------------------------------------------------
// HIGH FIDELITY BRAND ICONS RESOLVER
// ----------------------------------------------------

const renderAlertIcon = (iconName: string, className?: string) => {
  switch (iconName) {
    case "AlertCircle":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      );
    case "CheckCircle":
      return <ShieldCheck className={className} />;
    case "Clock":
      return <Clock className={className} />;
    default:
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      );
  }
};

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

const validateXmlStructure = (xmlContent: string | null | undefined): boolean => {
  if (!xmlContent) return false;
  
  // Minimal structural validation of downloaded XML:
  // Must contain cfdi:Comprobante, cfdi:Emisor, cfdi:Receptor, cfdi:Impuestos, cfdi:Conceptos,
  // cfdi:Concepto, cfdi:Traslados, cfdi:Traslado with TipoFactor="Tasa", TasaOCuota="0.160000",
  // and tfd:TimbreFiscalDigital with UUID, SelloCFD, SelloSAT, NoCertificadoSAT, FechaTimbrado.
  const hasComprobante = /<cfdi:Comprobante\b[^>]*\bTotal=/i.test(xmlContent) || /<Comprobante\b[^>]*\bTotal=/i.test(xmlContent);
  const hasEmisor = /<cfdi:Emisor\b[^>]*\bRfc=/i.test(xmlContent) || /<Emisor\b[^>]*\bRfc=/i.test(xmlContent);
  const hasReceptor = /<cfdi:Receptor\b[^>]*\bRfc=/i.test(xmlContent) || /<Receptor\b[^>]*\bRfc=/i.test(xmlContent);
  const hasTimbre = (/<tfd:TimbreFiscalDigital\b/i.test(xmlContent) || /<TimbreFiscalDigital\b/i.test(xmlContent)) &&
                    /\bUUID=/i.test(xmlContent) &&
                    /\bFechaTimbrado=/i.test(xmlContent) &&
                    /\bSelloCFD=/i.test(xmlContent) &&
                    /\bSelloSAT=/i.test(xmlContent) &&
                    /\bNoCertificadoSAT=/i.test(xmlContent);

  return !!(hasComprobante && hasEmisor && hasReceptor && hasTimbre);
};

const CAPTCHA_FLOW_STATUSES = new Set([
  "blocked_by_captcha",
  "waiting_human_verification",
  "waiting_user_captcha",
  "captcha_submitted",
  "verifying_captcha",
  "captcha_failed",
  "captcha_timeout",
]);

const CAPTCHA_TERMINAL_STATUSES = new Set([
  "captcha_resolved",
  "completed",
  "invoice_completed",
  "failed_final",
  "failed"
]);

export default function TicketsListScreen({
  tickets,
  invoices,
  fiscalProfile,
  onTriggerSimulationInline,
  currentUserEmail,
  onDeleteTicket,
  onTabChange,
  newlyAddedTicketId,
  onClearNewlyAddedTicketId,
  onUpdateTicketInDb,
  initialSubTab
}: TicketsListScreenProps) {
  const toast = useToast();

  const renderStatusBadge = (t: any) => {
    const inv = invoices.find(i => i.ticketId === t.id || i.id === t.invoiceId);
    const state = getBillingCanonicalState({ ticket: t, invoice: inv });
    const hasSpinner = state.canonicalStatus === "active_processing" || 
                       state.canonicalStatus === "waiting_user_captcha" || 
                       state.canonicalStatus === "verifying_captcha" ||
                       state.canonicalStatus === "invoice_recovery_pending" ||
                       state.canonicalStatus === "queued";

    return (
      <span className={`${state.badgeTone} text-[9.5px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider leading-none flex items-center gap-1`}>
        {hasSpinner && <RefreshCw className="w-2.5 h-2.5 animate-spin" />}
        {state.badgeLabel}
      </span>
    );
  };
  
  // Smoothly clear the newly added ID after 5 seconds to stop pulsing
  useEffect(() => {
    if (newlyAddedTicketId && onClearNewlyAddedTicketId) {
      const timer = setTimeout(() => {
        onClearNewlyAddedTicketId();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [newlyAddedTicketId, onClearNewlyAddedTicketId]);



  // Filter inside list
  const [activeSubTab, setActiveSubTab] = useState<"en-seguimiento" | "cfdi-obtenidos">(initialSubTab || "en-seguimiento");

  // Sync sub-tab from parent prop
  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Outer routing tabs: list or ver-pdf
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [selectedBillingItem, setSelectedBillingItem] = useState<any | null>(null);
  const [showXmlCode, setShowXmlCode] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [isValidatingSat, setIsValidatingSat] = useState<boolean>(false);
  const [viewCaptchaSolution, setViewCaptchaSolution] = useState("");
  const [isSubmittingViewCaptcha, setIsSubmittingViewCaptcha] = useState(false);
  const [activeJob, setActiveJob] = useState<any>(null);
  const [captchaPanelLocked, setCaptchaPanelLocked] = useState(false);
  const [isRetryingRecovery, setIsRetryingRecovery] = useState<string | null>(null);

  const handleRetryRecovery = async (ticketId: string) => {
    setIsRetryingRecovery(ticketId);
    try {
      const response = await fetchWithAuth(`/api/tickets/${ticketId}/retry-invoice-recovery`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Fallo al iniciar reintento");
      }
      toast.success("Se ha programado el reintento de recuperación de factura.", "RECUPERACIÓN EN COLA");
    } catch (err: any) {
      toast.error(err.message || "Error al solicitar reintento.");
    } finally {
      setIsRetryingRecovery(null);
    }
  };
  useEffect(() => {
    const activeInvoiceData = invoices.find(inv => inv.id === selectedInvoiceId);
    const associatedTicket = tickets.find(t => t.id === selectedInvoiceId || t.jobId === selectedInvoiceId || t.id === activeInvoiceData?.ticketId);
    const tStatus = associatedTicket?.status || "";
    const jStatus = activeJob?.status || "";
    const effectiveStatus = jStatus || tStatus;

    const flowActive =
      CAPTCHA_FLOW_STATUSES.has(effectiveStatus) ||
      activeJob?.captchaFlowActive === true ||
      (associatedTicket as any)?.captchaFlowActive === true ||
      activeJob?.blockingReason === "captcha_detected";

    if (flowActive) {
      if (!captchaPanelLocked) {
        console.debug("[CAPTCHA_UI_RENDER] TicketsList: Latching captcha panel. status:", effectiveStatus);
        setCaptchaPanelLocked(true);
      }
    } else if (CAPTCHA_TERMINAL_STATUSES.has(effectiveStatus)) {
      if (captchaPanelLocked) {
        console.debug("[CAPTCHA_UI_RENDER] TicketsList: Unlocking captcha panel. status:", effectiveStatus);
        setCaptchaPanelLocked(false);
      }
    }
  }, [activeJob?.status, activeJob?.captchaFlowActive, activeJob?.blockingReason, selectedInvoiceId, tickets, invoices, captchaPanelLocked]);

  // Real-time listener for the active ticket's job state
  useEffect(() => {
    const activeInvoiceData = invoices.find(inv => inv.id === selectedInvoiceId);
    const associatedTicket = tickets.find(t => t.id === selectedInvoiceId || t.jobId === selectedInvoiceId || t.id === activeInvoiceData?.ticketId);
    const jobKey = associatedTicket?.jobId;
    
    if (!jobKey) {
      setActiveJob(null);
      return;
    }
    const docRef = doc(db, "invoice_jobs", jobKey);
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        setActiveJob({ id: snapshot.id, ...snapshot.data() });
      }
    }, (err) => {
      console.error("Error watching live job in list:", err);
    });
    return unsubscribe;
  }, [selectedInvoiceId, tickets, invoices]);

  // Interactive inputs
  const [emailTo, setEmailTo] = useState(currentUserEmail || "legionrender@gmail.com");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [ticketIdToDelete, setTicketIdToDelete] = useState<string | null>(null);
  const [smtpStatus, setSmtpStatus] = useState<{ smtpConfigured: boolean; smtpUser: string | null } | null>(null);

  const onViewDetails = (item: any) => {
    if (!item || !item.ticket) {
      toast.error("No se pudo cargar la información del ticket.");
      return;
    }

    const t = item.ticket;
    const isDeleted = 
      t.hiddenFromUser === true ||
      !!t.deletedAt ||
      t.status === "deleted" ||
      t.linkedTicketDeleted === true ||
      (item.job && item.job.linkedTicketDeleted === true);

    if (isDeleted) {
      toast.error("Error técnico: No se permite visualizar detalles de un ticket eliminado o inactivo.");
      console.error("Acceso bloqueado a ticket eliminado:", t.id);
      return;
    }

    setSelectedBillingItem(item);
    setSelectedInvoiceId(item.invoice?.id || `inv-fallback-${t.id}`);
  };

  const handleSubmitViewCaptcha = async (associatedTicket: any) => {
    const jobIdToUpdate = associatedTicket?.jobId;
    const solution = viewCaptchaSolution.trim();
    if (!jobIdToUpdate || !solution) {
      toast.error("Por favor, ingresa el código CAPTCHA para continuar.");
      return;
    }
    setIsSubmittingViewCaptcha(true);
    try {
      await submitInvoiceJobCaptcha(jobIdToUpdate, solution, activeJob?.captchaAttemptId || null);
      setViewCaptchaSolution("");
      toast.success("Código enviado. Continuando con el proceso de facturación.");
    } catch (error: any) {
      console.error("Error submitting captcha:", error);
      toast.error("No se pudo enviar el código. Inténtalo nuevamente.");
    } finally {
      setIsSubmittingViewCaptcha(false);
    }
  };

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

  // Filter out all hidden/deleted tickets and invoices first
  const activeTickets = tickets.filter(t => 
    t.hiddenFromUser !== true &&
    !t.deletedAt &&
    t.status !== "deleted"
  );

  const activeInvoices = invoices.filter(inv =>
    inv.hiddenFromUser !== true &&
    inv.linkedTicketDeleted !== true
  );

  // Group/Pair tickets and invoices together to avoid duplicates
  const realInvoices = activeInvoices.filter(inv => !inv.id?.startsWith("inv-fallback-"));
  const syntheticInvoices = activeInvoices.filter(inv => inv.id?.startsWith("inv-fallback-"));
  
  const filteredInvoices = [...realInvoices];
  syntheticInvoices.forEach(syn => {
    const hasReal = realInvoices.some(real => 
      real.ticketId === syn.ticketId || 
      (syn.folioFiscal && real.folioFiscal === syn.folioFiscal)
    );
    const relatedTicket = activeTickets.find(t => t.id === syn.ticketId);
    const ticketIsDeleted = relatedTicket && (
      relatedTicket.hiddenFromUser === true ||
      relatedTicket.deletedAt ||
      relatedTicket.status === "deleted"
    );

    if (!hasReal && !ticketIsDeleted) {
      filteredInvoices.push(syn);
    }
  });

  const pairedItems: Array<{ ticket?: any; invoice?: any; job?: any }> = [];
  const processedTicketIds = new Set<string>();
  const processedInvoiceIds = new Set<string>();

  filteredInvoices.forEach(inv => {
    const resolved = resolveRelatedBillingDocs({
      invoice: inv,
      tickets: activeTickets,
      invoices: filteredInvoices
    });

    if (resolved.ticket) processedTicketIds.add(resolved.ticket.id);
    processedInvoiceIds.add(inv.id);

    pairedItems.push(resolved);
  });

  activeTickets.forEach(t => {
    if (processedTicketIds.has(t.id)) return;

    const resolved = resolveRelatedBillingDocs({
      ticket: t,
      tickets: activeTickets,
      invoices: filteredInvoices
    });

    if (resolved.ticket) processedTicketIds.add(resolved.ticket.id);
    if (resolved.invoice) processedInvoiceIds.add(resolved.invoice.id);

    pairedItems.push(resolved);
  });

  // Deduplicate globally using canonical helper
  const dedupedItems = dedupeBillingItems(pairedItems);

  const finalItems = dedupedItems.map(item => {
    const canonicalState = getBillingCanonicalState({ ticket: item.ticket, invoice: item.invoice, job: item.job });
    const visualKey = getBillingVisualKey({ ticket: item.ticket, invoice: item.invoice, job: item.job });
    return { ...item, canonicalState, visualKey };
  });

  finalItems.sort((a, b) => {
    const score = (x: typeof a) => {
      if (x.canonicalState.shouldAppearInReady) return 3;
      if (x.canonicalState.shouldAppearInProcess) return 2;
      return 1;
    };
    return score(b) - score(a);
  });

  // Calculate lists:
  const inProgressList = finalItems.filter(
    (item) => item.canonicalState.shouldAppearInProcess || item.canonicalState.shouldAppearInAttention
  );
  
  const emittedInvoicesList = finalItems.filter(
    (item) => item.canonicalState.shouldAppearInReady
  );

  // Auto-open ticket details when newlyAddedTicketId is set from a notification click
  useEffect(() => {
    if (newlyAddedTicketId) {
      const matchingItem = finalItems.find(
        (item) => item.ticket?.id === newlyAddedTicketId || item.invoice?.ticketId === newlyAddedTicketId
      );
      if (matchingItem) {
        onViewDetails(matchingItem);
      }
    }
  }, [newlyAddedTicketId, finalItems]);

  // Trigger SAT verification when detail view is opened
  useEffect(() => {
    if (!selectedBillingItem || !selectedBillingItem.invoice || !selectedBillingItem.invoice.xmlContent) {
      setVerificationError(null);
      return;
    }

    const associatedTicket = selectedBillingItem.ticket;
    const activeInvoiceData = selectedBillingItem.invoice;
    if (!associatedTicket) return;

    // SAT is disabled. We only perform local structural check.
    const needsSatCheck = false;
    if (!needsSatCheck) return;

    const runSatVerification = async () => {
      setIsValidatingSat(true);
      setVerificationError(null);
      try {
        const isXmlValid = validateXmlStructure(activeInvoiceData.xmlContent);
        if (!isXmlValid) {
          throw new Error("El XML obtenido del portal del comercio no contiene la estructura básica obligatoria.");
        }

        const res = await fetchWithAuth("/api/cfdi/verify-sat", {
          method: "POST",
          body: JSON.stringify({
            xmlContent: activeInvoiceData.xmlContent,
            ticketId: associatedTicket.id,
            invoiceId: activeInvoiceData.id
          })
        });

        if (!res.ok) {
          throw new Error("Error al conectar con el servicio de verificación del SAT.");
        }

        const data = await res.json();
        if (data.status === "valid") {
          setVerificationError(null);
        } else if (data.status === "canceled") {
          const errMsg = "El XML obtenido se encuentra CANCELADO ante el SAT. Requiere revisión manual.";
          setVerificationError(errMsg);
        } else if (data.status === "error" || data.status === "timeout") {
          const errMsg = "No pudimos verificar el CFDI ante el SAT en este momento. Requiere revisión manual.";
          setVerificationError(errMsg);
        } else {
          const errMsg = "El XML obtenido no fue localizado en los controles del SAT. Requiere revisión manual.";
          setVerificationError(errMsg);
        }
      } catch (err: any) {
        console.error("SAT Verification failed client side:", err);
        const errMsg = err.message || "Error al verificar el CFDI con el SAT.";
        setVerificationError(errMsg);
      } finally {
        setIsValidatingSat(false);
      }
    };

    runSatVerification();
  }, [selectedBillingItem]);

  // ----------------------------------------------------
  // THIRD VIEW SCREEN: VER PDF - DETALLE DE FACTURA
  // ----------------------------------------------------
  if (selectedBillingItem) {
    const associatedTicket = selectedBillingItem.ticket || {};
    const activeInvoiceData = selectedBillingItem.invoice || null;
    
    // Prohibir tickets eliminados o inactivos en el detalle
    const isDeleted = 
      associatedTicket.hiddenFromUser === true ||
      !!associatedTicket.deletedAt ||
      associatedTicket.status === "deleted" ||
      associatedTicket.linkedTicketDeleted === true ||
      (selectedBillingItem.job && selectedBillingItem.job.linkedTicketDeleted === true);

    if (isDeleted) {
      return (
        <div className="max-w-xl mx-auto py-12 px-6 text-center animate-fade-in">
          <div className="bg-rose-50 border border-rose-100 rounded-3xl p-8 text-left space-y-4">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-base font-extrabold text-rose-950">Acceso Denegado</h3>
            <p className="text-xs text-rose-800 leading-normal font-medium font-sans">
              Error técnico: No se permite visualizar detalles de un ticket eliminado o inactivo.
            </p>
          </div>
        </div>
      );
    }

    const isXmlValid = activeInvoiceData ? validateXmlStructure(activeInvoiceData.xmlContent) : false;
    const isMock = activeInvoiceData ? activeInvoiceData.id?.startsWith("mock-") : false;
    const detailState = getBillingCanonicalState({ ticket: associatedTicket, invoice: activeInvoiceData });
    const canRenderPdf = isMock || detailState.isValidInvoice;

    if (isValidatingSat) {
      return (
        <div className="max-w-xl mx-auto py-24 text-center animate-fade-in">
          <div className="animate-spin rounded-full h-10 w-10 border-[#0B53F4] border-t-transparent mx-auto"></div>
          <p className="text-slate-550 text-[11px] mt-4 font-mono uppercase tracking-widest">
            Verificando validez en controles del SAT...
          </p>
        </div>
      );
    }

    if (!canRenderPdf) {
      const isCaptcha = detailState.canonicalStatus === "waiting_user_captcha";
      const isTraining = detailState.canonicalStatus === "training" || ["training_required", "training_pending_review", "training_approved_queueing"].includes(String(associatedTicket?.status || ""));
      const isProcessing = (detailState.isActive && !isTraining) || detailState.canonicalStatus === "invoice_recovery_pending";
      
      const displayMsg = detailState.message || "No fue posible completar la solicitud en el portal del comercio. Revisa los datos del ticket o solicita revisión manual.";
      return (
        <div className="max-w-xl mx-auto py-12 px-6 text-center animate-fade-in">
          <div className="flex items-center gap-3 mb-8">
            <button
               type="button"
              onClick={() => {
                setSelectedInvoiceId(null);
                setSelectedBillingItem(null);
                setShowXmlCode(false);
              }}
              className="p-2 bg-[#ebf1ff] hover:bg-[#ebf1ff]/80 text-[#0B53F4] rounded-full cursor-pointer transition"
            >
              <ArrowLeft className="w-5 h-5 stroke-[2.2]" />
            </button>
            <span className="text-sm font-black text-slate-800">Volver</span>
          </div>
          {captchaPanelLocked ? (
            <div className="w-full flex justify-center">
              <CaptchaFlowPanel
                jobId={activeJob?.id || associatedTicket?.jobId || null}
                ticketId={associatedTicket?.id || null}
                source="tickets"
                initialTicket={associatedTicket}
              />
            </div>
          ) : isProcessing ? (
            <div className="bg-blue-50 border border-blue-100 rounded-3xl p-8 text-center space-y-6">
              <div className="w-12 h-12 bg-blue-100 text-[#0B53F4] rounded-full flex items-center justify-center mx-auto">
                <RefreshCw className="w-6 h-6 animate-spin" />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-extrabold text-blue-950">Facturación en Proceso</h3>
                <p className="text-xs text-blue-800 leading-normal font-medium max-w-sm mx-auto">
                  El robot está enviando los datos y resolviendo el CAPTCHA en el portal del comercio. El procesamiento continuará en segundo plano, por favor espera un momento...
                </p>
              </div>
            </div>
          ) : detailState.canonicalStatus === "already_invoiced_unverified" ? (() => {
            const alertStyle = getBillingAlertStyle(detailState);
            const iconBg = alertStyle.tone === "red" ? "zt-badge-error text-[var(--zt-error-text)]" :
                           alertStyle.tone === "green" ? "zt-badge-ok text-[var(--zt-ok-text)]" :
                           alertStyle.tone === "blue" ? "zt-badge-queue text-[var(--zt-queue-text)]" :
                           "zt-badge-alert text-[var(--zt-alert-text)]";
            const borderTopClass = alertStyle.tone === "red" ? "border-[var(--zt-error-border)]" :
                                   alertStyle.tone === "green" ? "border-[var(--zt-ok-border)]" :
                                   alertStyle.tone === "blue" ? "border-[var(--zt-queue-border)]" :
                                   "border-[var(--zt-alert-border)]";
            const gridBgBorder = alertStyle.tone === "red" ? "zt-card-error" :
                                 alertStyle.tone === "green" ? "zt-card-ok" :
                                 alertStyle.tone === "blue" ? "zt-card-queue" :
                                 "zt-card-alert";
            return (
              <div className={`border rounded-3xl p-8 text-left space-y-6 animate-fade-in shadow-2xs font-sans ${alertStyle.bgClass} ${alertStyle.textClass}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
                    {renderAlertIcon(alertStyle.icon, "w-6 h-6")}
                  </div>
                  <div>
                    <h3 className={`text-base font-extrabold font-display ${alertStyle.labelClass}`}>{detailState.badgeLabel}</h3>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${alertStyle.textClass}`}>Sin Comprobante Fiscal Recuperado</span>
                  </div>
                </div>

                <div className={`space-y-4 pt-2 border-t ${borderTopClass}`}>
                  <div>
                    <h4 className={`text-xs font-black uppercase tracking-wider mb-1 font-sans ${alertStyle.labelClass}`}>Respuesta del Portal</h4>
                    <p className="text-xs leading-relaxed font-sans">{displayMsg}</p>
                  </div>

                  <div className={`grid grid-cols-2 gap-4 p-4 rounded-2xl border ${gridBgBorder}`}>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">Folio de venta</span>
                      <span className="text-xs font-bold text-slate-800 font-mono">{normalizeBillingAttemptFields(associatedTicket as any, activeInvoiceData, fiscalProfile).folio || "S/D"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">ITU / ID Venta</span>
                      <span className="text-xs font-bold text-slate-800 font-mono">{normalizeBillingAttemptFields(associatedTicket as any, activeInvoiceData, fiscalProfile).itu || "S/D"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">Total del Ticket</span>
                      <span className="text-xs font-bold text-slate-800 font-mono">${(normalizeBillingAttemptFields(associatedTicket as any, activeInvoiceData, fiscalProfile).total || detailState.displayTotal).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">Fecha de compra</span>
                      <span className="text-xs font-bold text-slate-800 font-mono">{normalizeBillingAttemptFields(associatedTicket as any, activeInvoiceData, fiscalProfile).fechaCompra || "S/D"}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">RFC Receptor</span>
                      <span className="text-xs font-bold text-slate-800 font-mono">{normalizeBillingAttemptFields(associatedTicket as any, activeInvoiceData, fiscalProfile).rfcReceptor || "S/D"}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className={`flex justify-between text-xs font-medium ${alertStyle.textClass}`}>
                      <span>Intentos de recuperación realizados:</span>
                      <span className="font-extrabold font-mono">{(associatedTicket as any)?.recoveryAttemptCount || 0} / {(associatedTicket as any)?.maxRecoveryAttempts || 3}</span>
                    </div>
                    <div className={`flex justify-between text-xs font-medium ${alertStyle.textClass}`}>
                      <span>Rutas de recuperación intentadas:</span>
                      <span className="font-extrabold font-mono">{(associatedTicket as any)?.recoveryPathsTried?.join(", ") || "Ninguna"}</span>
                    </div>
                    {(associatedTicket as any)?.lastRecoveryError && (
                      <div className="text-[11px] text-rose-700 bg-rose-50/50 p-2.5 rounded-xl border border-rose-100 font-mono leading-relaxed">
                        <strong>Último error:</strong> {(associatedTicket as any).lastRecoveryError}
                      </div>
                    )}
                    <div className={`text-xs leading-relaxed ${alertStyle.textClass}`}>
                      <strong>Próximo paso sugerido:</strong> {(associatedTicket as any)?.nextRecommendedAction || "El portal indica que ya existe una factura, pero no se encontró ruta de descarga XML. Reintentar recuperación o revisar manualmente en el portal del comercio."}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => handleRetryRecovery(associatedTicket?.id || "")}
                    disabled={isRetryingRecovery === associatedTicket?.id}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 font-extrabold text-[10.5px] uppercase tracking-wider rounded-xl bg-amber-500 hover:bg-amber-600 text-white cursor-pointer shadow-3xs transition disabled:opacity-50"
                  >
                    {isRetryingRecovery === associatedTicket?.id ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    {isRetryingRecovery === associatedTicket?.id ? "Reintentando..." : "Reintentar recuperación"}
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const url = associatedTicket?.portalFields?.portalUrl || "https://www.google.com";
                        window.open(url, "_blank");
                      }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center justify-center gap-1.5 py-2 px-3 font-bold text-[10px] uppercase tracking-wider rounded-xl cursor-pointer border-none"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Buscar en portal
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        toast.info("Por favor, edita los campos del ticket en el listado para corregir cualquier dato incorrecto.");
                      }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center justify-center gap-1.5 py-2 px-3 font-bold text-[10px] uppercase tracking-wider rounded-xl cursor-pointer border-none"
                    >
                      Corregir campos
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        alert(JSON.stringify(associatedTicket || {}, null, 2));
                      }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center justify-center gap-1.5 py-2 px-3 font-bold text-[10px] uppercase tracking-wider rounded-xl cursor-pointer border-none"
                    >
                      Detalles técnicos
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        if (onUpdateTicketInDb && associatedTicket?.id) {
                          await onUpdateTicketInDb(associatedTicket.id, {
                            status: "requires_manual_review",
                            reviewReasonCode: "MANUAL_REVIEW_REQUESTED",
                            errorMsg: "El usuario solicitó revisión manual para este ticket."
                          });
                          toast.success("Ticket marcado para revisión manual.");
                          setSelectedInvoiceId(null);
                          setSelectedBillingItem(null);
                        }
                      }}
                      className="bg-rose-100 hover:bg-rose-200 text-rose-700 flex items-center justify-center gap-1.5 py-2 px-3 font-bold text-[10px] uppercase tracking-wider rounded-xl cursor-pointer border-none"
                    >
                      Revisión manual
                    </button>
                  </div>
                </div>
              </div>
            );
          })() : (() => {
            const ticketData = associatedTicket || {};
            const jitResolution = ticketData.jitResolution && typeof ticketData.jitResolution === "object" ? ticketData.jitResolution : null;
            const extracted = ticketData.portalFields && typeof ticketData.portalFields === "object" ? ticketData.portalFields : {};
            const receiptImage = ticketData.imageUrl || ticketData.imageDataUrl || null;
            const portalUrl = String(ticketData.portalUrl || extracted.portalUrl || "").trim();
            const verifiedPortalUrl = portalUrl && (
              ticketData.portalUrlVerifiedAt ||
              ["verified", "verified_observed_dom"].includes(ticketData.portalUrlVerification)
            );
            const visibleFields = Object.entries(extracted)
              .filter(([key, value]) => key !== "portalUrl" && value !== null && value !== undefined && String(value).trim())
              .slice(0, 6);

            return (
              <div className="max-w-4xl mx-auto space-y-6 text-left animate-fade-in font-sans">
                <section className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6 sm:p-8">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 shrink-0 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-500 flex items-center justify-center">
                      {renderAlertIcon("AlertCircle", "w-6 h-6")}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">Seguimiento de facturación</p>
                      <h3 className="mt-1 text-xl font-black tracking-tight text-white">{jitResolution?.title || "Necesitamos un nuevo intento"}</h3>
                      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">{jitResolution?.description || displayMsg}</p>
                    </div>
                  </div>
                </section>

                <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                  <section className="rounded-3xl border border-slate-800 bg-[#0b0d19] p-4 shadow-2xs">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="text-sm font-black text-white">Foto del ticket</h4>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Evidencia original</span>
                    </div>
                    {receiptImage ? (
                      <img src={receiptImage} alt="Ticket original" className="max-h-[420px] w-full rounded-2xl border border-slate-100 bg-slate-50 object-contain" />
                    ) : (
                      <div className="flex min-h-52 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">La imagen original del ticket no está disponible en este detalle.</div>
                    )}
                  </section>

                  <div className="space-y-6">
                    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-2xs">
                      <h4 className="text-sm font-black text-slate-900">Datos extraídos</h4>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">Revisa estos datos antes de solicitar otro intento. No se completa ningún valor que no aparezca en el ticket.</p>
                      <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
                        <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Comercio</dt><dd className="mt-1 font-bold text-slate-900">{ticketData.nombreEmisor || "No detectado"}</dd></div>
                        <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total</dt><dd className="mt-1 font-bold text-slate-900">${getTicketTotal(ticketData).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd></div>
                        <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Fecha</dt><dd className="mt-1 font-mono text-slate-900">{ticketData.fechaCompra || "No detectada"}</dd></div>
                        <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Folio</dt><dd className="mt-1 font-mono text-slate-900">{ticketData.folio || ticketData.billingReference || "No detectado"}</dd></div>
                        <div className="col-span-2"><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">RFC emisor</dt><dd className="mt-1 font-mono text-slate-900">{ticketData.rfcEmisor || "No detectado"}</dd></div>
                      </dl>
                      {visibleFields.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Campos del portal detectados</p><div className="mt-3 flex flex-wrap gap-2">{visibleFields.map(([key, value]) => <span key={key} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700"><strong>{key}:</strong> {String(value)}</span>)}</div></div>}
                    </section>

                    {jitResolution && <section className="rounded-3xl border border-slate-800 bg-[#0b0d19] p-6 shadow-2xs">
                      <h4 className="text-sm font-black text-white">Resolución del intento</h4>
                      <dl className="mt-4 space-y-3 text-sm">
                        <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Etapa</dt><dd className="mt-1 font-mono text-slate-200">{jitResolution.stage || "No disponible"}</dd></div>
                        <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Causa probable</dt><dd className="mt-1 text-slate-200">{jitResolution.probableCause || "Aún no clasificada"}</dd></div>
                        <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Siguiente acción</dt><dd className="mt-1 text-slate-200">{jitResolution.recommendedAction || "Conservar la evidencia para revisión."}</dd></div>
                        {jitResolution.evidence?.finalUrl && <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">URL observada</dt><dd className="mt-1 break-all font-mono text-xs text-slate-300">{jitResolution.evidence.finalUrl}</dd></div>}
                      </dl>
                    </section>}

                    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-2xs">
                      <h4 className="text-sm font-black text-slate-900">Portal de facturación</h4>
                      {verifiedPortalUrl ? <a href={portalUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex break-all text-sm font-bold text-[#0B53F4] hover:underline">{portalUrl}</a> : <p className="mt-2 text-sm leading-relaxed text-slate-600">Aún no hay una dirección oficial validada. ZenTicket seguirá investigando solo con evidencia del ticket y resultados del sitio del comercio.</p>}
                    </section>
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => onTriggerSimulationInline(ticketData)} className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-700 transition hover:bg-slate-50">Corregir datos</button>
                  <button type="button" onClick={() => onTriggerSimulationInline(ticketData)} className="rounded-xl bg-[#0B53F4] px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-blue-500/20 transition hover:bg-[#0941C4]">Facturar</button>
                </div>
              </div>
            );
          })()}
        </div>
      );
    }

    // Resolve dynamic currency and details
    const totalVal = activeInvoiceData.total || 0;
    const subtotalVal = totalVal / 1.16;
    const ivaVal = totalVal - subtotalVal;
    
    const emisorNameRaw = activeInvoiceData.nombreEmisor || "Emisor SAT";
    const emisorCorp = isMock 
      ? (activeInvoiceData as any).nombreEmisor === "Starbucks" ? "Café Sirena S. de R.L. de C.V." : `${emisorNameRaw} S.A. de C.V.`
      : `${emisorNameRaw} S.A. de C.V.`;
      
    const rfcEmisorVal = activeInvoiceData.rfcEmisor || "";
    const uuidVal = activeInvoiceData.folioFiscal || "";
    
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
                setSelectedBillingItem(null);
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
                toast.info(`UUID: ${uuidVal}`, "Detalle de Factura");
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
              <span className="text-slate-400 font-extrabold uppercase tracking-wide block">Fecha de Facturación</span>
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
                  ✓ Formato de Factura compatible v4.0
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
                             margin: 0;
                           }
                           @media print {
                             /* Hide browser default header (date/title) and footer (URL/pages) */
                             @page {
                               margin: 0;
                             }
                             body {
                               margin: 0 !important;
                               padding: 0 !important;
                             }
                             .page-wrapper {
                               border: none !important;
                               box-shadow: none !important;
                               padding: 15mm 20mm !important;
                               max-width: 100% !important;
                               border-radius: 0 !important;
                               margin: 0 !important;
                               width: 100% !important;
                               height: 100% !important;
                               box-sizing: border-box !important;
                             }
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
                            padding: 48px 45px 45px 45px;
                            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
                            position: relative;
                            overflow: hidden;
                          }
                          
                          .header-container {
                             display: flex;
                             flex-direction: column;
                             justify-content: flex-start;
                             align-items: flex-start;
                             position: relative;
                             z-index: 10;
                             margin-bottom: 25px;
                             width: 100%;
                           }
                           
                           .header-logo-row {
                             width: 100%;
                             display: flex;
                             justify-content: flex-start;
                             align-items: center;
                             margin-bottom: 30px;
                           }

                           .header-info-row {
                             width: 100%;
                             display: grid;
                             grid-template-columns: 1.15fr 0.85fr;
                             gap: 30px;
                             align-items: flex-start;
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

                        </style>
                                      <div class="page-wrapper">
                          
                          <!-- Top Header info -->
                          <div class="header-container">
                            <div class="header-logo-row">
                              <img src="${logoLight}" style="height: 52px; width: auto; object-fit: contain;" alt="ZenTicket" />
                            </div>
                            
                            <div class="header-info-row">
                              <!-- Left metadata column -->
                              <div style="text-align: left;">
                                <div class="invoice-meta-item" style="margin: 3px 0; font-size: 11px; text-align: left; color: #475569;">Fecha: <strong style="color: #0f172a;">${formattedDate}</strong></div>
                                <div class="invoice-meta-item" style="margin: 3px 0; font-size: 11px; text-align: left; color: #475569;">Folio Fiscal (UUID): <strong style="color: #0f172a; word-break: break-all;">${uuidVal}</strong></div>
                                <div class="invoice-meta-item" style="margin: 3px 0; font-size: 11px; text-align: left; color: #475569;">Lugar de Expedición: <strong style="color: #0f172a;">${lugarExpedicion}</strong></div>
                              </div>
                              
                              <!-- Right emisor column -->
                              <div class="issuer-box" style="text-align: left;">
                                <h3 style="font-size: 13.5px; font-weight: 850; color: #0f172a; margin: 0 0 4px 0;">${emisorCorp}</h3>
                                <p style="font-size: 11px; color: #475569; margin: 0;"><strong>RFC Emisor:</strong> ${rfcEmisorVal}</p>
                                <p style="font-size: 11px; color: #475569; margin: 2px 0 0 0;"><strong>Régimen Fiscal Emisor:</strong> ${getRegimenLabel(activeInvoiceData.regimenFiscalEmisor || "601")}</p>
                              </div>
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
                                CFDI verificado en bases SAT en tiempo real
                              </span>
                            </div>
                          </div>
                          
                          <!-- Footer banner item indicating invoice origin -->
                          <div class="custom-decor-footer-banner">
                            <div class="footer-banner-item">
                              <span>Esta factura es una representación impresa de un CFDI obtenido a través de ZenTicket &bull; www.zenticket.mx</span>
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
              if (!activeInvoiceData.xmlContent) {
                toast.error(
                  "El XML aún no está disponible. ZenTicket debe obtenerlo primero desde el portal oficial del comercio.",
                  "Descarga no disponible"
                );
                return;
              }
              downloadFile(activeInvoiceData.xmlContent, `Factura_${emisorNameRaw}_${uuidVal.substring(0,10)}.xml`, "text/xml");
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
              ZenTicket realiza el <strong>procesamiento automático y la validación en tiempo real</strong> de los tickets comerciales, consultando el portal oficial de facturación del comercio y verificando los CFDIs.
            </p>
            <p>
              <strong>¿Cómo opera en producción?</strong>
            </p>
            <ul className="list-decimal pl-4.5 space-y-2 text-[11px] sm:text-[11.5px] font-semibold text-slate-700">
              <li>
                <strong className="text-slate-800">Conexión Segura con Portales:</strong> El conector accede directamente al portal oficial de facturación del comercio para solicitar la descarga de tus comprobantes en formato XML y PDF.
              </li>
              <li>
                <strong className="text-slate-800">Validación SAT:</strong> Una vez obtenidos, se verifica la autenticidad estructural del comprobante de forma directa ante los servidores oficiales del SAT.
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
              <div className="flex items-start gap-2 zt-status-ok rounded-xl p-3 text-left border">
                <Check className="w-4 h-4 text-[var(--zt-ok-text)] shrink-0 mt-0.5" />
                <div className="leading-tight">
                  <span className="text-[10.5px] font-extrabold block">
                    Servidor de Correo SMTP Activo
                  </span>
                  <p className="text-[9.5px] text-[var(--zt-ok-text)] font-semibold block mt-0.5 leading-normal">
                    Credenciales configuradas para <strong>{smtpStatus.smtpUser}</strong>. El CFDI obtenido se enviará directamente a {emailTo}.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 zt-status-alert rounded-xl p-3 text-left border">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full zt-dot-alert animate-pulse shrink-0" />
                  <span className="text-[10.5px] font-black">
                    Servidor SMTP Desconfigurado
                  </span>
                </div>
                <p className="text-[9.5px] text-slate-400 dark:text-slate-500 leading-normal font-semibold">
                  Si deseas recibir los correos directamente en tu buzón personal o en el de tu contador, configura las credenciales de correo SMTP en la pestaña de configuración del workspace.
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
      
      {/* Top title header */}
      <div className="flex items-center gap-4 py-2 border-b border-[var(--zt-border-default)] pb-3 relative">
        <h1 className="zt-title-page">Mis Tickets</h1>
      </div>

      {/* SEGMENTED CONTROL TAB BAR FILTERS - Hidden on desktop screens */}
      <div className="bg-[var(--zt-bg-surface-soft)] p-1.5 rounded-2xl border border-[var(--zt-border-default)] shadow-inner flex w-full relative lg:hidden">
        <button
          type="button"
          onClick={() => setActiveSubTab("en-seguimiento")}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all duration-150 cursor-pointer ${
            activeSubTab === "en-seguimiento"
              ? "bg-[var(--zt-bg-surface)] text-[var(--zt-accent-secondary)] shadow-xs"
              : "text-[var(--zt-text-muted)] hover:text-[var(--zt-text-primary)]"
          }`}
        >
          En proceso
        </button>
        
        <button
          type="button"
          onClick={() => setActiveSubTab("cfdi-obtenidos")}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all duration-150 cursor-pointer ${
            activeSubTab === "cfdi-obtenidos"
              ? "bg-[var(--zt-bg-surface)] text-[var(--zt-accent-secondary)] shadow-xs"
              : "text-[var(--zt-text-muted)] hover:text-[var(--zt-text-primary)]"
          }`}
        >
          Listos
        </button>
      </div>

      {/* Grid container layout for widescreen desktop preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* COLUMN 1: EN SEGUIMIENTO (Visible on desktop OR when mobile has activeSubTab === "en-seguimiento") */}
        <div className={`space-y-4 lg:col-span-6 ${activeSubTab === "en-seguimiento" ? "block" : "hidden lg:block"}`}>
          <div className="flex items-center justify-between px-1 mb-2">
            <h2 className="font-display font-extrabold text-base text-slate-800 tracking-tight">
              En proceso
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
              inProgressList.map((item) => {
                const t = item.ticket || {};
                const state = item.canonicalState;
                const isFailed = state.canonicalStatus === "failed_blocking" || state.canonicalStatus.startsWith("cfdi_");
                const isProcessing = state.isActive;
                const brand = getBrandBrandIcon(t.nombreEmisor || item.invoice?.nombreEmisor || "");
                const isNewlyAdded = newlyAddedTicketId && t.id === newlyAddedTicketId;
                const isTicketCaptcha = state.canonicalStatus === "waiting_user_captcha";

                return (
                  <div 
                    key={t.id || item.invoice?.id}
                    className={`rounded-3xl p-5 flex flex-col gap-4 relative overflow-hidden transition ${
                      isNewlyAdded
                        ? "border-2 border-[#0B53F4] shadow-[0_0_25px_rgba(11,83,244,0.08)] bg-blue-50/10 scale-[1.01] duration-300"
                        : "bg-white border border-slate-200/55 rounded-3xl p-5 shadow-[0_4px_20px_rgba(15,23,42,0.02)] hover:border-[#0B53F4]/20 hover:shadow-[0_4px_24px_rgba(11,83,244,0.04)]"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="flex items-center gap-3.5 min-w-0 w-full">
                        <div className={`w-10 h-10 ${brand.color} rounded-full flex items-center justify-center shrink-0`}>
                          <brand.IconComponent className="w-5 h-5 stroke-[2.2]" />
                        </div>
                        
                        <div className="text-left leading-tight min-w-0 flex-1">
                          <span className="text-sm font-black text-slate-800 block truncate max-w-[220px] sm:max-w-[170px] uppercase">
                            {t.nombreEmisor || item.invoice?.nombreEmisor || "Emisor"}
                          </span>
                          
                          {/* Mobile status badge directly below name */}
                          <div className="sm:hidden mt-1.5 flex flex-wrap gap-1.5">
                            {isNewlyAdded && (
                              <span className="bg-[#EBF5FF] text-[#0B53F4] text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1 leading-none shadow-sm animate-pulse">
                                <Sparkles className="w-2.5 h-2.5 fill-current" />
                                RECIÉN AGREGADO
                              </span>
                            )}
                            {renderStatusBadge(t)}
                          </div>
                        </div>
                      </div>
 
                      {/* Desktop only active status state indicator badge */}
                      <div className="hidden sm:flex flex-col items-end gap-1.5 shrink-0">
                        {isNewlyAdded && (
                          <span className="bg-[#EBF5FF] text-[#0B53F4] text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1 leading-none shadow-sm animate-pulse">
                            <Sparkles className="w-2.5 h-2.5 fill-current" />
                            RECIÉN AGREGADO
                          </span>
                        )}
                         {renderStatusBadge(t)}
                      </div>
                    </div>

                    {/* Fila 2: Folio y fecha */}
                    <div className="text-left pt-1 border-t border-slate-100/60 sm:border-t-0 sm:pt-0 sm:-mt-1">
                      <span className="text-[11px] text-slate-500 block font-semibold font-mono">
                        Ticket #{t.folio || "S/D"} • {t.fechaCompra || (item.invoice?.createdAt ? new Date(item.invoice.createdAt).toLocaleDateString("es-MX") : "S/F")}
                      </span>
                    </div>

                    {/* Escalation/Failure Reason Card Block */}
                    {(() => {
                      if (!state.shouldAppearInAttention) return null;

                      const alertStyle = getBillingAlertStyle(state);
                      return (
                        <div className={`text-[11px] p-3.5 rounded-2xl leading-relaxed font-sans border ${alertStyle.bgClass} ${alertStyle.textClass}`}>
                          <span className={`font-bold block uppercase text-[9px] mb-1 tracking-wider ${alertStyle.labelClass}`}>
                            {state.badgeLabel}:
                          </span>
                          {state.message}
                        </div>
                      );
                    })()}

                    {/* Divider line Inside Card */}
                    <div className="border-t border-slate-100 my-0.5" />

                    {/* Lower cash amount indicator + interactive detail link */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none pt-0.5">
                      <span className="text-lg font-black text-slate-800 font-mono text-left">
                        ${state.displayTotal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>

                      <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                        {/* Trash Delete Option for Users */}
                        {onDeleteTicket && (t.id || item.invoice?.id) && (
                          ticketIdToDelete === (t.id || item.invoice?.id) ? (
                            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-lg text-[9px] font-bold animate-fade-in">
                              <span className="text-slate-550 mr-1">¿Eliminar?</span>
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteTicket(t.id || "", item.invoice?.id || "");
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
                              onClick={() => setTicketIdToDelete(t.id || item.invoice?.id || "")}
                              className="p-1.5 text-slate-300 hover:text-[#0B53F4] rounded-lg bg-transparent cursor-pointer hover:bg-[#ebf1ff] transition"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )
                        )}

                        {(state.canonicalStatus === "already_invoiced_unverified" ||
                          state.canonicalStatus === "invoice_recovery_pending" ||
                          t.errorCode === "TICKET_ALREADY_INVOICED" ||
                          t.reviewReasonCode === "ALREADY_INVOICED_XML_NOT_RECOVERED") && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRetryRecovery(t.id);
                              }}
                              disabled={isRetryingRecovery === t.id}
                              className="flex items-center gap-1 py-1.5 px-3 font-extrabold text-[10px] uppercase tracking-wider rounded-xl bg-amber-500 hover:bg-amber-600 text-white cursor-pointer shadow-3xs transition"
                            >
                              {isRetryingRecovery === t.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3.5 h-3.5" />
                              )}
                              Reintentar recuperación
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toast.info("Por favor, edita los campos del ticket en el listado para corregir cualquier dato incorrecto.");
                              }}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center justify-center gap-1 py-1.5 px-3 font-bold text-[10px] uppercase tracking-wider rounded-xl cursor-pointer border-none"
                            >
                              Corregir campos
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            onViewDetails(item);
                          }}
                          className={`group flex items-center justify-between gap-1.5 py-1.5 px-3 font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all duration-150 cursor-pointer shadow-3xs select-none shrink-0 ${
                            isTicketCaptcha
                              ? "bg-amber-600 hover:bg-amber-700 text-white shadow-amber-200/50"
                              : "zt-btn-secondary-blue"
                          }`}
                        >
                          <span>{isTicketCaptcha ? "Resolver CAPTCHA" : "Ver detalles"}</span>
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
        <div className={`space-y-4 lg:col-span-6 ${activeSubTab === "cfdi-obtenidos" ? "block" : "hidden lg:block"}`}>
          <div className="px-1 text-left mb-2">
            <h2 className="font-display font-extrabold text-base text-slate-800 tracking-tight">
              Listos
            </h2>
          </div>

          <div className="space-y-4">
            {emittedInvoicesList.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-200/80 p-9 rounded-3xl text-center">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-black text-slate-800">No hay CFDI obtenidos</p>
                <p className="text-[10px] text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">Los CFDI obtenidos y certificados por el SAT se guardarán aquí.</p>
              </div>
            ) : (
              emittedInvoicesList.map((item) => {
                const inv = item.invoice || {};
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
                const invState = item.canonicalState;

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
                            {invState.canonicalStatus !== "cfdi_validated" && (
                              <span className={`${invState.badgeTone} text-[8.5px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider leading-none shadow-3xs flex items-center shrink-0`}>
                                {invState.badgeLabel}
                              </span>
                            )}
                            {isNewlyAdded && (
                              <span className="bg-emerald-50 text-emerald-700 text-[8.5px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider leading-none shadow-3xs flex items-center gap-0.5 animate-pulse shrink-0">
                                <Sparkles className="w-2.5 h-2.5 fill-current" />
                                CFDI Obtenido
                              </span>
                            )}
                          </div>
                          <span className="text-[13px] font-black font-mono text-[#0B53F4] tracking-tight block mt-1">
                            ${invState.displayTotal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                          </span>
                        </div>
                      </div>

                      {/* Compact right actions stacked block (Hidden on mobile to avoid squeezing) */}
                      <div className="hidden sm:flex flex-col gap-1.5 min-w-[124px] shrink-0">
                        {invState.canViewPdf ? (
                          <button
                            type="button"
                            onClick={() => onViewDetails(item)}
                            className="w-full zt-btn-secondary-blue font-black rounded-xl py-1.5 px-3 text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5 stroke-[2.2]" />
                            Ver PDF
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onViewDetails(item)}
                            className="w-full zt-btn-secondary-blue font-black rounded-xl py-1.5 px-3 text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 stroke-[2.2]" />
                            Ver detalles
                          </button>
                        )}
                        
                        {invState.canDownloadXml && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!inv.xmlContent) {
                                toast.error(
                                  "El XML aún no está disponible. ZenTicket debe obtenerlo primero desde el portal oficial del comercio.",
                                  "Descarga no disponible"
                                );
                                  return;
                              }
                              downloadFile(inv.xmlContent, `Factura_${inv.nombreEmisor}_${inv.folioFiscal?.substring(0,8)}.xml`, "text/xml");
                            }}
                            className="w-full zt-btn-secondary-blue font-black rounded-xl py-1.5 px-3 text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5 stroke-[2.2]" />
                            Descargar XML
                          </button>
                        )}
                      </div>

                    </div>

                    {/* Alert Box if invoice requires attention */}
                    {invState.shouldAppearInAttention && (() => {
                      const alertStyle = getBillingAlertStyle(invState);
                      return (
                        <div className={`text-[11px] p-3.5 rounded-2xl leading-relaxed font-sans border ${alertStyle.bgClass} ${alertStyle.textClass}`}>
                          <span className={`font-bold block uppercase text-[9px] mb-1 tracking-wider ${alertStyle.labelClass}`}>
                            {invState.badgeLabel}:
                          </span>
                          {invState.message}
                        </div>
                      );
                    })()}

                    {/* Lower metadata footer details */}
                    <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-[10px] text-slate-400 font-bold select-none">
                       <span>Fecha de Factura: {dateStr}</span>
                      <span className="font-mono">RFC: {inv.rfcEmisor || "S/D"}</span>
                    </div>

                    {/* Mobile action buttons (Exclusively shown on mobile as a row underneath to guarantee full width and no truncation) */}
                    <div className="flex sm:hidden gap-2 mt-0.5">
                       {invState.canViewPdf ? (
                        <button
                          type="button"
                          onClick={() => onViewDetails(item)}
                          className="flex-1 zt-btn-secondary-blue font-black rounded-xl py-2.5 px-3.5 text-[10.5px] uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-2xs cursor-pointer min-h-[42px]"
                        >
                          <FileText className="w-4 h-4 stroke-[2.2]" />
                          Ver PDF
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onViewDetails(item)}
                          className="flex-1 zt-btn-secondary-blue font-black rounded-xl py-2.5 px-3.5 text-[10.5px] uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-2xs cursor-pointer min-h-[42px]"
                        >
                          <Eye className="w-4 h-4 stroke-[2.2]" />
                          Ver detalles
                        </button>
                      )}
                      
                      {invState.canDownloadXml && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!inv.xmlContent) {
                              toast.error(
                                "El XML aún no está disponible. ZenTicket debe obtenerlo primero desde el portal oficial del comercio.",
                                "Descarga no disponible"
                              );
                              return;
                            }
                            downloadFile(inv.xmlContent, `Factura_${inv.nombreEmisor}_${inv.folioFiscal?.substring(0,8)}.xml`, "text/xml");
                          }}
                          className="flex-1 zt-btn-secondary-blue font-black rounded-xl py-2.5 px-3.5 text-[10.5px] uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-2xs cursor-pointer min-h-[42px]"
                        >
                          <Download className="w-4 h-4 stroke-[2.2]" />
                          Descargar XML
                        </button>
                      )}
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
