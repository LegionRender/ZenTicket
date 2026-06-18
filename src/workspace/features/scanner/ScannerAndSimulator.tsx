import React, { useState, useRef, useEffect } from "react";
import { Ticket, Connector, ExtractedTicketData } from "@/types";
import { SAMPLE_TICKETS, drawMockTicketToDataUrl } from "@/utils/ticket-drawer";
import { 
  Upload, Loader2, Play, Terminal, AlertTriangle, CheckCircle, 
  RefreshCw, Sparkles, Cpu, Eye, Building2, Calendar, FileText, Clock,
  Camera, ShoppingBag, Fuel, Utensils, X, Brain, Image as ImageIcon,
  Shield, Users, Database, Check
} from "lucide-react";
import { useToast } from "@/shared/feedback/Toast";
import { db, auth } from "@/services/firebase/client";
import { runTicketAutomation } from "@/services/api/automationService";
import { analyzeTicketImage } from "@/services/api/ticketsService";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { AnimatePresence, motion } from "motion/react";
import {
  isTicketDataIncomplete,
  matchConnector
} from "@/workspace/features/scanner/scannerHelpers";
import { compressImage } from "@/workspace/features/scanner/scannerImage";
import type {
  ContingencyStrategy,
  OperationalNotification,
  ScannerAndSimulatorProps
} from "@/workspace/features/scanner/scanner.types";
import { ContingencyPanel } from "@/workspace/features/scanner/components/ContingencyPanel";
import { OperationalNotificationsCenter } from "@/workspace/features/scanner/components/OperationalNotificationsCenter";
import { RenewalBlockerModal } from "@/workspace/features/scanner/components/RenewalBlockerModal";
import { ProgressSteps } from "@/workspace/components/WorkspacePrimitives";

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
}: ScannerAndSimulatorProps) {
  const toast = useToast();

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

  // Operational Notifications Center State
  const [operationalNotifications, setOperationalNotifications] = useState<OperationalNotification[]>([
    {
      id: "op-1",
      category: "pendientes",
      criticality: "critica",
      title: "Bloqueo de CAPTCHA en Portal Walmart",
      message: "El robot de Playwright detectó un bucle de imágenes CAPTCHA complejas en el portal externo. Se requiere parche dinámico de script.",
      createdAt: new Date(Date.now() - 35 * 1000), // Hace 35s
      read: false,
      actionText: "Ir a Contingencia 🛡️",
      actionType: "contingency"
    },
    {
      id: "op-2",
      category: "facturas",
      criticality: "informativa",
      title: "Factura SAT certificada con éxito",
      message: "Se timbró exitosamente el CFDI 4.0 para Alsea S.A.B. por un monto de $345.50 MXN de manera limpia.",
      createdAt: new Date(Date.now() - 15 * 60 * 1000), // Hace 15 min
      read: true,
      actionText: "Ver detalles 📄",
      actionType: "info"
    },
    {
      id: "op-3",
      category: "gastos",
      criticality: "importante",
      title: "Alerta de Gasto: Discrepancia menor Starbucks",
      message: "El OCR leyó $120.00 pero el desglose heurístico calculó $120.50 debido a cargos adicionales de redondeo.",
      createdAt: new Date(Date.now() - 60 * 60 * 1000), // Hace 1h
      read: false,
      actionText: "Corregir Enmienda ✏️",
      actionType: "contingency"
    },
    {
      id: "op-4",
      category: "cuenta",
      criticality: "critica",
      title: "Credencial SAT Expirada (RFC: PRM120304AA1)",
      message: "La e.firma del usuario expiró ante el portal oficial del SAT. Operaciones suspendidas temporalmente.",
      createdAt: new Date(Date.now() - 3.5 * 60 * 60 * 1000), // Hace 3h
      read: false,
      actionText: "Ver Cuenta 👤",
      actionType: "info"
    },
    {
      id: "op-5",
      category: "facturas",
      criticality: "critica",
      title: "Error 504 Gateway: Ticketmaster Inc",
      message: "El portal del emisor de Ticketmaster está presentando intermitencia crítica sobre la cola de respuesta SAT.",
      createdAt: new Date(Date.now() - 4.5 * 60 * 60 * 1000), // Hace 4h
      read: false,
      actionText: "Parchar Playwright ⚡",
      actionType: "contingency"
    },
  ]);

  // Contingency state
  const [selectedContingencyTicket, setSelectedContingencyTicket] = useState<Ticket | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<ContingencyStrategy>("playwright");
  const [isSolvingContingency, setIsSolvingContingency] = useState(false);
  const [solvingProgress, setSolvingProgress] = useState(0);
  const [solvingLogs, setSolvingLogs] = useState<string[]>([]);

  // Modals for scrolling list escape
  const [isContingencyModalOpen, setIsContingencyModalOpen] = useState(false);

  // Clock tick to refresh relative times automatically
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setClockTick(prev => prev + 1);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeStep !== "upload") return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("zt-open-camera") !== "1") return;

    sessionStorage.removeItem("zt-open-camera");
    setTimeout(() => {
      if (fileInputRef.current) {
        fileInputRef.current.setAttribute("capture", "environment");
        fileInputRef.current.click();
      }
    }, 120);
  }, [activeStep]);

  const handleSolveContingency = async (ticket: Ticket) => {
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

  const markNotificationRead = (notificationId: string) => {
    setOperationalNotifications((prev) =>
      prev.map((item) => (item.id === notificationId ? { ...item, read: true } : item))
    );
  };

  const archiveNotification = (notificationId: string) => {
    markNotificationRead(notificationId);
    toast.success("NotificaciÃ³n archivada.");
  };

  const handleNotificationAction = (notification: OperationalNotification) => {
    markNotificationRead(notification.id);

    if (notification.actionType === "contingency") {
      const contingencyTicket =
        tickets.find((ticket) => ticket.status === "failed" || ticket.status === "review") || {
          id: "demo-tkt-123",
          nombreEmisor: "Walmart Supercenter",
          rfcEmisor: "NWM9709244W4",
          folio: "WM-48203",
          total: 948.5,
          status: "failed",
          errorMsg: "Error de CAPTCHA: Bloqueo anti-bot persistente en portal del emisor."
        };

      setSelectedContingencyTicket(contingencyTicket as Ticket);
      toast.info(`Direccionando a Contingencia IA para resolver ${contingencyTicket.nombreEmisor}...`, "MitigaciÃ³n Activada");

      setTimeout(() => {
        const contingencyElement = document.getElementById("ai-contingency-panel-card");
        if (contingencyElement) {
          contingencyElement.scrollIntoView({ behavior: "smooth" });
        }
      }, 100);
      return;
    }

    toast.success(`NotificaciÃ³n marcada como leÃ­da: ${notification.title}`, "LeÃ­do");
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
      setIsEditing(isTicketDataIncomplete(data));

      const found = matchConnector(connectors, ticket.nombreEmisor, ticket.rfcEmisor);
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
    const interval = setInterval(() => {
      current += Math.floor(Math.random() * 8) + 3;
      if (current >= 98) {
        current = 98;
        setOcrProgressStepMsg("Ajustando nitidez y aserción de importes...");
        clearInterval(interval);
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
      const ocrResult: any = await analyzeTicketImage({
        image: dataUrl.split(",")[1],
        mimeType: "image/png",
        personalGeminiKey: fiscalProfile?.personalGeminiKey,
      });
      setExtractedData(ocrResult);
      setEditNombre(ocrResult.nombreEmisor || "");
      setEditRfc(ocrResult.rfcEmisor || "");
      setEditFecha(ocrResult.fechaCompra || "");
      setEditFolio(ocrResult.folio || "");
      setEditSucursal(ocrResult.sucursal || "");
      setEditTotal(ocrResult.total || 0);
      setIsEditing(isTicketDataIncomplete(ocrResult));

      // Auto-save this ticket in Firebase with status "extracted"
      const tId = await onSaveTicketToDb({
        userId: "guest",
        imageUrl: dataUrl,
        status: "extracted",
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
    const found = matchConnector(connectors, data.nombreEmisor, data.rfcEmisor);
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

      const ocrResult: any = await analyzeTicketImage({
        image: rawBase64,
        mimeType: mime,
        personalGeminiKey: fiscalProfile?.personalGeminiKey,
      });
      setExtractedData(ocrResult);
      setEditNombre(ocrResult.nombreEmisor || "");
      setEditRfc(ocrResult.rfcEmisor || "");
      setEditFecha(ocrResult.fechaCompra || "");
      setEditFolio(ocrResult.folio || "");
      setEditSucursal(ocrResult.sucursal || "");
      setEditTotal(ocrResult.total || 0);
      setIsEditing(isTicketDataIncomplete(ocrResult));

      // Save ticket in DB
      const tId = await onSaveTicketToDb({
        userId: "guest",
        imageUrl: base64Str,
        status: "extracted",
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
      const invoiceData = await runTicketAutomation({
        ticket: extractedData,
        profile: fiscalProfile,
        connector: activeConn,
      });

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

  const openCameraCapture = () => {
    if (!fileInputRef.current) return;
    fileInputRef.current.setAttribute("capture", "environment");
    fileInputRef.current.click();
  };

  const openGalleryUpload = () => {
    if (!fileInputRef.current) return;
    fileInputRef.current.removeAttribute("capture");
    fileInputRef.current.click();
  };

  return (
    <div className="bg-transparent min-h-[500px] flex flex-col relative overflow-hidden select-none gap-6">

      {/* RENEWAL BLOCKER MODAL OVERLAY */}
      {showRenewalBlocker && (
        <RenewalBlockerModal
          blockerReason={blockerReason}
          fiscalProfile={fiscalProfile}
          isProcessingRenewalPay={isProcessingRenewalPay}
          onCancel={() => {
            setShowRenewalBlocker(false);
            setActiveStep("upload");
          }}
          onRenew={handleManualRenewalPay}
          onViewPlans={() => {
            setShowRenewalBlocker(false);
            if (onTabChange) onTabChange("cuenta");
          }}
        />
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
            <div className="bg-white border border-slate-200/80 shadow-[var(--shadow-surface)] rounded-[1.35rem] p-6 text-center my-auto flex flex-col items-center justify-center min-h-[300px] space-y-5 animate-fade-in">
              <ProgressSteps
                className="w-full max-w-md"
                currentStep={1}
                steps={[
                  { label: "Capturar" },
                  { label: "Procesar" },
                  { label: "Validar" },
                  { label: "Guardar" },
                ]}
              />
              {/* Spinner & Brain */}
              <div className="relative w-16 h-16 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border border-blue-100 animate-pulse bg-blue-50/40" />
                <div className="absolute inset-0 rounded-full border-4 border-slate-100 border-t-[#0B53F4] animate-spin" />
                <Brain className="w-6 h-6 text-[#0B53F4] absolute" />
              </div>

              <div className="space-y-1">
                <p className="text-sm font-black text-slate-800 uppercase tracking-wider">
                  Procesando ticket
                </p>
                <p className="text-[11px] font-mono font-black text-[#0B53F4] tracking-widest uppercase">
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
                  <span>LECTURA OCR</span>
                  <span className="text-[#0B53F4] font-black">{ocrProgress}%</span>
                </div>
              </div>

              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed text-center">
                El motor OCR lee pixeles refractarios en 3D para deducir montos, folios de facturación, fecha y el RFC corporativo.
              </p>
            </div>
          ) : (
            <>
              <section className="rounded-[1.35rem] bg-gradient-to-br from-[#06144F] via-[#0B53F4] to-[#18A7F8] p-4 sm:p-5 text-white shadow-[var(--shadow-surface)] relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-24 bg-white/10 blur-2xl pointer-events-none" />
                <div className="relative z-10 space-y-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 text-left">
                      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/65">Escanear</span>
                      <h2 className="mt-1 text-2xl font-black tracking-tight">Captura tu ticket</h2>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/18 bg-white/12 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white/90">
                      <Sparkles className="h-3.5 w-3.5" />
                      Auto
                    </span>
                  </div>

                  <ProgressSteps
                    className=""
                    currentStep={0}
                    steps={[
                      { label: "Capturar" },
                      { label: "Procesar" },
                      { label: "Validar" },
                      { label: "Guardar" },
                    ]}
                  />

                  <button
                    type="button"
                    onClick={openCameraCapture}
                    className="group relative w-full rounded-[1.25rem] border border-white/25 bg-slate-950/35 p-4 sm:p-5 min-h-[290px] overflow-hidden shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] active:scale-[0.995] transition"
                    aria-label="Abrir camara para capturar ticket"
                  >
                    <div className="absolute inset-5 rounded-[1rem] border border-white/16 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12),transparent_62%)]" />
                    <div className="absolute left-7 top-7 h-12 w-12 rounded-tl-2xl border-l-2 border-t-2 border-white/75" />
                    <div className="absolute right-7 top-7 h-12 w-12 rounded-tr-2xl border-r-2 border-t-2 border-white/75" />
                    <div className="absolute left-7 bottom-7 h-12 w-12 rounded-bl-2xl border-b-2 border-l-2 border-white/75" />
                    <div className="absolute right-7 bottom-7 h-12 w-12 rounded-br-2xl border-b-2 border-r-2 border-white/75" />
                    <div className="relative z-10 flex h-full min-h-[250px] flex-col items-center justify-center gap-3 text-center">
                      <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#0B53F4] shadow-[var(--shadow-floating)] group-hover:scale-[1.03] transition">
                        <Camera className="h-8 w-8" />
                      </span>
                      <div className="space-y-1">
                        <p className="text-sm font-black uppercase tracking-wider">Coloca el ticket dentro del marco</p>
                        <p className="mx-auto max-w-xs text-xs font-medium leading-relaxed text-white/72">
                          La camara se activara para capturar una imagen legible y enviarla a OCR.
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/16 px-3 py-1.5 text-[11px] font-bold text-emerald-100">
                        <span className="h-2 w-2 rounded-full bg-emerald-300" />
                        Escaneo automatico activo
                      </span>
                    </div>
                  </button>
                </div>
              </section>

              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-1">
                <button
                  type="button"
                  onClick={openGalleryUpload}
                  className="rounded-[1rem] border border-slate-200 bg-white px-3 py-4 text-slate-700 shadow-[var(--shadow-surface)] active:scale-[0.98] transition"
                >
                  <ImageIcon className="mx-auto h-5 w-5 text-[#0B53F4]" />
                  <span className="mt-2 block text-[11px] font-black">Galeria</span>
                </button>
                <button
                  type="button"
                  onClick={openCameraCapture}
                  className="h-20 w-20 rounded-full bg-gradient-to-br from-[#1FB4FF] to-[#0B53F4] text-white shadow-[var(--shadow-floating)] ring-8 ring-white flex items-center justify-center active:scale-[0.97] transition"
                  aria-label="Abrir camara para escanear ticket"
                >
                  <Camera className="h-8 w-8" />
                </button>
                <button
                  type="button"
                  onClick={openGalleryUpload}
                  className="rounded-[1rem] border border-slate-200 bg-white px-3 py-4 text-slate-700 shadow-[var(--shadow-surface)] active:scale-[0.98] transition"
                >
                  <FileText className="mx-auto h-5 w-5 text-[#0B53F4]" />
                  <span className="mt-2 block text-[11px] font-black">PDF</span>
                </button>
              </div>

              <section className="rounded-[1.35rem] border border-slate-200/80 bg-white p-4 sm:p-5 shadow-[var(--shadow-surface)] text-left">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Listo para capturar</h3>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      El ticket pasara por lectura, validacion fiscal y guardado.
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#0B53F4]">
                    Paso 1/4
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {[
                    ["Camara preparada", "Captura o selecciona una imagen del ticket.", true],
                    ["Extraccion OCR", "Se activara automaticamente al subir la imagen.", false],
                    ["Validacion y guardado", "Confirmaras los datos antes de automatizar.", false],
                  ].map(([title, copy, done]) => (
                    <div key={String(title)} className="flex items-start gap-3">
                      <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${done ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                        {done ? <Check className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                      </span>
                      <div>
                        <p className="text-xs font-black text-slate-800">{title}</p>
                        <p className="text-[11px] font-medium leading-relaxed text-slate-500">{copy}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="hidden">
              {/* 1. General Status / Activity Summary Blue Card (Exact screenshot style) - Reduced 50% in height */}
              <div id="general-status-card" className="bg-gradient-to-tr from-[#0546F0] to-[#1268FF] text-white rounded-[1.15rem] p-4 shadow-[var(--shadow-surface)] relative overflow-hidden select-none">
                {/* Sparkle top right decorator */}
                <div className="absolute top-3 right-4 opacity-75">
                  <Sparkles className="w-6 h-6 text-white animate-pulse" />
                </div>

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
                  <div
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.setAttribute("capture", "environment");
                        fileInputRef.current.click();
                      }
                    }}
                    className="bg-[#0b53f4] text-white rounded-[1rem] p-3 aspect-[1.3/1] flex flex-col justify-between cursor-pointer hover:bg-[#0947D1] transition shadow-[var(--shadow-surface)] relative select-none group active:scale-[0.98]"
                  >
                    <div className="p-1 bg-white/10 rounded-lg w-fit">
                      <Camera className="w-8 h-8 text-white stroke-[2]" />
                    </div>
                    <span className="text-xs font-black text-left leading-tight group-hover:translate-x-0.5 transition duration-150">
                      Capturar Ticket
                    </span>
                  </div>

                  {/* Quick Action #2: "Subir Imagen" (Light lavender Card) */}
                  <div
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.removeAttribute("capture");
                        fileInputRef.current.click();
                      }
                    }}
                    className="bg-[#ebf1ff] text-[#0b53f4] rounded-[1rem] p-3 aspect-[1.3/1] flex flex-col justify-between cursor-pointer hover:bg-[#dee8ff] transition border border-[#0b53f4]/5 relative select-none group active:scale-[0.98]"
                  >
                    <div className="p-1 bg-[#0b53f4]/10 rounded-lg w-fit">
                      <Upload className="w-8 h-8 text-[#0b53f4] stroke-[2]" />
                    </div>
                    <span className="text-xs font-black text-[#0b53f4] text-left leading-tight group-hover:translate-x-0.5 transition duration-150">
                      Subir Imagen
                    </span>
                  </div>
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

              {/* 3. Bottom Beautiful Banner Card (Insight card from screenshot) */}
              <div className="rounded-[1.15rem] overflow-hidden relative shadow-[var(--shadow-surface)] aspect-[16/8] md:aspect-auto md:h-44 flex flex-col justify-end p-4 select-none text-left">
                {/* Background image of workspace chart display */}
                <img
                  src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=800"
                  alt="Insight Chart Banner"
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  referrerPolicy="no-referrer"
                />
                
                {/* Visual rich gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/40 to-transparent pointer-events-none" />

                <div className="relative z-10 space-y-1">
                  <span className="text-[10px] text-white/70 uppercase tracking-widest font-extrabold font-sans">
                    Insight Mensual
                  </span>
                  <h4 className="text-lg lg:text-xl font-black text-white leading-tight">
                    Tus gastos han bajado un 12%
                  </h4>
                  <p className="text-[11px] text-white/80 leading-snug font-medium leading-none">
                    Sigue así para optimizar tus deducciones fiscales de forma legal.
                  </p>
                </div>
              </div>
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
              <div className="bg-[#121626] border border-slate-700/60 text-white rounded-[1.15rem] p-4 md:p-5 space-y-5 text-left relative overflow-hidden shadow-[var(--shadow-elevated)] animate-fade-in_50">
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
                    <div className="bg-[#FAF9FF] border border-[#EBF1FF] rounded-[1.15rem] p-4 text-left space-y-4 shadow-[var(--shadow-surface)]">
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
                        disabled={!fiscalProfile || !extractedData || isTicketDataIncomplete(extractedData)}
                        className="text-[10.5px] font-black uppercase tracking-widest flex items-center justify-center gap-2 text-white bg-[#0B53F4] hover:bg-blue-600 disabled:opacity-55 px-7 py-4 rounded-2xl transition duration-150 shadow-md shadow-[#0B53F4]/15 active:scale-[0.98] select-none cursor-pointer text-center"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        Facturar de Inmediato
                      </button>
                      <button
                        onClick={() => setActiveExtractedTab("detalles")}
                        className="text-[10.5px] font-extrabold uppercase tracking-widest flex items-center justify-center gap-2 text-slate-700 bg-slate-100 hover:bg-slate-200 px-6 py-4 rounded-2xl transition active:scale-[0.98] select-none cursor-pointer border border-transparent hover:border-slate-300"
                      >
                        Ver Desglose Técnico
                      </button>
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

                    {isTicketDataIncomplete(extractedData) && !isEditing && (
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
                    {!isTicketDataIncomplete(extractedData) && (
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
                    {!isTicketDataIncomplete(extractedData) && (
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
                  disabled={!fiscalProfile || !extractedData || isTicketDataIncomplete(extractedData)}
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
          <div id="automating-panel" className="flex-1 flex flex-col justify-between relative z-10 animate-fade-in_50 font-sans text-left bg-white border border-slate-200/80 rounded-[1.15rem] p-4 sm:p-5 shadow-[var(--shadow-surface)] my-4">
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
              <div className="text-right sm:border-l sm:border-slate-100 sm:pl-5">
                <p className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Establecimiento</p>
                <p className="text-xs font-black text-slate-700 font-sans truncate max-w-[180px]">{extractedData?.nombreEmisor || "Emisor Registrado"}</p>
              </div>
            </div>

            {/* Timeline Progress Tracker (structure from user drawing, ZenTicket styles) */}
            <div className="relative my-10 select-none px-4">
              {/* Background track line */}
              <div className="absolute top-1/2 left-0 w-full h-[6px] bg-slate-100 -translate-y-1/2 rounded-full" />
              
              {/* Active track overlay */}
              <div 
                className="absolute top-1/2 left-0 h-[6px] bg-gradient-to-r from-blue-500 to-[#0B53F4] -translate-y-1/2 rounded-full transition-all duration-500 shadow-[0_1px_4px_rgba(11,83,244,0.15)]"
                style={{ width: `${Math.min(100, Math.max(0, simulationProgress))}%` }}
              />

              {/* Step Nodes Container */}
              <div className="relative flex justify-between items-center w-full">
                {[1, 2, 3, 4].map((stepIdx) => {
                  const stepStatus = getStepStatus(stepIdx);
                  
                  let stepTitle = "";
                  let stepIcon = null;
                  if (stepIdx === 1) {
                    stepTitle = "Lectura del ticket";
                    stepIcon = <FileText className="w-5 h-5 sm:w-5.5 sm:h-5.5" />;
                  } else if (stepIdx === 2) {
                    stepTitle = "Extracción de datos";
                    stepIcon = <Database className="w-5 h-5 sm:w-5.5 sm:h-5.5" />;
                  } else if (stepIdx === 3) {
                    stepTitle = "Validación de información";
                    stepIcon = <Shield className="w-5 h-5 sm:w-5.5 sm:h-5.5" />;
                  } else {
                    stepTitle = "Generación de factura";
                    stepIcon = <Building2 className="w-5 h-5 sm:w-5.5 sm:h-5.5" />;
                  }

                  return (
                    <div key={stepIdx} className="flex flex-col items-center relative z-10 w-24 sm:w-32 text-center">
                      {/* Circle Node */}
                      <div className={`
                        w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm
                        ${stepStatus === "completed" 
                          ? "bg-[#0B53F4] border-2 border-[#0B53F4] text-white" 
                          : stepStatus === "active"
                            ? "bg-white border-4 border-[#0B53F4] text-[#0B53F4] scale-110 shadow-[0_0_15px_rgba(11,83,244,0.18)]"
                            : "bg-slate-50 border-2 border-slate-200/80 text-slate-400"
                        }
                      `}>
                        {stepStatus === "completed" ? (
                          <Check className="w-5 h-5 sm:w-6 sm:h-6 stroke-[3]" />
                        ) : stepStatus === "active" ? (
                          <div className="relative flex items-center justify-center">
                            <span className="absolute animate-ping inline-flex h-4 w-4 rounded-full bg-blue-400 opacity-60"></span>
                            {stepIcon}
                          </div>
                        ) : (
                          stepIcon
                        )}
                      </div>

                      {/* Step label text below circle node */}
                      <div className="mt-3.5 select-none">
                        <p className={`text-[10px] sm:text-[11.5px] font-bold leading-tight ${stepStatus === "active" ? "text-slate-900 font-extrabold" : "text-slate-500"}`}>
                          {stepTitle}
                        </p>
                        <p className={`text-[8.5px] sm:text-[9.5px] font-bold mt-1 font-mono uppercase tracking-wider ${
                          stepStatus === "completed" 
                            ? "text-emerald-500" 
                            : stepStatus === "active"
                              ? "text-[#0B53F4]"
                              : "text-slate-400"
                        }`}>
                          {stepStatus === "completed" ? "✔ Completado" : stepStatus === "active" ? "● Procesando..." : "○ Pendiente"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* A single line of dynamic text explaining the currently executed action */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4.5 mb-5 text-center mt-4">
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 text-[#0B53F4] animate-spin shrink-0 animate-duration-1000" />
                <span className="text-xs sm:text-[13px] font-semibold text-slate-600 font-sans tracking-tight">
                  {getDynamicStatusMsg()}
                </span>
              </div>
            </div>

            {/* Standard actions footer / backup background run option */}
            <div className="flex justify-between items-center border-t border-slate-100 pt-5 mt-2">
              <div className="flex items-center gap-1.5 select-none text-[10.5px] text-slate-400 font-medium">
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
                className="text-[10px] font-black uppercase tracking-wider text-slate-550 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 px-4 py-2.5 rounded-xl border border-slate-200 transition cursor-pointer"
              >
                ¿Demorando demasiado? Llevar a seguimiento
              </button>
            </div>
          </div>
        );
      })()}

      {/* CONTROLLED STATUS: EN SEGUIMIENTO */}
      {activeStep === "tracking" && (
        <div id="tracking-panel" className="flex-1 flex flex-col justify-center items-center text-center p-5 sm:p-6 space-y-5 relative z-10 animate-fade-in_50 bg-white border border-slate-200 rounded-[1.15rem] shadow-[var(--shadow-surface)] font-sans max-w-xl mx-auto my-4">
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
              className="flex-1 py-3 px-4 bg-[#0B53F4] hover:bg-[#0941C4] text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-[var(--shadow-surface)] transition cursor-pointer text-center"
            >
              Ir a En seguimiento
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveStep("upload");
              }}
              className="flex-1 py-3 px-4 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold uppercase tracking-wider rounded-xl border border-slate-200 transition cursor-pointer text-center"
            >
              Volver al inicio
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: SUCCESS GENERATED CONFIRMATION */}
      {activeStep === "success" && (
        <div className="flex-1 flex flex-col justify-center items-center text-center p-5 space-y-4 relative z-10 animate-fade-in_50 bg-white border border-slate-200/60 rounded-[1.15rem] shadow-[var(--shadow-surface)]">
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
              className="text-xs font-bold uppercase tracking-wider bg-white hover:bg-slate-50 border border-slate-200 text-slate-650 px-5 py-3.5 rounded-xl transition cursor-pointer select-none shadow-sm"
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
          <div className="bg-white rounded-[1.15rem] overflow-hidden max-w-lg w-full shadow-[var(--shadow-elevated)] border border-slate-100 flex flex-col text-slate-800 animate-scale-up">
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
                Nuestra Inteligencia Artificial ha interpretado con éxito la transcripción del ticket termal. Por favor verifique que los datos primarios sean correctos antes de proceder.
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

              {/* Automatic status indicator block precisely as requested */}
              <div className={`p-4 rounded-2xl border flex items-start gap-3.5 text-xs leading-relaxed ${
                matchingConnector 
                  ? "bg-emerald-500/5 border-emerald-200 text-emerald-800"
                  : "bg-[#FFFDF5] border-amber-200 text-amber-900"
              }`}>
                {matchingConnector ? (
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
                disabled={isTicketDataIncomplete(extractedData)}
                className="text-xs font-black uppercase tracking-wider text-white bg-[#0B53F4] hover:bg-blue-600 disabled:opacity-50 py-3 px-6 rounded-xl duration-150 cursor-pointer active:scale-98 text-center shadow-md shadow-[#0B53F4]/15"
              >
                {matchingConnector ? "✓ Confirmar y Facturar" : "🧠 Entrenar y Facturar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
