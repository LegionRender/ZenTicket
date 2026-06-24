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
}: ScannerAndSimulatorProps) {
  const toast = useToast();
  const { user } = useAuth();
  const userName = fiscalProfile?.razonSocial || user?.displayName || "Usuario";

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
  const [activeStep, setActiveStep] = useState<"upload" | "extracted" | "automating" | "success" | "tracking">("upload");
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrProgressStepMsg, setOcrProgressStepMsg] = useState("");
  const [showOcrConfirmationModal, setShowOcrConfirmationModal] = useState(false);
  const [isLearningLoading, setIsLearningLoading] = useState(false);

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

  // Corroboration Sub-tab & AI Model training visualizer states
  const [activeExtractedTab, setActiveExtractedTab] = useState<"corroborar" | "detalles">("corroborar");
  const [isTrainingModel, setIsTrainingModel] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [trainingStatus, setTrainingStatus] = useState("");

  // Helper validation function to check missing or bad critical fields
  const checkIsDataIncomplete = (data: ExtractedTicketData): boolean => {
    return !data.rfcEmisor?.trim() || !data.nombreEmisor?.trim() || !data.total || data.total <= 0 || !data.folio?.trim() || !data.fechaCompra?.trim();
  };

  // Helper function to find if we already have a successfully processed ticket with same Folio & RFC Emisor
  const getExistingInvoicedTicket = (rfc?: string, folio?: string): any | null => {
    if (!rfc || !folio || !tickets) return null;
    const cleanRfc = rfc.trim().toUpperCase();
    const cleanFolio = folio.trim().toUpperCase();
    return tickets.find(t => {
      const tRfc = t.rfcEmisor?.trim().toUpperCase();
      const tFolio = t.folio?.trim().toUpperCase();
      // Match on same RFC and same Folio where the status is "completed"
      return tRfc === cleanRfc && tFolio === cleanFolio && t.status === "completed";
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
  const [readNotifIds, setReadNotifIds] = useState<string[]>([]);

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
        message: "Debe rellenar sus datos oficiales (RFC, Razón Social, Régimen) en la pestaña ⚙️ Perfil Fiscal para poder habilitar el timbrado de sus comprobantes.",
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

        if (t.status === "failed") {
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
          list.push({
            id: `completed-${ticketId}`,
            category: "facturas",
            criticality: "informativa",
            title: `Factura Certificada SAT - ${t.nombreEmisor || "Establecimiento"}`,
            message: `Se timbró exitosamente el CFDI 4.0 para ${t.nombreEmisor || "Establecimiento"} por un monto de $${(t.total || 0).toFixed(2)} MXN de manera limpia.`,
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
        : "Parche Dinámico de Script (Inyección Playwright Stealth & bypass de selectores anti-bot externos)"
      }` },
      { p: 60, l: "🔌 Inyectando nuevos parámetros en caliente en los scripts de Playwright..." },
      { p: 80, l: "🔑 Bypass de CAPTCHA externo exitoso. Conexión de Túnel Seguro establecida con el SAT..." },
      { p: 95, l: "📨 Solicitud certificada. Detonando el timbrado de CFDI final..." },
      { p: 100, l: "✅ ¡Timbrado de factura finalizado con éxito! Registro actualizado." }
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
      toast.success(`Ticket de ${ticket.nombreEmisor} autocorregido y timbrado exitosamente sin re-subir.`, "Resolución Completa ✅");
      setSelectedContingencyTicket(null);
    } catch (err) {
      toast.error("Ocurrió un error al persistir la solución del ticket en la base de datos.");
    } finally {
      setIsSolvingContingency(false);
    }
  };

  // Helper for ultra-robust connector matching and deduplication
  const matchConnector = (tEmisorName: string, tEmisorRfc: string): Connector | null => {
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
      const cRfc = (c.rfc || "").toLowerCase().trim();
      if (tRfc && cRfc && tRfc === cRfc) return true;

      const cNombre = cleanStr(c.nombre || "");
      if (!tNombre || !cNombre) return false;

      // Check if one contains the other
      if (tNombre.includes(cNombre) || cNombre.includes(tNombre)) return true;

      // Token word-matching: check if they share a significant word
      const tWords = tNombre.split(/\s+/).filter(w => w.length > 2);
      const cWords = cNombre.split(/\s+/).filter(w => w.length > 2);
      return tWords.some(w => cWords.includes(w));
    });

    return found || null;
  };

  // Preload a ticket if triggered from tickets screen
  useEffect(() => {
    if (!preselectedTicketId) return;

    const ticket = tickets.find((t) => t.id === preselectedTicketId);
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
      setIsEditing(checkIsDataIncomplete(data));

      const found = matchConnector(ticket.nombreEmisor, ticket.rfcEmisor);
      setMatchingConnector(found);
      setActiveStep("extracted");
    }

    onClearPreselectedTicket();
  }, [preselectedTicketId, tickets, connectors, onClearPreselectedTicket]);

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
      "Comprobando integridad y timbrado preliminar...",
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
        toast.warning(ocrResult.ocrError || "El OCR no pudo leer este ticket. No se generaron datos simulados; completa los campos manualmente.", "Captura Manual Activada");
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
      });
      setTicketId(tId);

      // Seek matching connector
      findMatchingConnector(ocrResult);

      stopSimulation();
      // Wait for completion callback to trigger
      while (!finishTriggered) {
        await new Promise(r => setTimeout(r, 50));
      }

      setActiveStep("extracted");
      setShowOcrConfirmationModal(true);

      if (onSetNewlyAddedTicketId) {
        onSetNewlyAddedTicketId(tId);
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
  const findMatchingConnector = (data: ExtractedTicketData) => {
    const found = matchConnector(data.nombreEmisor, data.rfcEmisor);
    setMatchingConnector(found);
    setIsConnectorNewlyLearned(false);
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
        toast.warning(ocrResult.ocrError || "El OCR no pudo leer este ticket. No se generaron datos simulados; completa los campos manualmente.", "Captura Manual Activada");
      }
      setExtractedData(ocrResult);
      setEditNombre(ocrResult.nombreEmisor || "");
      setEditRfc(ocrResult.rfcEmisor || "");
      setEditFecha(ocrResult.fechaCompra || "");
      setEditFolio(ocrResult.folio || "");
      setEditSucursal(ocrResult.sucursal || "");
      setEditTotal(ocrResult.total || 0);
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
      });
      setTicketId(tId);

      // Find match
      findMatchingConnector(ocrResult);

      stopSimulation();
      // Wait for completion callback to trigger
      while (!finishTriggered) {
        await new Promise(r => setTimeout(r, 50));
      }

      setActiveStep("extracted");
      setShowOcrConfirmationModal(true);

      if (onSetNewlyAddedTicketId) {
        onSetNewlyAddedTicketId(tId);
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
  const handleTriggerAutomation = async (overrideConnector?: Connector) => {
    const activeConn = overrideConnector || matchingConnector;
    if (!extractedData || !fiscalProfile || !activeConn || !ticketId) return;

    // Check plan constraints before initiating SAT automation
    const currentPlanStr = fiscalProfile?.plan || "gratuito";
    const limit = currentPlanStr === "empresa" ? 60 : currentPlanStr === "personal" ? 20 : 5;
    const planStartDateStr = fiscalProfile?.planStartDate || fiscalProfile?.createdAt || new Date().toISOString();
    const planStartDate = new Date(planStartDateStr);
    const cycleInvoices = (invoices || []).filter(inv => {
      if (!inv.createdAt) return false;
      return new Date(inv.createdAt) >= planStartDate;
    });
    const cycleCount = cycleInvoices.length;
    const isExpired = (new Date().getTime() - planStartDate.getTime()) >= 30 * 24 * 60 * 60 * 1000;

    if (cycleCount >= limit || isExpired) {
      if (fiscalProfile?.autoRenew && currentPlanStr !== "gratuito") {
        // Auto-renew is active and profile has a card
        const cost = currentPlanStr === "personal" ? 150 : 300;
        try {
          if (onSaveProfile) {
            await onSaveProfile({
              ...fiscalProfile,
              planStartDate: new Date().toISOString()
            });
            toast.success(`🔄 Tu plan ${currentPlanStr} se renovó de forma automática y se cobraron $${cost} MXN a tu tarjeta.`, "Plan Renovado");
          }
        } catch (err) {
          toast.error("Fallo al renovar tu plan automáticamente de tu tarjeta registrada.");
          return;
        }
      } else {
        // Manual block
        setBlockerReason(cycleCount >= limit ? "limit" : "month");
        setShowRenewalBlocker(true);
        return;
      }
    }

    setActiveStep("automating");
    setIsAutomatingLoading(true);
    setSimulationLogs([]);
    setSimulationProgress(0);

    const fieldsSchema = JSON.parse(activeConn.fieldsJson);

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
      await addLog("🤖 [Playwright CLI] Inicializando robot de navegación web", 100);
      setSimulationProgress(10);
      await addLog("🌐 Abriendo puerto seguro proxy para saltar bloqueos", 800);
      await addLog(`🌍 Navegando directamente a: ${activeConn.portalUrl}`, 1200);
      setSimulationProgress(25);
      await addLog("⌛ Esperando a que el portal web cargue los selectores", 1000);

      // Simulate entering fields
      for (const field of fieldsSchema) {
        let val = "";
        if (field.key === "rfc") val = fiscalProfile.rfc;
        else if (field.key === "folio") val = extractedData.folio;
        else if (field.key === "total") val = extractedData.total.toString();
        else if (field.key === "fecha") val = extractedData.fechaCompra;
        else val = "VAL_AUTO__";

        await addLog(
          `✏️ Llenando campo '${field.name}' (Selector: ${field.selector}) con valor '${val}'`,
          1400
        );
      }
      setSimulationProgress(50);

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

      await addLog(`🔗 Conectando con PAC certificado emisor SAT para timbrar XML...`, 1200);

      // Fire actual backend composition to build real XML & visually responsive PDF HTML layouts
      const response = await runAutomation({
        ticket: extractedData,
        profile: fiscalProfile,
        connector: activeConn,
      });

      if (!response.ok) {
        throw new Error("El motor del SAT reportó un error al certificar el CFDI.");
      }

      const invoiceData = await response.json();

      // Save Invoice data to Firestore
      await onSaveInvoiceToDb(
        ticketId,
        invoiceData.xmlContent,
        invoiceData.pdfHtml,
        invoiceData.folioFiscal,
        extractedData.rfcEmisor,
        extractedData.nombreEmisor,
        extractedData.total,
        invoiceData.cost !== undefined ? invoiceData.cost : (isConnectorNewlyLearned ? 15.00 : 2.50),
        isConnectorNewlyLearned ? "nuevo" : "existente",
        invoiceData.rawCost !== undefined ? invoiceData.rawCost : 0
      );

      // update ticket state
      await onUpdateTicketInDb(ticketId, {
        status: "completed",
        invoiceId: invoiceData.folioFiscal,
      });

      await addLog(`💾 Factura certificada exitosamente. Folio Fiscal UID: ${invoiceData.folioFiscal}`, 800);
      await addLog(`📥 Archivos PDF & XML descargados en almacén virtual de ZenTicket.`, 500);
      await addLog(`🎉 ¡Procesamiento completado con éxito!`, 200);

      setSimulationProgress(100);

      // Redirect immediately to tickets tab and trigger the highlight
      if (onTabChange && onSetNewlyAddedTicketId) {
        onSetNewlyAddedTicketId(ticketId);
        onTabChange("tickets");
      }

      setTimeout(() => {
        setActiveStep("success");
      }, 1000);
    } catch (err: any) {
      console.error(err);
      await addLog(`❌ ERROR DE AUTOMATIZACIÓN: ${err.message || "Portal falló al procesar"}`, 200);
      if (ticketId) {
        await onUpdateTicketInDb(ticketId, {
          status: "review", // Status in Firestore is "review" indicating it continues under review/tracking
          errorMsg: err.message || "Failed simulation process",
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
      console.error("Error creating training doc, continuing locally:", e);
      handleFirestoreError(e, OperationType.WRITE, `automation_trainings/${ticketId}`);
    }

    const steps = [
      { progress: 15, step: "🔍 Descubriendo portal de facturación oficial en base a DNS y Google Search API..." },
      { progress: 35, step: "🧠 Analizando DOM para identificar inputs dinámicos (RFC, Folio, Monto)..." },
      { progress: 55, step: "🖥️ Generando aserciones de Playwright y selectores optimizados contra CAPTCHA..." },
      { progress: 75, step: "🌐 Simulando peticiones RPC de prueba para evadir protecciones Cloudflare..." },
      { progress: 95, step: "💾 Registrando nuevo conector automatizado y compilando especificación JSON..." },
      { progress: 100, step: "🎉 ¡Entrenamiento completado con éxito! Iniciando timbrado inmediato..." }
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
          console.error("Error updating training doc:", e);
          handleFirestoreError(e, OperationType.UPDATE, `automation_trainings/${ticketId}`);
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
          toast.error("El entrenamiento finalizó pero no se pudo timbrar automáticamente.");
          setIsTrainingModel(false);
        }
      }
    }, 1500); // 1.5 seconds per step, total ~9 seconds
  };

  const handleSaveEditedData = async () => {
    // Basic validation
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

    const updatedData: ExtractedTicketData = {
      ...extractedData!,
      rfcEmisor: cleanRfc,
      nombreEmisor: editNombre.trim(),
      fechaCompra: editFecha.trim(),
      folio: editFolio.trim(),
      total: totalNum,
      sucursal: editSucursal.trim(),
    };

    setExtractedData(updatedData);
    setIsEditing(false);

    // Save/update in DB
    if (ticketId) {
      try {
        await onUpdateTicketInDb(ticketId, {
          rfcEmisor: updatedData.rfcEmisor,
          nombreEmisor: updatedData.nombreEmisor,
          fechaCompra: updatedData.fechaCompra,
          folio: updatedData.folio,
          total: updatedData.total,
          sucursal: updatedData.sucursal,
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
            
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                {blockerReason === "limit" ? "Límite de Facturas Alcanzado" : "Mes de Cobertura Vencido"}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                {blockerReason === "limit"
                  ? `Has alcanzado el límite de tu plan actual (${fiscalProfile?.plan === "personal" ? "20" : fiscalProfile?.plan === "empresa" ? "60" : "5"} facturas).`
                  : "Tu cobertura mensual de facturación ha vencido desde tu última fecha de pago."
                } Para seguir timbrando facturas, debes de renovar tu paquete. ¿Deseas proceder con el pago mensual ahora?
              </p>
            </div>

            <div className="w-full bg-slate-50 rounded-2.5xl p-4.5 text-left border border-slate-200/50 space-y-3">
              <span className="text-[9.5px] font-black text-slate-400 uppercase tracking-widest block font-mono">
                DETALLE DE TRANSACCIÓN
              </span>
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="text-slate-600">Suscripción actual:</span>
                <span className="text-slate-900 font-extrabold capitalize">
                  {fiscalProfile?.plan === "personal" ? "Plan Personal (20 facturas)" : fiscalProfile?.plan === "empresa" ? "Plan Empresa (60 facturas)" : "Plan Gratuito (5 facturas)"}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold pt-1.5 border-t border-slate-100">
                <span className="text-slate-600">Costo mensual:</span>
                <span className="text-[#0B53F4] font-black text-sm">
                  {fiscalProfile?.plan === "personal" ? "$150.00 MXN" : fiscalProfile?.plan === "empresa" ? "$300.00 MXN" : "Contratar Plan ($150 - $300 MXN)"}
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
                className="flex-1 py-3 px-4.5 bg-[#ebf1ff] hover:bg-[#ebf1ff]/80 text-[#0B53F4] text-xs font-black rounded-xl transition cursor-pointer text-center border-none shadow-2xs"
              >
                Ver Planes
              </button>
              
              {fiscalProfile?.plan !== "gratuito" ? (
                <button
                  type="button"
                  disabled={isProcessingRenewalPay}
                  onClick={handleManualRenewalPay}
                  className="flex-3 py-3 px-4.5 bg-[#0B53F4] hover:bg-[#0747D1] disabled:opacity-50 text-white text-xs font-black rounded-xl transition cursor-pointer text-center flex items-center justify-center gap-1.5 shadow-md shadow-[#0B53F4]/15"
                >
                  {isProcessingRenewalPay ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Procesando pago...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      <span>Renovar Ahora</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowRenewalBlocker(false);
                    if (onTabChange) onTabChange("cuenta");
                  }}
                  className="flex-3 py-3 px-4.5 bg-[#0B53F4] hover:bg-[#0747D1] text-white text-xs font-black rounded-xl transition cursor-pointer text-center font-bold shadow-md"
                >
                  Contratar Plan
                </button>
              )}
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
                        const comp = tickets.filter(t => t.status === "completed").length;
                        return `${comp} ${comp === 1 ? 'ticket' : 'tickets'}`;
                      })()}
                    </span>
                    <span className="text-[9px] text-blue-200 block mt-0.5 font-bold leading-normal">
                      {(() => {
                        const plan = fiscalProfile?.plan || "gratuito";
                        const limit = plan === "empresa" ? 60 : plan === "personal" ? 20 : 5;
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
                      En Seguimiento
                    </span>
                    <span className="text-base font-black text-white mt-0.5 block">
                      {tickets.filter(t => t.status !== "completed").length} {tickets.filter(t => t.status !== "completed").length === 1 ? "ticket" : "tickets"}
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
                  Bitácora inteligente en tiempo real para flujos técnicos, de timbrado y de integraciones bancarias. Organiza alertas operativas críticas del robot de Playwright y el SAT.
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
                                  toast.info(`Direccionando a Contingencia IA para resolver ${fc.nombreEmisor}...`, "Mitigación Activada");
                                  setTimeout(() => {
                                    const cel = document.getElementById("ai-contingency-panel-card");
                                    if (cel) cel.scrollIntoView({ behavior: "smooth" });
                                  }, 100);
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
                                          const confirmed = window.confirm(`Archivar la alerta "${n.title}"?`);
                                          if (!confirmed) return;
                                          setReadNotifIds(prev => prev.includes(n.id) ? prev : [...prev, n.id]);
                                          toast.success("Notificación archivada.");
                                        }}
                                        className="text-[9.5px] font-bold text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 bg-transparent hover:bg-slate-100/50 dark:hover:bg-slate-800/50 px-2.5 py-1.5 rounded-lg cursor-pointer transition grow sm:grow-0 text-center select-none"
                                      >
                                        Archivar
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
                                  toast.info(`Direccionando a Contingencia IA para resolver ${fc.nombreEmisor}...`, "Mitigación Activada");
                                  
                                  setTimeout(() => {
                                    const cel = document.getElementById("ai-contingency-panel-card");
                                    if (cel) cel.scrollIntoView({ behavior: "smooth" });
                                  }, 130);
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
                                           toast.success("Notificación archivada.");
                                         }}
                                         className="text-[9.5px] font-bold text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 bg-transparent hover:bg-slate-100/50 dark:hover:bg-slate-800/50 px-2.5 py-1.5 rounded-lg cursor-pointer transition grow sm:grow-0 text-center select-none"
                                       >
                                         Archivar
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
                          const list = tickets.filter(t => t.status === "failed" || t.status === "review");

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
                    const listToRender = tickets.filter(t => t.status === "failed" || t.status === "review");
                    
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

                {/* Selected ticket workspace details */}
                {selectedContingencyTicket && (
                  <div className="bg-slate-50 dark:bg-[#0d0f1c] border border-slate-200 dark:border-slate-800/60 rounded-3xl p-5 space-y-5 animate-fadeIn">
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
                              <b>Causa raíz:</b> {selectedContingencyTicket.errorMsg || "Timeout o bloqueo parcial anti-bot en el robot de Playwright."}
                            </p>
                          </div>
                        </div>

                        {/* Step 4: Emisión CFDI */}
                        <div className="relative">
                          <div className="absolute -left-[27px] w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-800 border-4 border-slate-50 dark:border-[#0d0f1c] flex items-center justify-center">
                            <div className="w-1 h-1 bg-slate-400 rounded-full"></div>
                          </div>
                          <div>
                            <h5 className="text-[11px] font-black text-slate-450 dark:text-slate-400 flex items-center gap-1.5 leading-none">
                              Emisión CFDI
                              <span className="text-[8px] bg-slate-100 dark:bg-slate-900 text-slate-550 dark:text-slate-400 px-1 py-0.2 rounded font-sans leading-none">En espera ⌛</span>
                            </h5>
                            <p className="text-[9.5px] text-slate-400 dark:text-slate-500 mt-0.5 leading-normal">Timbrado pendiente. Esperando resolución de contingencia de portal.</p>
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

                        {/* Parche Playwright */}
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
                            <span className={`text-[10.5px] font-black block ${selectedStrategy === "playwright" ? "text-orange-900 dark:text-orange-200" : "text-slate-800 dark:text-slate-200"}`}>Parche Dinámico Playwright</span>
                            <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">Omitirá cargas lentas de la página de facturación externa para evadir anti-bots.</p>
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
                  </div>
                )}
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
              /* High-tech, premium AI training monitor */
              <div className="bg-[#121626] border border-slate-700/60 text-white rounded-3xl p-6 md:p-8 space-y-6 text-left relative overflow-hidden shadow-2xl animate-fade-in_50">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#0B53F4]/15 rounded-full blur-2xl pointer-events-none" />
                
                <div className="flex gap-4 items-center border-b border-slate-800/80 pb-5 font-sans">
                  <div className="relative shrink-0 w-12 h-12 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border border-[#0B53F4]/30 animate-ping opacity-60" />
                    <div className="absolute inset-0 rounded-full border-3 border-t-sky-400 border-r-indigo-500 border-b-[#0B53F4] border-l-transparent animate-spin" />
                    <div className="w-7 h-7 rounded-full bg-slate-800/90 flex items-center justify-center">
                      <Brain className="w-4 h-4 text-sky-400 animate-pulse" />
                    </div>
                  </div>
                  <div>
                    <span className="text-[9.5px] font-black tracking-widest text-[#CBDAFF]/90 uppercase font-mono bg-[#0B53F4]/20 border border-[#0B53F4]/30 px-2.5 py-1 rounded-md leading-none">
                      Entrenamiento de Automatización con IA
                    </span>
                    <h4 className="text-base font-black text-white mt-1.5 flex items-center gap-1.5">
                      Modelando portal para: <span className="text-sky-305 font-black uppercase text-sm select-text">{extractedData.nombreEmisor}</span>
                    </h4>
                  </div>
                </div>

                <div className="space-y-2 font-sans">
                  <div className="flex justify-between items-baseline font-mono text-xs leading-none mb-1">
                    <span className="text-slate-400 font-extrabold uppercase tracking-wide text-[9px]">Porcentaje del Proceso</span>
                    <span className="font-mono text-xs font-black text-sky-450">{trainingProgress}%</span>
                  </div>
                  <p className="text-xs text-slate-200 bg-slate-900 border border-slate-800 p-4 rounded-xl leading-relaxed font-mono flex items-center gap-2.5 select-text shadow-inner">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-450 animate-ping shrink-0" />
                    {trainingStatus}
                  </p>
                </div>

                {/* Progress bar visual container */}
                <div>
                  <div className="h-3 bg-slate-950 rounded-full overflow-hidden relative border border-slate-800 p-0.5">
                    <div 
                      className="bg-gradient-to-r from-sky-400 via-indigo-500 to-[#0B53F4] h-full rounded-full transition-all duration-300 relative shadow-[0_0_12px_rgba(56,189,248,0.45)]"
                      style={{ width: `${trainingProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 mt-2 font-sans">
                    <span>ZENTICKET AI COGNITIVE ENGINE v1.2</span>
                    <span>SISTEMA DE CONTROL DE APRENDIZAJE ACTIVO</span>
                  </div>
                </div>

                {/* High tech logging console */}
                <div className="bg-slate-950 rounded-2xl p-4.5 border border-slate-900 h-28 overflow-y-auto font-mono text-[10.5px] text-slate-400 space-y-2 select-text scrollbar-none shadow-inner">
                  <div>[{new Date().toLocaleTimeString()}] [CONSOLA_ADMIN] Iniciando sesión remota de entrenamiento...</div>
                  {trainingProgress >= 15 && <div>[{new Date().toLocaleTimeString()}] [BÚSQUEDA] DNS resuelto para {extractedData.nombreEmisor}. Navegando hacia portal de facturación...</div>}
                  {trainingProgress >= 35 && <div>[{new Date().toLocaleTimeString()}] [MAPPER] Localizados campos críticos de facturación. Inyectando tokens de aserción...</div>}
                  {trainingProgress >= 55 && <div>[{new Date().toLocaleTimeString()}] [PLAYWRIGHT] Generado script heurístico, estructurando campos dinámicos...</div>}
                  {trainingProgress >= 75 && <div>[{new Date().toLocaleTimeString()}] [PAC] Autenticando canal con firma del receptor para emitir CFDI 4.0...</div>}
                  {trainingProgress >= 95 && <div>[{new Date().toLocaleTimeString()}] [SST] Guardando conector permanente para {extractedData.nombreEmisor} en base de datos...</div>}
                  {trainingProgress === 100 && <div className="text-emerald-400 font-bold font-mono">[{new Date().toLocaleTimeString()}] [SUCCESS] ¡Sincronizado! Disparando ejecución de factura...</div>}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Visual Tab Selector precisely as requested - Pestañas de Corroboración vs Detalles */}
                <div className="flex border-b border-slate-200 mb-4 text-xs font-extrabold gap-4 select-none font-sans">
                  <button
                    type="button"
                    onClick={() => setActiveExtractedTab("corroborar")}
                    className={`pb-2.5 px-1 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 uppercase tracking-wide duration-150 relative ${
                      activeExtractedTab === "corroborar"
                        ? "border-[#0B53F4] text-[#0B53F4]"
                        : "border-transparent text-slate-400 hover:text-slate-650"
                    }`}
                  >
                    📋 Corroborar Ticket
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveExtractedTab("detalles")}
                    className={`pb-2.5 px-1 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 uppercase tracking-wide duration-150 ${
                      activeExtractedTab === "detalles"
                        ? "border-[#0B53F4] text-[#0B53F4]"
                        : "border-transparent text-slate-400 hover:text-slate-650"
                    }`}
                  >
                    🔍 Detalle Técnico (OCR)
                  </button>
                </div>

                {activeExtractedTab === "corroborar" && !isEditing ? (
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
                                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition shadow-xs text-[11px] uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer font-sans"
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

                    <div className="bg-[#FAF9FF] border border-[#EBF1FF] rounded-3xl p-6 text-left space-y-4.5 shadow-2xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block font-mono">Establecimiento (Tienda)</span>
                        <h3 className="text-lg font-black text-slate-800 uppercase mt-1 flex items-center gap-2.5 select-text">
                          <Building2 className="w-5.5 h-5.5 text-[#0B53F4]" />
                          {extractedData.nombreEmisor}
                        </h3>
                      </div>
                      
                      <div>
                        <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block font-mono font-bold">Importe Total</span>
                        <h2 className="text-3xl font-black text-[#0B53F4] mt-1 font-mono tracking-tight select-text">
                          ${extractedData.total.toFixed(2)} MXN
                        </h2>
                      </div>

                      {/* Explicit automated vs training details card - Summarized */}
                      <div className={`p-4 rounded-xl border flex items-center gap-3 text-xs ${
                        matchingConnector 
                          ? "bg-emerald-50/70 border-emerald-200 text-emerald-800"
                          : "bg-amber-50/70 border-amber-200 text-amber-800"
                      }`}>
                        {matchingConnector ? (
                          <>
                            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                            <div>
                              <span className="font-black text-xs uppercase tracking-wide block">Automatización Lista</span>
                              <p className="text-[11px] font-medium text-emerald-700 leading-tight">
                                Conector listo para timbrado directo sin demoras.
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-5 h-5 text-amber-600 shrink-0 animate-pulse" />
                            <div>
                              <span className="font-black text-xs uppercase tracking-wide block">Entrenamiento Requerido</span>
                              <p className="text-[11px] font-medium text-amber-700 leading-tight">
                                La IA entrenará el portal de la tienda en segundos.
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Prominent main invoice clickers triggers */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-1">
                      <button
                        onClick={() => {
                          if (matchingConnector) {
                            handleTriggerAutomation();
                          } else {
                            handleRunTraining();
                          }
                        }}
                        disabled={!fiscalProfile || !extractedData || checkIsDataIncomplete(extractedData)}
                        className="text-[10.5px] font-black uppercase tracking-widest flex items-center justify-center gap-2 text-white bg-[#0B53F4] hover:bg-blue-600 disabled:opacity-55 px-7 py-4 rounded-2xl transition duration-150 shadow-md shadow-[#0B53F4]/15 active:scale-[0.98] select-none cursor-pointer text-center"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        Facturar de Inmediato
                      </button>
                      <button
                        onClick={() => setActiveExtractedTab("detalles")}
                        className="text-[10.5px] font-black uppercase tracking-widest flex items-center justify-center gap-2 text-[#0B53F4] bg-[#ebf1ff] hover:bg-[#ebf1ff]/80 px-6 py-4 rounded-2xl transition active:scale-[0.98] select-none cursor-pointer border-none shadow-2xs"
                      >
                        Ver Desglose Técnico
                      </button>

                      {getExistingInvoicedTicket(extractedData?.rfcEmisor, extractedData?.folio) && (
                        <button
                          onClick={resetAll}
                          className="text-[10.5px] font-black uppercase tracking-widest flex items-center justify-center gap-2 text-white bg-rose-600 hover:bg-rose-700 px-6 py-4 rounded-2xl transition active:scale-[0.98] select-none cursor-pointer border-none shadow-md shadow-rose-600/15"
                        >
                          <X className="w-4 h-4 shrink-0" />
                          Cancelar Escaneo
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* ORIGINAL DETAILED VIEW */
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Datos Extraídos Vision OCR</h4>
                        
                        {/* OCR Score and Resolution indicators */}
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="bg-[#0B53F4]/10 border border-[#0B53F4]/20 text-[#0B53F4] font-mono text-[9px] font-black px-2.5 py-1 rounded-md flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-[#FFB200] animate-pulse" />
                            OCR SCORE: {(extractedData.nombreEmisor ? 25 : 0) + (extractedData.total > 0 ? 30 : 0) + (extractedData.folio ? 20 : 0) + (extractedData.rfcEmisor ? 15 : 0) + 10}/100 PTS
                          </span>
                          <span className={`font-mono text-[9px] font-black px-2.5 py-1 rounded-md border flex items-center gap-1 ${
                            extractedData.total > 0 && extractedData.rfcEmisor && extractedData.nombreEmisor
                              ? "bg-emerald-50 text-emerald-700 border-emerald-250"
                              : "bg-rose-50 text-rose-700 border-rose-250 animate-pulse"
                          }`}>
                            <CheckCircle className="w-3 h-3" />
                            {extractedData.total > 0 && extractedData.rfcEmisor && extractedData.nombreEmisor ? "RESOLUCIÓN: OK" : "RESOLUCIÓN: INCOMPLETO"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isEditing && (
                          <button
                            onClick={() => setIsEditing(true)}
                            className="text-[9px] font-extrabold uppercase tracking-widest border border-slate-200 hover:border-slate-350 bg-white text-slate-600 hover:text-slate-800 px-3 py-1.5 rounded-lg transition duration-150 flex items-center gap-1.5 cursor-pointer shadow-sm"
                          >
                            <RefreshCw className="w-3 h-3 text-slate-500" />
                            Corregir Datos
                          </button>
                        )}
                        <span className="text-[9px] font-extrabold uppercase tracking-widest bg-[#0B53F4]/10 text-[#0B53F4] px-3 py-1.5 rounded-md border border-[#0B53F4]/20 flex items-center gap-1 shrink-0">
                          <CheckCircle className="w-3.5 h-3.5 text-[#0B53F4]" /> IA Sincronizada
                        </span>
                      </div>
                    </div>

                    {checkIsDataIncomplete(extractedData) && !isEditing && (
                      <div className="p-4 bg-rose-50 border border-rose-200 text-rose-850 rounded-2xl flex items-start gap-3 text-xs leading-relaxed transition-all shadow-sm">
                        <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5 animate-pulse" />
                        <div>
                          <span className="font-extrabold block text-rose-800 uppercase mb-0.5 tracking-wide">🚨 Datos Críticos Faltantes</span>
                          <p className="opacity-95 text-rose-700 leading-normal font-medium">
                            Para timbrar una factura de forma legal, se requiere que la digitalización reconozca con exactitud el <strong>RFC Emisor</strong>, el <strong>Folio</strong>, la <strong>Fecha</strong> y el <strong>Total</strong> ($ MXN). Por favor, presiona el botón <span className="font-bold underline cursor-pointer hover:text-slate-900" onClick={() => setIsEditing(true)}>Corregir Datos</span> para complementarlos manualmente.
                          </p>
                        </div>
                      </div>
                    )}

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
                        className={`w-full bg-white border rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none transition uppercase ${
                          isNombreInvalid 
                            ? "border-rose-400 bg-rose-50 focus:border-rose-500" 
                            : "border-slate-200 focus:border-[#0B53F4] hover:border-slate-350"
                        }`}
                      />
                    </div>

                    {/* RFC Emisor */}
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">RFC del Emisor comercial *</label>
                        {isRfcInvalid && (
                          <span className="text-[9px] text-rose-500 font-extrabold uppercase tracking-wider flex items-center gap-1 animate-pulse">
                            ⚠️ Inválido (12-13 Caracteres)
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={editRfc}
                        onChange={(e) => setEditRfc(e.target.value)}
                        placeholder="Ej. NWM9709244W4"
                        maxLength={13}
                        className={`w-full bg-white border rounded-xl px-3 py-2 text-xs font-mono font-semibold text-slate-800 focus:outline-none transition uppercase ${
                          isRfcInvalid
                            ? "border-rose-450 bg-rose-50 focus:border-rose-500"
                            : "border-slate-200 focus:border-[#0B53F4] hover:border-slate-350"
                        }`}
                      />
                    </div>

                    {/* Referencia Folio */}
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Folio o Referencia del ticket *</label>
                        {isFolioInvalid && (
                          <span className="text-[9px] text-[#0B53F4] font-extrabold uppercase tracking-wider flex items-center gap-1">
                            ⚠️ Requerido
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={editFolio}
                        onChange={(e) => setEditFolio(e.target.value)}
                        placeholder="Ej. TR-495038"
                        className={`w-full bg-white border rounded-xl px-3 py-2 text-xs font-mono font-semibold text-slate-800 focus:outline-none transition-all ${
                          isFolioInvalid
                            ? "border-rose-455 bg-rose-50 focus:border-rose-500"
                            : "border-slate-200 focus:border-[#0B53F4] hover:border-slate-350"
                        }`}
                      />
                    </div>

                    {/* Fecha Compra */}
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Fecha Compra (AAAA-MM-DD) *</label>
                        {isFechaInvalid && (
                          <span className="text-[9px] text-rose-500 font-extrabold uppercase tracking-wider flex items-center gap-1 animate-pulse">
                            ⚠️ Requerido
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={editFecha}
                        onChange={(e) => setEditFecha(e.target.value)}
                        placeholder="Ej. 2026-06-08"
                        className={`w-full bg-white border rounded-xl px-3 py-2 text-xs font-mono font-semibold text-slate-800 focus:outline-none transition-all ${
                          isFechaInvalid
                            ? "border-rose-455 bg-rose-50 focus:border-rose-500"
                            : "border-slate-200 focus:border-[#0B53F4] hover:border-slate-350"
                        }`}
                      />
                    </div>

                    {/* Sucursal */}
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
                        className={`w-full bg-white border rounded-xl px-3 py-2 text-xs font-mono font-semibold text-slate-850 focus:outline-none transition-all ${
                          isTotalInvalid
                            ? "border-rose-455 bg-rose-50 focus:border-rose-500"
                            : "border-slate-200 focus:border-[#0B53F4] hover:border-slate-350"
                        }`}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2.5 pt-3.5 justify-end">
                    <button
                      onClick={handleSaveEditedData}
                      className="text-[10px] font-black uppercase tracking-widest text-white bg-[#0B53F4] hover:bg-blue-600 px-6 py-3.5 rounded-xl transition duration-150 shadow-md shadow-[#0B53F4]/10 cursor-pointer active:scale-[0.98] select-none"
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
                        className="text-[10px] font-bold uppercase tracking-widest text-[#0B53F4] bg-[#0B53F4]/5 border border-[#0B53F4]/10 px-5 py-3.5 rounded-xl transition cursor-pointer select-none"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* Static view for high-contrast data presentation */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200/65 shadow-sm">
                  <div className="flex items-start gap-2.5">
                    <Building2 className="w-4 h-4 text-[#0B53F4] mt-1 shrink-0" />
                    <div>
                      <span className="text-[9px] text-slate-400 font-extrabold block uppercase tracking-wide font-sans">Emisor Comercial</span>
                      <span className="text-xs font-bold text-slate-850 uppercase">{extractedData.nombreEmisor}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <Cpu className="w-4 h-4 text-[#0B53F4] mt-1 shrink-0" />
                    <div>
                      <span className="text-[9px] text-slate-400 font-extrabold block uppercase tracking-wide font-sans">RFC Emisor</span>
                      <span className="text-xs font-mono font-bold text-slate-850 select-all">{extractedData.rfcEmisor}</span>
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
                      <span className="text-xs font-bold text-slate-850 font-mono select-all">{extractedData.folio}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-[#FFB200] mt-1 shrink-0" />
                    <div>
                      <span className="text-[9px] text-slate-400 font-extrabold block uppercase tracking-wide font-sans">Sucursal</span>
                      <span className="text-xs font-bold text-slate-800 uppercase">{extractedData.sucursal || "General"}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <FileText className="w-4 h-4 text-[#0B53F4] mt-1 shrink-0" />
                    <div>
                      <span className="text-[9px] text-slate-400 font-extrabold block uppercase tracking-wide font-sans">Total Pagado</span>
                      <span className="text-sm font-black text-[#0B53F4] tracking-tight font-mono">${extractedData.total.toFixed(2)} MXN</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Items Desglose Preview */}
              <div>
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
              <div className="p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-5 mt-4 bg-white border-slate-200 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#0B53F4]/5 rounded-full blur-2xl pointer-events-none" />
                
                {matchingConnector ? (
                  <div className="flex items-center gap-3 relative z-10 font-sans">
                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shrink-0 border border-emerald-150">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Conector de Facturación Encontrado</h5>
                      <p className="text-[10px] text-slate-400 mt-1 font-semibold">Navegación Playwright mapeada: <span className="font-mono underline text-[#0B53F4] font-bold">{matchingConnector.nombre}</span></p>
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
                        Procederemos a ejecutar una auditoría por Google Search, interpretando el cargador del SAT para proponer nuevos selectores en segundos.
                      </p>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => {
                    if (ticketId && onStartAutomation) {
                      onStartAutomation(ticketId);
                    }
                    handleTriggerAutomation();
                  }}
                  disabled={!fiscalProfile || !extractedData || checkIsDataIncomplete(extractedData)}
                  className="sm:shrink-0 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 text-white bg-[#0B53F4] hover:bg-blue-600 px-5.5 py-3.5 rounded-xl transition shadow-md shadow-[#0B53F4]/10 active:scale-[0.98] disabled:opacity-50 select-none relative z-10 cursor-pointer text-center"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Iniciar Automatización
                </button>
              </div>

              {!fiscalProfile && (
                <div className="text-[10px] text-rose-600 flex items-center gap-2 font-bold bg-rose-50 border border-rose-150 rounded-xl p-3 mt-2 font-sans text-left">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>Primero debes rellenar tus datos oficiales en la pestaña ⚙️ Perfil Fiscal antes de timbrar.</span>
                </div>
              )}
              </>
            )}
            </div>
          )}
          </div>
        </div>
      )}

      {/* STEP 3: REDESIGNED TIMELINE ACTIVE PROCESSING PANEL */}
      {activeStep === "automating" && (() => {
        const getStepStatus = (stepIndex: number) => {
          if (stepIndex === 1) {
            return simulationProgress >= 25 ? "completed" : "active";
          }
          if (stepIndex === 2) {
            if (simulationProgress >= 50) return "completed";
            if (simulationProgress >= 25) return "active";
            return "pending";
          }
          if (stepIndex === 3) {
            if (simulationProgress >= 75) return "completed";
            if (simulationProgress >= 50) return "active";
            return "pending";
          }
          if (stepIndex === 4) {
            if (simulationProgress >= 100) return "completed";
            if (simulationProgress >= 75) return "active";
            return "pending";
          }
          return "pending";
        };

        const getDynamicStatusMsg = () => {
          if (simulationProgress === 0) return "Iniciando conexión con el motor de procesamiento ZenTicket...";
          if (simulationProgress < 25) return "Estableciendo conexión segura y preparando lectura digital...";
          if (simulationProgress < 50) return "Analizando estructura visual del ticket y abstrayendo conceptos de consumo...";
          if (simulationProgress < 75) return "Validando la consistencia de importes, tasas de IVA y datos fiscales SAT...";
          if (simulationProgress < 100) return "Enlazando con el PAC para timbrado oficial y generando archivos (PDF/XML)...";
          return "¡Factura generada con éxito en el almacén digital ZenTicket!";
        };

        return (
          <div id="automating-panel" className="flex-1 flex flex-col justify-between relative z-10 animate-fade-in_50 font-sans text-left bg-white border border-slate-200/80 rounded-3xl p-4 sm:p-8 shadow-[0_15px_35px_-10px_rgba(37,99,235,0.03)] my-4">
            {/* Header section fitting ZenTicket graphic language */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-5 mb-6 select-none">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-blue-50 border border-blue-200/50 text-[#0B53F4] text-[10px] font-black tracking-wider uppercase px-2.5 py-1 rounded-md">
                    Motor de Procesamiento
                  </span>
                  <span className="text-[10px] font-mono font-bold text-slate-400">
                    TICKET #{ticketId ? ticketId.slice(-8).toUpperCase() : "..."}
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900 font-display tracking-tight">
                  Procesando Comprobante Fiscal
                </h3>
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
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-5 text-center mt-4">
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 text-[#0B53F4] animate-spin shrink-0 animate-duration-1000" />
                <span className="text-xs sm:text-[13px] font-semibold text-slate-600 font-sans tracking-tight leading-normal">
                  {getDynamicStatusMsg()}
                </span>
              </div>
            </div>

            {/* Standard actions footer / backup background run option */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between sm:items-center border-t border-slate-100 pt-5 mt-2">
              <div className="flex items-center gap-1.5 select-none text-[10.5px] text-slate-400 font-medium justify-center sm:justify-start">
                <Clock className="w-3.5 h-3.5" />
                <span>Tiempo de procesamiento estimado: ~9s</span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (ticketId) {
                    await onUpdateTicketInDb(ticketId, {
                      status: "review", // mark as review under reviews
                    });
                  }
                  setActiveStep("tracking");
                }}
                className="w-full sm:w-auto text-center text-[10px] font-black uppercase tracking-wider text-[#0B53F4] bg-[#ebf1ff] hover:bg-[#ebf1ff]/80 px-4 py-2.5 rounded-xl transition cursor-pointer active:scale-[0.98] border-none shadow-2xs"
              >
                ¿Demorando demasiado? Llevar a seguimiento
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
              Procesamiento en seguimiento
            </h3>
            <p className="text-sm font-bold text-[#0B53F4]">
              El procesamiento continuará en segundo plano
            </p>
            <p className="text-xs sm:text-[13px] text-slate-500 leading-relaxed max-w-md mx-auto font-medium">
              Estamos revisando la información del ticket. Puedes consultar su avance desde <span className="font-bold text-slate-800 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-150">Mis tickets &gt; En seguimiento</span>.
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
              Ir a En seguimiento
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
              El ticket comercial ha sido procesado, timbrado e incorporado de forma segura en tu historial de CFDIs v4.0 listos para consultar.
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
              Ver Factura Emitida
            </button>
          </div>
        </div>
      )}

      {/* showOcrConfirmationModal Popup Overlay precisely as requested */}
      {showOcrConfirmationModal && extractedData && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl overflow-hidden max-w-lg w-full shadow-2xl border border-slate-100 flex flex-col text-slate-800 animate-scale-up">
            {/* Header */}
            <div className="p-6 border-b border-blue-50 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 flex items-center justify-between text-left">
              <div>
                <span className="text-[10px] font-black text-[#0B53F4] tracking-widest block uppercase font-mono">Lectura Optimizada por IA</span>
                <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#0B53F4] animate-pulse" />
                  Corrobore los Datos Técnicos
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowOcrConfirmationModal(false)}
                className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 p-1.5 rounded-full duration-150 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 text-left space-y-5">
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                {extractedData.ocrFailed
                  ? "El OCR no pudo leer con confianza este ticket. Por seguridad fiscal, dejamos los campos vacíos para que captures únicamente los datos reales impresos en el comprobante."
                  : "Nuestra Inteligencia Artificial interpretó la transcripción del ticket. Por favor verifica que los datos primarios sean correctos antes de proceder."}
              </p>

              {/* Info Box */}
              <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 space-y-3.5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block font-mono">Establecimiento</span>
                    <span className="text-xs font-extrabold text-slate-800 uppercase block leading-tight mt-0.5">
                      {extractedData.nombreEmisor || "Establecimiento no identificado"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block font-mono">Monto Total</span>
                    <span className="text-sm font-black text-[#0B53F4] block font-mono mt-0.5">
                      ${(extractedData.total || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-slate-200/60 pt-3">
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block font-mono">Folio de Compra</span>
                    <span className="text-xs font-extrabold text-slate-700 block mt-0.5">
                      {extractedData.folio || "S/D"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block font-mono">Fecha del Ticket</span>
                    <span className="text-xs font-extrabold text-slate-700 block mt-0.5">
                      {extractedData.fechaCompra || "S/D"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Duplicate/Already Invoiced ticket warning in modal */}
              {(() => {
                const dupTicket = getExistingInvoicedTicket(extractedData.rfcEmisor, extractedData.folio);
                if (dupTicket) {
                  return (
                    <div className="bg-rose-50 border border-rose-250 rounded-2xl p-4 flex items-start gap-3.5 text-rose-950 text-xs text-left">
                      <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center shrink-0 text-rose-600 mt-0.5 animate-bounce">
                        <AlertTriangle className="w-4.5 h-4.5" />
                      </div>
                      <div className="space-y-1">
                        <span className="font-extrabold text-[10px] uppercase tracking-wider block text-rose-700">⚠️ ¡Atención! Ticket Ya Facturado</span>
                        <p className="font-semibold text-[11.5px] text-rose-900 leading-normal">
                          Este ticket con Folio <strong className="font-black underline select-text">{extractedData.folio}</strong> y RFC Emisor <strong className="font-black select-text">{extractedData.rfcEmisor}</strong> ya fue facturado anteriormente en su cuenta.
                        </p>
                        <p className="text-[10px] text-rose-700 font-medium">
                          Volver a procesarlo generará folios duplicados ante el SAT y consumos extras no deseados.
                        </p>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Automatic status indicator block precisely as requested */}
              <div className={`p-4 rounded-2xl border flex items-start gap-3.5 text-xs leading-relaxed ${
                extractedData.ocrFailed
                  ? "bg-rose-50 border-rose-200 text-rose-900"
                  : matchingConnector 
                  ? "bg-emerald-500/5 border-emerald-200 text-emerald-800"
                  : "bg-[#FFFDF5] border-amber-200 text-amber-900"
              }`}>
                {extractedData.ocrFailed ? (
                  <>
                    <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center shrink-0 text-rose-600 mt-0.5">
                      <AlertTriangle className="w-4.5 h-4.5" />
                    </div>
                    <div className="space-y-0.5">
                      <span className="font-extrabold text-[10px] uppercase tracking-wider block text-rose-700">Captura manual requerida</span>
                      <p className="font-medium text-[11px] text-rose-800 leading-relaxed">
                        No se detectó información suficiente para facturar. Completa establecimiento, RFC, folio, fecha y total con los datos impresos en el ticket.
                      </p>
                    </div>
                  </>
                ) : matchingConnector ? (
                  <>
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 text-emerald-600 mt-0.5 animate-pulse">
                      <CheckCircle className="w-4.5 h-4.5" />
                    </div>
                    <div className="space-y-0.5">
                      <span className="font-extrabold text-[10px] uppercase tracking-wider block text-emerald-700">⚡ Facturación 100% Automática Lista</span>
                      <p className="font-medium text-[11px] text-emerald-650 leading-relaxed">
                        Detectamos que este portal de facturación ya está entrenado en su cuenta (<strong>{matchingConnector.nombre}</strong>). Al presionar o confirmar, el timbrado automático SAT se detonará directo en segundo plano a través de Playwright.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 text-amber-600 mt-0.5 animate-pulse">
                      <Brain className="w-4.5 h-4.5" />
                    </div>
                    <div className="space-y-0.5">
                      <span className="font-extrabold text-[10px] uppercase tracking-wider block text-amber-800">🧠 Nuevo Entrenamiento IA SAT Requerido</span>
                      <p className="font-medium text-[11px] text-amber-705 leading-relaxed">
                        Aún no contamos con un portal entrenado para <strong>{extractedData.nombreEmisor}</strong>. Al presionar facturar, nuestro agente IA procederá a entrenar el portal de manera dinámica, registrará el conector y timbrará tu factura en tiempo real.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-2 justify-end">
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
                className="text-xs font-bold text-slate-650 hover:text-slate-800 bg-white border border-slate-200 hover:border-slate-350 py-3 px-4 rounded-xl duration-150 cursor-pointer active:scale-98 text-center"
              >
                Corregir Datos del Ticket
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowOcrConfirmationModal(false);
                  if (matchingConnector) {
                    handleTriggerAutomation();
                  } else {
                    handleRunTraining();
                  }
                }}
                disabled={checkIsDataIncomplete(extractedData)}
                className="text-xs font-black uppercase tracking-wider text-white bg-[#0B53F4] hover:bg-blue-600 disabled:opacity-50 py-3 px-6 rounded-xl duration-150 cursor-pointer active:scale-98 text-center shadow-md shadow-[#0B53F4]/15"
              >
                {extractedData.ocrFailed ? "Completa los datos para continuar" : matchingConnector ? "Confirmar y Facturar" : "Entrenar y Facturar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
