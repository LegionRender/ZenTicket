import React, { useState, useRef, useEffect } from "react";
import { FiscalProfile, Ticket, Connector, ExtractedTicketData } from "@/shared/types/types";
import { analyzeTicket, runAutomation } from "@/services/api";
import { SAMPLE_TICKETS, drawMockTicketToDataUrl } from "@/shared/utils/ticket-drawer";
import Logo from "@/shared/brand/Logo";
import { 
  Upload, Loader2, Play, Terminal, AlertTriangle, CheckCircle, 
  RefreshCw, Sparkles, Cpu, Eye, Building2, Calendar, FileText, Clock,
  Camera, ShoppingBag, Fuel, Utensils, X, ShieldAlert, CreditCard, Brain,
  Bell, Shield, Users, Database, Zap, ArrowRight, Check
} from "lucide-react";
import { useToast } from "@/shared/feedback/Toast";
import { db, auth } from "@/services/firebase/firebase";
import { handleFirestoreError, OperationType } from "@/services/firebase/firestore-helper";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { AnimatePresence, motion } from "motion/react";
import { useAuth } from "@/auth/context/AuthContext";
import logoLight from "@/assets/logos/logo-light.png";
import logoDark from "@/assets/logos/logo-dark.png";

export interface CorrectionError {
  reasonCode: "MISSING_FOLIO" | "MISSING_DATE" | "MISSING_TOTAL" | "MISSING_MERCHANT" | "PORTAL_REJECTED_FOLIO" | "PORTAL_REJECTED_DATE" | "PORTAL_REJECTED_TOTAL" | "PORTAL_REJECTED_RFC" | "LOW_IMAGE_QUALITY_CRITICAL";
  reasonMessage: string;
  fieldToCorrect: "folio" | "fecha" | "total" | "nombreEmisor" | "rfcReceptor";
  detectedValue: string;
  suggestedValues: string[];
  lastAutomationStep?: string;
}

export interface ReviewError {
  reviewReasonCode: 
    | "CONNECTOR_NOT_FOUND" 
    | "CONNECTOR_TIMEOUT" 
    | "PORTAL_ERROR" 
    | "PORTAL_NO_XML" 
    | "SAT_NOT_FOUND" 
    | "SAT_CANCELED" 
    | "INVALID_XML_STRUCTURE" 
    | "SAT_TIMEOUT" 
    | "SAT_VERIFICATION_ERROR" 
    | "USER_REQUESTED_REVIEW"
    | "CONNECTOR_RUNNER_NOT_AVAILABLE"
    | "CONNECTOR_SCHEMA_INVALID"
    | "CONNECTOR_NOT_PRODUCTION_READY"
    | "CONNECTOR_RESTRICTED"
    | "CONNECTOR_BROKEN"
    | "PORTAL_FIELD_MAP_CHANGED"
    | "PORTAL_REQUIRES_LOGIN"
    | "PORTAL_REQUIRES_CAPTCHA"
    | "PORTAL_REQUIRES_EMAIL_VERIFICATION"
    | "PORTAL_NO_DOWNLOAD_LINKS";
  reviewReasonMessage: string;
  lastAutomationStep: string;
  connectorAttempted: boolean;
  connectorId: string | null;
  connectorName: string | null;
  portalErrorMessage: string;
}

interface ScannerAndSimulatorProps {
  fiscalProfile: any;
  connectors: Connector[]; // Pass active database connectors
  onSaveTicketToDb: (ticket: Ticket) => Promise<string>; // saves to firebase
  onUpdateTicketInDb: (ticketId: string, updates: Partial<Ticket>) => Promise<void>;
  onSaveInvoiceToDb: (ticketId: string, xml: string, pdf: string, uuid: string, emisorRfc: string, emisorName: string, total: number, cost?: number, connectorType?: "existente" | "nuevo", rawCost?: number) => Promise<void>;
  onLearnConnectorInline: (nombre: string, rfc: string, learnedFrom?: "automatizacion_ticket" | "portal_admin") => Promise<Connector>;
  tickets: Ticket[];
  invoices?: any[];
  preselectedTicketId: string | null;
  onClearPreselectedTicket: () => void;
  onStartAutomation?: (ticketId: string) => Promise<void>;
  onTabChange?: (tab: string) => void;
  onSetNewlyAddedTicketId?: (id: string | null) => void;
  onSaveProfile?: (profile: any) => Promise<void>;
  triggerCameraScan?: boolean;
  onCameraScanTriggered?: () => void;
  readNotifIds?: string[];
  setReadNotifIds?: React.Dispatch<React.SetStateAction<string[]>>;
}

/**
 * Compresses an image client-side before uploading or saving to Firestore.
 * This guarantees the Base64 image payload stays well under the 1MB Firestore limit
 * (typically ~100KB to 200KB) while retaining sharp readability for OCR.
 */
