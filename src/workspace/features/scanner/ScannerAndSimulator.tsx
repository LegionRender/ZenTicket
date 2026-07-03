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
import { doc, setDoc, updateDoc, getDoc, collection, query, where, getDocs, addDoc, onSnapshot } from "firebase/firestore";
import { AnimatePresence, motion } from "motion/react";
import { useAuth } from "@/auth/context/AuthContext";
import logoLight from "@/assets/logos/logo-light.png";
import logoDark from "@/assets/logos/logo-dark.png";
import { sanitizeBillingReferenceForConnector } from "@/shared/utils/validation";
import { buildPortalFieldsSnapshot, hasUsableExtractionContract, validatePortalFields } from "@/shared/utils/extraction-contract";

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
    | "PORTAL_NO_DOWNLOAD_LINKS"
    | "PORTAL_REJECTED_TICKET_DATA";
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
  onTabChange?: (tab: string, subTab?: string) => void;
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

function getFieldSource(f: any): "ticket" | "fiscalProfile" {
  if (f.source === "ticket" || f.source === "fiscalProfile") {
    return f.source;
  }
  const ticketKeys = ["referenciaFacturacion", "total", "fecha", "folio", "ticketNumber", "billingReference", "date", "sucursal"];
  if (ticketKeys.includes(f.key)) {
    return "ticket";
  }
  return "fiscalProfile";
}

function isInternalIdLike(value: string | undefined | null, rawOcrText?: string): boolean {
  if (!value) return true;
  const val = value.trim();
  if (!val) return true;

  // 1. Starts with ticket_ or job_ or similar internal prefixes
  if (val.startsWith("ticket_") || val.startsWith("job_") || val.startsWith("pilot-") || val.startsWith("OFFLINE-")) {
    return true;
  }

  // 2. If rawOcrText is provided, check if the value is in the raw OCR text.
  // If it's a generated ID or UUID not present in the original OCR text, reject it.
  if (rawOcrText) {
    const cleanOcr = rawOcrText.toLowerCase();
    const cleanVal = val.toLowerCase();
    if (!cleanOcr.includes(cleanVal)) {
      return true;
    }
  }

  return false;
}

function sanitizePortalFieldsForConnector(
  connector: any,
  detectedData: any,
  rawOcrText: string | undefined | null
): { billingReference: string; total: number; date: string; ticketNumber: string } {
  const ocrText = rawOcrText || "";
  let billingRef = detectedData.billingReference || detectedData.referenciaFacturacion || "";

  // Call the central sanitization function
  billingRef = sanitizeBillingReferenceForConnector(billingRef, ocrText, connector);

  const total = parseFloat(String(detectedData.total || 0));
  const date = detectedData.fechaCompra || detectedData.date || "";
  const ticketNumber = billingRef;

  return {
    billingReference: billingRef,
    total: isNaN(total) ? 0 : total,
    date,
    ticketNumber
  };
}

function validatePortalFieldsAgainstPortalMap(
  ticket: any,
  portalMap: any
): { isValid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];
  const pFields = ticket.portalFields || {};

  let requiredFields = portalMap.requiredFields || [];
  if (typeof requiredFields === "string") {
    try {
      requiredFields = JSON.parse(requiredFields);
    } catch (_) {
      requiredFields = [];
    }
  }

  for (const field of requiredFields) {
    let fieldKey = "";
    let isRequired = true;
    if (typeof field === "string") {
      fieldKey = field;
    } else if (field && typeof field === "object") {
      fieldKey = field.key;
      isRequired = field.required !== false;
    }

    if (!isRequired) continue;

    if (fieldKey === "portalFields.billingReference" || fieldKey === "ticket.billingReference") {
      if (!pFields.billingReference || !pFields.billingReference.trim()) {
        missingFields.push("portalFields.billingReference");
      }
    } else if (fieldKey === "portalFields.total" || fieldKey === "ticket.total") {
      if (pFields.total === undefined || pFields.total === null || isNaN(pFields.total) || pFields.total <= 0) {
        missingFields.push("portalFields.total");
      }
    } else if (fieldKey === "portalFields.date" || fieldKey === "ticket.date") {
      if (!pFields.date || !pFields.date.trim()) {
        missingFields.push("portalFields.date");
      }
    } else if (fieldKey.startsWith("portalFields.")) {
      const key = fieldKey.replace("portalFields.", "");
      if (pFields[key] === undefined || pFields[key] === null || (typeof pFields[key] === "string" && !pFields[key].trim())) {
        missingFields.push(fieldKey);
      }
    }
  }

  return {
    isValid: missingFields.length === 0,
    missingFields
  };
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
        toast.success(`¡Renovación completada por $${cost} MXN! Tu cupo mensual de solicitudes de facturas ha sido restablecido.`, "Plan Renovado");
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

  // Batch upload states
  const [batchTickets, setBatchTickets] = useState<any[] | null>(null);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchSummary, setBatchSummary] = useState({
    loaded: 0,
    errors: 0,
    requiresCorrection: 0,
    readyForInvoice: 0
  });

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
  const [editPortalFields, setEditPortalFields] = useState<Record<string, any>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [customProfileFields, setCustomProfileFields] = useState<Record<string, string>>({
    rfcReceptor: "",
    razonSocial: "",
    codigoPostal: "",
    regimenFiscal: "",
    usoCFDI: "",
    email: ""
  });

  const [liveTicket, setLiveTicket] = useState<any>(null);
  const [liveJob, setLiveJob] = useState<any>(null);
  const [inlineInputs, setInlineInputs] = useState<Record<string, string>>({});

  // Corroboration Sub-tab & AI Model training visualizer states
  const [activeExtractedTab, setActiveExtractedTab] = useState<"corroborar" | "detalles">("corroborar");
  const [isTrainingModel, setIsTrainingModel] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [trainingStatus, setTrainingStatus] = useState("");

  // Helper validation function to check missing or bad critical fields
  const checkIsDataIncomplete = (data: ExtractedTicketData): boolean => {
    const found = matchConnector(data.nombreEmisor, data.rfcEmisor);
    if (found) {
      if (hasUsableExtractionContract(found.extractionContract)) {
        return !validatePortalFields(found.extractionContract, (data as any).portalFields || {}).isValid;
      }
      try {
        const fields = JSON.parse(found.fieldsJson || "[]");
        if (fields.length > 0) {
          const hasMissingTicketField = fields.some((f: any) => {
            if (getFieldSource(f) !== "ticket" || !f.required) return false;
            if (f.key === "referenciaFacturacion" || f.key === "folio") return !data.folio?.trim();
            if (f.key === "total") return !data.total || data.total <= 0;
            if (f.key === "fecha") return !data.fechaCompra?.trim();
            return false;
          });
          return hasMissingTicketField;
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
        message: "Debe rellenar sus datos oficiales (RFC, Razón Social, Régimen) en la pestaña ⚙️ Perfil Fiscal para poder habilitar la obtención automática de sus comprobantes desde los portales de los comercios.",
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
            title: wasOffline ? `CFDI Obtenido (Sincronización Offline)` : `CFDI Obtenido - ${t.nombreEmisor || "Establecimiento"}`,
            message: wasOffline
              ? `El ticket sin conexión de ${t.nombreEmisor || "Establecimiento"} por $${(t.total || 0).toFixed(2)} MXN ha sido procesado y obtenido automáticamente desde el portal del comercio.`
              : `Se obtuvo exitosamente el CFDI 4.0 para ${t.nombreEmisor || "Establecimiento"} por un monto de $${(t.total || 0).toFixed(2)} MXN de manera limpia.`,
            createdAt: timestamp,
            read: readNotifIds.includes(`completed-${ticketId}`),
            actionText: "Enterado",
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
      { p: 95, l: "📨 Solicitud certificada. Procesando solicitud en el portal..." },
      { p: 100, l: "✅ ¡Proceso de solicitud finalizado con éxito! Registro de CFDI obtenido actualizado." }
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
      toast.success(`Ticket de ${ticket.nombreEmisor} autocorregido y solicitado exitosamente en el portal sin re-subir.`, "Resolución Completa ✅");
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

    const candidates = connectors.filter((c) => {
      // Filter out disabled/duplicate mock connectors
      if (c.status === "disabled" || c.disabledReason === "DUPLICATE_MOCK_CONNECTOR") return false;

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

    if (candidates.length === 0) return null;

    // Prioritized Sorting
    candidates.sort((a, b) => {
      const aProd = a.status === "production_ready" ? 1 : 0;
      const bProd = b.status === "production_ready" ? 1 : 0;
      if (aProd !== bProd) return bProd - aProd;

      const aAvail = (a.status === "automation_available" || a.status === "real_validation") ? 1 : 0;
      const bAvail = (b.status === "automation_available" || b.status === "real_validation") ? 1 : 0;
      if (aAvail !== bAvail) return bAvail - aAvail;

      const aSys = a.userId === "system" ? 1 : 0;
      const bSys = b.userId === "system" ? 1 : 0;
      if (aSys !== bSys) return bSys - aSys;

      const aMock = (a.status === "mock_only" || a.isMock === true) ? 1 : 0;
      const bMock = (b.status === "mock_only" || b.isMock === true) ? 1 : 0;
      if (aMock !== bMock) return aMock - bMock; // prefer non-mock (0) over mock (1)

      const aContract = (a.extractionContract && a.extractionContract.requiredPortalFields && a.extractionContract.requiredPortalFields.length > 0) ? 1 : 0;
      const bContract = (b.extractionContract && b.extractionContract.requiredPortalFields && b.extractionContract.requiredPortalFields.length > 0) ? 1 : 0;
      if (aContract !== bContract) return bContract - aContract;

      return 0;
    });

    return candidates[0];
  };

  // Preload a ticket if triggered from tickets screen
  useEffect(() => {
    if (!preselectedTicketId) return;

    const ticket = (tickets || []).find((t) => t.id === preselectedTicketId);
    if (ticket) {
      setTicketId(ticket.id || null);
      setTicketImage(ticket.imageUrl || null);

      const parsedItems = ticket.itemsJson ? JSON.parse(ticket.itemsJson) : [];
      const found = matchConnector(ticket.nombreEmisor, ticket.rfcEmisor);
      const data: ExtractedTicketData = {
        rfcEmisor: ticket.rfcEmisor,
        nombreEmisor: ticket.nombreEmisor,
        fechaCompra: ticket.fechaCompra,
        folio: ticket.folio,
        total: ticket.total,
        sucursal: ticket.sucursal,
        items: parsedItems,
        billingReference: ticket.billingReference || ticket.referenciaFacturacion || "",
        referenciaFacturacion: ticket.billingReference || ticket.referenciaFacturacion || "",
      } as any;
      setExtractedData(data);
      setEditPortalFields(ticket.portalFields || {});
      const sanitized = sanitizePortalFieldsForConnector(found, ticket.portalFields || data, ticket.rawOcrText);
      const persistedReference = sanitizeBillingReferenceForConnector(
        ticket.portalFields?.billingReference,
        ticket.rawOcrText,
        found
      );
      const detectedReference = sanitized.billingReference || "";
      const initialBillingRef = persistedReference || detectedReference || "";

      setEditNombre(data.nombreEmisor || "");
      setEditRfc(data.rfcEmisor || "");
      setEditFecha(data.fechaCompra || "");
      setEditFolio(initialBillingRef);
      setEditSucursal(data.sucursal || "");
      setEditTotal(ticket.portalFields?.total !== undefined ? ticket.portalFields.total : (data.total || 0));
      setCustomProfileFields({
        rfcReceptor: fiscalProfile?.rfc || "",
        razonSocial: fiscalProfile?.razonSocial || "",
        codigoPostal: fiscalProfile?.codigoPostal || "",
        regimenFiscal: fiscalProfile?.regimenFiscal || "",
        usoCFDI: fiscalProfile?.usoCFDI || "",
        email: fiscalProfile?.correoElectronico || ""
      });
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
      } else if ([
        "queued_for_runner",
        "runner_processing",
        "waiting_fiscal_profile",
        "missing_required_fields",
        "sat_validation_pending",
        "pending_portal_submission",
        "submitted_to_merchant",
        "processing",
        "waiting_portal_result",
        "sat_verifying",
        "merchant_cfdi_downloaded"
      ].includes(ticket.status || "")) {
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

  // 1. Listen to live ticket document updates in real-time
  useEffect(() => {
    if (!ticketId) {
      setLiveTicket(null);
      return;
    }
    const docRef = doc(db, "tickets", ticketId);
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setLiveTicket({ id: snapshot.id, ...data });
      }
    }, (err) => {
      console.error("Error watching live ticket:", err);
    });
    return unsubscribe;
  }, [ticketId]);

  // 2. Listen to live invoice_job document updates if jobId exists
  useEffect(() => {
    const ticketDoc = liveTicket || (tickets || []).find(t => t.id === ticketId);
    const jobKey = ticketDoc?.jobId;
    if (!jobKey) {
      setLiveJob(null);
      return;
    }
    const docRef = doc(db, "invoice_jobs", jobKey);
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        setLiveJob({ id: snapshot.id, ...snapshot.data() });
      }
    }, (err) => {
      console.error("Error watching live job:", err);
    });
    return unsubscribe;
  }, [ticketId, liveTicket?.jobId, tickets]);

  // 3. Protection against infinite spinner/slow automation runner
  const [isTakingTooLong, setIsTakingTooLong] = useState(false);
  useEffect(() => {
    if (activeStep !== "automating") {
      setIsTakingTooLong(false);
      return;
    }
    const timer = setTimeout(() => {
      setIsTakingTooLong(true);
    }, 120000); // 2 minutes timeout
    return () => clearTimeout(timer);
  }, [activeStep, ticketId]);

  // Real-time synchronization with Firestore ticket state
  useEffect(() => {
    if (activeStep !== "automating" || !ticketId) return;

    const currentTicket = liveTicket || (tickets || []).find(t => t.id === ticketId);
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
    } else if (tStatus === "cfdi_validated" || tStatus === "completed" || tStatus === "invoice_obtained") {
      setIsAutomatingLoading(false);
      setSimulationProgress(100);
      setActiveStep("success");
    } else if (tStatus === "requires_manual_review" || tStatus === "failed") {
      setIsAutomatingLoading(false);
      setActiveStep("tracking");
    }
  }, [ticketId, tickets, activeStep, liveTicket]);

  // Loader timeout protection
  useEffect(() => {
    if (activeStep !== "automating" || !ticketId) return;

    const currentTicket = liveTicket || (tickets || []).find(t => t.id === ticketId);
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
      "Comprobando integridad y solicitud preliminar...",
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
      const foundConnector = findMatchingConnector(ocrResult);
      const sanitized = sanitizePortalFieldsForConnector(foundConnector, ocrResult, ocrResult.rawOcrText);

      setExtractedData(ocrResult);
      setEditPortalFields(ocrResult.portalFields || {});
      setEditNombre(ocrResult.nombreEmisor || "");
      setEditRfc(ocrResult.rfcEmisor || "");
      setEditFecha(ocrResult.fechaCompra || "");
      setEditFolio(sanitized.billingReference || "");
      setEditSucursal(ocrResult.sucursal || "");
      setEditTotal(sanitized.total || 0);
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
        rawOcrText: ocrResult.rawOcrText || "",
        portalFields: ocrResult.portalFields || {},
        portalFieldsConfidence: ocrResult.portalFieldsConfidence || {},
        extractionState: ocrResult.extractionState || "extraction_found",
        extractionDiagnostics: ocrResult.extractionDiagnostics || null,
      } as any);
      setTicketId(tId);
      await ensureTrainingRequest(ocrResult, foundConnector, tId);

      // Seek matching connector (already matched above)

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

      if (hasCritFields) {
        setActiveStep("automating");
        setTimeout(() => {
          handleTriggerAutomation(foundConnector, tId, ocrResult);
        }, 300);
      } else {
        let fieldToCorrect: "folio" | "fecha" | "total" | "nombreEmisor" = "folio";
        let reasonCode: "MISSING_FOLIO" | "MISSING_DATE" | "MISSING_TOTAL" | "MISSING_MERCHANT" = "MISSING_FOLIO";
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

  const tryAutoEnqueueBatchTicket = async (ticketId: string, ocrResult: any, foundConnector: any) => {
    if (!foundConnector) return false;
    if (!hasUsableExtractionContract(foundConnector.extractionContract)) return false;
    if (foundConnector.runnerAvailable !== true || foundConnector.status === "automation_pending_setup") {
      return false;
    }
    try {
      const portalMapsColl = collection(db, "portal_maps");
      const qMaps = query(portalMapsColl, where("connectorId", "==", foundConnector.id));
      const pMapsSnap = await getDocs(qMaps);
      if (pMapsSnap.empty) return false;
      
      const pMap = pMapsSnap.docs[0].data();
      const pFields = ocrResult.portalFields || {};
      const validationResult = validatePortalFields(foundConnector.extractionContract, pFields);
      const missingFields = [...validationResult.missingFields, ...validationResult.invalidFields];
      
      if (!fiscalProfile || !fiscalProfile.userId) return false;
      if (!fiscalProfile.rfc || !fiscalProfile.rfc.trim()) return false;
      if (!fiscalProfile.razonSocial || !fiscalProfile.razonSocial.trim()) return false;
      if (!fiscalProfile.codigoPostal || !fiscalProfile.codigoPostal.trim()) return false;
      if (!fiscalProfile.regimenFiscal || !fiscalProfile.regimenFiscal.trim()) return false;
      if (!fiscalProfile.usoCFDI || !fiscalProfile.usoCFDI.trim()) return false;
      
      const fpEmail = fiscalProfile.correoElectronico || fiscalProfile.correoRecepcion || "";
      if (!fpEmail || !fpEmail.trim() || !fpEmail.includes("@")) return false;
      
      if (missingFields.length > 0) return false;
      
      const ticketDataSnapshot = {
        merchantName: ocrResult.nombreEmisor || "",
        portalFields: buildPortalFieldsSnapshot(foundConnector.extractionContract, pFields),
        expectedTicketTotal: Number(ocrResult.total || 0),
        rawOcrText: ocrResult.rawOcrText || "",
      };
      
      const fiscalProfileSnapshot = {
        userId: fiscalProfile.userId,
        rfc: fiscalProfile.rfc,
        razonSocial: fiscalProfile.razonSocial,
        regimenFiscal: fiscalProfile.regimenFiscal,
        codigoPostal: fiscalProfile.codigoPostal,
        usoCFDI: fiscalProfile.usoCFDI,
        correoElectronico: fpEmail,
        createdAt: fiscalProfile.createdAt || new Date().toISOString()
      };
      
      const jobData = {
        ticketId,
        userId: fiscalProfile.userId,
        status: "pending",
        connectorId: foundConnector.id || "",
        portalMapId: pMapsSnap.docs[0].id || "",
        connectorStatusAtRun: foundConnector.status || "real_validation",
        ticketDataSnapshot,
        fiscalProfileSnapshot,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const jobsCollection = collection(db, "invoice_jobs");
      await addDoc(jobsCollection, jobData);
      
      await onUpdateTicketInDb(ticketId, {
        status: "queued_for_runner",
        connectorId: foundConnector.id || ""
      });
      return true;
    } catch (err) {
      console.warn("Error auto-enqueueing batch ticket:", err);
      return false;
    }
  };

  const handleForceTargetedRetry = async () => {
    if (!ticketImage || !matchingConnector) {
      toast.error("No hay una imagen de ticket o conector asociado para reintentar.");
      return;
    }
    
    setIsOcrLoading(true);
    setValidationError(null);
    
    let finishTriggered = false;
    const stopSimulation = simulateOcrProgress(() => {
      finishTriggered = true;
    });

    try {
      const rawBase64 = ticketImage.includes(",") ? ticketImage.split(",")[1] : ticketImage;
      const response = await analyzeTicket({
        imageBase64: rawBase64,
        mimeType: "image/png",
        personalGeminiKey: fiscalProfile?.personalGeminiKey,
        userId: user?.uid,
        forceTargetedRetry: true,
        connectorId: matchingConnector.id
      });

      if (!response.ok) {
        throw new Error("No se pudo forzar el reintento de extracción dirigida.");
      }

      const ocrResult: any = await response.json();
      if (ocrResult.ocrFailed) {
        toast.warning(
          ocrResult.ocrError || "El OCR no pudo extraer el dato de forma dirigida. Completa manualmente.",
          "Captura Manual Activada"
        );
      } else {
        toast.success("¡Lectura automática exitosa en reintento dirigido!", "Lectura Completada");
      }

      const sanitized = sanitizePortalFieldsForConnector(matchingConnector, ocrResult, ocrResult.rawOcrText);

      setExtractedData(ocrResult);
      setEditPortalFields(ocrResult.portalFields || {});
      setEditNombre(ocrResult.nombreEmisor || "");
      setEditRfc(ocrResult.rfcEmisor || "");
      setEditFecha(ocrResult.fechaCompra || "");
      setEditFolio(sanitized.billingReference || "");
      setEditSucursal(ocrResult.sucursal || "");
      setEditTotal(sanitized.total || 0);
      setIsEditing(ocrResult.extractionState === "manual_input_required");

      if (ticketId) {
        await onUpdateTicketInDb(ticketId, {
          status: ocrResult.ocrFailed || ocrResult.extractionState === "manual_input_required" ? "review" : "extracted",
          rfcEmisor: ocrResult.rfcEmisor,
          nombreEmisor: ocrResult.nombreEmisor,
          fechaCompra: ocrResult.fechaCompra,
          folio: ocrResult.folio,
          total: ocrResult.total,
          sucursal: ocrResult.sucursal || "",
          itemsJson: JSON.stringify(ocrResult.items),
          cost: ocrResult.cost !== undefined ? ocrResult.cost : 0.50,
          rawCost: ocrResult.rawCost || 0.0,
          extractionState: ocrResult.extractionState || "extraction_found",
          portalFields: ocrResult.portalFields || {},
          portalFieldsConfidence: ocrResult.portalFieldsConfidence || { billingReference: 1.0, total: 1.0 },
          extractionDiagnostics: ocrResult.extractionDiagnostics || null
        });
      }
    } catch (err: any) {
      toast.error(err.message || "Error al reintentar la extracción dirigida.");
    } finally {
      stopSimulation();
      setIsOcrLoading(false);
    }
  };

  // Convert files loaded manually or captured from camera to base64, compress, and parse
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (files.length > 1) {
      // Multiple file batch upload flow
      setIsBatchModalOpen(true);
      
      // Initialize batch state
      const initialBatch = files.map((file, idx) => ({
        id: idx,
        fileName: file.name,
        progress: 10,
        step: "Validando archivo...",
        status: "pending" as const,
        error: ""
      }));
      setBatchTickets(initialBatch);
      setBatchSummary({
        loaded: 0,
        errors: 0,
        requiresCorrection: 0,
        readyForInvoice: 0
      });

      const updateTicketInBatch = (idx: number, updates: any) => {
        setBatchTickets(prev => {
          if (!prev) return null;
          return prev.map(t => t.id === idx ? { ...t, ...updates } : t);
        });
      };

      const processFile = async (file: File, idx: number) => {
        try {
          if (!file.type.startsWith("image/")) {
            throw new Error("El archivo no es una imagen válida.");
          }
          if (file.size > 10 * 1024 * 1024) {
            throw new Error("El tamaño máximo permitido es 10MB.");
          }

          updateTicketInBatch(idx, { progress: 30, step: "Comprimiendo imagen..." });
          const compressed = await compressImage(file, 1200, 0.75);
          const base64Str = compressed.base64Str;
          const mime = compressed.mimeType;

          updateTicketInBatch(idx, { progress: 50, step: "Analizando con IA OCR..." });
          const rawBase64 = base64Str.split(",")[1];

          const response = await analyzeTicket({
            imageBase64: rawBase64,
            mimeType: mime,
            personalGeminiKey: fiscalProfile?.personalGeminiKey,
            userId: user?.uid,
          });

          if (!response.ok) {
            let errorMsg = "El motor de lectura reportó un error.";
            try {
              const errJson = await response.json();
              if (errJson.error) {
                errorMsg = errJson.error;
              }
            } catch (e) {}
            throw new Error(errorMsg);
          }

          const ocrResult: any = await response.json();
          updateTicketInBatch(idx, { progress: 75, step: "Buscando comercio..." });

          const foundConnector = findMatchingConnector(ocrResult);
          const sanitized = sanitizePortalFieldsForConnector(foundConnector, ocrResult, ocrResult.rawOcrText);

          updateTicketInBatch(idx, { progress: 90, step: "Guardando ticket..." });
          const isDataIncomplete = checkIsDataIncomplete(ocrResult);
          const ticketStatus = ocrResult.ocrFailed || isDataIncomplete ? "review" : "extracted";

          const tId = await onSaveTicketToDb({
            userId: user?.uid || "guest",
            imageUrl: base64Str,
            status: ticketStatus,
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
            rawOcrText: ocrResult.rawOcrText || "",
            portalFields: ocrResult.portalFields || {},
            portalFieldsConfidence: ocrResult.portalFieldsConfidence || {},
            extractionState: ocrResult.extractionState || "extraction_found",
            extractionDiagnostics: ocrResult.extractionDiagnostics || null,
          } as any);

          let isEnqueued = false;
          let isPendingSetup = false;
          if (foundConnector) {
            if (foundConnector.runnerAvailable === true && foundConnector.status !== "automation_pending_setup") {
              if (!isDataIncomplete) {
                updateTicketInBatch(idx, { step: "Encolando en el portal del comercio..." });
                isEnqueued = await tryAutoEnqueueBatchTicket(tId, ocrResult, foundConnector);
              }
            } else {
              isPendingSetup = true;
              await ensureTrainingRequest(ocrResult, foundConnector, tId);
              const runnerErr: ReviewError = {
                reviewReasonCode: "CONNECTOR_RUNNER_NOT_AVAILABLE",
                reviewReasonMessage: "Detectamos este comercio, pero su automatización todavía se está configurando. Guardamos tu ticket para revisión.",
                lastAutomationStep: "connector_resolving",
                connectorAttempted: true,
                connectorId: foundConnector.id || null,
                connectorName: foundConnector.nombre || null,
                portalErrorMessage: "Runner not available"
              };
              await onUpdateTicketInDb(tId, {
                status: "requires_manual_review",
                errorMsg: runnerErr.reviewReasonMessage,
                reviewError: runnerErr as any
              });
            }
          }

          let finalStep = "Listo";
          if (isEnqueued) {
            finalStep = "Solicitud de factura en proceso 🚀";
          } else if (isPendingSetup) {
            finalStep = "Configurando automatización ⏳";
          } else if (ticketStatus === "review") {
            finalStep = "Requiere corregir datos ⚠️";
          } else {
            finalStep = "Ticket digitalizado con éxito ✅";
          }

          updateTicketInBatch(idx, {
            progress: 100,
            step: finalStep,
            status: "success",
            ticketId: tId
          });

          setBatchSummary(prev => {
            const next = { ...prev, loaded: prev.loaded + 1 };
            if (isEnqueued) {
              next.readyForInvoice = prev.readyForInvoice + 1;
            } else {
              next.requiresCorrection = prev.requiresCorrection + 1;
            }
            return next;
          });

        } catch (err: any) {
          console.error("Error batch processing file:", err);
          updateTicketInBatch(idx, {
            progress: 100,
            step: "Error al digitalizar",
            status: "error",
            error: err?.message || "Error desconocido."
          });
          setBatchSummary(prev => ({
            ...prev,
            errors: prev.errors + 1
          }));
        }
      };

      // Sequentially process each file to avoid API concurrency rate limits
      for (let i = 0; i < files.length; i++) {
        await processFile(files[i], i);
      }
      return;
    }

    // Single file upload flow (existing logic)
    const file = files[0];
    setIsOcrLoading(true);
    setMessage(null);

    // Start progress simulation
    let finishTriggered = false;
    const stopSimulation = simulateOcrProgress(() => {
      finishTriggered = true;
    });

    try {
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
          "No tienes conexión a internet en este momento. No te preocupes: hemos guardado la foto de tu ticket de forma segura y realizaremos la solicitud automatizada de tu factura en cuanto recuperes tu conexión. ¡Nosotros nos encargamos! 🌐",
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
      const foundConnector = findMatchingConnector(ocrResult);
      const sanitized = sanitizePortalFieldsForConnector(foundConnector, ocrResult, ocrResult.rawOcrText);

      setExtractedData(ocrResult);
      setEditPortalFields(ocrResult.portalFields || {});
      setEditNombre(ocrResult.nombreEmisor || "");
      setEditRfc(ocrResult.rfcEmisor || "");
      setEditFecha(ocrResult.fechaCompra || "");
      setEditFolio(sanitized.billingReference || "");
      setEditSucursal(ocrResult.sucursal || "");
      setEditTotal(sanitized.total || 0);
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
        userId: user?.uid || "guest",
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
        rawOcrText: ocrResult.rawOcrText || "",
        portalFields: ocrResult.portalFields || {},
        portalFieldsConfidence: ocrResult.portalFieldsConfidence || {},
        extractionState: ocrResult.extractionState || "extraction_found",
        extractionDiagnostics: ocrResult.extractionDiagnostics || null,
      } as any);
      setTicketId(tId);
      await ensureTrainingRequest(ocrResult, foundConnector, tId);

      stopSimulation();
      // Wait for completion callback to trigger
      while (!finishTriggered) {
        await new Promise(r => setTimeout(r, 50));
      }

      // Auto-trigger automation if critical fields are present
      const hasCritFields = !!(ocrResult.nombreEmisor?.trim() && ocrResult.total && ocrResult.total > 0 && ocrResult.fechaCompra?.trim() && ocrResult.folio?.trim());
      const rfcReceptorVal = fiscalProfile?.rfc || "";
      const isRfcReceptorValid = /^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i.test(rfcReceptorVal);

      if (hasCritFields) {
        setActiveStep("automating");
        setTimeout(() => {
          handleTriggerAutomation(foundConnector, tId, ocrResult);
        }, 300);
      } else {
        let fieldToCorrect: "folio" | "fecha" | "total" | "nombreEmisor" = "folio";
        let reasonCode: "MISSING_FOLIO" | "MISSING_DATE" | "MISSING_TOTAL" | "MISSING_MERCHANT" = "MISSING_FOLIO";
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
      setMessage(err.message || "Error al aprender el portal de facturación del comercio.");
    } finally {
      setIsLearningLoading(false);
    }
  };

  const ensureTrainingRequest = async (ocrResult: any, foundConnector: any, tId: string | null) => {
    if (!foundConnector || foundConnector.runnerAvailable === false || foundConnector.status === "automation_pending_setup") {
      try {
        const requestId = `${user?.uid || "guest"}_${tId || "unknown"}`;
        const reqRef = doc(db, "training_requests", requestId);
        const existingRequest = await getDoc(reqRef);
        if (existingRequest.exists()) return;
        await setDoc(reqRef, {
          userId: user?.uid || "guest",
          storeName: foundConnector?.nombre || ocrResult?.nombreEmisor || "Comercio por identificar",
          rfc: foundConnector?.rfc || ocrResult?.rfcEmisor || "",
          officialBillingUrl: foundConnector?.portalUrl || "",
          createdAt: new Date().toISOString()
        });
        console.log(`[Training Request] Created for: ${foundConnector?.nombre || ocrResult?.nombreEmisor}`);
      } catch (e) {
        console.warn("Could not save training request:", e);
      }
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
      "queued_for_runner",
      "runner_processing",
      "merchant_cfdi_downloaded",
      "sat_validation_pending",
      "cfdi_validated",
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
      setBlockerReason(cycleCount >= limit ? "limit" : "month");
      setShowRenewalBlocker(true);
      return;
    }

    setActiveStep("automating");
    setIsAutomatingLoading(true);
    setSimulationLogs([]);
    setSimulationProgress(0);

    const fieldsSchema = activeConn ? JSON.parse(activeConn.fieldsJson || "[]") : [];

    const addLog = (text: string, delay: number) => {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          setSimulationLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${text}`]);
          resolve();
        }, delay);
      });
    };

    try {
      await addLog("📋 ETAPA 1: Iniciando lectura del ticket and validación...", 500);
      
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
        await ensureTrainingRequest(activeExtractedData, null, activeTicketId);
        
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

      // Scheme validation
      let flowSteps = [];
      if (!hasUsableExtractionContract(activeConn.extractionContract)) {
        try {
          throw new Error("El conector no tiene un extractionContract aprobado con campos reales del portal.");
        } catch (e: any) {
          const schemaErr: ReviewError = {
            reviewReasonCode: "CONNECTOR_SCHEMA_INVALID",
            reviewReasonMessage: "El conector tiene una configuración incompleta y requiere revisión técnica.",
            lastAutomationStep: "connector_resolving",
            connectorAttempted: true,
            connectorId: activeConn.id || null,
            connectorName: activeConn.nombre || null,
            portalErrorMessage: e.message || "Invalid fieldsJson or flowJson schema",
            reviewError: {
              connectorStatus: activeConn.status || "undefined",
              runnerAvailable: activeConn.runnerAvailable || false,
              isProductionReady: activeConn.isProductionReady || false,
              portalMapFound: false,
              portalMapApproved: false,
              hasStepsJson: !!activeConn.flowJson,
              missingFields: ["fieldsSchema_validation_failed"],
              blockingReason: "CONNECTOR_SCHEMA_INVALID: " + (e.message || "")
            } as any
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
      }

      // Check runner availability
      if (activeConn.runnerAvailable !== true || activeConn.status === "automation_pending_setup") {
        const runnerErr: ReviewError = {
          reviewReasonCode: "CONNECTOR_RUNNER_NOT_AVAILABLE",
          reviewReasonMessage: "Detectamos este comercio, pero su automatización todavía se está configurando. Guardamos tu ticket para revisión.",
          lastAutomationStep: "connector_resolving",
          connectorAttempted: true,
          connectorId: activeConn.id || null,
          connectorName: activeConn.nombre || null,
          portalErrorMessage: "Runner not available"
        };
        await ensureTrainingRequest(activeExtractedData, activeConn, activeTicketId);
        await onUpdateTicketInDb(activeTicketId, {
          status: "requires_manual_review",
          errorMsg: runnerErr.reviewReasonMessage,
          reviewError: runnerErr as any
        });
        await addAutomationEvent("connector_resolving", "failed", runnerErr.reviewReasonMessage, undefined, "CONNECTOR_RUNNER_NOT_AVAILABLE");
        setIsAutomatingLoading(false);
        return;
      }

      // Check connector status
      if (!["production_ready", "automation_available", "real_validation"].includes(activeConn.status)) {
        let code: "CONNECTOR_NOT_PRODUCTION_READY" | "CONNECTOR_RESTRICTED" | "CONNECTOR_BROKEN" = "CONNECTOR_NOT_PRODUCTION_READY";
        let msg = "Detectamos este comercio, pero su automatización todavía se está configurando. Guardamos tu ticket para revisión.";
        if (activeConn.status === "restricted") {
          code = "CONNECTOR_RESTRICTED";
          msg = "Este portal requiere credenciales especiales o permisos de acceso restringidos.";
        } else if (activeConn.status === "broken" || activeConn.status === "automation_blocked") {
          code = "CONNECTOR_BROKEN";
          msg = "El conector de este portal se encuentra temporalmente fuera de servicio por mantenimiento o restricciones del portal.";
        }

        const runnerErr: ReviewError = {
          reviewReasonCode: code,
          reviewReasonMessage: msg,
          lastAutomationStep: "connector_resolving",
          connectorAttempted: true,
          connectorId: activeConn.id || null,
          connectorName: activeConn.nombre || null,
          portalErrorMessage: `Connector status: ${activeConn.status}`
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

      // Check portalMap
      await addLog("🔌 Verificando mapa de navegación oficial (portalMap)...", 500);
      const portalMapsRef = collection(db, "portal_maps");
      const q = query(portalMapsRef, where("connectorId", "==", activeConn.id || ""));
      const portalMapsSnap = await getDocs(q);

      if (portalMapsSnap.empty) {
        const mapErr: ReviewError = {
          reviewReasonCode: "PORTAL_MAP_NOT_FOUND",
          reviewReasonMessage: "No se encontró el mapa de navegación oficial para este portal.",
          lastAutomationStep: "connector_resolving",
          connectorAttempted: true,
          connectorId: activeConn.id || null,
          connectorName: activeConn.nombre || null,
          portalErrorMessage: "Portal map not found"
        };
        await onUpdateTicketInDb(activeTicketId, {
          status: "requires_manual_review",
          errorMsg: mapErr.reviewReasonMessage,
          reviewError: mapErr as any
        });
        await addAutomationEvent("connector_resolving", "failed", mapErr.reviewReasonMessage, undefined, "PORTAL_MAP_NOT_FOUND");
        setIsAutomatingLoading(false);
        return;
      }

      const pMap = portalMapsSnap.docs[0].data();
      if (!pMap.isApproved) {
        const mapErr: ReviewError = {
          reviewReasonCode: "PORTAL_MAP_NOT_APPROVED",
          reviewReasonMessage: "El mapa de navegación del portal aún no ha sido aprobado por el administrador.",
          lastAutomationStep: "connector_resolving",
          connectorAttempted: true,
          connectorId: activeConn.id || null,
          connectorName: activeConn.nombre || null,
          portalErrorMessage: "Portal map not approved"
        };
        await onUpdateTicketInDb(activeTicketId, {
          status: "requires_manual_review",
          errorMsg: mapErr.reviewReasonMessage,
          reviewError: mapErr as any
        });
        await addAutomationEvent("connector_resolving", "failed", mapErr.reviewReasonMessage, undefined, "PORTAL_MAP_NOT_APPROVED");
        setIsAutomatingLoading(false);
        return;
      }

      await addAutomationEvent("connector_resolving", "success", `Portal oficial de facturación del comercio identificado como: ${activeConn.nombre}`);
      await addLog(`✅ Mapa de navegación verificado y aprobado.`, 400);

      // portalFields must already come from contract-directed OCR or explicit user input.
      const ticketDocRef = doc(db, "tickets", activeTicketId);
      const currentTicketDoc = await getDoc(ticketDocRef);
      if (!currentTicketDoc.exists()) {
        throw new Error("El ticket no existe en la base de datos.");
      }
      const currentTicketData = currentTicketDoc.data();
      
      let pFields = currentTicketData.portalFields || {};

      // LEER DE NUEVO TICKET DESDE FIRESTORE (Snapshot real e inmutable)
      await addLog("⚙️ Validando campos persistidos en la base de datos (Firestore)...", 400);
      const freshTicketDoc = await getDoc(ticketDocRef);
      const freshTicketData = freshTicketDoc.data()!;
      
      let rawPFields = freshTicketData.portalFields || {};
      const sanitizedFreshRef = sanitizeBillingReferenceForConnector(
        rawPFields.billingReference,
        freshTicketData.rawOcrText,
        activeConn
      );
      
      pFields = {
        ...rawPFields,
        billingReference: sanitizedFreshRef
      };
      
      if (rawPFields.billingReference !== sanitizedFreshRef) {
        await updateDoc(ticketDocRef, {
          portalFields: pFields
        });
      }

      // First check technical configuration of the connector (Rule 11)
      const hasOperationalStatus = ["production_ready", "automation_available", "real_validation"].includes(activeConn.status);
      const isTechnicalConfigIncomplete = !activeConn.id ||
        !pMap ||
        (!pMap.isApproved && pMap.status !== "approved") ||
        !pMap.stepsJson ||
        activeConn.runnerAvailable !== true ||
        !hasOperationalStatus;

      if (isTechnicalConfigIncomplete) {
        const configErr: ReviewError = {
          reviewReasonCode: "CONNECTOR_SCHEMA_INVALID",
          reviewReasonMessage: "El conector tiene una configuración incompleta y requiere revisión técnica.",
          lastAutomationStep: "connector_resolving",
          connectorAttempted: true,
          connectorId: activeConn.id || null,
          connectorName: activeConn.nombre || null,
          portalErrorMessage: `Configuración técnica incompleta.`,
          reviewError: {
            connectorStatus: activeConn.status || "undefined",
            runnerAvailable: activeConn.runnerAvailable || false,
            isProductionReady: activeConn.isProductionReady || false,
            portalMapFound: !!pMap,
            portalMapApproved: pMap ? (pMap.isApproved === true || pMap.status === "approved") : false,
            hasStepsJson: pMap ? !!pMap.stepsJson : false,
            missingFields: ["technical_config"],
            blockingReason: "CONFIG_INCOMPLETE: Technical fields missing"
          } as any
        };
        await onUpdateTicketInDb(activeTicketId, {
          status: "requires_manual_review",
          reviewReasonCode: "CONNECTOR_SCHEMA_INVALID",
          errorMsg: configErr.reviewReasonMessage,
          reviewError: configErr as any
        });
        await addAutomationEvent("connector_resolving", "failed", configErr.reviewReasonMessage, undefined, "CONNECTOR_SCHEMA_INVALID");
        setIsAutomatingLoading(false);
        return;
      }

      const contract = activeConn.extractionContract;
      const portalValidation = validatePortalFields(contract, pFields);
      let missingTicketFields: string[] = [...portalValidation.missingFields, ...portalValidation.invalidFields];
      let missingFiscalFields: string[] = [];
      const initialRequiredFields: string[] = Array.isArray(contract?.screenOrder)
        ? (contract.screenOrder.find((s: any) => s.screenIndex === 1)?.requiredFields || [])
        : [];

      for (const fieldKey of initialRequiredFields) {
        if (fieldKey.startsWith("fiscalProfile.")) {
          const k = fieldKey.replace("fiscalProfile.", "");
          let mappedKey = k;
          if (k === "rfc") mappedKey = "rfc";
          if (k === "businessName") mappedKey = "razonSocial";
          if (k === "postalCode") mappedKey = "codigoPostal";
          if (k === "taxRegime") mappedKey = "regimenFiscal";
          if (k === "cfdiUse") mappedKey = "usoCFDI";
          if (k === "email") mappedKey = "correoElectronico";

          const val = fiscalProfile[mappedKey];
          const cleanVal = (val || "").toString().trim();
          if (mappedKey === "rfc") {
            if (cleanVal.length < 12) missingFiscalFields.push(fieldKey);
          } else if (mappedKey === "correoElectronico") {
            if (!cleanVal.includes("@")) missingFiscalFields.push(fieldKey);
          } else {
            if (!cleanVal) missingFiscalFields.push(fieldKey);
          }
        }
      }

      // If initial physical fields are missing, stop immediately and report missing_required_fields
      if (missingTicketFields.length > 0) {
        await addLog(`❌ Faltan campos físicos iniciales del ticket: ${missingTicketFields.join(", ")}`, 400);

        const hasBillingRefMissing = missingTicketFields.includes("portalFields.billingReference");
        const reasonMessage = hasBillingRefMissing
          ? "Necesitamos la referencia de facturación impresa en tu ticket para solicitar la factura."
          : "Necesitamos completar algunos datos del ticket para solicitar la factura en el portal oficial.";
        const configErr: ReviewError = {
          reviewReasonCode: "MISSING_REQUIRED_FIELDS",
          reviewReasonMessage: reasonMessage,
          lastAutomationStep: "connector_resolving",
          connectorAttempted: true,
          connectorId: activeConn.id || null,
          connectorName: activeConn.nombre || null,
          portalErrorMessage: `Campos físicos requeridos para iniciar faltantes: ${missingTicketFields.join(", ")}`,
          reviewError: {
            connectorStatus: activeConn.status || "undefined",
            runnerAvailable: activeConn.runnerAvailable || false,
            isProductionReady: activeConn.isProductionReady || false,
            portalMapFound: !!pMap,
            portalMapApproved: pMap ? (pMap.isApproved === true || pMap.status === "approved") : false,
            hasStepsJson: pMap ? !!pMap.stepsJson : false,
            missingFields: missingTicketFields,
            blockingReason: "MISSING_REQUIRED_FIELDS: " + missingTicketFields.join(", ")
          } as any
        };

        await onUpdateTicketInDb(activeTicketId, {
          status: "missing_required_fields",
          reviewReasonCode: "MISSING_REQUIRED_FIELDS",
          errorMsg: configErr.reviewReasonMessage,
          reviewError: configErr as any,
          missingFields: missingTicketFields
        } as any);
        await addAutomationEvent("connector_resolving", "failed", configErr.reviewReasonMessage, undefined, "MISSING_REQUIRED_FIELDS");
        setIsAutomatingLoading(false);
        return;
      }

      // If initial fiscal fields are missing, stop here and report waiting_fiscal_profile
      if (missingFiscalFields.length > 0) {
        await addLog(`❌ Faltan campos fiscales requeridos para la primera pantalla: ${missingFiscalFields.join(", ")}`, 400);

        const reasonMessage = "El portal necesita tus datos fiscales para continuar con la factura.";
        const configErr: ReviewError = {
          reviewReasonCode: "MISSING_FISCAL_PROFILE",
          reviewReasonMessage: reasonMessage,
          lastAutomationStep: "connector_resolving",
          connectorAttempted: true,
          connectorId: activeConn.id || null,
          connectorName: activeConn.nombre || null,
          portalErrorMessage: `Campos fiscales requeridos para iniciar faltantes: ${missingFiscalFields.join(", ")}`,
          reviewError: {
            connectorStatus: activeConn.status || "undefined",
            runnerAvailable: activeConn.runnerAvailable || false,
            isProductionReady: activeConn.isProductionReady || false,
            portalMapFound: !!pMap,
            portalMapApproved: pMap ? (pMap.isApproved === true || pMap.status === "approved") : false,
            hasStepsJson: pMap ? !!pMap.stepsJson : false,
            missingFields: missingFiscalFields,
            blockingReason: "MISSING_FISCAL_PROFILE: " + missingFiscalFields.join(", ")
          } as any
        };

        await onUpdateTicketInDb(activeTicketId, {
          status: "waiting_fiscal_profile",
          reviewReasonCode: "MISSING_FISCAL_PROFILE",
          errorMsg: configErr.reviewReasonMessage,
          reviewError: configErr as any,
          missingFields: missingFiscalFields
        } as any);
        await addAutomationEvent("connector_resolving", "failed", configErr.reviewReasonMessage, undefined, "MISSING_FISCAL_PROFILE");
        setIsAutomatingLoading(false);
        return;
      }

      await addLog("✅ Todos los campos requeridos validados desde Firestore.", 300);
      setSimulationProgress(40);

      // Create snapshots using ONLY Firestore data (No fallbacks to internal UUIDs)
      await addLog("📥 Creando ticketDataSnapshot y fiscalProfileSnapshot...", 300);
      const ticketDataSnapshot = {
        merchantName: freshTicketData.nombreEmisor || "",
        portalFields: buildPortalFieldsSnapshot(contract, pFields),
        expectedTicketTotal: Number(freshTicketData.total || 0),
        rawOcrText: freshTicketData.rawOcrText || "",
      };

      const fiscalProfileSnapshot: FiscalProfile = {
        userId: fiscalProfile.userId,
        rfc: fiscalProfile.rfc,
        razonSocial: fiscalProfile.razonSocial,
        regimenFiscal: fiscalProfile.regimenFiscal,
        codigoPostal: fiscalProfile.codigoPostal,
        usoCFDI: fiscalProfile.usoCFDI,
        correoElectronico: fiscalProfile.correoElectronico || fiscalProfile.correoRecepcion || "",
        createdAt: fiscalProfile.createdAt
      };

      // Create the invoice_job document
      await addLog("📥 Encolando job en la colección invoice_jobs...", 400);
      const jobData = {
        ticketId: activeTicketId,
        userId: fiscalProfile.userId,
        status: "pending",
        connectorId: activeConn.id || "",
        portalMapId: portalMapsSnap.docs[0].id || "",
        connectorStatusAtRun: activeConn.status || "real_validation",
        ticketDataSnapshot,
        fiscalProfileSnapshot,
        attempts: 0,
        maxAttempts: 3,
        currentStepIndex: 0,
        waitingForFields: [],
        canResume: true,
        lastCompletedStepIndex: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const jobsCollection = collection(db, "invoice_jobs");
      const jobRef = await addDoc(jobsCollection, jobData);
      
      await onUpdateTicketInDb(activeTicketId, {
        status: "queued_for_runner",
        connectorId: activeConn.id || "",
        jobId: jobRef.id
      });

      await addAutomationEvent("connector_resolving", "success", "Ticket encolado para procesamiento por el motor robotizado.");
      await addLog("🎉 ¡Ticket encolado con éxito para procesamiento automático!", 400);
      setSimulationProgress(100);

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
      await addLog(`❌ ERROR: ${errMessage}`, 200);

      const reviewErr: ReviewError = {
        reviewReasonCode: "UNKNOWN_RUNNER_ERROR",
        reviewReasonMessage: errMessage || "Error desconocido al encolar el job.",
        lastAutomationStep: "connector_resolving",
        connectorAttempted: true,
        connectorId: activeConn?.id || null,
        connectorName: activeConn?.nombre || null,
        portalErrorMessage: errMessage
      };

      if (activeTicketId) {
        await addAutomationEvent("connector_resolving", "failed", reviewErr.reviewReasonMessage, undefined, "UNKNOWN_RUNNER_ERROR");
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
      { progress: 15, step: "Buscando portal del comercio..." },
      { progress: 35, step: "Preparando la solicitud..." },
      { progress: 55, step: "Configurando conector..." },
      { progress: 75, step: "Estableciendo conexión segura..." },
      { progress: 95, step: "Registrando conector..." },
      { progress: 100, step: "¡Configuración completada con éxito! Iniciando solicitud en el portal..." }
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
          toast.success("🧠 ¡Entrenamiento de IA completado! Solicitud enviada de inmediato.");
        } catch (err: any) {
          console.error("Error after training complete:", err);
          toast.error("La configuración finalizó pero no se pudo obtener la factura desde el portal automáticamente.");
          setIsTrainingModel(false);
        }
      }
    }, 1500); // 1.5 seconds per step, total ~9 seconds
  };

  const handleSaveEditedData = async () => {
    const cleanRef = sanitizeBillingReferenceForConnector(
      editFolio,
      extractedData?.rawOcrText,
      matchingConnector
    );

    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(editFolio.trim());
    const hasInternalPrefix = /^ticket_|^job_|^OFFLINE-|^worker-/i.test(editFolio.trim());
    if (isUuid || hasInternalPrefix || (editFolio.trim() && !cleanRef)) {
      setValidationError("Ese valor parece un identificador interno o folio fiscal, no una referencia de facturación del portal. Ingresa la referencia impresa en el ticket.");
      return;
    }

    const contract = matchingConnector?.extractionContract;
    const isContractConnector = !!contract;

    let updatedData: ExtractedTicketData;
    const totalNum = parseFloat(editTotal.toString());

    if (isContractConnector) {
      // Stage 1: Validate ticket required fields from contract
      const refField = contract.requiredPortalFields.find((f: any) => f.canonicalKey === "billingReference");
      const totalField = contract.requiredPortalFields.find((f: any) => f.canonicalKey === "total");

      if (refField && refField.required) {
        if (!editFolio.trim()) {
          setValidationError(`El campo '${refField.label}' es obligatorio.`);
          return;
        }
        // Validation pattern
        if (refField.validationPattern) {
          const regex = new RegExp(refField.validationPattern, "i");
          if (!regex.test(editFolio.trim())) {
            setValidationError(`El campo '${refField.label}' no coincide con el formato esperado.`);
            return;
          }
        }
        // Forbidden patterns
        if (refField.forbiddenPatterns) {
          for (const pattern of refField.forbiddenPatterns) {
            const regex = new RegExp(pattern, "i");
            if (regex.test(editFolio.trim())) {
              setValidationError(`El campo '${refField.label}' contiene un valor prohibido (ej: UUID/ID interno). Por favor captura el dato del ticket impreso.`);
              return;
            }
          }
        }
      }

      if (totalField && totalField.required) {
        if (isNaN(totalNum) || totalNum <= 0) {
          setValidationError(`El campo '${totalField.label}' es obligatorio y debe ser mayor a cero.`);
          return;
        }
        if (totalField.validationPattern) {
          const regex = new RegExp(totalField.validationPattern, "i");
          if (!regex.test(totalNum.toString())) {
            setValidationError(`El campo '${totalField.label}' no tiene un formato numérico válido.`);
            return;
          }
        }
      }

      const correctedPortalFields = {
        ...editPortalFields,
        ...(refField ? { billingReference: editFolio.trim() } : {}),
        ...(totalField ? { total: !isNaN(totalNum) ? totalNum : "" } : {})
      };
      const contractValidation = validatePortalFields(contract, correctedPortalFields);
      if (!contractValidation.isValid) {
        const invalidKey = [...contractValidation.missingFields, ...contractValidation.invalidFields][0];
        const invalidField = contract.requiredPortalFields.find((field: any) =>
          `portalFields.${String(field.canonicalKey || field.key || "").replace(/^portalFields\./, "")}` === invalidKey
        );
        setValidationError(`Revisa el campo '${invalidField?.label || invalidKey}'. Debe coincidir con el dato impreso que solicita el portal.`);
        return;
      }

      setValidationError(null);

      // Construct dynamic updated data
      updatedData = {
        ...extractedData!,
        folio: editFolio.trim(),
        total: !isNaN(totalNum) ? totalNum : (extractedData?.total || 0),
        fechaCompra: editFecha.trim() || (extractedData?.fechaCompra || ""),
        sucursal: editSucursal.trim(),
        portalFields: correctedPortalFields
      };

      // Save/update user's fiscal profile if fields were edited
      const updatedProfile = { ...fiscalProfile };
      let profileChanged = false;
      
      const pFields = ["rfcReceptor", "razonSocial", "codigoPostal", "regimenFiscal", "usoCFDI", "email"];
      for (const k of pFields) {
        if (customProfileFields[k]?.trim()) {
          let mappedKey = k;
          if (k === "rfcReceptor") mappedKey = "rfc";
          if (k === "email") mappedKey = "correoElectronico";
          
          if (updatedProfile[mappedKey] !== customProfileFields[k]) {
            updatedProfile[mappedKey] = customProfileFields[k];
            profileChanged = true;
          }
        }
      }
      
      if (profileChanged && onSaveProfile) {
        const confirmSave = window.confirm("¿Deseas guardar los cambios fiscales editados en tu Perfil Fiscal para futuras facturas?");
        if (confirmSave) {
          try {
            await onSaveProfile(updatedProfile);
            toast.success("Se actualizó tu perfil fiscal con los datos corregidos.");
          } catch (e) {
            console.error("Error saving updated profile:", e);
          }
        }
      }
    } else {
      // Standard generic merchant validations
      const isRfcReceptorValid = /^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i.test(fiscalProfile?.rfc || "");
      if (!isRfcReceptorValid) {
        const val = (customProfileFields.rfcReceptor || "").trim().toUpperCase();
        const validFormat = /^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i.test(val);
        if (!validFormat) {
          setValidationError("El RFC del receptor no tiene un formato válido ante el SAT.");
          return;
        }
        // Save to fiscalProfile
        const updatedProfile = { ...fiscalProfile, rfc: val };
        if (onSaveProfile) {
          try {
            await onSaveProfile(updatedProfile);
            toast.success("Se actualizó tu RFC receptor en tu perfil fiscal.");
          } catch (e) {
            console.error("Error saving updated profile RFC:", e);
          }
        }
      }

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
        setValidationError("Necesitamos la referencia de facturación impresa en tu ticket para solicitar la factura en el portal del comercio.");
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
        const portalFields = updatedData.portalFields || {
          billingReference: updatedData.folio || "",
          total: updatedData.total || 0,
          ticketNumber: updatedData.folio || "",
          date: updatedData.fechaCompra || ""
        };

        await onUpdateTicketInDb(ticketId, {
          rfcEmisor: updatedData.rfcEmisor || "",
          nombreEmisor: updatedData.nombreEmisor || "",
          fechaCompra: updatedData.fechaCompra || "",
          folio: updatedData.folio || "",
          total: updatedData.total || 0,
          sucursal: updatedData.sucursal || "",
          portalFields: portalFields
        });
        toast.success("Datos del ticket y portal persistidos en base de datos.");
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

    // Immediately trigger automation (Guardar y continuar behavior)
    if (found && found.runnerAvailable) {
      await handleTriggerAutomation(found, ticketId, updatedData);
    }
  };

  const handleSaveInlineInputs = async () => {
    if (!ticketId) return;
    
    const currentTicket = liveTicket || (tickets || []).find(t => t.id === ticketId);
    const missing = currentTicket?.missingFields || [];
    const missingFieldsToReport: string[] = [];

    // Verify all missing fields are entered
    for (const key of missing) {
      const val = inlineInputs[key] || "";
      if (!val.trim()) {
        missingFieldsToReport.push(key);
      }
    }

    if (missingFieldsToReport.length > 0) {
      toast.error("Por favor completa todos los campos requeridos.");
      return;
    }

    setIsAutomatingLoading(true);
    try {
      const docRef = doc(db, "tickets", ticketId);
      const ticketSnap = await getDoc(docRef);
      if (!ticketSnap.exists()) {
        toast.error("El ticket no existe.");
        setIsAutomatingLoading(false);
        return;
      }
      const ticketData = ticketSnap.data();

      // Separate inputs
      const profileUpdates: Record<string, string> = {};
      const ticketUpdates: Record<string, any> = {};
      const newPortalFields = { ...(ticketData.portalFields || {}) };

      for (const key of missing) {
        const val = inlineInputs[key].trim();
        if (key.startsWith("fiscalProfile.")) {
          const k = key.replace("fiscalProfile.", "");
          let mappedKey = k;
          if (k === "rfc") mappedKey = "rfc";
          if (k === "businessName") mappedKey = "razonSocial";
          if (k === "postalCode") mappedKey = "codigoPostal";
          if (k === "taxRegime") mappedKey = "regimenFiscal";
          if (k === "cfdiUse") mappedKey = "usoCFDI";
          if (k === "email") mappedKey = "correoElectronico";

          profileUpdates[mappedKey] = val;
        } else if (key.startsWith("portalFields.")) {
          const k = key.replace("portalFields.", "");
          if (k === "billingReference") {
            ticketUpdates.folio = val;
            newPortalFields.billingReference = val;
            newPortalFields.ticketNumber = val;
          } else if (k === "total") {
            const num = parseFloat(val);
            ticketUpdates.total = isNaN(num) ? 0 : num;
            newPortalFields.total = isNaN(num) ? 0 : num;
          } else if (k === "date") {
            ticketUpdates.fechaCompra = val;
            newPortalFields.date = val;
          }
        }
      }

      // Save fiscal profile updates if any
      let finalProfile = { ...(fiscalProfile || {}) };
      if (Object.keys(profileUpdates).length > 0) {
        finalProfile = { ...finalProfile, ...profileUpdates };
        if (onSaveProfile) {
          await onSaveProfile(finalProfile);
        }
      }

      // Reset associated invoice_job if it exists (Case C)
      if (ticketData.jobId) {
        try {
          const jobDocRef = doc(db, "invoice_jobs", ticketData.jobId);
          const jobSnap = await getDoc(jobDocRef);
          if (jobSnap.exists()) {
            const jobOldData = jobSnap.data();
            const ticketDataSnapshot = {
              ...(jobOldData.ticketDataSnapshot || {}),
              ...ticketUpdates,
              folio: newPortalFields.billingReference || jobOldData.ticketDataSnapshot?.folio || "",
              billingReference: newPortalFields.billingReference || jobOldData.ticketDataSnapshot?.billingReference || "",
              total: newPortalFields.total !== undefined ? newPortalFields.total : (jobOldData.ticketDataSnapshot?.total || 0),
              date: newPortalFields.date || jobOldData.ticketDataSnapshot?.date || ""
            };
            
            const fiscalProfileSnapshot = {
              ...(jobOldData.fiscalProfileSnapshot || {}),
              ...profileUpdates
            };

            await updateDoc(jobDocRef, {
              status: "pending",
              attempts: 0,
              ticketDataSnapshot,
              fiscalProfileSnapshot,
              waitingForFields: [],
              canResume: true,
              updatedAt: new Date().toISOString()
            });
          }
        } catch (jobErr) {
          console.error("Error updating/resetting invoice_job in Firestore:", jobErr);
        }
      }

      // Save ticket updates in Firestore
      const finalTicketUpdates = {
        ...ticketUpdates,
        portalFields: newPortalFields,
        status: "queued_for_runner", // Queue back for runner
        errorMsg: null,
        reviewReasonCode: null,
        reviewError: null
      };

      await updateDoc(docRef, finalTicketUpdates);
      
      if (onUpdateTicketInDb) {
        await onUpdateTicketInDb(ticketId, finalTicketUpdates);
      }

      toast.success("Campos guardados. Reintentando procesamiento automático...");
      
      if (!ticketData.jobId) {
        const activeConn = matchingConnector || matchConnector(ticketData.nombreEmisor || "", ticketData.rfcEmisor || "");
        if (activeConn) {
          await handleTriggerAutomation(activeConn, ticketId, {
            ...ticketData,
            ...finalTicketUpdates
          });
        } else {
          toast.error("No se pudo iniciar el proceso: conector no identificado.");
          setIsAutomatingLoading(false);
        }
      } else {
        setIsAutomatingLoading(false);
      }
    } catch (err: any) {
      console.error("Error saving inline inputs:", err);
      toast.error("Ocurrió un error al guardar los campos: " + err.message);
      setIsAutomatingLoading(false);
    }
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

  const isSimilares = matchingConnector?.rfc === "FSI120304XYZ" || matchingConnector?.nombre?.toLowerCase().includes("similares") || extractedData?.nombreEmisor?.toLowerCase().includes("similares") || extractedData?.rfcEmisor === "FSI120304XYZ";
  const folioLabel = isSimilares ? "Referencia de facturación" : "Folio del ticket";

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
                  : "Tu cobertura mensual de obtención de facturas ha vencido desde tu última fecha de pago."
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
                El motor OCR lee pixeles refractarios en 3D para deducir montos, referencias de facturación, fecha y el RFC corporativo.
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

              <div id="general-status-card" className="bg-gradient-to-tr from-[#0546F0] to-[#1268FF] text-white rounded-2xl p-4 shadow-md relative overflow-hidden select-none">
 
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider text-left">
                    Estado general
                  </span>
                </div>
 
                <div className="grid grid-cols-2 gap-3">
                  {/* Procesado Card with live calculated values */}
                  <button
                    type="button"
                    onClick={() => onTabChange && onTabChange("tickets", "cfdi-obtenidos")}
                    className="bg-white/10 hover:bg-white/15 active:bg-white/25 border border-white/15 rounded-xl p-2.5 text-left transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-white/30 w-full block text-left"
                  >
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
                  </button>
 
                  {/* Pendiente Card with live count */}
                  <button
                    type="button"
                    onClick={() => onTabChange && onTabChange("tickets", "en-seguimiento")}
                    className="bg-white/10 hover:bg-white/15 active:bg-white/25 border border-white/15 rounded-xl p-2.5 text-left transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-white/30 w-full block text-left"
                  >
                    <span className="text-[10px] text-white/70 font-semibold block uppercase tracking-wider">
                      En seguimiento
                    </span>
                    <span className="text-base font-black text-white mt-0.5 block">
                      {(tickets || []).filter(t => t.status !== "completed" && t.status !== "cfdi_validated").length} {(tickets || []).filter(t => t.status !== "completed" && t.status !== "cfdi_validated").length === 1 ? "ticket" : "tickets"}
                    </span>
                    <span className="text-[9px] text-blue-200 block mt-0.5 font-bold leading-normal">
                      Pendientes
                    </span>
                  </button>
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
                multiple
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
                  Bitácora inteligente en tiempo real para flujos técnicos, de obtención de facturas y de integraciones bancarias. Organiza alertas operativas críticas del conector y el SAT.
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

              {/* BATCH UPLOAD DIALOG MODAL */}
              <AnimatePresence>
                {isBatchModalOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setIsBatchModalOpen(false)}
                      className="absolute inset-0 bg-slate-900/35 backdrop-blur-md cursor-zoom-out"
                    />

                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 15 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 15 }}
                      className="bg-white dark:bg-[#0b0d19] border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-6 shadow-xl relative max-w-2xl w-full z-10 flex flex-col max-h-[85vh] text-left"
                    >
                      {/* Header block */}
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 bg-blue-50 dark:bg-blue-950/40 rounded-xl">
                            <Sparkles className="w-5 h-5 text-blue-500 animate-pulse" />
                          </div>
                          <div>
                            <h3 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-tight">
                              Procesamiento Múltiple de Tickets
                            </h3>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
                              Digitalización inteligente en lote
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsBatchModalOpen(false)}
                          className="p-1 text-slate-450 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-lg cursor-pointer transition select-none border-none bg-transparent"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Summary Metrics */}
                      <div className="grid grid-cols-4 gap-3 bg-slate-50/50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200/40 dark:border-slate-800/60 my-4 text-center animate-fade-in">
                        <div>
                          <span className="text-[9px] text-slate-500 font-bold block uppercase tracking-wider">Cargados</span>
                          <span className="text-lg font-black text-[#0b53f4] dark:text-blue-400 mt-0.5 block">{batchSummary.loaded}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-500 font-bold block uppercase tracking-wider">En proceso</span>
                          <span className="text-lg font-black text-green-500 mt-0.5 block">{batchSummary.readyForInvoice}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-500 font-bold block uppercase tracking-wider">Por Corregir</span>
                          <span className="text-lg font-black text-amber-500 mt-0.5 block">{batchSummary.requiresCorrection}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-500 font-bold block uppercase tracking-wider">Con Error</span>
                          <span className="text-lg font-black text-rose-500 mt-0.5 block">{batchSummary.errors}</span>
                        </div>
                      </div>

                      {/* Ticket list */}
                      <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[300px]">
                        {batchTickets?.map((t) => (
                          <div
                            key={t.id}
                            className="border border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/10 rounded-xl p-3.5 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div className="truncate flex-1">
                                <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200 block truncate">{t.fileName}</span>
                                <span className="text-[9.5px] text-slate-450 block mt-0.5">{t.step}</span>
                              </div>
                              <div className="shrink-0 flex items-center">
                                {t.status === "pending" && (
                                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                                )}
                                {t.status === "success" && (
                                  <Check className="w-4.5 h-4.5 text-green-500" />
                                )}
                                {t.status === "error" && (
                                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                                )}
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  t.status === "error" ? "bg-rose-500" : t.status === "success" ? "bg-green-500" : "bg-[#0B53F4]"
                                }`}
                                style={{ width: `${t.progress}%` }}
                              />
                            </div>

                            {t.error && (
                              <p className="text-[9.5px] font-bold text-rose-500 leading-normal bg-rose-50/50 dark:bg-rose-950/20 p-2 rounded-lg border border-rose-100/50 dark:border-rose-500/10 mt-1">
                                {t.error}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Footer block */}
                      <div className="flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800 pt-4 mt-4 shrink-0">
                        <button
                          type="button"
                          onClick={() => setIsBatchModalOpen(false)}
                          className="px-4 py-2.5 text-xs font-black uppercase text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition cursor-pointer bg-transparent border-none"
                        >
                          Cerrar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsBatchModalOpen(false);
                            if (onTabChange) onTabChange("tickets");
                          }}
                          className="zt-btn-primary-blue text-xs font-black uppercase px-5 py-2.5 rounded-xl cursor-pointer"
                        >
                          Ver mis tickets
                        </button>
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
                            setEditFolio(extractedData.billingReference || "");
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
                        const contract = matchingConnector?.extractionContract;
                        const isContractConnector = !!contract;

                        if (isContractConnector) {
                          const ticketFields = contract.requiredPortalFields || [];
                          const fiscalFields = contract.fiscalFields || [];

                          // Map key helper
                          const mapContractKeyToStateKey = (key: string): string => {
                            if (key.startsWith("fiscalProfile.")) {
                              const k = key.replace("fiscalProfile.", "");
                              if (k === "rfc") return "rfcReceptor";
                              if (k === "businessName") return "razonSocial";
                              if (k === "postalCode") return "codigoPostal";
                              if (k === "taxRegime") return "regimenFiscal";
                              if (k === "cfdiUse") return "usoCFDI";
                              return k;
                            }
                            return key;
                          };

                          return (
                            <div className="space-y-5 text-left">
                              {/* Block A: Datos para facturar en el portal */}
                              <div className="bg-[#121421] p-4.5 rounded-2xl border border-slate-800 space-y-3.5">
                                <h6 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-800/80 pb-2 flex items-center gap-1.5 font-mono">
                                  <Building2 className="w-4.5 h-4.5 text-[#0B53F4]" />
                                  A) Datos para facturar en el portal
                                </h6>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  {ticketFields.map((field: any) => {
                                    if (field.canonicalKey === "billingReference") {
                                      return (
                                        <div key={field.key} className="space-y-1">
                                          <label className="text-[9px] text-slate-450 font-black uppercase tracking-wider block font-mono">{field.label} *</label>
                                          <input
                                            type="text"
                                            value={editFolio}
                                            onChange={(e) => setEditFolio(e.target.value)}
                                            placeholder={`Ej. ${field.hints?.[0] || ""}`}
                                            className={getInputClass(!editFolio.trim(), false)}
                                          />
                                          {field.hints && field.hints.length > 0 && (
                                            <span className="text-[9px] text-slate-500 block leading-normal">{field.hints.join(" ")}</span>
                                          )}
                                        </div>
                                      );
                                    }
                                    if (field.canonicalKey === "total") {
                                      return (
                                        <div key={field.key} className="space-y-1">
                                          <label className="text-[9px] text-slate-455 font-black uppercase tracking-wider block font-mono">{field.label} *</label>
                                          <input
                                            type="number"
                                            step="0.01"
                                            value={editTotal || ""}
                                            onChange={(e) => setEditTotal(parseFloat(e.target.value) || 0)}
                                            placeholder="0.00"
                                            className={getInputClass(!editTotal || editTotal <= 0, false, true)}
                                          />
                                          {field.hints && field.hints.length > 0 && (
                                            <span className="text-[9px] text-slate-500 block leading-normal">{field.hints.join(" ")}</span>
                                          )}
                                        </div>
                                      );
                                    }
                                    const fieldKey = String(field.canonicalKey || field.key || "").replace(/^portalFields\./, "");
                                    if (!fieldKey) return null;
                                    const currentValue = editPortalFields[fieldKey] ?? "";
                                    const numeric = ["number", "currency", "decimal"].includes(String(field.type || "").toLowerCase());
                                    return (
                                      <div key={field.key || fieldKey} className="space-y-1">
                                        <label className="text-[9px] text-slate-455 font-black uppercase tracking-wider block font-mono">
                                          {field.label || fieldKey}{field.required !== false ? " *" : ""}
                                        </label>
                                        <input
                                          type={numeric ? "number" : "text"}
                                          step={numeric ? "0.01" : undefined}
                                          value={currentValue}
                                          onChange={(e) => setEditPortalFields({
                                            ...editPortalFields,
                                            [fieldKey]: numeric ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value
                                          })}
                                          placeholder={`Completa ${field.label || fieldKey}`}
                                          className={getInputClass(field.required !== false && String(currentValue).trim() === "", false)}
                                        />
                                        {field.hints?.length > 0 && (
                                          <span className="text-[9px] text-slate-500 block leading-normal">{field.hints.join(" ")}</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Block B: Datos fiscales del receptor */}
                              <div className="bg-[#121421] p-4.5 rounded-2xl border border-slate-800 space-y-3.5">
                                <h6 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-800/80 pb-2 flex items-center gap-1.5 font-mono">
                                  <Users className="w-4.5 h-4.5 text-emerald-500" />
                                  B) Datos fiscales del receptor
                                </h6>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  {fiscalFields.map((field: any) => {
                                    const stateKey = mapContractKeyToStateKey(field.key);
                                    const curVal = customProfileFields[stateKey] || "";
                                    const isValid = curVal.trim().length > 0;

                                    return (
                                      <div key={field.key}>
                                        <label className="text-[9px] text-slate-455 font-black uppercase tracking-wider block mb-1 font-mono">{field.label} *</label>
                                        <input
                                          type="text"
                                          value={curVal}
                                          onChange={(e) => setCustomProfileFields({ ...customProfileFields, [stateKey]: e.target.value })}
                                          placeholder={`Completa ${field.label}`}
                                          className={getInputClass(!isValid, false)}
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
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

                            {/* RFC Receptor (Tú) */}
                            {!/^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i.test(fiscalProfile?.rfc || "") && (
                              <div>
                                <div className="flex justify-between items-center mb-1.5">
                                  <label className="text-[9px] text-[#0B53F4] font-black uppercase tracking-wider block">RFC del Receptor (Tú) *</label>
                                  <span className="text-[9px] text-rose-500 font-extrabold uppercase tracking-wider flex items-center gap-1 animate-pulse">
                                    ⚠️ Requerido
                                  </span>
                                </div>
                                <input
                                  type="text"
                                  value={customProfileFields.rfcReceptor || ""}
                                  onChange={(e) => setCustomProfileFields({ ...customProfileFields, rfcReceptor: e.target.value })}
                                  placeholder="Ej. GORL940812S1A"
                                  maxLength={13}
                                  className={getInputClass(!/^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i.test(customProfileFields.rfcReceptor || ""), correctionError?.fieldToCorrect === "rfcReceptor", true)}
                                  autoFocus={correctionError?.fieldToCorrect === "rfcReceptor"}
                                />
                              </div>
                            )}

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
                                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">{folioLabel} *</label>
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
                            setEditFolio(extractedData.billingReference || "");
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
                                Este ticket con Folio <strong className="font-black underline select-text">{extractedData?.folio}</strong> y RFC Emisor <strong className="font-black select-text">{extractedData?.rfcEmisor}</strong> ya fue obtenido anteriormente desde el portal en su cuenta.
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

                    {extractedData?.extractionState === "manual_input_required" ? (
                      <div className="p-4 bg-rose-50 border border-rose-200 text-rose-950 rounded-2xl flex flex-col gap-3 text-xs leading-relaxed transition-all shadow-sm text-left font-sans">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-rose-550 shrink-0 mt-0.5 animate-pulse" />
                          <div>
                            {extractedData?.extractionDiagnostics?.reasonForManualInput === "IMAGE_QUALITY_ISSUE" ? (
                              <>
                                <span className="font-extrabold block text-rose-800 uppercase mb-0.5 tracking-wide">🚨 Calidad de Imagen Insuficiente</span>
                                <p className="opacity-95 text-rose-700 leading-normal font-semibold">
                                  La foto no permite leer correctamente algunos datos. Toma otra foto o corrige manualmente.
                                </p>
                              </>
                            ) : (
                              <>
                                <span className="font-extrabold block text-rose-800 uppercase mb-0.5 tracking-wide">🚨 Datos Críticos Faltantes</span>
                                <p className="opacity-95 text-rose-700 leading-normal font-semibold">
                                  No pudimos detectar automáticamente este dato. Puedes escribirlo manualmente o tomar otra foto.
                                </p>
                              </>
                            )}
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
                          {matchingConnector && (
                            <button
                              onClick={handleForceTargetedRetry}
                              className="text-[9.5px] font-black uppercase tracking-wider text-amber-705 bg-amber-100 hover:bg-amber-200 px-3.5 py-2 rounded-xl transition cursor-pointer border-none font-sans flex items-center gap-1.5"
                            >
                              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                              Reintentar lectura automática
                            </button>
                          )}
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
                    ) : extractedData?.extractionState === "extraction_low_confidence" ? (
                      <div className="p-4 bg-amber-50 border border-amber-200 text-amber-955 rounded-2xl flex flex-col gap-3 text-xs leading-relaxed transition-all shadow-sm text-left font-sans animate-fade-in_50">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-amber-550 shrink-0 mt-0.5 animate-pulse" />
                          <div>
                            <span className="font-extrabold block text-amber-800 uppercase mb-0.5 tracking-wide">⚠️ Validación de Confianza</span>
                            <p className="opacity-95 text-amber-700 leading-normal font-semibold font-sans">
                              Detectamos algunos datos con baja confianza. Revísalos antes de continuar.
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1 font-sans">
                          <button
                            onClick={() => setIsEditing(true)}
                            className="text-[9.5px] font-black uppercase tracking-wider text-blue-700 bg-blue-100 hover:bg-blue-200 px-3.5 py-2 rounded-xl transition cursor-pointer border-none font-sans"
                          >
                            Revisar / Editar datos
                          </button>
                          {matchingConnector && (
                            <button
                              onClick={handleForceTargetedRetry}
                              className="text-[9.5px] font-black uppercase tracking-wider text-amber-705 bg-amber-100 hover:bg-amber-200 px-3.5 py-2 rounded-xl transition cursor-pointer border-none font-sans flex items-center gap-1.5"
                            >
                              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                              Reintentar lectura automática
                            </button>
                          )}
                        </div>
                      </div>
                    ) : matchingConnector ? (
                      <div className="p-3.5 bg-blue-50 border border-blue-150 text-blue-900 rounded-xl flex items-start gap-2.5 text-xs text-left animate-fade-in_50 font-sans">
                        <CheckCircle className="w-4.5 h-4.5 text-[#0B53F4] shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-blue-800 leading-normal font-sans">
                            Estamos revisando si este comercio puede procesarse automáticamente.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-amber-50/50 border border-amber-200 text-amber-900 rounded-2xl flex flex-col gap-3 text-xs leading-relaxed transition-all shadow-sm text-left font-sans">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-amber-550 shrink-0 mt-0.5 animate-pulse" />
                          <div>
                            <span className="font-extrabold block text-amber-800 uppercase mb-0.5 tracking-wide">Comercio Sin Conector</span>
                            <p className="opacity-95 text-amber-700 leading-normal font-semibold font-sans">
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
        const currentTicket = liveTicket || (tickets || []).find(t => t.id === ticketId);

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
            if (code === "PORTAL_REJECTED_TICKET_DATA") return "Necesitamos corregir un dato del ticket. Verifica la referencia de facturación y el total.";
            if (code === "SAT_NOT_FOUND") return "El CFDI no fue localizado en los controles del SAT.";
            if (code === "SAT_CANCELED") return "El CFDI aparece cancelado ante el SAT.";
            if (code === "SAT_TIMEOUT") return "No pudimos verificar el CFDI ante el SAT en este momento.";
            if (code === "USER_REQUESTED_REVIEW") return "El usuario solicitó revisión manual del ticket.";
            if (code === "CONNECTOR_TIMEOUT") return "El conector del comercio tardó más de lo esperado en responder.";
            if (code === "PORTAL_ERROR") return revErr.reviewReasonMessage || "Ocurrió un error en el portal del comercio.";
            if (code === "CONNECTOR_RUNNER_NOT_AVAILABLE") return "Detectamos este comercio, pero su automatización todavía se está configurando. Guardamos tu ticket para revisión.";
            if (code === "CONNECTOR_SCHEMA_INVALID") return "Detectamos este comercio, pero su automatización todavía se está configurando. Guardamos tu ticket para revisión.";
            if (code === "CONNECTOR_NOT_PRODUCTION_READY") return "Detectamos este comercio, pero su automatización todavía se está configurando. Guardamos tu ticket para revisión.";
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
          const isFinished = ["cfdi_validated", "completed", "invoice_obtained"].includes(tStatus);

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
            if (["submitting_to_portal", "waiting_portal_result", "merchant_cfdi_downloaded", "sat_verifying", "pending_portal_submission", "submitted_to_merchant", "queued_for_runner", "runner_processing"].includes(tStatus)) return "active";
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
          const jStatus = liveJob?.status || "";
          
          if (tStatus === "ticket_uploaded" || tStatus === "extracting_data" || tStatus === "uploaded" || tStatus === "ocr_processing") {
            return "Leyendo ticket";
          }
          if (tStatus === "connector_resolving" || tStatus === "extracted" || tStatus === "connector_detected") {
            return "Revisa los datos";
          }
          if (tStatus === "missing_required_fields" || jStatus === "waiting_user_input") {
            return "Necesitamos completar datos para continuar";
          }
          if (tStatus === "waiting_fiscal_profile") {
            return "Necesitamos completar datos para continuar";
          }
          if (tStatus === "queued_for_runner" && (jStatus === "pending" || !jStatus)) {
            const jobCreatedAt = liveJob?.createdAt || currentTicket?.createdAt;
            if (jobCreatedAt) {
              const pendingTimeMs = Date.now() - new Date(jobCreatedAt).getTime();
              if (pendingTimeMs > 3 * 60 * 1000) {
                return "El robot de facturación está tardando más de lo normal. Puedes revisar el avance en Mis Tickets.";
              }
            }
            return "Esperando robot de facturación";
          }
          if (jStatus === "locked" || jStatus === "running" || tStatus === "runner_processing") {
            return "Estamos solicitando la factura en el portal oficial";
          }
          if (tStatus === "merchant_cfdi_downloaded") {
            return "Descargando archivos de factura";
          }
          if (tStatus === "invoice_obtained" || tStatus === "cfdi_validated" || tStatus === "completed" || jStatus === "succeeded") {
            return "Factura lista";
          }
          if (tStatus === "requires_manual_review" || tStatus === "failed" || jStatus === "manual_review" || jStatus === "failed") {
            return "No pudimos completar la solicitud automática";
          }
          return "Estamos solicitando la factura en el portal oficial";
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
                  Estamos procesando tu ticket en el portal del comercio...
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  ZenTicket está solicitando la factura en el portal oficial del comercio.
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

            {/* Warning banner for slow process / runner timeout */}
            {isTakingTooLong && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5 text-left mt-4 animate-fade-in flex items-start gap-2.5">
                <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-extrabold block text-amber-800 uppercase mb-0.5 tracking-wide text-xs">
                    Proceso lento
                  </span>
                  <p className="opacity-95 text-amber-700 text-[11.5px] leading-normal font-semibold font-sans">
                    El proceso está tardando más de lo normal. Puedes revisar el avance en Mis Tickets.
                  </p>
                </div>
              </div>
            )}

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
            ) : (currentTicket?.status === "waiting_fiscal_profile" || currentTicket?.status === "missing_required_fields") ? (
              <div className="bg-amber-50/30 border border-amber-200 rounded-2xl p-5 mb-5 text-left mt-4 animate-fade-in space-y-4">
                <div className="flex items-start gap-2.5">
                  <Users className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold block text-amber-800 uppercase mb-0.5 tracking-wide text-xs">
                      Datos incompletos
                    </span>
                    <p className="opacity-95 text-amber-700 text-[11.5px] leading-normal font-semibold font-sans">
                      {currentTicket?.errorMsg || "Necesitamos completar algunos datos para poder solicitar la factura automáticamente."}
                    </p>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-xl p-4 space-y-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                    Por favor completa los siguientes datos:
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {(currentTicket?.missingFields || []).map((fieldKey: string) => {
                      const label = fieldKey.startsWith("fiscalProfile.") 
                        ? (fieldKey === "fiscalProfile.rfc" ? "RFC Receptor"
                          : fieldKey === "fiscalProfile.businessName" ? "Razón Social Receptor"
                          : fieldKey === "fiscalProfile.postalCode" ? "Código Postal Receptor"
                          : fieldKey === "fiscalProfile.taxRegime" ? "Régimen Fiscal Receptor"
                          : fieldKey === "fiscalProfile.cfdiUse" ? "Uso CFDI Receptor"
                          : fieldKey === "fiscalProfile.email" ? "Correo del Receptor" : fieldKey)
                        : (fieldKey === "portalFields.billingReference" ? "Referencia de Facturación"
                          : fieldKey === "portalFields.total" ? "Total de la compra"
                          : fieldKey === "portalFields.date" ? "Fecha del Ticket" 
                          : fieldKey === "portalFields.branch" ? "Sucursal"
                          : fieldKey === "portalFields.barcode" ? "Código de barras"
                          : fieldKey === "portalFields.transactionNumber" ? "Número de transacción"
                          : fieldKey === "portalFields.ticketNumber" ? "Número de ticket"
                          : fieldKey === "portalFields.storeNumber" ? "Número de tienda"
                          : fieldKey === "portalFields.purchaseTime" ? "Hora de compra"
                          : fieldKey.replace("portalFields.", "").replace(/^\w/, (c) => c.toUpperCase()));

                      const inputType = (fieldKey === "portalFields.total") ? "number" : "text";

                      return (
                        <div key={fieldKey} className="space-y-1">
                          <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">
                            {label} *
                          </label>
                          <input
                            type={inputType}
                            step={inputType === "number" ? "0.01" : undefined}
                            value={inlineInputs[fieldKey] || ""}
                            onChange={(e) => setInlineInputs({ ...inlineInputs, [fieldKey]: e.target.value })}
                            placeholder={`Ingresa ${label.toLowerCase()}`}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-850 focus:border-[#0B53F4] focus:outline-none transition-all"
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleSaveInlineInputs}
                      disabled={isAutomatingLoading}
                      className="bg-[#0B53F4] hover:bg-blue-600 text-white text-[10px] font-black px-4 py-2.5 rounded-xl uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap active:scale-97 select-none shrink-0"
                    >
                      Confirmar y Reintentar Facturación
                    </button>
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
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block font-mono">{folioLabel}</span>
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