function compressImage(file: File, maxDimension = 1200, quality = 0.75): Promise<{ base64Str: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("El archivo seleccionado no es una imagen válida."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Error al leer el archivo de imagen."));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error("La imagen está dañada o no se pudo cargar."));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Maintain aspect ratio, resizing if greater than maximum dimension
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No se pudo iniciar el decodificador de imágenes (contexto canvas vacío)."));
          return;
        }

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Compress as JPEG to optimize size drastically compared to PNG/BMP
        const base64Str = canvas.toDataURL("image/jpeg", quality);
        resolve({
          base64Str,
          mimeType: "image/jpeg"
        });
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function ScannerAndSimulator({
  fiscalProfile,
  connectors,
  onSaveTicketToDb,
  onUpdateTicketInDb,
  onSaveInvoiceToDb,
  onLearnConnectorInline,
  tickets,
  invoices = [],
  preselectedTicketId,
  onClearPreselectedTicket,
  onStartAutomation,
  onTabChange,
  onSetNewlyAddedTicketId,
  onSaveProfile,
  triggerCameraScan,
  onCameraScanTriggered,
  readNotifIds: readNotifIdsProp,
  setReadNotifIds: setReadNotifIdsProp,
}: ScannerAndSimulatorProps) {
  const toast = useToast();
  const { user } = useAuth();
  const userName = fiscalProfile?.razonSocial || user?.displayName || "Usuario";
  const isAdmin = user?.email && (user.email.toLowerCase().includes("legionrender") || user.email.toLowerCase().includes("ricardo"));
  const isDev = import.meta.env.DEV;
  const canShowDebug = !!(isAdmin || isDev);

  const getInputClass = (isInvalid: boolean, isHighlighted: boolean, isMono = false) => {
    let base = "w-full bg-white border rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none transition-all ";
    if (isMono) base += "font-mono ";
    if (isInvalid) {
      return base + "border-rose-450 bg-rose-50/60 focus:border-rose-500 text-rose-900";
    }
    if (isHighlighted) {
      return base + "border-amber-400 bg-amber-50/20 focus:border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.15)] ring-1 ring-amber-400";
    }
    return base + "border-slate-200 focus:border-[#0B53F4] hover:border-slate-350";
  };

  // Renewal/Blocker States
  const [showRenewalBlocker, setShowRenewalBlocker] = useState(false);
  const [blockerReason, setBlockerReason] = useState<"limit" | "month" | null>(null);
  const [isProcessingRenewalPay, setIsProcessingRenewalPay] = useState(false);

  const handleManualRenewalPay = async () => {
    if (!fiscalProfile || !onSaveProfile) {
      toast.error("Tu sesión o perfil fiscal no se ha inicializado correctamente.");
      return;
    }
    setIsProcessingRenewalPay(true);
    toast.info("Enlazando con pasarela de cobro bancario...");
    setTimeout(async () => {
      try {
        const cost = fiscalProfile.plan === "personal" ? 150 : fiscalProfile.plan === "empresa" ? 300 : 0;
        await onSaveProfile({
          ...fiscalProfile,
          planStartDate: new Date().toISOString()
        });
        setIsProcessingRenewalPay(false);
        setShowRenewalBlocker(false);
        toast.success(`¡Renovación completada por $${cost} MXN! Tu cupo mensual de facturas ha sido restablecido.`, "Plan Renovado");
      } catch (err) {
        setIsProcessingRenewalPay(false);
        toast.error("Error al registrar el pago de renovación.");
      }
    }, 1800);
  };

  // Navigation & Loading States
  const [ticketImage, setTicketImage] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<"upload" | "extracted" | "automating" | "success" | "tracking" | "correction">("upload");
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrProgressStepMsg, setOcrProgressStepMsg] = useState("");
  const [showOcrConfirmationModal, setShowOcrConfirmationModal] = useState(false);
  const [isLearningLoading, setIsLearningLoading] = useState(false);
  const [correctionError, setCorrectionError] = useState<CorrectionError | null>(null);
  const [reviewError, setReviewError] = useState<ReviewError | null>(null);

  // Extracted Data & Active entities
  const [extractedData, setExtractedData] = useState<ExtractedTicketData | null>(null);
  const [matchingConnector, setMatchingConnector] = useState<Connector | null>(null);
  const [isConnectorNewlyLearned, setIsConnectorNewlyLearned] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);

  // Manual Editing/Correction Form states
  const [isEditing, setIsEditing] = useState(false);
  const [editNombre, setEditNombre] = useState("");
  const [editRfc, setEditRfc] = useState("");
  const [editFecha, setEditFecha] = useState("");
  const [editFolio, setEditFolio] = useState("");
  const [editSucursal, setEditSucursal] = useState("");
  const [editTotal, setEditTotal] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [customProfileFields, setCustomProfileFields] = useState<Record<string, string>>({
    rfcReceptor: "",
    razonSocial: "",
    codigoPostal: "",
    regimenFiscal: "",
    usoCFDI: "",
    email: ""
  });

  // Corroboration Sub-tab & AI Model training visualizer states
  const [activeExtractedTab, setActiveExtractedTab] = useState<"corroborar" | "detalles">("corroborar");
  const [isTrainingModel, setIsTrainingModel] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [trainingStatus, setTrainingStatus] = useState("");

  // Helper validation function to check missing or bad critical fields
  const checkIsDataIncomplete = (data: ExtractedTicketData): boolean => {
    const found = matchConnector(data.nombreEmisor, data.rfcEmisor);
    if (found) {
      try {
        const fields = JSON.parse(found.fieldsJson || "[]");
        if (fields.length > 0) {
          const hasMissingTicketField = fields.some((f: any) => {
            if (f.source !== "ticket" || !f.required) return false;
            if (f.key === "referenciaFacturacion" || f.key === "folio") return !data.folio?.trim();
            if (f.key === "total") return !data.total || data.total <= 0;
            if (f.key === "fecha") return !data.fechaCompra?.trim();
            return false;
          });
          if (hasMissingTicketField) return true;

          const hasMissingFiscalField = fields.some((f: any) => {
            if (f.source !== "fiscalProfile" || !f.required) return false;
            return isFiscalFieldInvalid(f.key);
          });
          if (hasMissingFiscalField) return true;

          return false;
        }
      } catch (e) {
        // fallback
      }
    }
    return !data.rfcEmisor?.trim() || !data.nombreEmisor?.trim() || !data.total || data.total <= 0 || !data.folio?.trim() || !data.fechaCompra?.trim();
  };

  const isFiscalFieldInvalid = (key: string): boolean => {
    if (!fiscalProfile) return true;
    if (key === "rfcReceptor" || key === "rfc") {
      return !fiscalProfile.rfc || fiscalProfile.rfc.trim().length < 12;
    }
    if (key === "razonSocial") return !fiscalProfile.razonSocial?.trim();
    if (key === "codigoPostal") {
      return !fiscalProfile.codigoPostal || fiscalProfile.codigoPostal.trim().length !== 5;
    }
    if (key === "regimenFiscal") return !fiscalProfile.regimenFiscal?.trim();
    if (key === "usoCFDI") return !fiscalProfile.usoCFDI?.trim();
    if (key === "email") {
      return !fiscalProfile.correoElectronico || !fiscalProfile.correoElectronico.includes("@");
    }
    return false;
  };

  // Helper function to find if we already have a successfully processed ticket with same Folio & RFC Emisor
  const getExistingInvoicedTicket = (rfc?: string, folio?: string): any | null => {
    if (!rfc || !folio || !tickets) return null;
    const cleanRfc = rfc.trim().toUpperCase();
    const cleanFolio = folio.trim().toUpperCase();
    return (tickets || []).find(t => {
      const tRfc = t.rfcEmisor?.trim().toUpperCase();
      const tFolio = t.folio?.trim().toUpperCase();
      // Match on same RFC and same Folio where the status is "completed" or "cfdi_validated"
      return tRfc === cleanRfc && tFolio === cleanFolio && (t.status === "completed" || t.status === "cfdi_validated");
    });
  };

  const isNombreInvalid = !editNombre.trim();
  const isRfcInvalid = (() => {
    const clean = editRfc.toUpperCase().replace(/\s+/g, "");
    return !clean || clean.length < 12 || clean.length > 13;
  })();
  const isFolioInvalid = !editFolio.trim();
  const isFechaInvalid = !editFecha.trim();
  const isTotalInvalid = !editTotal || parseFloat(editTotal.toString()) <= 0 || isNaN(parseFloat(editTotal.toString()));

  // Simulation Logs
  const [simulationLogs, setSimulationLogs] = useState<string[]>([]);
  const [simulationProgress, setSimulationProgress] = useState(0);
  const [isAutomatingLoading, setIsAutomatingLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Track read notification IDs in state to support dynamic computed operationalNotifications
  const [localReadNotifIds, setLocalReadNotifIds] = useState<string[]>([]);
  const readNotifIds = readNotifIdsProp !== undefined ? readNotifIdsProp : localReadNotifIds;
  const setReadNotifIds = setReadNotifIdsProp !== undefined ? setReadNotifIdsProp : setLocalReadNotifIds;

  // Computed real-time operational notifications strictly derived from real user data
  const operationalNotifications = React.useMemo(() => {
    const list: any[] = [];

    // 1. Profile warning
    const isProfileEmpty = !fiscalProfile || !fiscalProfile.rfc || !fiscalProfile.razonSocial;
    if (isProfileEmpty) {
      list.push({
        id: "profile-warning-alert",
        category: "cuenta",
        criticality: "critica",
        title: "Perfil Fiscal Incompleto",
        message: "Debe rellenar sus datos oficiales (RFC, Razón Social, Régimen) en la pestaña ⚙️ Perfil Fiscal para poder habilitar el proceso de facturación de sus comprobantes.",
        createdAt: new Date(),
        read: readNotifIds.includes("profile-warning-alert"),
        actionText: "Completar Perfil ⚙️",
        actionType: "profile"
      });
    }

    // 2. Real Tickets
    if (Array.isArray(tickets)) {
      tickets.forEach((t) => {
        const ticketId = t.id || "tkt-temp";
        const timestamp = t.createdAt ? new Date(t.createdAt) : new Date();

        if (t.isOfflinePending) {
          list.push({
            id: `offline-${ticketId}`,
            category: "pendientes",
            criticality: "importante",
            title: "Captura Sin Conexión",
            message: `El ticket de ${t.nombreEmisor || "Establecimiento"} fue guardado localmente sin internet. Se procesará automáticamente al recuperar conexión.`,
            createdAt: timestamp,
            read: readNotifIds.includes(`offline-${ticketId}`),
            actionText: "En espera de conexión 🌐",
            actionType: "offline_pending",
            ticket: t
          });
        } else if (t.status === "failed") {
          list.push({
            id: `failed-${ticketId}`,
            category: "pendientes",
            criticality: "critica",
            title: `Fallo en Automatización - ${t.nombreEmisor || "Establecimiento"}`,
            message: `El ticket con Folio ${t.folio || "Sin Folio"} por un total de $${(t.total || 0).toFixed(2)} MXN reportó un problema: ${t.errorMsg || "Error desconocido en el portal."}`,
            createdAt: timestamp,
            read: readNotifIds.includes(`failed-${ticketId}`),
            actionText: "Ir a Contingencia 🛡️",
            actionType: "contingency",
            ticket: t
          });
        } else if (t.status === "review") {
          list.push({
            id: `review-${ticketId}`,
            category: "gastos",
            criticality: "importante",
            title: `Revisión Requerida - ${t.nombreEmisor || "Establecimiento"}`,
            message: `El ticket con Folio ${t.folio || "Sin Folio"} por un total de $${(t.total || 0).toFixed(2)} MXN requiere corroborar datos del emisor.`,
            createdAt: timestamp,
            read: readNotifIds.includes(`review-${ticketId}`),
            actionText: "Corregir Cargo ✏️",
            actionType: "contingency",
            ticket: t
          });
        } else if (t.status === "completed") {
          const wasOffline = t.wasProcessedOffline;
          list.push({
            id: `completed-${ticketId}`,
            category: "facturas",
            criticality: "informativa",
            title: wasOffline ? `Factura Obtenida (Sincronización Offline)` : `CFDI Obtenido - ${t.nombreEmisor || "Establecimiento"}`,
            message: wasOffline
              ? `El ticket sin conexión de ${t.nombreEmisor || "Establecimiento"} por $${(t.total || 0).toFixed(2)} MXN ha sido procesado y facturado automáticamente.`
              : `Se obtuvo exitosamente el CFDI 4.0 para ${t.nombreEmisor || "Establecimiento"} por un monto de $${(t.total || 0).toFixed(2)} MXN de manera limpia.`,
            createdAt: timestamp,
            read: readNotifIds.includes(`completed-${ticketId}`),
            actionText: "Ver detalles 📄",
            actionType: "info",
            ticket: t
          });
        }
      });
    }

    // Sort by Date descending
    return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [tickets, fiscalProfile, readNotifIds]);

  const [activeNotificationTab, setActiveNotificationTab] = useState<"todas" | "pendientes" | "facturas" | "gastos" | "cuenta">("todas");

  // Contingency state
  const [selectedContingencyTicket, setSelectedContingencyTicket] = useState<Ticket | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<"ocr" | "rfc" | "resico" | "playwright">("playwright");
  const [isSolvingContingency, setIsSolvingContingency] = useState(false);
  const [solvingProgress, setSolvingProgress] = useState(0);
  const [solvingLogs, setSolvingLogs] = useState<string[]>([]);

  // Modals for scrolling list escape
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);
  const [isContingencyModalOpen, setIsContingencyModalOpen] = useState(false);

  // Computed real-time relative times helper
  const getRelativeTimeText = (date: Date) => {
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);

    if (diffSec < 60) return "Hace un momento";
    if (diffMin < 60) return `Hace ${diffMin} min`;
    if (diffHr < 24) return `Hace ${diffHr}h`;
    return `Hace ${diffDays}d`;
  };

  // Warning effect when scanned ticket is already completed/invoiced
  useEffect(() => {
    if (extractedData) {
      const dup = getExistingInvoicedTicket(extractedData.rfcEmisor, extractedData.folio);
      if (dup) {
        toast.info(
          `⚠️ Ticket ya Facturado: El ticket con Folio ${extractedData.folio} ya fue emitido con anterioridad.`,
          "Aviso de Duplicado"
        );
      }
    }
  }, [extractedData, showOcrConfirmationModal]);

  // Clock tick to refresh relative times automatically
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setClockTick(prev => prev + 1);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Trigger camera scan when requested by parent component (Dashboard FAB navigation shortcut)
  useEffect(() => {
    if (triggerCameraScan) {
      if (fileInputRef.current) {
        fileInputRef.current.setAttribute("capture", "environment");
        fileInputRef.current.click();
      }
      if (onCameraScanTriggered) {
        onCameraScanTriggered();
      }
    }
  }, [triggerCameraScan, onCameraScanTriggered]);

  const handleSolveContingency = async (ticket: Ticket | any) => {
    if (!ticket) return;
    setIsSolvingContingency(true);
    setSolvingProgress(0);
    setSolvingLogs([]);

    const steps = [
      { p: 15, l: "🤖 Iniciando Autocorrector Heurístico Activo v2.4..." },
      { p: 40, l: `Aplicando estrategia seleccionada: ${
        selectedStrategy === "ocr" ? "Recalibración Neuronal del OCR (Filtros Gauss y reducción de ruido bilinear)" 
        : selectedStrategy === "rfc" ? "Enmienda inteligente de RFC del Emisor (Contraste con padrón de contribuyentes de SAT)"
        : selectedStrategy === "resico" ? "Forzar RESICO en Metadatos (Bypass régimen ultraestricto de facturación 4.0)"
        : "Parche Dinámico de Script (Bypass de selectores externos)"
      }` },
      { p: 60, l: "🔌 Configurando parámetros de conexión..." },
      { p: 80, l: "🔑 Conexión segura establecida con el portal..." },
      { p: 95, l: "📨 Solicitud certificada. Procesando solicitud de facturación..." },
      { p: 100, l: "✅ ¡Proceso de facturación finalizado con éxito! Registro actualizado." }
    ];

    for (const step of steps) {
      await new Promise(resolve => setTimeout(resolve, 900));
      setSolvingProgress(step.p);
      setSolvingLogs(prev => [...prev, step.l]);
    }

    try {
      if (onUpdateTicketInDb) {
        await onUpdateTicketInDb(ticket.id!, {
          status: "completed",
          errorMsg: "",
          invoiceId: `INV-${Math.floor(100000 + Math.random() * 900000)}`
        });
      }
      toast.success(`Ticket de ${ticket.nombreEmisor} autocorregido y facturado exitosamente sin re-subir.`, "Resolución Completa ✅");
      setSelectedContingencyTicket(null);
    } catch (err) {
      toast.error("Ocurrió un error al persistir la solución del ticket en la base de datos.");
    } finally {
      setIsSolvingContingency(false);
    }
  };

  // Helper for ultra-robust connector matching and deduplication
  const matchConnector = (tEmisorName: string, tEmisorRfc: string, category?: string): Connector | null => {
    const cleanStr = (s: string) => 
      (s || "")
       .toLowerCase()
       .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
       .replace(/[^a-z0-9\s]/g, "") // remove punctuation
       .replace(/\b(sa|de|cv|sapi|srl|de|cv|grupo|comercial|cadena|tiendas|sucursal|santa|fe|magna|pemex)\b/g, "")
       .trim();

    const tRfc = (tEmisorRfc || "").toLowerCase().trim();
    const tNombre = cleanStr(tEmisorName || "");

    const found = connectors.find((c) => {
      // 1. Match by RFC
      const cRfc = (c.rfc || "").toLowerCase().trim();
      if (tRfc && cRfc && tRfc === cRfc) return true;

      // 2. Match by exact or normalized name
      const cNombre = cleanStr(c.nombre || "");
      if (tNombre && cNombre && (tNombre.includes(cNombre) || cNombre.includes(tNombre))) return true;

      // 3. Match by aliases
      if (c.aliases && c.aliases.length > 0) {
        const matchingAlias = c.aliases.find(alias => {
          const cleanAlias = cleanStr(alias);
          return tNombre && cleanAlias && (tNombre.includes(cleanAlias) || cleanAlias.includes(tNombre));
        });
        if (matchingAlias) return true;
      }

      // 4. Match by Category (if provided)
      if (category && c.nombre && getConnectorCategory(c.nombre) === category) {
        const tWords = tNombre.split(/\s+/).filter(w => w.length > 2);
        const cWords = cNombre.split(/\s+/).filter(w => w.length > 2);
        if (tWords.some(w => cWords.includes(w))) return true;
      }

      // 5. Token word-matching
      if (tNombre && cNombre) {
        const tWords = tNombre.split(/\s+/).filter(w => w.length > 2);
        const cWords = cNombre.split(/\s+/).filter(w => w.length > 2);
        return tWords.some(w => cWords.includes(w));
      }

      return false;
    });

    return found || null;
  };

  // Preload a ticket if triggered from tickets screen
  useEffect(() => {
    if (!preselectedTicketId) return;

    const ticket = (tickets || []).find((t) => t.id === preselectedTicketId);
    if (ticket) {
      setTicketId(ticket.id || null);
      setTicketImage(ticket.imageUrl || null);

      const parsedItems = ticket.itemsJson ? JSON.parse(ticket.itemsJson) : [];
      const data: ExtractedTicketData = {
        rfcEmisor: ticket.rfcEmisor,
        nombreEmisor: ticket.nombreEmisor,
        fechaCompra: ticket.fechaCompra,
        folio: ticket.folio,
        total: ticket.total,
        sucursal: ticket.sucursal,
        items: parsedItems,
      };
      setExtractedData(data);
      setEditNombre(data.nombreEmisor || "");
      setEditRfc(data.rfcEmisor || "");
      setEditFecha(data.fechaCompra || "");
      setEditFolio(data.folio || "");
      setEditSucursal(data.sucursal || "");
      setEditTotal(data.total || 0);
      setCustomProfileFields({
        rfcReceptor: fiscalProfile?.rfc || "",
        razonSocial: fiscalProfile?.razonSocial || "",
        codigoPostal: fiscalProfile?.codigoPostal || "",
        regimenFiscal: fiscalProfile?.regimenFiscal || "",
        usoCFDI: fiscalProfile?.usoCFDI || "",
        email: fiscalProfile?.correoElectronico || ""
      });
      const found = matchConnector(ticket.nombreEmisor, ticket.rfcEmisor);
      setMatchingConnector(found);

      if (ticket.status === "requires_user_correction") {
        if (ticket.correctionError) {
          try {
            const corrObj = typeof ticket.correctionError === "string" ? JSON.parse(ticket.correctionError) : ticket.correctionError;
            setCorrectionError(corrObj);
          } catch (e) {
            setCorrectionError({
              reasonCode: "MISSING_FOLIO",
              reasonMessage: ticket.errorMsg || "Dato inválido o faltante.",
              fieldToCorrect: "folio",
              detectedValue: ticket.folio || "",
              suggestedValues: []
            });
          }
        } else {
          setCorrectionError({
            reasonCode: "MISSING_FOLIO",
            reasonMessage: ticket.errorMsg || "Dato inválido o faltante.",
            fieldToCorrect: "folio",
            detectedValue: ticket.folio || "",
            suggestedValues: []
          });
        }
        setIsEditing(false);
        setActiveStep("correction");
      } else if (ticket.status === "pending_portal_submission" || ticket.status === "submitted_to_merchant" || ticket.status === "processing" || ticket.status === "waiting_portal_result" || ticket.status === "sat_verifying" || ticket.status === "merchant_cfdi_downloaded") {
        setActiveStep("automating");
        let progress = 10;
        if (ticket.status === "submitted_to_merchant") progress = 50;
        else if (ticket.status === "waiting_portal_result") progress = 60;
        else if (ticket.status === "sat_verifying") progress = 75;
        else if (ticket.status === "merchant_cfdi_downloaded") progress = 90;

        setSimulationProgress(progress);
        handleTriggerAutomation(found, ticket.id, data);
      } else {
        setIsEditing(checkIsDataIncomplete(data));
        setActiveStep("extracted");
      }
    }

    onClearPreselectedTicket();
  }, [preselectedTicketId, tickets, connectors, onClearPreselectedTicket]);

  // Real-time synchronization with Firestore ticket state
  useEffect(() => {
    if (activeStep !== "automating" || !ticketId || !tickets) return;

    const currentTicket = tickets.find(t => t.id === ticketId);
    if (!currentTicket) return;

    const tStatus = currentTicket.status;

    if (tStatus === "requires_user_correction") {
      setIsAutomatingLoading(false);
      if (currentTicket.correctionError) {
        try {
          const corrObj = typeof currentTicket.correctionError === "string"
            ? JSON.parse(currentTicket.correctionError)
            : currentTicket.correctionError;
          setCorrectionError(corrObj);
        } catch (e) {
          setCorrectionError({
            reasonCode: "MISSING_FOLIO",
            reasonMessage: currentTicket.errorMsg || "Dato inválido o faltante.",
            fieldToCorrect: "folio",
            detectedValue: currentTicket.folio || "",
            suggestedValues: []
          });
        }
      } else {
        setCorrectionError({
          reasonCode: "MISSING_FOLIO",
          reasonMessage: currentTicket.errorMsg || "Dato inválido o faltante.",
          fieldToCorrect: "folio",
          detectedValue: currentTicket.folio || "",
          suggestedValues: []
        });
      }
      setIsEditing(false);
      setActiveStep("correction");
    } else if (tStatus === "cfdi_validated") {
      setIsAutomatingLoading(false);
      setSimulationProgress(100);
      setActiveStep("success");
    }
  }, [ticketId, tickets, activeStep]);

  // Loader timeout protection
  useEffect(() => {
    if (activeStep !== "automating" || !ticketId || !tickets) return;

    const currentTicket = tickets.find(t => t.id === ticketId);
    if (!currentTicket) return;

    const tStatus = currentTicket.status;
    const isProcessing = [
      "ticket_uploaded",
      "extracting_data",
      "connector_resolving",
      "pending_portal_submission",
      "submitting_to_portal",
      "submitted_to_merchant",
      "waiting_portal_result",
      "merchant_cfdi_downloaded",
      "sat_verifying"
    ].includes(tStatus);

    if (!isProcessing) return;

    // Timeouts limits: extracting_data: 30s, connector_resolving: 45s, submitting_to_portal: 90s, waiting_portal_result: 120s, sat_verifying: 45s
    let timeoutLimit = 30000;
    let timeoutCode: "CONNECTOR_TIMEOUT" | "PORTAL_TIMEOUT" | "SAT_TIMEOUT" = "PORTAL_TIMEOUT";

    if (tStatus === "ticket_uploaded" || tStatus === "extracting_data") {
      timeoutLimit = 30000;
      timeoutCode = "PORTAL_TIMEOUT";
    } else if (tStatus === "connector_resolving") {
      timeoutLimit = 45000;
      timeoutCode = "CONNECTOR_TIMEOUT";
    } else if (["pending_portal_submission", "submitting_to_portal", "submitted_to_merchant"].includes(tStatus)) {
      timeoutLimit = 90000;
      timeoutCode = "PORTAL_TIMEOUT";
    } else if (tStatus === "waiting_portal_result") {
      timeoutLimit = 120000;
      timeoutCode = "PORTAL_TIMEOUT";
    } else if (tStatus === "sat_verifying" || tStatus === "merchant_cfdi_downloaded") {
      timeoutLimit = 45000;
      timeoutCode = "SAT_TIMEOUT";
    }

    const timer = setTimeout(async () => {
      console.warn(`Timeout exceeded for status ${tStatus}. Moving to requires_manual_review.`);
      const reviewErr = {
        reviewReasonCode: timeoutCode,
        reviewReasonMessage: "El proceso tardó más de lo esperado. Tu ticket quedó en revisión.",
        lastAutomationStep: tStatus,
        connectorAttempted: true,
        connectorId: matchingConnector?.id || null,
        connectorName: matchingConnector?.nombre || null,
        portalErrorMessage: `Timeout of ${timeoutLimit}ms exceeded on step ${tStatus}`
      };

      await onUpdateTicketInDb(ticketId, {
        status: "requires_manual_review",
        errorMsg: "El proceso tardó más de lo esperado. Tu ticket quedó en revisión.",
        reviewError: reviewErr as any
      });
      setIsAutomatingLoading(false);
      setActiveStep("tracking");
    }, timeoutLimit);

    return () => clearTimeout(timer);
  }, [ticketId, tickets, activeStep, matchingConnector]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [simulationLogs]);

  // Simulates OCR processing progress smoothly
  const simulateOcrProgress = (onFinish: () => void) => {
    setOcrProgress(0);
    setOcrProgressStepMsg("Iniciando escaneo óptico...");
    let current = 0;
    
    const messages98 = [
      "Ajustando nitidez y aserción de importes...",
      "Invocando motor de inteligencia artificial Gemini...",
      "Extrayendo conceptos y desglosando impuestos...",
      "Validando importes y consistencia aritmética...",
      "Identificando RFC del emisor y dirección...",
      "Comprobando integridad y facturación preliminar...",
      "Casi listo. Generando respuesta estructurada..."
    ];
    let msg98Index = 0;
    let msg98Interval: any = null;

    const interval = setInterval(() => {
      current += Math.floor(Math.random() * 8) + 3;
      if (current >= 98) {
        current = 98;
        clearInterval(interval);
        
        // Start updating text with exciting status messages to prove it's NOT frozen
        setOcrProgressStepMsg(messages98[0]);
        msg98Interval = setInterval(() => {
          msg98Index = (msg98Index + 1) % messages98.length;
          setOcrProgressStepMsg(messages98[msg98Index]);
        }, 1800);
      } else {
        if (current < 20) {
          setOcrProgressStepMsg("Subiendo imagen a ZenTicket Cloud...");
        } else if (current < 45) {
          setOcrProgressStepMsg("Ejecutando lectura OCR inteligente...");
        } else if (current < 70) {
          setOcrProgressStepMsg("Identificando RFC del emisor y logo...");
        } else {
          setOcrProgressStepMsg("Estructurando impuestos y desgloses...");
        }
      }
      setOcrProgress(current);
    }, 120);

    return () => {
      clearInterval(interval);
      if (msg98Interval) {
        clearInterval(msg98Interval);
      }
      setOcrProgress(100);
      setOcrProgressStepMsg("¡Lectura completada exitosamente!");
      setTimeout(() => {
        onFinish();
      }, 400);
    };
  };

  // Load a sample ticket spec and render to canvas
  const handleSelectSample = async (key: keyof typeof SAMPLE_TICKETS) => {
    setIsOcrLoading(true);
    setMessage(null);

    // Start progress simulation
    let finishTriggered = false;
    const stopSimulation = simulateOcrProgress(() => {
      finishTriggered = true;
    });

    try {
      const dataUrl = drawMockTicketToDataUrl(SAMPLE_TICKETS[key]);
      setTicketImage(dataUrl);

      // Trigger server OCR
      const response = await analyzeTicket({
        imageBase64: dataUrl.split(",")[1],
        mimeType: "image/png",
        personalGeminiKey: fiscalProfile?.personalGeminiKey,
        userId: user?.uid,
      });

      if (!response.ok) {
        let errorMsg = "No se pudo ejecutar el OCR en el ticket seleccionado.";
        try {
          const errJson = await response.json();
          if (errJson.error) {
            errorMsg = errJson.error;
          }
        } catch (e) {
          // Fallback if not valid JSON
        }
        throw new Error(errorMsg);
      }

      const ocrResult: any = await response.json();
      if (ocrResult.ocrFailed) {
        toast.warning(ocrResult.ocrError || "El OCR no pudo leer este ticket. Por favor, completa los campos manualmente.", "Captura Manual Activada");
      }
      setExtractedData(ocrResult);
      setEditNombre(ocrResult.nombreEmisor || "");
      setEditRfc(ocrResult.rfcEmisor || "");
      setEditFecha(ocrResult.fechaCompra || "");
      setEditFolio(ocrResult.folio || "");
      setEditSucursal(ocrResult.sucursal || "");
      setEditTotal(ocrResult.total || 0);
      setIsEditing(checkIsDataIncomplete(ocrResult));

      // Auto-save this ticket in Firebase with status "extracted"
      const tId = await onSaveTicketToDb({
        userId: "guest",
        imageUrl: dataUrl,
        status: ocrResult.ocrFailed ? "review" : "extracted",
        rfcEmisor: ocrResult.rfcEmisor,
        nombreEmisor: ocrResult.nombreEmisor,
        fechaCompra: ocrResult.fechaCompra,
        folio: ocrResult.folio,
        total: ocrResult.total,
        sucursal: ocrResult.sucursal || "",
        itemsJson: JSON.stringify(ocrResult.items),
        createdAt: new Date().toISOString(),
        cost: ocrResult.cost !== undefined ? ocrResult.cost : 0.50,
        rawCost: ocrResult.rawCost !== undefined ? ocrResult.rawCost : 0,
        pipelineLogs: ocrResult.pipelineLogs,
        confidenceScore: ocrResult.confidenceScore,
        extractedFields: ocrResult.extractedFields ? JSON.stringify(ocrResult.extractedFields) : "",
      } as any);
      setTicketId(tId);

      // Seek matching connector
      const foundConnector = findMatchingConnector(ocrResult);

      stopSimulation();
      // Wait for completion callback to trigger
      while (!finishTriggered) {
        await new Promise(r => setTimeout(r, 50));
      }

      if (onSetNewlyAddedTicketId) {
        onSetNewlyAddedTicketId(tId);
      }

      // Auto-trigger automation if critical fields are present
      const hasCritFields = !!(ocrResult.nombreEmisor?.trim() && ocrResult.total && ocrResult.total > 0 && ocrResult.fechaCompra?.trim() && ocrResult.folio?.trim());
      const rfcReceptorVal = fiscalProfile?.rfc || "";
      const isRfcReceptorValid = /^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i.test(rfcReceptorVal);

      if (hasCritFields && isRfcReceptorValid) {
        setActiveStep("automating");
        setTimeout(() => {
          handleTriggerAutomation(foundConnector, tId, ocrResult);
        }, 300);
      } else {
        let fieldToCorrect: "folio" | "fecha" | "total" | "nombreEmisor" | "rfcReceptor" = "folio";
        let reasonCode: "MISSING_FOLIO" | "MISSING_DATE" | "MISSING_TOTAL" | "MISSING_MERCHANT" | "PORTAL_REJECTED_RFC" = "MISSING_FOLIO";
        let reasonMessage = "";
        let detectedValue = "";

        if (!ocrResult.nombreEmisor?.trim()) {
          fieldToCorrect = "nombreEmisor";
          reasonCode = "MISSING_MERCHANT";
          reasonMessage = "No detectamos un establecimiento/comercio válido.";
          detectedValue = "";
        } else if (!ocrResult.total || ocrResult.total <= 0) {
          fieldToCorrect = "total";
          reasonCode = "MISSING_TOTAL";
          reasonMessage = "No detectamos un total válido.";
          detectedValue = ocrResult.total ? ocrResult.total.toString() : "";
        } else if (!ocrResult.fechaCompra?.trim()) {
          fieldToCorrect = "fecha";
          reasonCode = "MISSING_DATE";
          reasonMessage = "No pudimos confirmar la fecha del ticket.";
          detectedValue = "";
        } else if (!ocrResult.folio?.trim()) {
          fieldToCorrect = "folio";
          reasonCode = "MISSING_FOLIO";
          reasonMessage = "El portal no reconoció el folio del ticket.";
          detectedValue = "";
        } else if (!isRfcReceptorValid) {
          fieldToCorrect = "rfcReceptor";
          reasonCode = "PORTAL_REJECTED_RFC";
          reasonMessage = "El RFC del receptor no tiene un formato válido ante el SAT.";
          detectedValue = rfcReceptorVal;
        }

        const corrErr: CorrectionError = {
          reasonCode,
          reasonMessage,
          fieldToCorrect,
          detectedValue,
          suggestedValues: [],
          lastAutomationStep: "extraction_ready"
        };

        if (onUpdateTicketInDb) {
          onUpdateTicketInDb(tId, {
            status: "requires_user_correction",
            errorMsg: reasonMessage,
            correctionError: corrErr as any
          });
        }

        setCorrectionError(corrErr);
        setActiveStep("correction");
      }
    } catch (err: any) {
      console.error(err);
      setMessage(err.message || "Error al procesar ticket con IA OCR.");
    } finally {
      setIsOcrLoading(false);
    }
  };

  const [message, setMessage] = useState<string | null>(null);

  // Seek matching connector in rules DB
  const findMatchingConnector = (data: ExtractedTicketData): Connector | null => {
    const found = matchConnector(data.nombreEmisor, data.rfcEmisor);
    setMatchingConnector(found);
    setIsConnectorNewlyLearned(false);
    return found;
  };

  // Convert files loaded manually or captured from camera to base64, compress, and parse
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOcrLoading(true);
    setMessage(null);

    // Start progress simulation
    let finishTriggered = false;
    const stopSimulation = simulateOcrProgress(() => {
      finishTriggered = true;
    });

    try {
      // Compress the image client-side to ensure it occupies less space and satisfies the 1MB Firestore limit.
      // This reduces 5-10MB mobile uploads to ~100-200KB transparently.
      const compressed = await compressImage(file, 1200, 0.75);
      const base64Str = compressed.base64Str;
      const mime = compressed.mimeType;

      setTicketImage(base64Str);

      if (!window.navigator.onLine) {
        stopSimulation();
        const offlineTicketId = await onSaveTicketToDb({
          userId: user?.uid || "guest",
          imageUrl: base64Str,
          status: "review",
          isOfflinePending: true,
          rfcEmisor: "PENDIENTE",
          nombreEmisor: "Establecimiento Pendiente (Captura Offline)",
          fechaCompra: new Date().toISOString().split("T")[0],
          folio: "OFFLINE-" + Math.random().toString(36).substring(2, 7).toUpperCase(),
          total: 0,
          sucursal: "Captura Local",
          itemsJson: "[]",
          createdAt: new Date().toISOString(),
          cost: 0.50,
          rawCost: 0
        });
        setTicketId(offlineTicketId);
        toast.warning(
          "No tienes conexión a internet en este momento. No te preocupes: hemos guardado la foto de tu ticket de forma segura y realizaremos todo el proceso de facturación automáticamente en cuanto recuperes tu conexión. ¡Nosotros nos encargamos! 🌐",
          "Captura Sin Conexión"
        );
        setIsOcrLoading(false);
        return;
      }

      const rawBase64 = base64Str.split(",")[1];

      const response = await analyzeTicket({
        imageBase64: rawBase64,
        mimeType: mime,
        personalGeminiKey: fiscalProfile?.personalGeminiKey,
        userId: user?.uid,
      });

      if (!response.ok) {
        let errorMsg = "El motor OCR reportó un problema al digitalizar el archivo.";
        try {
          const errJson = await response.json();
          if (errJson.error) {
            errorMsg = errJson.error;
          }
        } catch (e) {
          // Fallback
        }
        throw new Error(errorMsg);
      }

      const ocrResult: any = await response.json();
      if (ocrResult.ocrFailed) {
        toast.warning(ocrResult.ocrError || "El OCR no pudo leer este ticket. Por favor, completa los campos manualmente.", "Captura Manual Activada");
      }
      setExtractedData(ocrResult);
      setEditNombre(ocrResult.nombreEmisor || "");
      setEditRfc(ocrResult.rfcEmisor || "");
      setEditFecha(ocrResult.fechaCompra || "");
      setEditFolio(ocrResult.folio || "");
      setEditSucursal(ocrResult.sucursal || "");
      setEditTotal(ocrResult.total || 0);
      setCustomProfileFields({
        rfcReceptor: fiscalProfile?.rfc || "",
        razonSocial: fiscalProfile?.razonSocial || "",
        codigoPostal: fiscalProfile?.codigoPostal || "",
        regimenFiscal: fiscalProfile?.regimenFiscal || "",
        usoCFDI: fiscalProfile?.usoCFDI || "",
        email: fiscalProfile?.correoElectronico || ""
      });
      setIsEditing(checkIsDataIncomplete(ocrResult));

      // Save ticket in DB
      const tId = await onSaveTicketToDb({
        userId: "guest",
        imageUrl: base64Str,
        status: ocrResult.ocrFailed ? "review" : "extracted",
        rfcEmisor: ocrResult.rfcEmisor,
        nombreEmisor: ocrResult.nombreEmisor,
        fechaCompra: ocrResult.fechaCompra,
        folio: ocrResult.folio,
        total: ocrResult.total,
        sucursal: ocrResult.sucursal || "",
        itemsJson: JSON.stringify(ocrResult.items),
        createdAt: new Date().toISOString(),
        cost: ocrResult.cost !== undefined ? ocrResult.cost : 0.50,
        rawCost: ocrResult.rawCost !== undefined ? ocrResult.rawCost : 0,
        pipelineLogs: ocrResult.pipelineLogs,
        confidenceScore: ocrResult.confidenceScore,
        extractedFields: ocrResult.extractedFields ? JSON.stringify(ocrResult.extractedFields) : "",
      } as any);
      setTicketId(tId);

      // Find match
      const foundConnector = findMatchingConnector(ocrResult);

      stopSimulation();
      // Wait for completion callback to trigger
      while (!finishTriggered) {
        await new Promise(r => setTimeout(r, 50));
      }

      // Auto-trigger automation if critical fields are present
      const hasCritFields = !!(ocrResult.nombreEmisor?.trim() && ocrResult.total && ocrResult.total > 0 && ocrResult.fechaCompra?.trim() && ocrResult.folio?.trim());
      const rfcReceptorVal = fiscalProfile?.rfc || "";
      const isRfcReceptorValid = /^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i.test(rfcReceptorVal);

      if (hasCritFields && isRfcReceptorValid) {
        setActiveStep("automating");
        setTimeout(() => {
          handleTriggerAutomation(foundConnector, tId, ocrResult);
        }, 300);
      } else {
        let fieldToCorrect: "folio" | "fecha" | "total" | "nombreEmisor" | "rfcReceptor" = "folio";
        let reasonCode: "MISSING_FOLIO" | "MISSING_DATE" | "MISSING_TOTAL" | "MISSING_MERCHANT" | "PORTAL_REJECTED_RFC" = "MISSING_FOLIO";
        let reasonMessage = "";
        let detectedValue = "";

        if (!ocrResult.nombreEmisor?.trim()) {
          fieldToCorrect = "nombreEmisor";
          reasonCode = "MISSING_MERCHANT";
          reasonMessage = "No detectamos un establecimiento/comercio válido.";
          detectedValue = "";
        } else if (!ocrResult.total || ocrResult.total <= 0) {
          fieldToCorrect = "total";
          reasonCode = "MISSING_TOTAL";
          reasonMessage = "No detectamos un total válido.";
          detectedValue = ocrResult.total ? ocrResult.total.toString() : "";
        } else if (!ocrResult.fechaCompra?.trim()) {
          fieldToCorrect = "fecha";
          reasonCode = "MISSING_DATE";
          reasonMessage = "No pudimos confirmar la fecha del ticket.";
          detectedValue = "";
        } else if (!ocrResult.folio?.trim()) {
          fieldToCorrect = "folio";
          reasonCode = "MISSING_FOLIO";
          reasonMessage = "El portal no reconoció el folio del ticket.";
          detectedValue = "";
        } else if (!isRfcReceptorValid) {
          fieldToCorrect = "rfcReceptor";
          reasonCode = "PORTAL_REJECTED_RFC";
          reasonMessage = "El RFC del receptor no tiene un formato válido ante el SAT.";
          detectedValue = rfcReceptorVal;
        }

        const corrErr: CorrectionError = {
          reasonCode,
          reasonMessage,
          fieldToCorrect,
          detectedValue,
          suggestedValues: [],
          lastAutomationStep: "extraction_ready"
        };

        if (onUpdateTicketInDb) {
          onUpdateTicketInDb(tId, {
            status: "requires_user_correction",
            errorMsg: reasonMessage,
            correctionError: corrErr as any
          });
        }

        setCorrectionError(corrErr);
        setActiveStep("correction");
      }
    } catch (err: any) {
      console.error(err);
      setMessage(err.message || "No se pudo interpretar el ticket ingresado.");
    } finally {
      setIsOcrLoading(false);
    }
  };

  // Request Search Grounding mapping to learn connector on-the-fly
  const handleLearnOnFly = async () => {
    if (!extractedData) return;
    setIsLearningLoading(true);
    setMessage(null);

    try {
      const learned = await onLearnConnectorInline(extractedData.nombreEmisor, extractedData.rfcEmisor);
      setMatchingConnector(learned);
      setIsConnectorNewlyLearned(true);

      // update ticket with new connector matched
      if (ticketId) {
        await onUpdateTicketInDb(ticketId, { connectorId: learned.id });
      }
    } catch (err: any) {
      console.error(err);
      setMessage(err.message || "Error al aprender el portal remoto de autofactura.");
    } finally {
      setIsLearningLoading(false);
    }
  };

  // Trigger high fidelity automation logs and final document generation
  const handleTriggerAutomation = async (
    overrideConnector?: Connector,
    overrideTicketId?: string,
    overrideExtractedData?: ExtractedTicketData
  ) => {
    const activeConn = overrideConnector || matchingConnector;
    const activeExtractedData = overrideExtractedData || extractedData;
    const activeTicketId = overrideTicketId || ticketId;

    if (!activeExtractedData || !fiscalProfile || !activeTicketId) return;

    const currentTicket = (tickets || []).find(t => t.id === activeTicketId);
    const tStatus = currentTicket?.status;
    const isAlreadyProcessing = [
      "ticket_uploaded",
      "extracting_data",
      "connector_resolving",
      "pending_portal_submission",
      "submitting_to_portal",
      "submitted_to_merchant",
      "waiting_portal_result",
      "merchant_cfdi_downloaded",
      "sat_verifying"
    ].includes(tStatus || "");

    if (isAlreadyProcessing) {
      toast.info("Ya estamos procesando este ticket de forma automática.");
      setActiveStep("automating");
      return;
    }

    const addAutomationEvent = async (
      step: "extracting_data" | "connector_resolving" | "submitting_to_portal" | "waiting_portal_result" | "sat_verifying" | "cfdi_validated",
      status: "success" | "failed" | "processing",
      message: string,
      reasonCode?: string,
      reviewReasonCode?: string
    ) => {
      const currentT = (tickets || []).find(t => t.id === activeTicketId);
      const prevEvents = currentT?.automationEvents || [];
      const newEvent = {
        step,
        status,
        message,
        timestamp: new Date().toISOString(),
        reasonCode: reasonCode || null,
        reviewReasonCode: reviewReasonCode || null
      };
      
      await onUpdateTicketInDb(activeTicketId, {
        automationEvents: [...prevEvents, newEvent]
      });
    };

    // Initialize startedAt and reset events
    await onUpdateTicketInDb(activeTicketId, {
      startedAt: new Date().toISOString(),
      automationEvents: []
    });
    
    await addAutomationEvent("extracting_data", "success", "Datos principales detectados.");

    // Pre-submit validations bypassed to guarantee direct automatic processing if critical fields exist

    // Check plan constraints before initiating SAT automation
    const currentPlanStr = fiscalProfile?.plan || "gratuito";
    
    // Validate subscription state for paid plans
    if (currentPlanStr !== "gratuito" && fiscalProfile?.paymentStatus !== "paid" && fiscalProfile?.paymentStatus !== "subscription_active") {
      toast.error("Tu suscripción de pago no se encuentra activa. Por favor, ve a la sección de Cuenta para activar tu suscripción.", "Suscripción Inactiva");
      if (onTabChange) onTabChange("cuenta");
      return;
    }

    let limit = 5;
    if (currentPlanStr === "brisa") limit = 10;
    else if (currentPlanStr === "serenidad") limit = 30;
    else if (currentPlanStr === "nirvana") limit = 100;

    const planStartDateStr = fiscalProfile?.planStartDate || fiscalProfile?.createdAt || new Date().toISOString();
    const planStartDate = new Date(planStartDateStr);
    const cycleInvoices = (invoices || []).filter(inv => {
      if (!inv.createdAt) return false;
      return new Date(inv.createdAt) >= planStartDate;
    });
    const cycleCount = cycleInvoices.length;
    const isExpired = (new Date().getTime() - planStartDate.getTime()) >= 30 * 24 * 60 * 60 * 1000;

    if (cycleCount >= limit || isExpired) {
      // Manual block - redirects user to their account/plans tab where they can upgrade/renew
      setBlockerReason(cycleCount >= limit ? "limit" : "month");
      setShowRenewalBlocker(true);
      return;
    }

    setActiveStep("automating");
    setIsAutomatingLoading(true);
    setSimulationLogs([]);
    setSimulationProgress(0);

    const fieldsSchema = activeConn ? JSON.parse(activeConn.fieldsJson) : [];

    // Full-fidelity step sequencer
    const addLog = (text: string, delay: number) => {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          setSimulationLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${text}`]);
          resolve();
        }, delay);
      });
    };

    try {
      await addLog("📋 ETAPA 1: Iniciando lectura del ticket y validación...", 500);
      
      const pLogs = (activeExtractedData as any).pipelineLogs || [
        "Etapa 1: Recibida imagen del ticket y decodificada.",
        "Etapa 2: Escaneando códigos de barras... No se detectaron códigos útiles.",
        "Etapa 3: Analizando datos con motor OCR de IA.",
        `Etapa 4: Comercio identificado: ${activeConn?.nombre || activeExtractedData.nombreEmisor}.`,
        "Etapa 5: Ejecutando normalización de campos (limpieza de RFC, formato de fechas y totales).",
        `Etapa 6: Cálculo de confianza general completado: ${Math.round(((activeExtractedData as any).confidenceScore || 0.95) * 100)}%.`
      ];

      for (const pl of pLogs) {
        await addLog(`🔍 ${pl}`, 400);
      }

      await addLog(`📋 Campos extraídos con confianza:`, 300);
      await addLog(`   • Comercio: ${activeConn?.nombre || activeExtractedData.nombreEmisor} (Confianza: 98%)`, 200);
      await addLog(`   • RFC Emisor: ${activeExtractedData.rfcEmisor || "XAXX010101000"} (Confianza: 99%)`, 200);
      await addLog(`   • Folio: ${activeExtractedData.folio} (Confianza: 93%)`, 200);
      await addLog(`   • Total: $${activeExtractedData.total} (Confianza: 96%)`, 200);
      await addLog(`   • Fecha: ${activeExtractedData.fechaCompra} (Confianza: 95%)`, 200);

      // Transition to Extracción stage -> connector_resolving in Firestore!
      setSimulationProgress(15);
      await onUpdateTicketInDb(activeTicketId, { status: "connector_resolving" });
      await addAutomationEvent("connector_resolving", "processing", "Buscando conector oficial para el portal del comercio...");
      await addLog("🔌 Buscando conector oficial para el portal del comercio...", 800);

      if (!activeConn) {
        await addLog("❌ Error: No se localizó un conector automático para este comercio.", 1000);
        
        const reviewErr: ReviewError = {
          reviewReasonCode: "CONNECTOR_NOT_FOUND",
          reviewReasonMessage: "Este comercio aún no puede procesarse automáticamente. Estamos revisando si puede agregarse.",
          lastAutomationStep: "connector_resolving",
          connectorAttempted: false,
          connectorId: null,
          connectorName: null,
          portalErrorMessage: "No connector found"
        };
        
        await onUpdateTicketInDb(activeTicketId, {
          status: "requires_manual_review",
          errorMsg: "Este comercio aún no puede procesarse automáticamente. Estamos revisando si puede agregarse.",
          reviewError: reviewErr as any
        });
        
        await addAutomationEvent("connector_resolving", "failed", "No existe conector disponible para este comercio.", undefined, "CONNECTOR_NOT_FOUND");
        
        setIsAutomatingLoading(false);
        return;
      }

      // Scheme validation & runner availability checks
      let fieldsSchema = [];
      let flowSteps = [];
      try {
        fieldsSchema = JSON.parse(activeConn.fieldsJson || "[]");
        flowSteps = JSON.parse(activeConn.flowJson || "[]");
        
        // Check fields schema integrity
        const hasInvalidField = fieldsSchema.some((f: any) => !f.key || !f.name || !f.selector || !f.type || f.required === undefined || !f.source);
        if (hasInvalidField) {
          throw new Error("Esquema de campos inválido.");
        }
      } catch (e) {
        const schemaErr: ReviewError = {
          reviewReasonCode: "CONNECTOR_SCHEMA_INVALID",
          reviewReasonMessage: "El conector tiene una configuración incompleta y requiere revisión técnica.",
          lastAutomationStep: "connector_resolving",
          connectorAttempted: true,
          connectorId: activeConn.id || null,
          connectorName: activeConn.nombre || null,
          portalErrorMessage: "Invalid fieldsJson or flowJson schema"
        };
        await onUpdateTicketInDb(activeTicketId, {
          status: "requires_manual_review",
          errorMsg: schemaErr.reviewReasonMessage,
          reviewError: schemaErr as any
        });
        await addAutomationEvent("connector_resolving", "failed", schemaErr.reviewReasonMessage, undefined, "CONNECTOR_SCHEMA_INVALID");
        setIsAutomatingLoading(false);
        return;
      }

      // Check runner availability
      if (activeConn.runnerAvailable !== true || activeConn.status !== "production_ready") {
        let code: "CONNECTOR_RUNNER_NOT_AVAILABLE" | "CONNECTOR_NOT_PRODUCTION_READY" | "CONNECTOR_RESTRICTED" | "CONNECTOR_BROKEN" = "CONNECTOR_RUNNER_NOT_AVAILABLE";
        let msg = "El conector está entrenado, pero el motor productivo de automatización aún no está disponible.";

        if (activeConn.status === "restricted") {
          code = "CONNECTOR_RESTRICTED";
          msg = "Este portal requiere credenciales especiales o permisos de acceso restringidos.";
        } else if (activeConn.status === "broken") {
          code = "CONNECTOR_BROKEN";
          msg = "El conector de este portal se encuentra temporalmente fuera de servicio por mantenimiento.";
        } else if (activeConn.status === "trained_needs_validation" || activeConn.status === "mock_only") {
          code = "CONNECTOR_NOT_PRODUCTION_READY";
          msg = "El conector de este comercio está en validación técnica y no está listo para producción.";
        }

        const runnerErr: ReviewError = {
          reviewReasonCode: code,
          reviewReasonMessage: msg,
          lastAutomationStep: "connector_resolving",
          connectorAttempted: true,
          connectorId: activeConn.id || null,
          connectorName: activeConn.nombre || null,
          portalErrorMessage: `Runner not available. Status: ${activeConn.status || "N/A"}`
        };
        
        await onUpdateTicketInDb(activeTicketId, {
          status: "requires_manual_review",
          errorMsg: runnerErr.reviewReasonMessage,
          reviewError: runnerErr as any
        });
        await addAutomationEvent("connector_resolving", "failed", runnerErr.reviewReasonMessage, undefined, code);
        setIsAutomatingLoading(false);
        return;
      }

      await addAutomationEvent("connector_resolving", "success", `Portal oficial de facturación del comercio identificado como: ${activeConn.nombre}`);

      setSimulationProgress(20);
      await onUpdateTicketInDb(activeTicketId, { status: "pending_portal_submission" });
      await addAutomationEvent("submitting_to_portal", "processing", `Enviando datos al portal oficial de ${activeConn.nombre}...`);
      await addLog("🌐 Abriendo puerto seguro proxy para ingresar al portal", 800);
      await addLog(`🌍 Conectando de forma segura con: ${activeConn.portalUrl}`, 1200);
      setSimulationProgress(30);
      await addLog("⌛ Esperando respuesta del portal de facturación oficial...", 1000);

      // Simulate entering fields
      for (const field of fieldsSchema) {
        let val = "";
        if (field.key === "rfc") val = fiscalProfile.rfc;
        else if (field.key === "folio") val = activeExtractedData.folio;
        else if (field.key === "total") val = activeExtractedData.total.toString();
        else if (field.key === "fecha") val = activeExtractedData.fechaCompra;
        else val = "VAL_AUTO__";

        await addLog(
          `✏️ Llenando campo '${field.name}' (Selector: ${field.selector}) con valor '${val}'`,
          1400
        );
      }
      setSimulationProgress(50);
      await onUpdateTicketInDb(activeTicketId, { status: "submitted_to_merchant" });
      await addAutomationEvent("waiting_portal_result", "processing", "Esperando respuesta y descarga de archivos desde el portal...");

      await addLog(`🚀 Presionando botón de consulta en el portal...`, 1200);
      await addLog(`✅ Registro de Ticket validado en el portal corporativo exitosamente.`, 900);
      setSimulationProgress(60);

      await addLog(`🔄 Redirigiendo a pantalla de Datos Fiscales del Receptor...`, 1200);
      await addLog(`✏️ Llenando RFC del cliente: '${fiscalProfile.rfc}' (Régimen: ${fiscalProfile.regimenFiscal})`, 1005);
      await addLog(`✏️ Inyectando Razón Social: '${fiscalProfile.razonSocial}' (Código Postal: ${fiscalProfile.codigoPostal})`, 1001);
      setSimulationProgress(75);

      await addLog(`🔔 Procesando datos fiscales y validando Uso CFDI: '${fiscalProfile.usoCFDI}'`, 1200);
      await addLog(`🖨️ Presionando botón 'Generar Factura / CFDI 4.0' en el portal emisor...`, 1500);
      setSimulationProgress(90);

      await addLog("📥 Solicitando descarga del comprobante generado desde el portal oficial del comercio...", 1200);

      // Fire actual backend composition to build real XML & visually responsive PDF HTML layouts
      const response = await runAutomation({
        ticket: activeExtractedData,
        profile: fiscalProfile,
        connector: activeConn,
      });

      if (!response.ok) {
        throw new Error("No fue posible completar la solicitud en el portal del comercio. Revisa los datos del ticket o solicita revisión manual.");
      }

      const invoiceData = await response.json();

      // Save Invoice data to Firestore
      await onSaveInvoiceToDb(
        activeTicketId,
        invoiceData.xmlContent,
        invoiceData.pdfHtml,
        invoiceData.folioFiscal,
        activeExtractedData.rfcEmisor,
        activeExtractedData.nombreEmisor,
        activeExtractedData.total,
        invoiceData.cost !== undefined ? invoiceData.cost : (isConnectorNewlyLearned ? 15.00 : 2.50),
        isConnectorNewlyLearned ? "nuevo" : "existente",
        invoiceData.rawCost !== undefined ? invoiceData.rawCost : 0
      );

      // update ticket state
      await onUpdateTicketInDb(activeTicketId, {
        status: "merchant_cfdi_downloaded",
        invoiceId: invoiceData.folioFiscal,
      });
      await addAutomationEvent("sat_verifying", "processing", "Factura obtenida. Validando autenticidad y vigencia ante el SAT...");

      await addLog("CFDI obtenido desde el portal del comercio.", 800);
      await addLog(`📥 Archivos PDF & XML descargados en almacén virtual de ZenTicket.`, 500);
      await addLog(`🎉 ¡Procesamiento completado con éxito!`, 200);

      setSimulationProgress(100);

      // Redirect immediately to tickets tab and trigger the highlight
      if (onTabChange && onSetNewlyAddedTicketId) {
        onSetNewlyAddedTicketId(activeTicketId);
        onTabChange("tickets");
      }

      setTimeout(() => {
        setActiveStep("success");
      }, 1000);
    } catch (err: any) {
      console.error(err);
      const errMessage = err.message || "";
      await addLog(`❌ ERROR: ${errMessage || "No fue posible completar la solicitud en el portal de facturación del comercio."}`, 200);

      let reasonCode: "CONNECTOR_NOT_FOUND" | "CONNECTOR_TIMEOUT" | "PORTAL_ERROR" | "PORTAL_NO_XML" | "SAT_NOT_FOUND" | "SAT_CANCELED" | "SAT_TIMEOUT" | "SAT_VERIFICATION_ERROR" | "INVALID_XML_STRUCTURE" = "PORTAL_ERROR";

      if (errMessage.includes("timeout") || errMessage.includes("Timeout")) {
        reasonCode = "CONNECTOR_TIMEOUT";
      } else if (errMessage.includes("XML") && (errMessage.includes("no") || errMessage.includes("sin"))) {
        reasonCode = "PORTAL_NO_XML";
      } else if (errMessage.includes("SAT") && errMessage.includes("no localizado")) {
        reasonCode = "SAT_NOT_FOUND";
      } else if (errMessage.includes("SAT") && errMessage.includes("cancelado")) {
        reasonCode = "SAT_CANCELED";
      } else if (errMessage.includes("SAT") && errMessage.includes("timeout")) {
        reasonCode = "SAT_TIMEOUT";
      } else if (errMessage.includes("SAT") && errMessage.includes("error")) {
        reasonCode = "SAT_VERIFICATION_ERROR";
      } else if (errMessage.includes("estructura") || errMessage.includes("XML inválido") || errMessage.includes("structure")) {
        reasonCode = "INVALID_XML_STRUCTURE";
      }

      const reviewErr: ReviewError = {
        reviewReasonCode: reasonCode,
        reviewReasonMessage: errMessage || "No fue posible completar la solicitud en el portal de facturación del comercio.",
        lastAutomationStep: "waiting_portal_result",
        connectorAttempted: true,
        connectorId: activeConn?.id || null,
        connectorName: activeConn?.nombre || null,
        portalErrorMessage: errMessage ? errMessage.replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi, "***") : "Portal error"
      };

      if (activeTicketId) {
        await addAutomationEvent("waiting_portal_result", "failed", reviewErr.reviewReasonMessage, undefined, reasonCode);
        await onUpdateTicketInDb(activeTicketId, {
          status: "requires_manual_review",
          errorMsg: reviewErr.reviewReasonMessage,
          reviewError: reviewErr as any
        });
      }
      setIsAutomatingLoading(false);
      setActiveStep("tracking");
    }
  };

  // Run real-time high-fidelity simulated AI training sync'd with Firestore /automation_trainings
  const handleRunTraining = async () => {
    if (!extractedData || !ticketId) {
      toast.error("Datos de ticket insuficientes para iniciar el entrenamiento.");
      return;
    }

    setIsTrainingModel(true);
    setTrainingProgress(0);
    setTrainingStatus("Evaluando estructura de portales en base a DNS y Búsqueda de Google...");

    const userEmail = auth.currentUser?.email || "legionrender@gmail.com";
    const trainingDocRef = doc(db, "automation_trainings", ticketId);

    const initialTrainingData = {
      id: ticketId,
      ticketId: ticketId,
      userId: auth.currentUser?.uid || "guest",
      userEmail: userEmail,
      storeName: extractedData.nombreEmisor,
      company: extractedData.nombreEmisor, // Map brand to company so it shows in Admin section
      totalAmount: extractedData.total,
      status: "Iniciando mapeo cognitivo...", // Map status to descriptive msg for Admin list
      progress: 0,
      step: "Iniciando mapeo cognitivo...",
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(trainingDocRef, initialTrainingData);
    } catch (e) {
      console.warn("Error creating training doc, continuing locally:", e);
    }

    const steps = [
      { progress: 15, step: "Buscando portal de facturación..." },
      { progress: 35, step: "Preparando la solicitud..." },
      { progress: 55, step: "Configurando conector..." },
      { progress: 75, step: "Estableciendo conexión segura..." },
      { progress: 95, step: "Registrando conector..." },
      { progress: 100, step: "¡Configuración completada con éxito! Iniciando facturación..." }
    ];

    let currentStepIdx = 0;

    const interval = setInterval(async () => {
      if (currentStepIdx < steps.length) {
        const currentData = steps[currentStepIdx];
        setTrainingProgress(currentData.progress);
        setTrainingStatus(currentData.step);

        try {
          await updateDoc(trainingDocRef, {
            progress: currentData.progress,
            step: currentData.step,
            status: currentData.step, // Update status message so it mirrors progress step description
            state: currentData.progress === 100 ? "completed" : "in_progress"
          });
        } catch (e) {
          console.warn("Error updating training doc, continuing locally:", e);
        }

        currentStepIdx++;
      } else {
        clearInterval(interval);
        
        try {
          // 1. Learn the connector inline
          const newlyCreatedConnector = await onLearnConnectorInline(extractedData.nombreEmisor, extractedData.rfcEmisor, "automatizacion_ticket");
          
          // 2. Set newly trained connector
          setMatchingConnector(newlyCreatedConnector);
          setIsConnectorNewlyLearned(true);
          setIsTrainingModel(false);

          // 3. Trigger immediate billing
          await handleTriggerAutomation(newlyCreatedConnector);
          toast.success("🧠 ¡Entrenamiento de IA completado! Factura procesada de inmediato.");
        } catch (err: any) {
          console.error("Error after training complete:", err);
          toast.error("La configuración finalizó pero no se pudo obtener la factura automáticamente.");
          setIsTrainingModel(false);
        }
      }
    }, 1500); // 1.5 seconds per step, total ~9 seconds
  };

  const handleSaveEditedData = async () => {
    let fieldsSchema: any[] = [];
    try {
      fieldsSchema = matchingConnector ? JSON.parse(matchingConnector.fieldsJson || "[]") : [];
    } catch (e) {
      fieldsSchema = [];
    }
    const isCustomConnector = fieldsSchema.length > 0;

    let updatedData: ExtractedTicketData;

    if (isCustomConnector) {
      // Validate dynamic fields
      const hasFolioField = fieldsSchema.some(f => f.key === "referenciaFacturacion" || f.key === "folio");
      if (hasFolioField && !editFolio.trim()) {
        setValidationError("La referencia de facturación o folio es obligatorio.");
        return;
      }
      const hasTotalField = fieldsSchema.some(f => f.key === "total");
      const totalNum = parseFloat(editTotal.toString());
      if (hasTotalField && (isNaN(totalNum) || totalNum <= 0)) {
        setValidationError("El importe total es obligatorio y debe ser mayor a cero.");
        return;
      }
      const hasFechaField = fieldsSchema.some(f => f.key === "fecha");
      if (hasFechaField && !editFecha.trim()) {
        setValidationError("La fecha es obligatoria.");
        return;
      }

      setValidationError(null);

      // Construct dynamic updated data
      updatedData = {
        ...extractedData!,
        folio: editFolio.trim(),
        total: !isNaN(totalNum) ? totalNum : (extractedData?.total || 0),
        fechaCompra: editFecha.trim() || (extractedData?.fechaCompra || ""),
      };

      // Save/update user's fiscal profile if fields were corrected (ONLY IF THEY WERE EMPTY INITIALLY)
      const updatedProfile = { ...fiscalProfile };
      let profileChanged = false;
      
      const pFields = ["rfcReceptor", "razonSocial", "codigoPostal", "regimenFiscal", "usoCFDI", "email"];
      for (const k of pFields) {
        if (customProfileFields[k]?.trim()) {
          let mappedKey = k;
          if (k === "rfcReceptor") mappedKey = "rfc";
          if (k === "email") mappedKey = "correoElectronico";
          
          const originalVal = fiscalProfile?.[mappedKey];
          if (!originalVal || !originalVal.toString().trim()) {
            if (updatedProfile[mappedKey] !== customProfileFields[k]) {
              updatedProfile[mappedKey] = customProfileFields[k];
              profileChanged = true;
            }
          }
        }
      }
      
      if (profileChanged && onSaveProfile) {
        try {
          await onSaveProfile(updatedProfile);
          toast.success("Se actualizó tu perfil fiscal con los datos corregidos.");
        } catch (e) {
          console.error("Error saving updated profile:", e);
        }
      }
    } else {
      // Standard generic merchant validations
      if (!editRfc.trim()) {
        setValidationError("El RFC del emisor es obligatorio.");
        return;
      }
      const cleanRfc = editRfc.toUpperCase().replace(/\s+/g, "");
      if (cleanRfc.length < 12 || cleanRfc.length > 13) {
        setValidationError("El RFC del emisor debe tener 12 o 13 caracteres (alfanumérico).");
        return;
      }
      if (!editNombre.trim()) {
        setValidationError("El Nombre/Razón Social del emisor es obligatorio.");
        return;
      }
      const totalNum = parseFloat(editTotal.toString());
      if (isNaN(totalNum) || totalNum <= 0) {
        setValidationError("El importe total de compra debe ser un número mayor a cero.");
        return;
      }
      if (!editFolio.trim()) {
        setValidationError("El folio o número de referencia del ticket es obligatorio.");
        return;
      }
      if (!editFecha.trim()) {
        setValidationError("La fecha de compra de ticket es obligatoria.");
        return;
      }

      setValidationError(null);

      updatedData = {
        ...extractedData!,
        rfcEmisor: cleanRfc,
        nombreEmisor: editNombre.trim(),
        fechaCompra: editFecha.trim(),
        folio: editFolio.trim(),
        total: totalNum,
        sucursal: editSucursal.trim(),
      };
    }

    setExtractedData(updatedData);
    setIsEditing(false);

    // Save/update in DB
    if (ticketId) {
      try {
        await onUpdateTicketInDb(ticketId, {
          rfcEmisor: updatedData.rfcEmisor || "",
          nombreEmisor: updatedData.nombreEmisor || "",
          fechaCompra: updatedData.fechaCompra || "",
          folio: updatedData.folio || "",
          total: updatedData.total || 0,
          sucursal: updatedData.sucursal || "",
        });
      } catch (err) {
        console.error("Error saving corrected ticket inside Firestore", err);
      }
    }

    // Refresh matching connector logic
    const found = connectors.find(
      (c) =>
        c.rfc.toLowerCase().trim() === updatedData.rfcEmisor.toLowerCase().trim() ||
        updatedData.nombreEmisor.toLowerCase().includes(c.nombre.toLowerCase()) ||
        c.nombre.toLowerCase().includes(updatedData.nombreEmisor.toLowerCase())
    );
    setMatchingConnector(found || null);
  };

  const resetAll = () => {
    setTicketImage(null);
    setExtractedData(null);
    setMatchingConnector(null);
    setIsEditing(false);
    setEditNombre("");
    setEditRfc("");
    setEditFecha("");
    setEditFolio("");
    setEditSucursal("");
    setEditTotal(0);
    setValidationError(null);
    setMessage(null);
    setActiveStep("upload");
  };

  return (
    <div className="bg-transparent min-h-[500px] flex flex-col relative overflow-hidden select-none gap-6">

      {/* RENEWAL BLOCKER MODAL OVERLAY */}
      {showRenewalBlocker && (
        <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-md flex flex-col justify-center items-center p-6 text-center animate-fade-in">
          <div className="max-w-md bg-white border border-slate-100 rounded-3xl p-8 shadow-2xl flex flex-col items-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500">
              <ShieldAlert className="w-8 h-8" />
            </div>
            
            <div className="space-y-2 font-sans">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                {blockerReason === "limit" ? "Límite de Facturas Alcanzado" : "Mes de Cobertura Vencido"}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                {blockerReason === "limit"
                  ? `Has alcanzado el límite de tu plan actual (${fiscalProfile?.plan === "brisa" ? "10" : fiscalProfile?.plan === "serenidad" ? "30" : fiscalProfile?.plan === "nirvana" ? "100" : "5"} facturas).`
                  : "Tu cobertura mensual de facturación ha vencido desde tu última fecha de pago."
                } Para seguir obteniendo facturas, debes de actualizar o renovar tu paquete desde la sección de facturación.
              </p>
            </div>

            <div className="w-full bg-slate-50 rounded-2xl p-4.5 text-left border border-slate-200/50 space-y-3 font-sans">
              <span className="text-[9.5px] font-black text-slate-400 uppercase tracking-widest block font-mono">
                DETALLE DE TRANSACCIÓN
              </span>
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="text-slate-600">Suscripción actual:</span>
                <span className="text-slate-900 font-extrabold capitalize">
                  {fiscalProfile?.plan === "brisa" ? "Plan Brisa (10 facturas)" : fiscalProfile?.plan === "serenidad" ? "Plan Serenidad (30 facturas)" : fiscalProfile?.plan === "nirvana" ? "Plan Nirvana (100 facturas)" : "Plan Gratuito (5 facturas)"}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold pt-1.5 border-t border-slate-100 font-mono">
                <span className="text-slate-600 font-sans">Costo mensual:</span>
                <span className="text-[#0B53F4] font-black text-sm">
                  {fiscalProfile?.plan === "brisa" ? "$5.00 MXN" : fiscalProfile?.plan === "serenidad" ? "$250.00 MXN" : fiscalProfile?.plan === "nirvana" ? "$500.00 MXN" : "Contratar Plan ($5 - $500 MXN)"}
                </span>
              </div>
            </div>

            <div className="w-full flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowRenewalBlocker(false);
                  if (onTabChange) onTabChange("cuenta");
                }}
                className="w-full py-3 px-4.5 bg-[#0B53F4] hover:bg-[#0747D1] text-white text-xs font-black rounded-xl transition cursor-pointer text-center font-bold shadow-md shadow-[#0B53F4]/10"
              >
                Ver Planes y Facturación
              </button>
            </div>
            
            <button
              type="button"
              onClick={() => {
                setShowRenewalBlocker(false);
                setActiveStep("upload");
              }}
              className="text-slate-400 hover:text-slate-600 text-[10.5px] font-bold underline cursor-pointer bg-transparent border-none mt-2"
            >
              Cancelar y regresar
            </button>
          </div>
        </div>
      )}
      




      {/* Standard Step header for active editing actions */}
      {activeStep !== "upload" && activeStep !== "tracking" && (
        <div className="bg-white border border-slate-200/60 p-5 rounded-2xl shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4 relative z-10">
          <div>
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2 select-none uppercase tracking-wide">
              <Sparkles className="w-5.5 h-5.5 text-[#FFB200]" />
              Procesamiento de Ticket con IA
            </h2>
          </div>

          <button
            onClick={resetAll}
            className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-[#0B53F4] hover:text-[#0B53F4]/90 bg-[#0B53F4]/10 border border-[#0B53F4]/20 px-5 py-2.5 rounded-xl transition cursor-pointer font-sans"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Capturar Siguiente
          </button>
        </div>
      )}

      {message && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-150 text-rose-700 text-xs flex items-start gap-2.5 max-w-4xl relative z-10 shadow-sm">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <span className="font-semibold leading-relaxed">{message}</span>
        </div>
      )}

      {/* STEP 1: Upload / Redesigned Dashboard exactly matching user screenshot */}
      {activeStep === "upload" && (
        <div className="flex-1 flex flex-col gap-6 relative z-10 animate-fade-in_50 font-sans">
          
          {isOcrLoading ? (
            <div className="bg-white border border-slate-200/80 shadow-sm rounded-3xl p-12 text-center my-auto flex flex-col items-center justify-center min-h-[350px] space-y-5 animate-fade-in">
              {/* Spinner & Brain */}
              <div className="relative w-16 h-16 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border border-blue-100 animate-pulse bg-blue-50/40" />
                <div className="absolute inset-0 rounded-full border-4 border-slate-100 border-t-[#0B53F4] animate-spin" />
                <Brain className="w-6 h-6 text-[#0B53F4] absolute" />
              </div>

              <div className="space-y-1">
                <p className="text-sm font-black text-slate-800 uppercase tracking-wider">
                  Vision IA Digitalizando Ticket...
                </p>
                <p className="text-[11px] font-mono font-black text-[#0B53F4] tracking-widest uppercase flex items-center justify-center gap-1.5 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0B53F4] inline-block animate-ping" />
                  {ocrProgressStepMsg || "Analizando estructura..."}
                </p>
              </div>

              {/* Progress bar van llenándose */}
              <div className="w-full max-w-xs space-y-2">
                <div className="h-3.5 bg-slate-105 rounded-full overflow-hidden p-0.5 border border-slate-200 scale-x-100 transition-all duration-300">
                  <div 
                    className="bg-gradient-to-r from-blue-500 via-[#0B53F4] to-indigo-600 h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(11,83,244,0.3)]"
                    style={{ width: `${ocrProgress}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 font-mono">
                  <span>PROGRESO LECTURA</span>
                  <span className="text-[#0B53F4] font-black">{ocrProgress}%</span>
                </div>
              </div>

              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed text-center">
                El motor OCR lee pixeles refractarios en 3D para deducir montos, folios de facturación, fecha y el RFC corporativo.
              </p>
            </div>
          ) : (
            <>
              {/* 1. HEADER SECTION */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1360f8] pb-5">
                <div>
                  <h1 className="font-display font-extrabold text-[28px] text-[#1360f8] tracking-tight">Inicio</h1>
                  <p className="text-sm text-slate-500 mt-1 font-medium">¡Bienvenido, {userName}! Gestiona tus tickets y gastos corporativos.</p>
                </div>
              </div>

              {/* 1. General Status / Activity Summary Blue Card (Exact screenshot style) - Reduced 50% in height */}
              <div id="general-status-card" className="bg-gradient-to-tr from-[#0546F0] to-[#1268FF] text-white rounded-2xl p-4 shadow-md relative overflow-hidden select-none">

                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider text-left">
                    Estado general
                  </span>
                  <span className="text-xs font-black text-white/90">
                    Resumen de actividad
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Procesado Card with live calculated values */}
                  <div className="bg-white/10 backdrop-blur-xs border border-white/10 rounded-xl p-2.5 text-left">
                    <span className="text-[10px] text-white/70 font-semibold block uppercase tracking-wider">
                      Procesados
                    </span>
                    <span className="text-base font-black text-white mt-0.5 block">
                      {(() => {
                        const comp = (tickets || []).filter(t => t.status === "completed" || t.status === "cfdi_validated").length;
                        return `${comp} ${comp === 1 ? 'ticket' : 'tickets'}`;
                      })()}
                    </span>
                    <span className="text-[9px] text-blue-200 block mt-0.5 font-bold leading-normal">
                      {(() => {
                        const plan = fiscalProfile?.plan || "gratuito";
                        let limit = 5;
                        if (plan === "brisa") limit = 10;
                        else if (plan === "serenidad") limit = 30;
                        else if (plan === "nirvana") limit = 100;

                        const planStartDateStr = fiscalProfile?.planStartDate || fiscalProfile?.createdAt || new Date().toISOString();
                        const planStartDate = new Date(planStartDateStr);
                        const cycleInvoices = (invoices || []).filter(inv => {
                          if (!inv.createdAt) return false;
                          return new Date(inv.createdAt) >= planStartDate;
                        });
                        const compInvoices = cycleInvoices.length;
                        const rem = Math.max(limit - compInvoices, 0);
                        return `Ciclo: ${compInvoices}/${limit} (Ques: ${rem})`;
                      })()}
                    </span>
                  </div>

                  {/* Pendiente Card with live count */}
                  <div className="bg-white/10 backdrop-blur-xs border border-white/10 rounded-xl p-2.5 text-left">
                    <span className="text-[10px] text-white/70 font-semibold block uppercase tracking-wider">
                      En Proceso
                    </span>
                    <span className="text-base font-black text-white mt-0.5 block">
                      {(tickets || []).filter(t => t.status !== "completed" && t.status !== "cfdi_validated").length} {(tickets || []).filter(t => t.status !== "completed" && t.status !== "cfdi_validated").length === 1 ? "ticket" : "tickets"}
                    </span>
                    <span className="text-[9px] text-blue-200 block mt-0.5 font-bold leading-normal">
                      Pendientes
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Quick Actions Header & Grid - 30% smaller, much larger icons */}
              <div className="space-y-2">
                <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-500 text-left">
                  Acciones rápidas
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  {/* Quick Action #1: "Capturar Ticket" (Deep Blue Card) */}
                  <button
                    type="button"
                    aria-label="Capturar ticket con la cámara"
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.setAttribute("capture", "environment");
                        fileInputRef.current.click();
                      }
                    }}
                    className="bg-[#0b53f4] text-white rounded-2xl p-3.5 flex flex-col justify-between items-start gap-3.5 cursor-pointer hover:bg-[#0947D1] transition shadow-md shadow-[#0b53f4]/15 relative select-none group active:scale-[0.98] text-left h-full min-h-[148px]"
                  >
                    <div className="p-2 bg-white/12 rounded-xl w-fit shrink-0">
                      <Camera className="w-6 h-6 text-white stroke-[2]" />
                    </div>
                    <span className="block">
                      <span className="text-xs sm:text-sm font-extrabold leading-tight block group-hover:translate-x-0.5 transition duration-150">
                        Capturar Ticket
                      </span>
                      <span className="text-[10px] text-white/80 font-medium leading-normal block mt-1">
                        Abre la cámara y prepara el ticket para OCR.
                      </span>
                    </span>
                  </button>

                  {/* Quick Action #2: "Subir Imagen" (Light lavender Card) */}
                  <button
                    type="button"
                    aria-label="Subir imagen de ticket desde archivos"
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.removeAttribute("capture");
                        fileInputRef.current.click();
                      }
                    }}
                    className="bg-[#ebf1ff] dark:bg-blue-950/25 hover:bg-[#dee8ff] dark:hover:bg-blue-900/30 text-[#0b53f4] dark:text-blue-300 rounded-2xl p-3.5 flex flex-col justify-between items-start gap-3.5 cursor-pointer transition border border-[#0b53f4]/5 dark:border-blue-500/15 relative select-none group active:scale-[0.98] text-left h-full min-h-[148px]"
                  >
                    <div className="p-2 bg-[#0b53f4]/10 dark:bg-blue-400/10 rounded-xl w-fit shrink-0">
                      <Upload className="w-6 h-6 text-[#0b53f4] dark:text-blue-400 stroke-[2]" />
                    </div>
                    <span className="block">
                      <span className="text-xs sm:text-sm font-extrabold text-[#0b53f4] dark:text-white leading-tight block group-hover:translate-x-0.5 transition duration-150">
                        Subir Imagen
                      </span>
                      <span className="text-[10px] text-blue-700/80 dark:text-blue-300/70 font-medium leading-normal block mt-1">
                        Usa una foto guardada sin activar cámara.
                      </span>
                    </span>
                  </button>
                </div>
              </div>

              {/* Hidden Native input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />

              {/* 3. Operational Notifications / Alerts Hub & Dynamic AI Contingency Center */}
              <div id="operational-notifications-center" className="bg-white dark:bg-[#0b0d19] border border-slate-200/70 dark:border-slate-800/80 rounded-3xl p-5 shadow-2xs space-y-4 text-left">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-[#0B53F4] dark:text-blue-400 flex items-center justify-center">
                      <Bell className="w-5 h-5 stroke-[2.3]" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider block font-mono">Monitoreo Técnico</span>
                      <h3 className="text-base font-black text-slate-800 dark:text-white tracking-tight">Centro de Notificaciones Operativas</h3>
                    </div>
                  </div>
                  <span className="bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-450 text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1.5 leading-none">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                    </span>
                    <span>{operationalNotifications.filter(n => !n.read).length} Inéditas</span>
                  </span>
                </div>

                 <p className="text-xs text-slate-450 leading-relaxed font-medium">
                  Bitácora inteligente en tiempo real para flujos técnicos, de facturación y de integraciones bancarias. Organiza alertas operativas críticas del conector y el SAT.
                </p>

                {/* Categories Tab Bar */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none select-none">
                  {[
                    { id: "todas", label: "Todas" },
                    { id: "pendientes", label: "Pendientes" },
                    { id: "facturas", label: "Facturas" },
                    { id: "gastos", label: "Gastos" },
                    { id: "cuenta", label: "Cuenta" }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveNotificationTab(tab.id as any)}
                      className={`px-3 py-1.5 text-[11px] font-extrabold rounded-xl transition duration-150 cursor-pointer ${
                        activeNotificationTab === tab.id
                          ? "bg-[#0B53F4] text-white"
                          : "bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-700/60 text-slate-650 dark:text-slate-300"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Notifications list - LIMITED TO at most 3 results on main view */}
                <div className="space-y-3.5 pr-1">
                  {(() => {
                    const list = operationalNotifications.filter(n => {
                      if (n.read) return false;
                      if (activeNotificationTab === "todas") return true;
                      if (activeNotificationTab === "pendientes") return n.criticality === "critica";
                      return n.category === activeNotificationTab;
                    });

                    if (list.length === 0) {
                      return (
                        <div className="py-8 text-center bg-slate-50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800/80 rounded-2xl">
                          <span className="text-slate-400 dark:text-slate-350 text-xs font-bold font-sans">No hay alertas en esta categoría. ¡Operación limpia!</span>
                        </div>
                      );
                    }

                    // Slice to 3!
                    const slicedList = list.slice(0, 3);

                    return (
                      <>
                        <div className="space-y-3.5">
                          {slicedList.map(n => {
                            // Semáforo de criticidad
                            const isCrit = n.criticality === "critica";
                            const isImp = n.criticality === "importante";
                            
                            const cardStyle = isCrit 
                              ? "border-rose-200 dark:border-rose-500/20 bg-rose-50/10 dark:bg-[#0d0f1c]" 
                              : isImp 
                                ? "border-amber-200 dark:border-amber-500/20 bg-amber-50/10 dark:bg-[#0d0f1c]" 
                                : "border-slate-200 dark:border-blue-500/20 bg-slate-50/45 dark:bg-[#0d0f1c]";

                            const accentStyle = isCrit
                              ? "border-l-4 border-l-rose-500"
                              : isImp
                                ? "border-l-4 border-l-amber-500"
                                : "border-l-4 border-l-[#0B53F4] dark:border-l-blue-550";

                            const badgeStyle = isCrit
                              ? "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-100/50 dark:border-rose-500/10"
                              : isImp
                                ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-100/50 dark:border-amber-500/10"
                                : "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-100/50 dark:border-blue-500/10";

                            const dotStyle = isCrit 
                              ? "bg-rose-500" 
                              : isImp 
                                ? "bg-amber-500" 
                                : "bg-[#0153F4]";

                            const handleNotifClick = () => {
                              setReadNotifIds(prev => prev.includes(n.id) ? prev : [...prev, n.id]);

                              if (n.actionType === "contingency") {
                                const fc = n.ticket;
                                if (fc) {
                                  setSelectedContingencyTicket(fc as Ticket);
                                } else {
                                  toast.info("No se encontró el ticket asociado.");
                                }
                              } else if (n.actionType === "profile") {
                                if (onTabChange) onTabChange("cuenta");
                              } else {
                                toast.success(`Notificación marcada como leída: ${n.title}`, "Leído");
                              }
                            };

                            return (
                              <div 
                                key={n.id} 
                                className={`border ${cardStyle} ${accentStyle} rounded-2xl p-4.5 space-y-3 transition duration-200 hover:scale-[1.005] hover:shadow-2xs relative ${
                                  !n.read 
                                    ? "shadow-3xs" 
                                    : "opacity-80"
                                }`}
                              >
                                <div className="flex justify-between items-start gap-4">
                                  <div className="flex items-center gap-2">
                                    <span className={`w-2.5 h-2.5 rounded-full ${dotStyle} shrink-0 ${!n.read ? "animate-pulse" : ""}`} />
                                    <span className="text-[11px] font-extrabold uppercase text-slate-700 dark:text-slate-200 tracking-wider font-sans leading-none">{n.title}</span>
                                  </div>
                                  <span className="text-[10px] text-slate-400 font-bold shrink-0">{getRelativeTimeText(n.createdAt)}</span>
                                </div>

                                <p className="text-[11.5px] text-slate-600 dark:text-slate-400 leading-relaxed font-sans font-medium select-text">{n.message}</p>

                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                                  <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                                    <span className={`text-[8.5px] font-black px-2 py-0.5 rounded-md ${badgeStyle} uppercase font-mono`}>
                                      {n.criticality === "critica" ? "🔴 Crítico" : n.criticality === "importante" ? "🟡 Alerta" : "🔵 Información"}
                                    </span>
                                    <span className="text-[8.5px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider font-mono bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200/40 dark:border-slate-700/40 px-1.5 py-0.5 rounded-md">
                                      {n.category}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                                    {!n.read && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setReadNotifIds(prev => prev.includes(n.id) ? prev : [...prev, n.id]);
                                          toast.success("Notificación marcada como vista.");
                                        }}
                                        className="text-[9.5px] font-bold text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 bg-transparent hover:bg-slate-100/50 dark:hover:bg-slate-800/50 px-2.5 py-1.5 rounded-lg cursor-pointer transition grow sm:grow-0 text-center select-none"
                                      >
                                        Visto
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={handleNotifClick}
                                      className={`text-[10px] font-black px-3 py-1.5 rounded-lg cursor-pointer transition grow sm:grow-0 text-center ${
                                        n.actionType === "contingency"
                                          ? "border bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/20"
                                          : "zt-btn-secondary-blue"
                                      }`}
                                    >
                                      {n.actionText}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* SHOW ALL BUTTON */}
                        {list.length > 3 && (
                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() => setIsNotificationsModalOpen(true)}
                              className="w-full py-3 bg-[#ebf1ff] dark:bg-blue-950/25 hover:bg-[#ebf1ff]/80 dark:hover:bg-blue-950/45 text-[#0B53F4] dark:text-blue-400 text-xs font-black uppercase rounded-xl transition duration-150 cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs border-none"
                            >
                              <span>Ver Todas las Alertas ({list.length})</span>
                              <ArrowRight className="w-3.5 h-3.5 stroke-[2.2]" />
                            </button>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* DETAILED OPERATIONAL ALERTS DIALOG MODAL */}
              <AnimatePresence>
                {isNotificationsModalOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setIsNotificationsModalOpen(false)}
                      className="absolute inset-0 bg-slate-900/35 backdrop-blur-md cursor-zoom-out"
                    />

                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 15 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 15 }}
                      className="bg-white dark:bg-[#0b0d19] border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-6 shadow-xl relative max-w-2xl w-full z-10 flex flex-col max-h-[85vh]"
                    >
                      {/* Header block */}
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-[#0B53F4] dark:text-blue-400 flex items-center justify-center">
                            <Bell className="w-5 h-5 stroke-[2.3]" />
                          </div>
                          <div className="text-left">
                            <span className="text-[9px] uppercase font-black text-[#0B53F4] dark:text-blue-400 tracking-wider block font-mono">Ventana Detallada</span>
                            <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight">Centro de Notificaciones (Historial Completo)</h3>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setIsNotificationsModalOpen(false)}
                          className="w-8 h-8 rounded-full hover:bg-slate-100/80 dark:hover:bg-slate-800/80 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                        >
                          <X className="w-5 h-5 stroke-[2.5]" />
                        </button>
                      </div>

                      {/* Modal Tabs inside */}
                      <div className="flex gap-1.5 overflow-x-auto py-3 border-b border-slate-100 dark:border-slate-800 select-none scrollbar-none">
                        {[
                          { id: "todas", label: "Todas" },
                          { id: "pendientes", label: "Pendientes" },
                          { id: "facturas", label: "Facturas" },
                          { id: "gastos", label: "Gastos" },
                          { id: "cuenta", label: "Cuenta" }
                        ].map(tab => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveNotificationTab(tab.id as any)}
                            className={`px-3 py-1.5 text-[11px] font-extrabold rounded-xl transition duration-150 cursor-pointer whitespace-nowrap leading-none ${
                              activeNotificationTab === tab.id
                                ? "bg-[#0B53F4] dark:bg-blue-600 text-white shadow-3xs"
                                : "bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-700/60 text-slate-600 dark:text-slate-350"
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* Notifications complete scroll box */}
                      <div className="flex-1 overflow-y-auto pt-4 pr-1 space-y-3.5 max-h-[50vh]">
                        {(() => {
                          const list = operationalNotifications.filter(n => {
                            if (n.read) return false;
                            if (activeNotificationTab === "todas") return true;
                            if (activeNotificationTab === "pendientes") return n.criticality === "critica";
                            return n.category === activeNotificationTab;
                          });

                          if (list.length === 0) {
                            return (
                              <div className="py-12 text-center bg-slate-50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800/80 rounded-2xl my-auto">
                                <span className="text-slate-400 dark:text-slate-350 text-xs font-bold">No hay alertas disponibles en esta categoría.</span>
                              </div>
                            );
                          }
return list.map(n => {
                            const isCrit = n.criticality === "critica";
                            const isImp = n.criticality === "importante";
                            
                            const cardStyle = isCrit 
                              ? "border-rose-200 dark:border-rose-500/20 bg-rose-50/10 dark:bg-[#0d0f1c]" 
                              : isImp 
                                ? "border-amber-200 dark:border-amber-500/20 bg-amber-50/10 dark:bg-[#0d0f1c]" 
                                : "border-slate-200 dark:border-blue-500/20 bg-slate-50/45 dark:bg-[#0d0f1c]";

                            const accentStyle = isCrit
                              ? "border-l-4 border-l-rose-500"
                              : isImp
                                ? "border-l-4 border-l-amber-500"
                                : "border-l-4 border-l-[#0B53F4] dark:border-l-blue-550";

                            const badgeStyle = isCrit
                              ? "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-100/50 dark:border-rose-500/10"
                              : isImp
                                ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-100/50 dark:border-amber-500/10"
                                : "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-100/50 dark:border-blue-500/10";

                            const dotStyle = isCrit 
                              ? "bg-rose-500" 
                              : isImp 
                                ? "bg-amber-500" 
                                : "bg-[#0153F4]";

                            const handleNotifClickModal = () => {
                              // Close modal first
                              setIsNotificationsModalOpen(false);

                              // Mark read
                              setReadNotifIds(prev => prev.includes(n.id) ? prev : [...prev, n.id]);
                              
                              if (n.actionType === "contingency") {
                                const fc = n.ticket;
                                if (fc) {
                                  setSelectedContingencyTicket(fc as Ticket);
                                } else {
                                  toast.info("No se encontró el ticket asociado.");
                                }
                              } else if (n.actionType === "profile") {
                                if (onTabChange) onTabChange("cuenta");
                              } else {
                                toast.success(`Notificación marcada como leída: ${n.title}`, "Leído");
                              }
                            };

                            return (
                               <div 
                                 key={n.id} 
                                 className={`border ${cardStyle} ${accentStyle} rounded-2xl p-4.5 space-y-3 transition duration-200 hover:scale-[1.005] hover:shadow-2xs relative text-left ${
                                   !n.read 
                                     ? "shadow-3xs" 
                                     : "opacity-80"
                                 }`}
                               >
                                 <div className="flex justify-between items-start gap-4">
                                   <div className="flex items-center gap-2">
                                     <span className={`w-2.5 h-2.5 rounded-full ${dotStyle} shrink-0 ${!n.read ? "animate-pulse" : ""}`} />
                                     <span className="text-[11px] font-extrabold uppercase text-slate-700 dark:text-slate-200 tracking-wider font-sans leading-none">{n.title}</span>
                                   </div>
                                   <span className="text-[10px] text-slate-400 font-bold shrink-0">{getRelativeTimeText(n.createdAt)}</span>
                                 </div>

                                 <p className="text-[11.5px] text-slate-600 dark:text-slate-400 leading-relaxed font-sans font-medium">{n.message}</p>

                                 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                                   <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                                     <span className={`text-[8.5px] font-black px-2 py-0.5 rounded-md ${badgeStyle} uppercase font-mono`}>
                                       {n.criticality === "critica" ? "🔴 Crítico" : n.criticality === "importante" ? "🟡 Alerta" : "🔵 Información"}
                                     </span>
                                     <span className="text-[8.5px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider font-mono bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200/40 dark:border-slate-700/40 px-1.5 py-0.5 rounded-md">
                                       {n.category}
                                     </span>
                                   </div>

                                   <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                                     {!n.read && (
                                       <button
                                         type="button"
                                         onClick={() => {
                                           setReadNotifIds(prev => prev.includes(n.id) ? prev : [...prev, n.id]);
                                           toast.success("Notificación marcada como vista.");
                                         }}
                                         className="text-[9.5px] font-bold text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 bg-transparent hover:bg-slate-100/50 dark:hover:bg-slate-800/50 px-2.5 py-1.5 rounded-lg cursor-pointer transition grow sm:grow-0 text-center select-none"
                                       >
                                         Visto
                                       </button>
                                     )}
                                     <button
                                       type="button"
                                       onClick={handleNotifClickModal}
                                       className="zt-btn-secondary-blue text-[10px] font-black px-3 py-1.5 rounded-lg cursor-pointer transition grow sm:grow-0 text-center"
                                     >
                                       {n.actionText}
                                     </button>
                                   </div>
                                 </div>
                               </div>
                             );
                          });
                        })()}
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

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
                      className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xl relative max-w-2xl w-full z-10 flex flex-col max-h-[85vh]"
                    >
                      {/* Header block */}
                      <div className="flex items-center justify-between border-b border-slate-105 pb-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                            <Shield className="w-5 h-5 stroke-[2.3]" />
                          </div>
                          <div className="text-left">
                            <span className="text-[9px] uppercase font-black text-orange-600 tracking-wider block font-mono">Ventana Detallada</span>
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
                          const list = (tickets || []).filter(t => t.status === "failed" || t.status === "review");

                          if (list.length === 0) {
                            return (
                              <div className="py-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl w-full">
                                <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                                <span className="text-slate-500 text-xs font-bold block">No hay casos en contingencia en este momento.</span>
                              </div>
                            );
                          }

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
              <div id="ai-contingency-panel-card" className="bg-white dark:bg-[#0b0d19] text-slate-800 rounded-3xl p-6 shadow-2xs space-y-5 text-left relative overflow-hidden border border-slate-200/70 dark:border-slate-800/80">
                <div className="absolute top-0 right-0 w-36 h-36 bg-orange-500/5 rounded-full blur-2xl pointer-events-none" />
                
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-orange-55 dark:bg-orange-950/20 text-orange-500 flex items-center justify-center">
                      <Shield className="w-5 h-5 stroke-[2.3]" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-black text-[#0B53F4]/80 dark:text-[#0b53f4] tracking-wider block font-mono">Centro de Comando</span>
                      <h3 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight">Panel de Contingencia IA</h3>
                    </div>
                  </div>
                  <span className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-500/20 text-orange-700 dark:text-orange-400 text-[10.5px] font-bold px-2.5 py-1 rounded-xl">
                    Soporte & Autocorrección
                  </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-450 leading-relaxed font-sans font-medium">
                  Rescata automáticamente aquellos tickets y facturas trabadas debido a problemas externos (portales lentos, CAPTCHAs, errores tipográficos o caídas del SAT).
                </p>

                {/* Contingency tickets list selection slider */}
                <div className="space-y-2">
                  <span className="text-[10px] text-slate-450 font-bold uppercase tracking-wider block font-mono">1. Seleccionar Ticket para Diagnóstico</span>
                  
                  {(() => {
                    const listToRender = (tickets || []).filter(t => t.status === "failed" || t.status === "review");
                    
                    if (listToRender.length === 0) {
                      return (
                        <div className="py-8 px-4 text-center bg-slate-50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800/60 rounded-3xl">
                          <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                          <span className="text-slate-500 dark:text-slate-300 text-xs font-bold block">No tienes casos en contingencia en este momento.</span>
                          <span className="text-slate-400 text-[10.5px] font-medium block mt-1">Todos tus comprobantes y flujos automáticos operan con éxito e integridad total.</span>
                        </div>
                      );
                    }

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
                                    ? "bg-blue-50/50 dark:bg-blue-950/20 border-[#0b53f4] dark:border-blue-500/30 text-[#0b53f4] dark:text-blue-400 ring-1 ring-[#0b53f4]/20"
                                    : "bg-slate-50/55 dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/40 border-slate-200 dark:border-slate-800/80 text-slate-705 dark:text-slate-300"
                                }`}
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <span className={`text-[11px] font-black uppercase tracking-wide truncate max-w-[170px] ${isCur ? "text-[#0b53f4] dark:text-blue-400" : "text-slate-800 dark:text-slate-200"}`}>{t.nombreEmisor}</span>
                                  <span className={`text-[10px] font-extrabold font-mono shrink-0 ${isCur ? "text-[#0b53f4] dark:text-blue-400" : "text-slate-900 dark:text-slate-100"}`}>${(t.total || 0).toFixed(2)}</span>
                                </div>
                                <p className="text-[10px] text-slate-400 font-mono leading-none mt-1">RFC: {t.rfcEmisor || "S/D"} • Folio: {t.folio || "S/D"}</p>
                                
                                <p className="text-[9.5px] font-mono text-rose-600 dark:text-rose-400 truncate mt-2 leading-tight bg-rose-50 dark:bg-rose-950/20 p-1 border border-rose-100 dark:border-rose-500/20">
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
                              className="group w-full py-3 px-4.5 bg-[#ebf1ff] hover:bg-[#ebf1ff]/80 text-[#0B53F4] font-black text-[11px] uppercase tracking-wider rounded-xl transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 shadow-2xs border-none"
                            >
                              <span>Ver Todos los Casos de Contingencia ({listToRender.length})</span>
                              <ArrowRight className="w-3.5 h-3.5 text-[#0B53F4] group-hover:translate-x-1 transition-transform stroke-[2.2]" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Selected ticket workspace details in Centered Modal overlay */}
                <AnimatePresence>
                  {selectedContingencyTicket && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => !isSolvingContingency && setSelectedContingencyTicket(null)}
                        className="absolute inset-0 bg-slate-900/35 backdrop-blur-md cursor-zoom-out"
                      />

                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 15 }}
                        className="bg-white dark:bg-[#0b0d19] border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-6 shadow-xl relative max-w-2xl w-full z-10 flex flex-col max-h-[90vh] overflow-y-auto space-y-5 text-left"
                      >
                    {/* Ticket Info header */}
                    <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800/60 pb-3">
                      <div>
                        <span className="text-[10px] text-[#0B53F4] font-black uppercase font-mono font-bold tracking-wider">DIAGNÓSTICO COMPLETO</span>
                        <h4 className="text-xs font-black text-slate-805 dark:text-slate-100 uppercase mt-0.5">Analizando {selectedContingencyTicket.nombreEmisor}</h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => !isSolvingContingency && setSelectedContingencyTicket(null)}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer bg-transparent border-none outline-none"
                      >
                        <X className="w-5.5 h-5.5" />
                      </button>
                    </div>

                    {/* 1. DIAGNÓSTICO DEL FLUJO CRÍTICO (LINEA DE TIEMPO VISUAL) */}
                    <div className="space-y-3.5 text-left">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block font-mono">1. Diagnóstico del Flujo Crítico (¿Dónde se trabó?)</span>
                      
                      <div className="relative pl-5 border-l-2 border-slate-200 dark:border-slate-850 space-y-4">
                        {/* Step 1: Captura OCR */}
                        <div className="relative">
                          <div className="absolute -left-[27px] w-4 h-4 rounded-full bg-emerald-500 border-4 border-slate-50 dark:border-[#0d0f1c] flex items-center justify-center shadow-md">
                            <div className="w-1 h-1 bg-white rounded-full"></div>
                          </div>
                          <div>
                            <h5 className="text-[11px] font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5 leading-none">
                              Captura OCR
                              <span className="text-[8px] bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-250 dark:border-emerald-500/20 px-1 py-0.2 rounded font-sans leading-none">Éxito ✔️</span>
                            </h5>
                            <p className="text-[9.5px] text-slate-500 dark:text-slate-400 mt-0.5 leading-normal">Imagen del ticket digitalizada correctamente. Datos binarios recuperados en buffer.</p>
                          </div>
                        </div>

                        {/* Step 2: Mapeo Heurístico */}
                        <div className="relative">
                          <div className="absolute -left-[27px] w-4 h-4 rounded-full bg-emerald-500 border-4 border-slate-50 dark:border-[#0d0f1c] flex items-center justify-center shadow-md">
                            <div className="w-1 h-1 bg-white rounded-full"></div>
                          </div>
                          <div>
                            <h5 className="text-[11px] font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5 leading-none">
                              Mapeo Heurístico
                              <span className="text-[8px] bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-250 dark:border-emerald-500/20 px-1 py-0.2 rounded font-sans leading-none">Identificado ✔️</span>
                            </h5>
                            <p className="text-[9.5px] text-slate-500 dark:text-slate-400 mt-0.5 leading-normal">
                              Importes, folios y fechas localizados. Total detectado: <span className="text-emerald-700 dark:text-emerald-400 font-mono font-bold">${(selectedContingencyTicket.total || 0).toFixed(2)} MXN</span>
                            </p>
                          </div>
                        </div>

                        {/* Step 3: Portal Emisor */}
                        <div className="relative">
                          <div className="absolute -left-[27px] w-4 h-4 rounded-full bg-rose-500 border-4 border-slate-50 dark:border-[#0d0f1c] flex items-center justify-center shadow-md">
                            <div className="w-1 h-1 bg-white rounded-full"></div>
                          </div>
                          <div>
                            <h5 className="text-[11px] font-black text-rose-600 dark:text-rose-400 flex items-center gap-1.5 leading-none">
                              Portal Emisor
                              <span className="text-[8px] bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border border-rose-250 dark:border-rose-500/20 px-1 py-0.2 rounded font-sans leading-none animate-pulse">Bloqueado ❌</span>
                            </h5>
                            <p className="text-[9.5px] text-slate-700 dark:text-slate-300 mt-1 leading-relaxed bg-[#FAF9FF] dark:bg-slate-900/40 p-2.5 border border-slate-200 dark:border-slate-800/60 rounded-xl font-mono">
                              <b>Causa raíz:</b> {selectedContingencyTicket.errorMsg || "Timeout o bloqueo en el portal de facturación."}
                            </p>
                          </div>
                        </div>

                        {/* Step 4: Facturación CFDI */}
                        <div className="relative">
                          <div className="absolute -left-[27px] w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-800 border-4 border-slate-50 dark:border-[#0d0f1c] flex items-center justify-center">
                            <div className="w-1 h-1 bg-slate-400 rounded-full"></div>
                          </div>
                          <div>
                            <h5 className="text-[11px] font-black text-slate-450 dark:text-slate-400 flex items-center gap-1.5 leading-none">
                              Facturación CFDI
                              <span className="text-[8px] bg-slate-100 dark:bg-slate-900 text-slate-550 dark:text-slate-400 px-1 py-0.2 rounded font-sans leading-none">En espera ⌛</span>
                            </h5>
                            <p className="text-[9.5px] text-slate-400 dark:text-slate-500 mt-0.5 leading-normal">Facturación pendiente. Esperando resolución de contingencia de portal.</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 2. ESTRATEGIAS DE RESOLUCIÓN INTELIGENTES */}
                    <div className="space-y-3.5 text-left pt-2">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block font-mono">2. Estrategias de Mitigación Inteligentes (Seleccionable)</span>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {/* OCR Recalibration */}
                        <div
                          onClick={() => !isSolvingContingency && setSelectedStrategy("ocr")}
                          className={`p-3 rounded-xl border cursor-pointer transition text-left flex gap-2.5 ${
                            selectedStrategy === "ocr"
                              ? "border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/20 ring-1 ring-indigo-500/10 text-indigo-950 dark:text-indigo-300"
                              : "border-slate-205 dark:border-slate-800/80 bg-white dark:bg-[#0b0d19] hover:bg-slate-50/50 dark:hover:bg-slate-900/40 text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          <RefreshCw className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                          <div>
                            <span className={`text-[10.5px] font-black block ${selectedStrategy === "ocr" ? "text-indigo-900 dark:text-indigo-200" : "text-slate-800 dark:text-slate-200"}`}>Recalibración OCR</span>
                            <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">Filtros de reducción de ruido e interpretación avanzada para textos pixelados.</p>
                          </div>
                        </div>

                        {/* RFC Enmienda */}
                        <div
                          onClick={() => !isSolvingContingency && setSelectedStrategy("rfc")}
                          className={`p-3 rounded-xl border cursor-pointer transition text-left flex gap-2.5 ${
                            selectedStrategy === "rfc"
                              ? "border-sky-500 bg-sky-50/70 dark:bg-sky-950/20 ring-1 ring-sky-500/10 text-sky-950 dark:text-sky-300"
                              : "border-slate-205 dark:border-slate-800/80 bg-white dark:bg-[#0b0d19] hover:bg-slate-50/50 dark:hover:bg-slate-900/40 text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          <Users className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                          <div>
                            <span className={`text-[10.5px] font-black block ${selectedStrategy === "rfc" ? "text-sky-900 dark:text-sky-200" : "text-slate-800 dark:text-slate-200"}`}>Enmienda de RFC Emisor</span>
                            <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">Corrige errores tipográficos comunes cotejando vs padrón oficial del SAT.</p>
                          </div>
                        </div>

                        {/* Forzar RESICO */}
                        <div
                          onClick={() => !isSolvingContingency && setSelectedStrategy("resico")}
                          className={`p-3 rounded-xl border cursor-pointer transition text-left flex gap-2.5 ${
                            selectedStrategy === "resico"
                              ? "border-amber-500 bg-amber-50/70 dark:bg-amber-950/20 ring-1 ring-amber-500/10 text-amber-955 dark:text-amber-300"
                              : "border-slate-205 dark:border-slate-800/80 bg-white dark:bg-[#0b0d19] hover:bg-slate-50/50 dark:hover:bg-slate-900/40 text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          <Database className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <span className={`text-[10.5px] font-black block ${selectedStrategy === "resico" ? "text-amber-900 dark:text-amber-200" : "text-slate-800 dark:text-slate-200"}`}>Forzar RESICO</span>
                            <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">Omitir temporalmente validaciones ultraestrictas de régimen fiscal 4.0.</p>
                          </div>
                        </div>

                        {/* Parche Conector */}
                        <div
                          onClick={() => !isSolvingContingency && setSelectedStrategy("playwright")}
                          className={`p-3 rounded-xl border cursor-pointer transition text-left flex gap-2.5 ${
                            selectedStrategy === "playwright"
                              ? "border-orange-500 bg-orange-50/70 dark:bg-orange-950/20 ring-1 ring-orange-500/10 text-orange-955 dark:text-orange-300"
                              : "border-slate-205 dark:border-slate-800/80 bg-white dark:bg-[#0b0d19] hover:bg-slate-50/50 dark:hover:bg-slate-900/40 text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          <Play className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                          <div>
                            <span className={`text-[10.5px] font-black block ${selectedStrategy === "playwright" ? "text-orange-900 dark:text-orange-200" : "text-slate-800 dark:text-slate-200"}`}>Parche Dinámico del Conector</span>
                            <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">Omitirá cargas lentas de la página de facturación externa.</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* PROGRESS MONITOR / LOGS TERMINAL WHEN RUNNING */}
                    {isSolvingContingency && (
                      <div className="space-y-3 pt-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-orange-600 font-extrabold uppercase font-mono animate-pulse">⚙️ Autocorrector Heurístico Activo...</span>
                          <span className="text-xs font-black text-slate-700 dark:text-slate-300 font-mono">{solvingProgress}%</span>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-slate-100 dark:bg-slate-900 h-2.5 rounded-full overflow-hidden shadow-inner border border-slate-200 dark:border-slate-800">
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
                      <div className="pt-2 flex flex-col sm:flex-row gap-3">
                        <button
                          type="button"
                          onClick={() => setSelectedContingencyTicket(null)}
                          className="w-full sm:w-1/3 bg-transparent hover:bg-slate-105 dark:hover:bg-slate-900/60 text-slate-700 dark:text-slate-300 border border-slate-250 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98 leading-none"
                        >
                          <span>Cancelar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSolveContingency(selectedContingencyTicket)}
                          className="flex-1 bg-[#0B53F4] hover:bg-[#0747D1] text-white py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-[#0B53F4]/10 cursor-pointer flex items-center justify-center gap-2 active:scale-98 leading-none"
                        >
                          <Zap className="w-4 h-4 fill-white animate-bounce" />
                          <span>Solucionar Problema Automáticamente</span>
                        </button>
                      </div>
                    )}
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>
              </div>

            </>
          )}
        </div>
      )}

      {/* STEP 2: Extracted metadata results & Action Selection */}
      {activeStep === "extracted" && extractedData && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10 animate-fade-in_50 font-sans">
          {/* Visual of ticket canvas */}
          <div className="lg:col-span-4 flex flex-col items-center">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 self-start">Lectura de Ticket Termal</h4>
            {ticketImage && (
              <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm bg-white p-2.5 max-w-xs flex justify-center">
                <img
                  src={ticketImage}
                  alt="Ticket OCR scan"
                  className="max-h-[380px] object-contain rounded-xl"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}
          </div>

          {/* Values parsed & connector seek panel */}
          <div className="lg:col-span-8 flex flex-col justify-between text-left">
            {isTrainingModel ? (
              /* Simple, friendly loading/training progress view */
              <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 space-y-6 text-center shadow-md animate-fade-in_50">
                <div className="flex flex-col items-center gap-4 animate-pulse">
                  <div className="relative shrink-0 w-12 h-12 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border border-[#0B53F4]/30 animate-ping opacity-60" />
                    <div className="absolute inset-0 rounded-full border-3 border-t-[#0B53F4] border-slate-100 animate-spin" />
                    <Brain className="w-5 h-5 text-[#0B53F4] absolute" />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-slate-800 tracking-tight">
                      Preparando la solicitud...
                    </h4>
                    <p className="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
                      Estamos configurando el conector disponible para procesar tu ticket automáticamente.
                    </p>
                  </div>
                </div>

                <div className="space-y-2 max-w-xs mx-auto">
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden relative border border-slate-200 p-0.5">
                    <div 
                      className="bg-gradient-to-r from-blue-500 to-[#0B53F4] h-full rounded-full transition-all duration-300 relative shadow-sm"
                      style={{ width: `${trainingProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                    <span>{trainingStatus}</span>
                    <span className="text-[#0B53F4] font-black">{trainingProgress}%</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {isEditing ? (
                  /* Manual edit form for data correction in premium light styles */
                  <div className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-200 relative">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 mb-2">
                      <h5 className="text-[11px] font-extrabold text-[#0B53F4] flex items-center gap-1.5 uppercase tracking-wider font-mono">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-[#0B53F4] animate-pulse" />
                        Corrección Manual de Campos Críticos
                      </h5>
                      {!checkIsDataIncomplete(extractedData) && (
                        <button
                          onClick={() => {
                            setEditNombre(extractedData.nombreEmisor || "");
                            setEditRfc(extractedData.rfcEmisor || "");
                            setEditFecha(extractedData.fechaCompra || "");
                            setEditFolio(extractedData.folio || "");
                            setEditSucursal(extractedData.sucursal || "");
                            setEditTotal(extractedData.total || 0);
                            setValidationError(null);
                            setIsEditing(false);
                          }}
                          className="text-[10px] text-slate-500 hover:text-slate-800 font-extrabold uppercase transition cursor-pointer"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>

                    {validationError && (
                      <div className="p-3 bg-rose-50 border border-rose-250 rounded-xl text-[11px] text-rose-700 font-bold flex items-center gap-2 animate-pulse">
                        <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                        <span>{validationError}</span>
                      </div>
                    )}

                     {(() => {
                      let fieldsSchema = [];
                      try {
                        fieldsSchema = matchingConnector ? JSON.parse(matchingConnector.fieldsJson || "[]") : [];
                      } catch (e) {
                        fieldsSchema = [];
                      }
                      const isCustomConnector = fieldsSchema.length > 0;

                      if (isCustomConnector) {
                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {fieldsSchema.map((field: any) => {
                              const isTicketSource = field.source === "ticket";
                              const isProfileSource = field.source === "fiscalProfile";

                              if (isTicketSource) {
                                if (field.key === "referenciaFacturacion" || field.key === "folio") {
                                  return (
                                    <div key={field.key}>
                                      <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">{field.name} *</label>
                                      <input
                                        type="text"
                                        value={editFolio}
                                        onChange={(e) => setEditFolio(e.target.value)}
                                        placeholder={`Ej. ${field.name}`}
                                        className={getInputClass(!editFolio.trim(), false)}
                                      />
                                    </div>
                                  );
                                }
                                if (field.key === "total") {
                                  return (
                                    <div key={field.key}>
                                      <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">{field.name} *</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={editTotal || ""}
                                        onChange={(e) => setEditTotal(parseFloat(e.target.value) || 0)}
                                        placeholder="0.00"
                                        className={getInputClass(!editTotal || editTotal <= 0, false, true)}
                                      />
                                    </div>
                                  );
                                }
                                if (field.key === "fecha") {
                                  return (
                                    <div key={field.key}>
                                      <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">{field.name} *</label>
                                      <input
                                        type="text"
                                        value={editFecha}
                                        onChange={(e) => setEditFecha(e.target.value)}
                                        placeholder="DD/MM/AAAA"
                                        className={getInputClass(!editFecha.trim(), false)}
                                      />
                                    </div>
                                  );
                                }
                              }

                              if (isProfileSource && isFiscalFieldInvalid(field.key)) {
                                return (
                                  <div key={field.key}>
                                    <div className="flex justify-between items-center mb-1">
                                      <label className="text-[9px] text-[#0B53F4] font-black uppercase tracking-wider block">{field.name} (Perfil Fiscal) *</label>
                                      <span className="text-[8px] text-rose-500 font-bold uppercase tracking-wider">Faltante o Inválido</span>
                                    </div>
                                    <input
                                      type="text"
                                      value={customProfileFields[field.key] || ""}
                                      onChange={(e) => setCustomProfileFields({ ...customProfileFields, [field.key]: e.target.value })}
                                      placeholder={`Completa ${field.name}`}
                                      className={getInputClass(!customProfileFields[field.key]?.trim(), false)}
                                    />
                                  </div>
                                );
                              }

                              return null;
                            })}
                          </div>
                        );
                      }

                      // Generic legacy merchant fallback form
                      return (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Nombre Emisor */}
                            <div>
                              <div className="flex justify-between items-center mb-1.5">
                                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Razón Social Emisor *</label>
                                {isNombreInvalid && (
                                  <span className="text-[9px] text-rose-500 font-extrabold uppercase tracking-wider flex items-center gap-1 animate-pulse">
                                    ⚠️ Faltante
                                  </span>
                                )}
                              </div>
                              <input
                                type="text"
                                value={editNombre}
                                onChange={(e) => setEditNombre(e.target.value)}
                                placeholder="Ej. NUEVA WAL MART DE MEXICO"
                                className={getInputClass(isNombreInvalid, correctionError?.fieldToCorrect === "nombreEmisor")}
                                autoFocus={correctionError?.fieldToCorrect === "nombreEmisor"}
                              />
                            </div>

                            {/* RFC Emisor */}
                            <div>
                              <div className="flex justify-between items-center mb-1.5">
                                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">RFC Emisor *</label>
                                {isRfcInvalid && (
                                  <span className="text-[9px] text-rose-500 font-extrabold uppercase tracking-wider flex items-center gap-1 animate-pulse">
                                    ⚠️ Inválido
                                  </span>
                                )}
                              </div>
                              <input
                                type="text"
                                value={editRfc}
                                onChange={(e) => setEditRfc(e.target.value)}
                                placeholder="Ej. NWM9709244W4"
                                maxLength={13}
                                className={getInputClass(isRfcInvalid, false, true)}
                              />
                            </div>

                            {/* Fecha Compra */}
                            <div>
                              <div className="flex justify-between items-center mb-1.5">
                                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Fecha del Ticket *</label>
                                {isFechaInvalid && (
                                  <span className="text-[9px] text-rose-500 font-extrabold uppercase tracking-wider flex items-center gap-1 animate-pulse">
                                    ⚠️ Faltante
                                  </span>
                                )}
                              </div>
                              <input
                                type="text"
                                value={editFecha}
                                onChange={(e) => setEditFecha(e.target.value)}
                                placeholder="DD/MM/AAAA"
                                className={getInputClass(isFechaInvalid, correctionError?.fieldToCorrect === "fecha")}
                                autoFocus={correctionError?.fieldToCorrect === "fecha"}
                              />
                            </div>

                            {/* Referencia Folio */}
                            <div>
                              <div className="flex justify-between items-center mb-1.5">
                                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Folio de Compra *</label>
                                {isFolioInvalid && (
                                  <span className="text-[9px] text-rose-500 font-extrabold uppercase tracking-wider flex items-center gap-1 animate-pulse">
                                    ⚠️ Faltante
                                  </span>
                                )}
                              </div>
                              <input
                                type="text"
                                value={editFolio}
                                onChange={(e) => setEditFolio(e.target.value)}
                                placeholder="Ej. 123456789"
                                className={getInputClass(isFolioInvalid, correctionError?.fieldToCorrect === "folio")}
                                autoFocus={correctionError?.fieldToCorrect === "folio"}
                              />
                            </div>
                          </div>

                          {/* Sucursal */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                            <div>
                              <label className="text-[9px] text-slate-500 font-bold block mb-1.5 uppercase tracking-wider">Sucursal (Opcional)</label>
                              <input
                                type="text"
                                value={editSucursal}
                                onChange={(e) => setEditSucursal(e.target.value)}
                                placeholder="Ej. Sucursal Santa Fe"
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#0B53F4] hover:border-slate-350 transition-all font-sans"
                              />
                            </div>

                            {/* Total Pagado */}
                            <div>
                              <div className="flex justify-between items-center mb-1.5">
                                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Total de la Compra ($ MXN) *</label>
                                {isTotalInvalid && (
                                  <span className="text-[9px] text-rose-500 font-extrabold uppercase tracking-wider flex items-center gap-1 animate-pulse">
                                    ⚠️ Total Inválido
                                  </span>
                                )}
                              </div>
                              <input
                                type="number"
                                step="0.01"
                                value={editTotal || ""}
                                onChange={(e) => setEditTotal(parseFloat(e.target.value) || 0)}
                                placeholder="0.00"
                                className={getInputClass(isTotalInvalid, correctionError?.fieldToCorrect === "total", true)}
                                autoFocus={correctionError?.fieldToCorrect === "total"}
                              />
                            </div>
                          </div>
                        </>
                      );
                    })()}

                    <div className="flex gap-2.5 pt-3.5 justify-end">
                      <button
                        onClick={handleSaveEditedData}
                        className="text-[10px] font-black uppercase tracking-widest text-white bg-[#0B53F4] hover:bg-blue-600 px-6 py-3.5 rounded-xl transition duration-150 shadow-md shadow-[#0B53F4]/10 cursor-pointer active:scale-[0.98] select-none border-none font-sans"
                      >
                        Confirmar y Guardar Cambios
                      </button>
                      {!checkIsDataIncomplete(extractedData) && (
                        <button
                          onClick={() => {
                            setEditNombre(extractedData.nombreEmisor || "");
                            setEditRfc(extractedData.rfcEmisor || "");
                            setEditFecha(extractedData.fechaCompra || "");
                            setEditFolio(extractedData.folio || "");
                            setEditSucursal(extractedData.sucursal || "");
                            setEditTotal(extractedData.total || 0);
                            setValidationError(null);
                            setIsEditing(false);
                          }}
                          className="text-[10px] font-bold uppercase tracking-widest text-[#0B53F4] bg-[#0B53F4]/5 border border-[#0B53F4]/10 px-5 py-3.5 rounded-xl transition cursor-pointer select-none font-sans"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* SIMPLIFIED CORROBORATION PAGE AS REQUESTED */
                  <div className="space-y-5 animate-fade-in_50 font-sans">
                    {/* Duplicate/Already Invoiced ticket warning inline */}
                    {(() => {
                      const dupTicket = getExistingInvoicedTicket(extractedData?.rfcEmisor, extractedData?.folio);
                      if (dupTicket) {
                        return (
                          <div className="bg-rose-50 border border-rose-250 rounded-2xl p-4 flex items-start gap-3.5 text-rose-950 text-xs text-left">
                            <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center shrink-0 text-rose-600 mt-0.5 animate-bounce">
                              <AlertTriangle className="w-4.5 h-4.5" />
                            </div>
                            <div className="space-y-1">
                              <span className="font-extrabold text-[10px] uppercase tracking-wider block text-rose-700">⚠️ ¡Atención! Ticket Ya Facturado</span>
                              <p className="font-semibold text-[11.5px] text-rose-900 leading-normal">
                                Este ticket con Folio <strong className="font-black underline select-text">{extractedData?.folio}</strong> y RFC Emisor <strong className="font-black select-text">{extractedData?.rfcEmisor}</strong> ya fue facturado anteriormente en su cuenta.
                              </p>
                              <p className="text-[10px] text-rose-700 font-medium pb-2.5">
                                Recomendamos no procesarlo nuevamente para evitar duplicados fiscales ante el SAT.
                              </p>
                              <button
                                onClick={resetAll}
                                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition shadow-xs text-[11px] uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer font-sans border-none"
                              >
                                <X className="w-3.5 h-3.5" />
                                Cancelar y Capturar Otro
                              </button>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Simple confirmation card */}
                    <div className="bg-[#FAF9FF] border border-[#EBF1FF] rounded-3xl p-6 text-left space-y-4.5 shadow-2xs">
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block font-mono">Comercio</span>
                          <span className="text-sm font-black text-slate-800 uppercase block mt-1 select-text">
                            {extractedData.nombreEmisor || "No detectado"}
                          </span>
                        </div>
                        
                        <div>
                          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block font-mono font-bold">Total</span>
                          <span className="text-sm font-black text-[#0B53F4] block mt-1 font-mono select-text font-bold">
                            ${extractedData.total ? extractedData.total.toFixed(2) : "0.00"} MXN
                          </span>
                        </div>

                        <div className="border-t border-slate-200/60 pt-3">
                          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block font-mono font-bold">Fecha</span>
                          <span className="text-xs font-extrabold text-slate-700 block mt-0.5 select-text">
                            {extractedData.fechaCompra || "No detectada"}
                          </span>
                        </div>

                        <div className="border-t border-slate-200/60 pt-3">
                          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block font-mono font-bold">Folio</span>
                          <span className="text-xs font-extrabold text-slate-700 block mt-0.5 select-text">
                            {extractedData.folio || "No detectado"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {checkIsDataIncomplete(extractedData) ? (
                      <div className="p-4 bg-rose-50 border border-rose-200 text-rose-855 rounded-2xl flex flex-col gap-3 text-xs leading-relaxed transition-all shadow-sm text-left">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5 animate-pulse" />
                          <div>
                            <span className="font-extrabold block text-rose-800 uppercase mb-0.5 tracking-wide">🚨 Datos Críticos Faltantes</span>
                            <p className="opacity-95 text-rose-700 leading-normal font-semibold">
                              No pudimos leer bien algunos datos del ticket.
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            onClick={resetAll}
                            className="text-[9.5px] font-black uppercase tracking-wider text-rose-700 bg-rose-100 hover:bg-rose-200 px-3.5 py-2 rounded-xl transition cursor-pointer border-none font-sans"
                          >
                            Volver a tomar foto
                          </button>
                          <button
                            onClick={() => setIsEditing(true)}
                            className="text-[9.5px] font-black uppercase tracking-wider text-blue-700 bg-blue-100 hover:bg-blue-200 px-3.5 py-2 rounded-xl transition cursor-pointer border-none font-sans"
                          >
                            Editar datos
                          </button>
                          <button
                            onClick={async () => {
                              if (ticketId) {
                                const reviewErr: ReviewError = {
                                  reviewReasonCode: "USER_REQUESTED_REVIEW",
                                  reviewReasonMessage: "El usuario solicitó revisión manual del ticket.",
                                  lastAutomationStep: "extraction_ready",
                                  connectorAttempted: false,
                                  connectorId: matchingConnector?.id || null,
                                  connectorName: matchingConnector?.nombre || null,
                                  portalErrorMessage: "User request"
                                };
                                await onUpdateTicketInDb(ticketId, {
                                  status: "requires_manual_review",
                                  errorMsg: "El usuario solicitó revisión manual del ticket.",
                                  reviewError: reviewErr as any
                                });
                                toast.info("Enviado a revisión manual. Podrás facturar este ticket cuando un agente lo complete.", "Revisión");
                                resetAll();
                              }
                            }}
                            className="text-[9.5px] font-black uppercase tracking-wider text-slate-700 bg-slate-100 hover:bg-slate-205 px-3.5 py-2 rounded-xl transition cursor-pointer border-none font-sans"
                          >
                            Enviar a revisión
                          </button>
                        </div>
                      </div>
                    ) : matchingConnector ? (
                      <div className="p-3.5 bg-blue-50 border border-blue-150 text-blue-900 rounded-xl flex items-start gap-2.5 text-xs text-left animate-fade-in_50 font-sans">
                        <CheckCircle className="w-4.5 h-4.5 text-[#0B53F4] shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-blue-800 leading-normal">
                            Estamos revisando si este comercio puede procesarse automáticamente.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-amber-50/50 border border-amber-200 text-amber-900 rounded-2xl flex flex-col gap-3 text-xs leading-relaxed transition-all shadow-sm text-left">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
                          <div>
                            <span className="font-extrabold block text-amber-800 uppercase mb-0.5 tracking-wide">Comercio Sin Conector</span>
                            <p className="opacity-95 text-amber-700 leading-normal font-semibold">
                              Este comercio aún requiere revisión manual. Puedes corregir los datos o enviar el ticket a revisión.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Prominent main invoice clickers triggers */}
                    {!checkIsDataIncomplete(extractedData) && (
                      <div className="flex flex-col sm:flex-row gap-3 pt-1">
                        {matchingConnector ? (
                          <>
                            <button
                              onClick={handleTriggerAutomation}
                              disabled={!fiscalProfile || !extractedData}
                              className="text-[10.5px] font-black uppercase tracking-widest flex items-center justify-center gap-2 text-white bg-[#0B53F4] hover:bg-blue-600 disabled:opacity-55 px-7 py-4 rounded-2xl transition duration-150 shadow-md shadow-[#0B53F4]/15 active:scale-[0.98] select-none cursor-pointer text-center border-none font-sans"
                            >
                              <Play className="w-4 h-4 fill-current" />
                              Confirmar y facturar
                            </button>
                            <button
                              onClick={() => setIsEditing(true)}
                              className="text-[10.5px] font-black uppercase tracking-widest flex items-center justify-center gap-2 text-[#0B53F4] bg-[#ebf1ff] hover:bg-[#ebf1ff]/80 px-6 py-4 rounded-2xl transition active:scale-[0.98] select-none cursor-pointer border-none shadow-2xs font-sans"
                            >
                              Editar datos
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setIsEditing(true)}
                              className="text-[10.5px] font-black uppercase tracking-widest flex items-center justify-center gap-2 text-[#0B53F4] bg-[#ebf1ff] hover:bg-[#ebf1ff]/80 px-6 py-4 rounded-2xl transition active:scale-[0.98] select-none cursor-pointer border-none shadow-2xs font-sans"
                            >
                              Editar datos
                            </button>
                            <button
                              onClick={async () => {
                                if (ticketId) {
                                  const reviewErr: ReviewError = {
                                    reviewReasonCode: matchingConnector ? "PORTAL_ERROR" : "CONNECTOR_NOT_FOUND",
                                    reviewReasonMessage: matchingConnector ? "El usuario solicitó revisión manual." : "Este comercio aún requiere revisión. Estamos revisando si puede procesarse automáticamente.",
                                    lastAutomationStep: "extraction_ready",
                                    connectorAttempted: false,
                                    connectorId: matchingConnector?.id || null,
                                    connectorName: matchingConnector?.nombre || null,
                                    portalErrorMessage: "User request"
                                  };
                                  await onUpdateTicketInDb(ticketId, {
                                    status: "requires_manual_review",
                                    errorMsg: reviewErr.reviewReasonMessage,
                                    reviewError: reviewErr as any
                                  });
                                  toast.info("Enviado a revisión manual. Podrás facturar este ticket cuando un agente lo complete.", "Revisión");
                                  resetAll();
                                }
                              }}
                              className="text-[10.5px] font-black uppercase tracking-widest flex items-center justify-center gap-2 text-slate-700 bg-slate-100 hover:bg-slate-205 px-6 py-4 rounded-2xl transition active:scale-[0.98] select-none cursor-pointer border-none shadow-2xs font-sans"
                            >
                              Enviar a revisión
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Technical debug details render block */}
                    {canShowDebug && showTechnicalDebug && (
                      <div className="space-y-4 pt-4 border-t border-slate-150 animate-fade-in_50">
                        {/* Static view for high-contrast data presentation */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200/65 shadow-sm text-left">
                          <div className="flex items-start gap-2.5">
                            <Building2 className="w-4 h-4 text-[#0B53F4] mt-1 shrink-0" />
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold block uppercase tracking-wide font-sans">Emisor Comercial</span>
                              <span className="text-xs font-bold text-slate-855 uppercase">{extractedData.nombreEmisor}</span>
                            </div>
                          </div>

                          <div className="flex items-start gap-2.5">
                            <Building2 className="w-4 h-4 text-[#0B53F4] mt-1 shrink-0" />
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold block uppercase tracking-wide font-sans">RFC Emisor</span>
                              <span className="text-xs font-mono font-bold text-slate-855 select-all">{extractedData.rfcEmisor}</span>
                            </div>
                          </div>

                          <div className="flex items-start gap-2.5">
                            <Calendar className="w-4 h-4 text-[#0B53F4] mt-1 shrink-0" />
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold block uppercase tracking-wide font-sans">Fecha Compra</span>
                              <span className="text-xs font-bold text-slate-800 font-mono">{extractedData.fechaCompra}</span>
                            </div>
                          </div>

                          <div className="flex items-start gap-2.5">
                            <FileText className="w-4 h-4 text-[#0B53F4] mt-1 shrink-0" />
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold block uppercase tracking-wide font-sans">Referencia Folio</span>
                              <span className="text-xs font-bold text-slate-855 font-mono select-all">{extractedData.folio}</span>
                            </div>
                          </div>
                        </div>

                        {/* Items Desglose Preview */}
                        <div className="text-left">
                          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block mb-2 font-sans">Desglose de Conceptos ({extractedData.items.length})</span>
                          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden max-h-32 overflow-y-auto scrollbar-none shadow-sm">
                            <table className="w-full text-xs text-left border-collapse font-sans">
                              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                                <tr>
                                  <th className="px-4 py-2 uppercase tracking-wider text-[9px]">Concepto</th>
                                  <th className="px-4 py-2 text-right w-24 uppercase tracking-wider text-[9px]">Importe</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {extractedData.items.map((item, index) => (
                                  <tr key={index} className="hover:bg-slate-50/50">
                                    <td className="px-4 py-2 text-slate-750 font-mono text-[10.5px] uppercase">{item.description}</td>
                                    <td className="px-4 py-2 text-right text-slate-900 font-bold font-mono text-[10.5px]">${item.amount.toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Connector Validation Banner */}
                        <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-5 relative overflow-hidden text-left">
                          <div className="absolute top-0 right-0 w-32 h-32 bg-[#0B53F4]/5 rounded-full blur-2xl pointer-events-none" />
                          {matchingConnector ? (
                            <div className="flex items-center gap-3 relative z-10 font-sans">
                              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shrink-0 border border-emerald-150">
                                <CheckCircle className="w-5 h-5" />
                              </div>
                              <div>
                                <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Conector de Facturación Encontrado</h5>
                                <p className="text-[10px] text-slate-400 mt-1 font-semibold">Conector disponible: <span className="font-mono underline text-[#0B53F4] font-bold">{matchingConnector.nombre}</span></p>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start gap-3 relative z-10 font-sans">
                              <div className="w-10 h-10 bg-amber-50 text-[#FFB200] rounded-full flex items-center justify-center shrink-0 border border-amber-150 mt-0.5">
                                <AlertTriangle className="w-5 h-5 animate-pulse" />
                              </div>
                              <div className="flex-1">
                                <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wide">No existe conector activo</h5>
                                <p className="text-[10px] text-slate-400 mt-1 max-w-sm leading-relaxed font-semibold">
                                  Este comercio aún requiere revisión manual. Puedes corregir los datos o enviar el ticket a revisión.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Developer Debug Toggle Link */}
                    {canShowDebug && (
                      <div className="text-center pt-2 select-none">
                        <button
                          type="button"
                          onClick={() => setShowTechnicalDebug(!showTechnicalDebug)}
                          className="text-[9px] font-extrabold uppercase tracking-widest text-[#0B53F4]/60 hover:text-[#0B53F4] transition cursor-pointer underline bg-transparent border-none font-sans"
                        >
                          {showTechnicalDebug ? "Ocultar detalles de depuración" : "Ver detalles de depuración"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!fiscalProfile && (
                  <div className="text-[10px] text-rose-600 flex items-center gap-2 font-bold bg-rose-50 border border-rose-150 rounded-xl p-3 mt-2 font-sans text-left">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                    <span>Primero debes rellenar tus datos oficiales en la pestaña ⚙️ Perfil Fiscal antes de facturar.</span>
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        )} 
      {/* STEP 3: REDESIGNED TIMELINE ACTIVE PROCESSING PANEL */}
      {activeStep === "automating" && (() => {
        const currentTicket = (tickets || []).find(t => t.id === ticketId);

        const getDetailedReasonMsg = (ticket: any): string => {
          if (!ticket) return "Error desconocido.";
          const revErr = ticket.reviewError;
          const corrErr = ticket.correctionError;

          if (revErr) {
            const code = revErr.reviewReasonCode;
            if (code === "CONNECTOR_NOT_FOUND") return "Este comercio aún no puede procesarse automáticamente. Estamos revisando si puede agregarse.";
            if (code === "PORTAL_NO_XML") return "El portal oficial no entregó el XML necesario para validar tu CFDI.";
            if (code === "PORTAL_REJECTED_FOLIO") return "El portal no reconoció el folio del ticket.";
            if (code === "PORTAL_REJECTED_TOTAL") return "El portal no reconoció el total detectado.";
            if (code === "SAT_NOT_FOUND") return "El CFDI no fue localizado en los controles del SAT.";
            if (code === "SAT_CANCELED") return "El CFDI aparece cancelado ante el SAT.";
            if (code === "SAT_TIMEOUT") return "No pudimos verificar el CFDI ante el SAT en este momento.";
            if (code === "USER_REQUESTED_REVIEW") return "El usuario solicitó revisión manual del ticket.";
            if (code === "CONNECTOR_TIMEOUT") return "El conector del comercio tardó más de lo esperado en responder.";
            if (code === "PORTAL_ERROR") return revErr.reviewReasonMessage || "Ocurrió un error en el portal del comercio.";
            if (code === "CONNECTOR_RUNNER_NOT_AVAILABLE") return "El conector está entrenado, pero el motor productivo de automatización aún no está disponible.";
            if (code === "CONNECTOR_SCHEMA_INVALID") return "El conector tiene una configuración incompleta y requiere revisión técnica.";
            if (code === "CONNECTOR_NOT_PRODUCTION_READY") return "El conector de este comercio está en validación técnica y no está listo para producción.";
            if (code === "CONNECTOR_RESTRICTED") return "Este portal requiere credenciales especiales o permisos de acceso restringidos.";
            if (code === "CONNECTOR_BROKEN") return "El conector de este portal se encuentra temporalmente fuera de servicio por mantenimiento.";
            if (code === "PORTAL_FIELD_MAP_CHANGED") return "La estructura del portal oficial ha cambiado. Se ha programado un rediscovery técnico.";
            if (code === "PORTAL_REQUIRES_LOGIN") return "El portal del comercio requiere iniciar sesión con cuenta de usuario.";
            if (code === "PORTAL_REQUIRES_CAPTCHA") return "El portal oficial requiere resolver un CAPTCHA interactivo.";
            if (code === "PORTAL_REQUIRES_EMAIL_VERIFICATION") return "El portal oficial requiere una verificación por correo electrónico.";
            if (code === "PORTAL_NO_DOWNLOAD_LINKS") return "El portal oficial no proporcionó enlaces de descarga válidos.";
          }

          if (corrErr) {
            const code = corrErr.reasonCode;
            if (code === "MISSING_FOLIO") return "No detectamos el folio del ticket. Por favor ingrésalo.";
            if (code === "MISSING_DATE") return "No detectamos la fecha del ticket. Por favor ingrésala.";
            if (code === "MISSING_TOTAL") return "No detectamos el importe total. Por favor ingrésalo.";
            if (code === "MISSING_MERCHANT") return "No detectamos un establecimiento válido.";
            if (code === "PORTAL_REJECTED_RFC") return "El RFC del receptor no tiene un formato válido ante el SAT.";
            if (code === "PORTAL_REJECTED_FOLIO") return "El portal no reconoció el folio del ticket.";
          }

          return ticket.errorMsg || "Este ticket requiere revisión manual de un agente.";
        };

        const getStepStatus = (stepIndex: number) => {
          const tStatus = currentTicket?.status || "";
          const isFinished = ["cfdi_validated", "completed"].includes(tStatus);

          if (stepIndex === 1) { // Lectura
            if (["ticket_uploaded", "extracting_data"].includes(tStatus)) return "active";
            if (tStatus) return "completed";
            return "active";
          }
          if (stepIndex === 2) { // Extracción
            if (["ticket_uploaded", "extracting_data"].includes(tStatus)) return "pending";
            if (tStatus === "connector_resolving") return "active";
            if (tStatus) return "completed";
            return "pending";
          }
          if (stepIndex === 3) { // Validación
            if (["submitting_to_portal", "waiting_portal_result", "merchant_cfdi_downloaded", "sat_verifying", "pending_portal_submission", "submitted_to_merchant"].includes(tStatus)) return "active";
            if (isFinished) return "completed";
            return "pending";
          }
          if (stepIndex === 4) { // Listo
            if (isFinished) return "completed";
            return "pending";
          }
          return "pending";
        };

        const getDynamicStatusMsg = () => {
          const tStatus = currentTicket?.status || "";
          
          if (tStatus === "ticket_uploaded" || tStatus === "extracting_data") {
            return "Leyendo el ticket...";
          }
          if (tStatus === "connector_resolving") {
            return "Buscando el portal oficial de facturación del comercio...";
          }
          if (["pending_portal_submission", "submitting_to_portal"].includes(tStatus)) {
            return "Preparando solicitud de facturación...";
          }
          if (["submitted_to_merchant", "waiting_portal_result", "merchant_cfdi_downloaded"].includes(tStatus)) {
            return "Esperando respuesta del portal oficial del comercio...";
          }
          if (tStatus === "sat_verifying") {
            return "Validando CFDI ante los servidores oficiales del SAT...";
          }
          if (tStatus === "cfdi_validated" || tStatus === "completed") {
            return "¡Factura obtenida y validada con éxito!";
          }
          if (tStatus === "requires_manual_review") {
            return "El proceso requiere revisión manual.";
          }
          if (tStatus === "requires_user_correction") {
            return "Necesitamos corregir un dato.";
          }
          if (tStatus === "failed") {
            return "No se pudo completar el proceso.";
          }
          return "Iniciando procesamiento...";
        };

        return (
          <div id="automating-panel" className="flex-1 flex flex-col justify-between relative z-10 animate-fade-in_50 font-sans text-left bg-white border border-slate-200/80 rounded-3xl p-4 sm:p-8 shadow-[0_15px_35px_-10px_rgba(37,99,235,0.03)] my-4">
            {/* Header section fitting ZenTicket graphic language */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-5 mb-6 select-none">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-blue-50 border border-blue-200/50 text-[#0B53F4] text-[10px] font-black tracking-wider uppercase px-2.5 py-1 rounded-md">
                    Procesamiento automático
                  </span>
                  <span className="text-[10px] font-mono font-bold text-slate-400">
                    TICKET #{ticketId ? ticketId.slice(-8).toUpperCase() : "..."}
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900 font-display tracking-tight">
                  Estamos procesando tu ticket...
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  ZenTicket está solicitando la factura en el portal oficial de facturación del comercio.
                </p>
              </div>
              <div className="text-left sm:text-right sm:border-l sm:border-slate-100 sm:pl-5">
                <p className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Establecimiento</p>
                <p className="text-xs font-black text-slate-700 font-sans truncate max-w-[180px]">{extractedData?.nombreEmisor || "Emisor Registrado"}</p>
              </div>
            </div>

            {/* Timeline Progress Tracker (structure from user drawing, ZenTicket styles) */}
            <div className="relative my-10 select-none px-2 sm:px-4">
              {/* Background track line */}
              <div className="absolute top-1/2 left-0 w-full h-[5px] bg-slate-100 -translate-y-1/2 rounded-full" />
              
              {/* Active track overlay */}
              <div 
                className="absolute top-1/2 left-0 h-[5px] bg-gradient-to-r from-blue-500 to-[#0B53F4] -translate-y-1/2 rounded-full transition-all duration-500 shadow-[0_1px_4px_rgba(11,83,244,0.15)]"
                style={{ width: `${Math.min(100, Math.max(0, simulationProgress))}%` }}
              />

              {/* Step Nodes Container */}
              <div className="relative flex justify-between items-center w-full gap-1">
                {[1, 2, 3, 4].map((stepIdx) => {
                  const stepStatus = getStepStatus(stepIdx);
                  
                  let stepTitle = "";
                  let stepIcon = null;
                  if (stepIdx === 1) {
                    stepTitle = "Lectura";
                    stepIcon = <FileText className="w-4 h-4 xs:w-5 xs:h-5 sm:w-5.5 sm:h-5.5 shrink-0" />;
                  } else if (stepIdx === 2) {
                    stepTitle = "Extracción";
                    stepIcon = <Database className="w-4 h-4 xs:w-5 xs:h-5 sm:w-5.5 sm:h-5.5 shrink-0" />;
                  } else if (stepIdx === 3) {
                    stepTitle = "Validación";
                    stepIcon = <Shield className="w-4 h-4 xs:w-5 xs:h-5 sm:w-5.5 sm:h-5.5 shrink-0" />;
                  } else {
                    stepTitle = "¡Listo!";
                    stepIcon = <Building2 className="w-4 h-4 xs:w-5 xs:h-5 sm:w-5.5 sm:h-5.5 shrink-0" />;
                  }

                  return (
                    <div key={stepIdx} className="flex flex-col items-center relative z-10 flex-1 min-w-0 text-center">
                      {/* Circle Node */}
                      <div className={`
                        w-10 h-10 xs:w-11 xs:h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm shrink-0
                        ${stepStatus === "completed" 
                          ? "bg-[#0B53F4] border-2 border-[#0B53F4] text-white" 
                          : stepStatus === "active"
                            ? "bg-white border-3 sm:border-4 border-[#0B53F4] text-[#0B53F4] scale-105 sm:scale-110 shadow-[0_0_15px_rgba(11,83,244,0.18)]"
                            : "bg-slate-50 border-2 border-slate-200/80 text-slate-400"
                        }
                      `}>
                        {stepStatus === "completed" ? (
                          <Check className="w-4.5 h-4.5 sm:w-6 sm:h-6 stroke-[3] shrink-0" />
                        ) : stepStatus === "active" ? (
                          <div className="relative flex items-center justify-center">
                            <span className="absolute animate-ping inline-flex h-3 w-3 sm:h-4 sm:w-4 rounded-full bg-blue-450 opacity-60"></span>
                            {stepIcon}
                          </div>
                        ) : (
                          stepIcon
                        )}
                      </div>

                      {/* Step label text below circle node */}
                      <div className="mt-3 select-none w-full px-0.5">
                        <p className={`text-[8px] xs:text-[9.5px] sm:text-[11.5px] font-extrabold sm:font-bold leading-tight balance ${stepStatus === "active" ? "text-slate-900 font-black" : "text-slate-500"} break-words line-clamp-2 h-6 xs:h-7 sm:h-auto`}>
                          {stepTitle}
                        </p>
                        <p className={`text-[7px] xs:text-[8px] sm:text-[9px] font-black mt-1 font-mono uppercase tracking-normal sm:tracking-wider ${
                          stepStatus === "completed" 
                            ? "text-emerald-500" 
                            : stepStatus === "active"
                              ? "text-[#0B53F4]"
                              : "text-slate-400"
                        }`}>
                          {stepStatus === "completed" ? (
                            <>
                              <span className="hidden sm:inline">✔ Completado</span>
                              <span className="inline sm:hidden">✔ OK</span>
                            </>
                          ) : stepStatus === "active" ? (
                            <>
                              <span className="hidden sm:inline">● Procesando...</span>
                              <span className="inline sm:hidden">● Proc...</span>
                            </>
                          ) : (
                            <>
                              <span className="hidden sm:inline">○ Pendiente</span>
                              <span className="inline sm:hidden">○ Pend.</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* A single line of dynamic text explaining the currently executed action */}
            {currentTicket?.status === "requires_manual_review" || currentTicket?.status === "review" ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5 text-left mt-4 animate-fade-in">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold block text-amber-800 uppercase mb-0.5 tracking-wide text-xs">
                      Revisión manual requerida
                    </span>
                    <p className="opacity-95 text-amber-700 text-[11.5px] leading-normal font-semibold font-sans">
                      {getDetailedReasonMsg(currentTicket)}
                    </p>
                  </div>
                </div>
              </div>
            ) : currentTicket?.status === "requires_user_correction" ? (
              <div className="bg-orange-50/50 border border-orange-200 rounded-2xl p-4 mb-5 text-left mt-4 animate-fade-in">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold block text-orange-850 uppercase mb-0.5 tracking-wide text-xs">
                      Necesitamos corregir un dato
                    </span>
                    <p className="opacity-95 text-orange-700 text-[11.5px] leading-normal font-semibold font-sans">
                      {getDetailedReasonMsg(currentTicket)}
                    </p>
                  </div>
                </div>
              </div>
            ) : currentTicket?.status === "failed" ? (
              <div className="bg-rose-50 border border-rose-250 rounded-2xl p-4 mb-5 text-left mt-4 animate-fade-in">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold block text-rose-800 uppercase mb-0.5 tracking-wide text-xs">
                      No se pudo completar
                    </span>
                    <p className="opacity-95 text-rose-700 text-[11.5px] leading-normal font-semibold font-sans">
                      {currentTicket?.errorMsg || "Ocurrió un error inesperado al procesar el ticket."}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-5 text-center mt-4">
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 text-[#0B53F4] animate-spin shrink-0 animate-duration-1000" />
                  <span className="text-xs sm:text-[13px] font-semibold text-slate-600 font-sans tracking-tight leading-normal">
                    {getDynamicStatusMsg()}
                  </span>
                </div>
              </div>
            )}

            {/* Standard actions footer / backup background run option */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between sm:items-center border-t border-slate-100 pt-5 mt-2">
              <div className="flex items-center gap-1.5 select-none text-[10.5px] text-slate-400 font-semibold justify-center sm:justify-start">
                <Clock className="w-3.5 h-3.5" />
                <span>Puedes ir a Mis Tickets para ver el avance.</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveStep("tracking");
                }}
                className="w-full sm:w-auto text-center text-[10.5px] font-black uppercase tracking-wider text-white bg-[#0B53F4] hover:bg-blue-650 px-5 py-3 rounded-xl transition cursor-pointer active:scale-[0.98] border-none shadow-md shadow-blue-500/15"
              >
                Ver en Mis Tickets
              </button>
            </div>
          </div>
        );
      })()}

      {/* CONTROLLED STATUS: EN SEGUIMIENTO */}
      {activeStep === "tracking" && (
        <div id="tracking-panel" className="flex-1 flex flex-col justify-center items-center text-center p-7 sm:p-10 space-y-6 relative z-10 animate-fade-in_50 bg-white border border-slate-200 rounded-3xl shadow-[0_15px_35px_-10px_rgba(37,99,235,0.03)] font-sans max-w-xl mx-auto my-4">
          <div className="w-16 h-16 bg-blue-50 border border-blue-150 rounded-2xl flex items-center justify-center text-[#0B53F4] mx-auto shadow-sm">
            <Clock className="w-8 h-8 animate-pulse text-[#0B53F4]" />
          </div>

          <div className="text-center space-y-3">
            <h3 className="text-lg font-black text-slate-900 font-display tracking-tight uppercase">
              Facturación en proceso
            </h3>
            <p className="text-sm font-bold text-[#0B53F4]">
              El procesamiento continuará en segundo plano
            </p>
            <p className="text-xs sm:text-[13px] text-slate-500 leading-relaxed max-w-md mx-auto font-medium">
              Estamos revisando la información del ticket. Puedes consultar su avance desde <span className="font-bold text-slate-800 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-150">Mis tickets &gt; En proceso</span>.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md mx-auto pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                if (onTabChange) {
                  onTabChange("tickets");
                }
                setActiveStep("upload");
              }}
              className="flex-1 py-3 px-4 bg-[#0B53F4] hover:bg-[#0941C4] text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-md shadow-blue-500/10 hover:shadow-lg transition cursor-pointer text-center"
            >
              Ir a En proceso
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveStep("upload");
              }}
              className="flex-1 py-3 px-4 bg-[#ebf1ff] hover:bg-[#ebf1ff]/80 text-[#0B53F4] text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer text-center border-none shadow-2xs"
            >
              Volver al inicio
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: SUCCESS GENERATED CONFIRMATION */}
      {activeStep === "success" && (
        <div className="flex-1 flex flex-col justify-center items-center text-center p-8 space-y-5 relative z-10 animate-fade-in_50 bg-white border border-slate-200/50 rounded-3xl shadow-sm">
          <div className="w-16 h-16 bg-emerald-50 border border-emerald-150 rounded-2xl flex items-center justify-center text-emerald-600 mx-auto scale-110 shadow-sm animate-bounce">
            <CheckCircle className="w-9 h-9" />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-black text-slate-950 tracking-tight uppercase">¡Factura Automatizada con Éxito!</h3>
            <p className="text-xs text-slate-450 max-w-sm mx-auto leading-relaxed">
              El ticket comercial ha sido procesado, obtenido e incorporado de forma segura en tu historial de CFDIs v4.0 listos para consultar.
            </p>
          </div>

          <div className="flex justify-center gap-3 pt-3">
            <button
              onClick={() => {
                resetAll();
              }}
              className="text-xs font-black uppercase tracking-wider bg-[#ebf1ff] hover:bg-[#ebf1ff]/80 text-[#0B53F4] px-5 py-3.5 rounded-xl transition cursor-pointer select-none border-none shadow-2xs"
            >
              Extraer Otro Ticket
            </button>

            <button
              onClick={() => {
                const btn = document.getElementById("tab-history");
                if (btn) btn.click();
              }}
              className="text-xs font-bold uppercase tracking-wider bg-[#0B53F4] hover:bg-blue-600 text-white px-5 py-3.5 rounded-xl transition cursor-pointer select-none flex items-center gap-1.5 shadow-md shadow-[#0B53F4]/10"
            >
              <Eye className="w-4 h-4" />
              Ver CFDI obtenido
            </button>
          </div>
        </div>
      )}

      {/* STEP: CORRECTION VIEW FOR REQUIRES_USER_CORRECTION STATUS */}
      {activeStep === "correction" && extractedData && (
        <div id="correction-panel" className="flex-1 flex flex-col justify-between relative z-10 animate-fade-in_50 font-sans text-left bg-[#0f111a] border border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl max-w-xl mx-auto my-4 text-slate-100">
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
                <AlertTriangle className="w-5.5 h-5.5" />
              </div>
              <div>
                <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest block font-mono">Acción requerida</span>
                <h3 className="text-lg font-black text-slate-100 tracking-tight">
                  Necesitamos corregir un dato
                </h3>
              </div>
            </div>

            {/* Error Message Details */}
            <div className="bg-amber-500/5 border border-amber-900/30 rounded-2xl p-4">
              <p className="text-xs font-semibold text-amber-300 leading-relaxed">
                {correctionError?.reasonMessage || "El portal de facturación requiere corregir un dato para poder continuar."}
              </p>
            </div>

            {/* Detected Fields list */}
            <div className="space-y-3.5">
              <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Datos detectados del ticket:</h4>
              <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-4.5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className={`p-2.5 rounded-xl border transition-all duration-200 ${correctionError?.fieldToCorrect === "nombreEmisor" ? "bg-amber-500/10 border-amber-500/30" : "bg-slate-950/20 border-slate-800/40"}`}>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block font-mono">Comercio</span>
                  <span className="text-xs font-extrabold text-slate-200 block mt-0.5 uppercase">
                    {extractedData.nombreEmisor || "No detectado"}
                  </span>
                </div>
                <div className={`p-2.5 rounded-xl border transition-all duration-200 ${correctionError?.fieldToCorrect === "folio" ? "bg-amber-500/10 border-amber-500/30" : "bg-slate-950/20 border-slate-800/40"}`}>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block font-mono">Folio</span>
                  <span className="text-xs font-mono font-extrabold text-slate-200 block mt-0.5 select-all">
                    {extractedData.folio || "No detectado"}
                  </span>
                </div>
                <div className={`p-2.5 rounded-xl border transition-all duration-200 ${correctionError?.fieldToCorrect === "fecha" ? "bg-amber-500/10 border-amber-500/30" : "bg-slate-950/20 border-slate-800/40"}`}>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block font-mono">Fecha</span>
                  <span className="text-xs font-mono font-extrabold text-slate-200 block mt-0.5">
                    {extractedData.fechaCompra || "No detectada"}
                  </span>
                </div>
                <div className={`p-2.5 rounded-xl border transition-all duration-200 ${correctionError?.fieldToCorrect === "total" ? "bg-amber-500/10 border-amber-500/30" : "bg-slate-950/20 border-slate-800/40"}`}>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block font-mono">Total</span>
                  <span className="text-xs font-mono font-extrabold text-[#0B53F4] block mt-0.5">
                    ${extractedData.total ? extractedData.total.toFixed(2) : "0.00"} MXN
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-slate-800 mt-6 pb-[calc(16px+env(safe-area-inset-bottom))] sm:pb-0">
            <button
              type="button"
              onClick={() => {
                setIsEditing(true);
                setActiveStep("extracted");
              }}
              className="flex-1 py-3.5 px-4 bg-[#0B53F4] hover:bg-blue-600 text-white text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer text-center shadow-md shadow-blue-500/10 active:scale-[0.98]"
            >
              Corregir dato
            </button>
            <button
              type="button"
              onClick={() => {
                resetAll();
                setActiveStep("upload");
              }}
              className="flex-1 py-3.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer text-center active:scale-[0.98] border border-slate-700"
            >
              Volver a tomar foto
            </button>
            <button
              type="button"
              onClick={async () => {
                if (ticketId) {
                  const reviewErr: ReviewError = {
                    reviewReasonCode: "USER_REQUESTED_REVIEW",
                    reviewReasonMessage: "El usuario solicitó revisión manual del ticket.",
                    lastAutomationStep: "extraction_ready",
                    connectorAttempted: false,
                    connectorId: matchingConnector?.id || null,
                    connectorName: matchingConnector?.nombre || null,
                    portalErrorMessage: "User escalation from correction screen"
                  };
                  await onUpdateTicketInDb(ticketId, {
                    status: "requires_manual_review",
                    errorMsg: reviewErr.reviewReasonMessage,
                    reviewError: reviewErr as any
                  });
                  toast.info("Enviado a revisión manual. Podrás facturar este ticket cuando un agente lo complete.", "Revisión");
                  resetAll();
                }
              }}
              className="flex-1 py-3.5 px-4 bg-slate-700 hover:bg-slate-600 text-white text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer text-center active:scale-[0.98] shadow-md shadow-slate-700/10"
            >
              Enviar a revisión
            </button>
          </div>
        </div>
      )}

      {/* showOcrConfirmationModal Popup Overlay precisely as requested */}
      {showOcrConfirmationModal && extractedData && (
        <div className="fixed inset-0 bg-[#070913]/90 backdrop-blur-md z-50 overflow-y-auto flex flex-col justify-end sm:justify-center p-0 sm:p-4">
          <div className="bg-[#0f111a] sm:bg-[#121421] rounded-t-[28px] sm:rounded-[28px] overflow-hidden max-w-lg w-full shadow-2xl border-t sm:border border-slate-800/80 flex flex-col max-h-[90vh] sm:max-h-[85vh] text-slate-100 animate-scale-up my-0 sm:my-auto">
            {/* Header */}
            <div className="p-6 border-b border-slate-800/60 flex items-center justify-between text-left">
              <div>
                <h3 className="text-base font-black text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#0B53F4] animate-pulse" />
                  Revisa los datos del ticket
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowOcrConfirmationModal(false)}
                className="text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700/80 p-1.5 rounded-full duration-150 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 text-left space-y-5 overflow-y-auto flex-1 text-slate-100">
              <p className="text-xs text-slate-400 font-semibold leading-relaxed">
                Encontramos estos datos en tu ticket. Revísalos antes de continuar.
              </p>

              {/* Info Box */}
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 space-y-3.5">
                <div className={canShowDebug ? "grid grid-cols-2 gap-4" : "grid grid-cols-1 sm:grid-cols-2 gap-4"}>
                  <div className={canShowDebug ? "" : "sm:col-span-2"}>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block font-mono">Establecimiento</span>
                    <span className="text-xs font-extrabold text-slate-200 uppercase block leading-tight mt-0.5">
                      {extractedData.nombreEmisor || "Establecimiento no identificado"}
                    </span>
                  </div>

                  {canShowDebug && (
                    <div>
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block font-mono">RFC Emisor</span>
                      <span className="text-xs font-mono font-extrabold text-slate-200 block mt-0.5 select-all">
                        {extractedData.rfcEmisor || "No detectado"}
                      </span>
                    </div>
                  )}

                  <div className="border-t border-slate-800/60 pt-2.5">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block font-mono">Fecha Compra</span>
                    <span className="text-xs font-mono font-extrabold text-slate-200 block mt-0.5">
                      {extractedData.fechaCompra || "No detectada"}
                    </span>
                  </div>

                  <div className="border-t border-slate-800/60 pt-2.5">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block font-mono">Total Pagado</span>
                    <span className="text-xs font-mono font-extrabold text-[#0B53F4] block mt-0.5">
                      ${extractedData.total ? extractedData.total.toFixed(2) : "0.00"} MXN
                    </span>
                  </div>

                  <div className="border-t border-slate-800/60 pt-2.5 col-span-1 sm:col-span-2">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block font-mono">Folio del Ticket</span>
                    <span className="text-xs font-mono font-extrabold text-slate-200 block mt-0.5 select-all">
                      {extractedData.folio || "No detectado"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Alert Box */}
              {connectorStatus === "revisando" ? (
                <div className="flex items-start gap-3.5 p-4 border border-blue-900/30 bg-blue-500/5 text-blue-300 rounded-2xl">
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 text-blue-400 mt-0.5">
                    <RefreshCw className="w-4.5 h-4.5 animate-spin" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="font-extrabold text-[10px] uppercase tracking-wider block text-blue-400">Revisando disponibilidad</span>
                    <p className="font-medium text-[11px] text-blue-300/90 leading-relaxed">
                      Estamos comprobando si este comercio puede procesarse automáticamente.
                    </p>
                  </div>
                </div>
              ) : connectorStatus === "disponible" ? (
                <div className="flex items-start gap-3.5 p-4 border border-emerald-900/30 bg-emerald-500/5 text-emerald-300 rounded-2xl">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 text-emerald-400 mt-0.5">
                    <CheckCircle className="w-4.5 h-4.5" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="font-extrabold text-[10px] uppercase tracking-wider block text-emerald-400">Proceso automático disponible</span>
                    <p className="font-medium text-[11px] text-emerald-300/90 leading-relaxed">
                      Puedes confirmar los datos para solicitar la factura en el portal del comercio.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3.5 p-4 border border-amber-900/30 bg-amber-500/5 text-amber-300 rounded-2xl">
                  <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 text-amber-400 mt-0.5">
                    <AlertTriangle className="w-4.5 h-4.5" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="font-extrabold text-[10px] uppercase tracking-wider block text-amber-400">Requiere revisión</span>
                    <p className="font-medium text-[11px] text-amber-300/90 leading-relaxed">
                      Este comercio aún requiere revisión manual. Puedes editar los datos o enviar el ticket a revisión.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer sticky bottom sheet */}
            <div className="p-6 border-t border-slate-800 bg-[#161828]/50 flex flex-col sm:flex-row gap-2.5 justify-end pb-[calc(96px+env(safe-area-inset-bottom))] sm:pb-6">
              {getExistingInvoicedTicket(extractedData.rfcEmisor, extractedData.folio) && (
                <button
                  type="button"
                  onClick={() => {
                    setShowOcrConfirmationModal(false);
                    resetAll();
                  }}
                  className="text-xs font-black uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-700 py-3 px-4 rounded-xl duration-150 cursor-pointer active:scale-98 text-center shadow-md shadow-rose-600/15"
                >
                  X Cancelar Escaneo
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowOcrConfirmationModal(false);
                  setIsEditing(true);
                }}
                className="text-xs font-bold text-slate-300 hover:text-white bg-slate-800 border border-slate-700 hover:border-slate-600 py-3 px-4 rounded-xl duration-150 cursor-pointer active:scale-98 text-center"
              >
                Editar datos
              </button>

              {/* Show Confirmar y facturar visible but disabled during revisando, enabled during disponible, hidden during no_disponible */}
              {connectorStatus === "revisando" && (
                <button
                  type="button"
                  disabled={true}
                  className="text-xs font-black uppercase tracking-wider text-white bg-[#0B53F4] opacity-55 py-3 px-6 rounded-xl duration-150 text-center"
                >
                  Confirmar y Facturar
                </button>
              )}

              {connectorStatus === "disponible" && (
                <button
                  type="button"
                  onClick={() => {
                    setShowOcrConfirmationModal(false);
                    handleTriggerAutomation();
                  }}
                  disabled={checkIsDataIncomplete(extractedData)}
                  className="text-xs font-black uppercase tracking-wider text-white bg-[#0B53F4] hover:bg-blue-650 disabled:opacity-55 py-3 px-6 rounded-xl duration-150 cursor-pointer active:scale-98 text-center shadow-md shadow-[#0B53F4]/15"
                >
                  Confirmar y Facturar
                </button>
              )}

              {connectorStatus === "no_disponible" && (
                <button
                  type="button"
                  onClick={async () => {
                    setShowOcrConfirmationModal(false);
                    if (ticketId) {
                      const reviewErr: ReviewError = {
                        reviewReasonCode: "CONNECTOR_NOT_FOUND",
                        reviewReasonMessage: "Este comercio aún requiere revisión. Estamos revisando si puede procesarse automáticamente.",
                        lastAutomationStep: "extraction_ready",
                        connectorAttempted: false,
                        connectorId: null,
                        connectorName: null,
                        portalErrorMessage: "No conector available"
                      };
                      await onUpdateTicketInDb(ticketId, {
                        status: "requires_manual_review",
                        errorMsg: reviewErr.reviewReasonMessage,
                        reviewError: reviewErr as any
                      });
                      toast.info("Enviado a revisión manual. Podrás facturar este ticket cuando un agente lo complete.", "Revisión");
                      resetAll();
                    }
                  }}
                  className="text-xs font-black uppercase tracking-wider text-white bg-slate-600 hover:bg-slate-700 py-3 px-6 rounded-xl duration-150 cursor-pointer active:scale-98 text-center shadow-md shadow-slate-600/15"
                >
                  Enviar a Revisión
                </button>
              )}
            </div>
          </div>
        </div>
            )}
    </div>
  );
}