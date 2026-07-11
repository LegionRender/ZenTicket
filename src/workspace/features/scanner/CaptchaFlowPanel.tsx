import React, { useState, useEffect } from "react";
import { db } from "@/services/firebase/firebase";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { submitInvoiceJobCaptcha } from "@/services/api";
import { useToast } from "@/shared/feedback/Toast";
import { RefreshCw, Check } from "lucide-react";

// CAPTCHA statuses
const CAPTCHA_FLOW_STATUSES = new Set([
  "blocked_by_captcha",
  "waiting_human_verification",
  "waiting_user_captcha",
  "captcha_submitted",
  "verifying_captcha",
  "captcha_failed",
  "captcha_timeout",
  "captcha_resolved",
]);

const CAPTCHA_UNLOCK_STATUSES = new Set([
  "completed",
  "invoice_completed",
  "failed_final",
  "failed",
  "runner_processing",
  "processing",
  "sat_verifying",
  "waiting_portal_result",
  "cfdi_validated",
  "invoice_obtained"
]);

interface CaptchaFlowPanelProps {
  jobId: string | null;
  ticketId: string | null;
  source: "scanner" | "tickets";
  onTabChange?: (tab: any) => void;
  // If the parent already listens to the ticket/job, we can optionally pass it
  initialTicket?: any;
}

export const CaptchaFlowPanel: React.FC<CaptchaFlowPanelProps> = ({
  jobId,
  ticketId,
  source,
  onTabChange,
  initialTicket
}) => {
  const toast = useToast();
  const [activeJob, setActiveJob] = useState<any>(null);
  const [activeTicket, setActiveTicket] = useState<any>(initialTicket || null);
  const [captchaSolution, setCaptchaSolution] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captchaPanelLocked, setCaptchaPanelLocked] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;
    e.currentTarget.style.transformOrigin = `${x}% ${y}%`;
  };

  // 1. Listen to activeJob
  useEffect(() => {
    if (!jobId) {
      setActiveJob(null);
      return;
    }
    console.debug("[CAPTCHA_UI_RENDER] Subscribing to job:", jobId);
    const docRef = doc(db, "invoice_jobs", jobId);
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        console.debug("[CAPTCHA_UI_RENDER] Job Snapshot Update:", { jobId, status: data.status });
        setActiveJob({ id: snapshot.id, ...data });
      }
    }, (err) => {
      console.error("Error watching live job in CaptchaFlowPanel:", err);
    });
    return unsubscribe;
  }, [jobId]);

  // 2. Listen to activeTicket
  useEffect(() => {
    if (!ticketId) {
      setActiveTicket(null);
      return;
    }
    const docRef = doc(db, "tickets", ticketId);
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setActiveTicket({ id: snapshot.id, ...data });
      }
    }, (err) => {
      console.error("Error watching ticket in CaptchaFlowPanel:", err);
    });
    return unsubscribe;
  }, [ticketId]);

  // 3. Latch logic
  const effectiveStatus = activeJob?.status || activeTicket?.status || "";
  
  useEffect(() => {
    const flowActive =
      CAPTCHA_FLOW_STATUSES.has(effectiveStatus) ||
      activeJob?.captchaFlowActive === true ||
      activeTicket?.captchaFlowActive === true ||
      activeJob?.blockingReason === "captcha_detected";

    if (flowActive) {
      if (!captchaPanelLocked) {
        console.debug("[CAPTCHA_UI_RENDER] Locking CAPTCHA panel. status:", effectiveStatus);
        setCaptchaPanelLocked(true);
      }
    } else if (CAPTCHA_UNLOCK_STATUSES.has(effectiveStatus)) {
      if (captchaPanelLocked) {
        console.debug("[CAPTCHA_UI_RENDER] Unlocking CAPTCHA panel. status:", effectiveStatus);
        setCaptchaPanelLocked(false);
      }
    }
  }, [effectiveStatus, activeJob, activeTicket, captchaPanelLocked]);

  // Unmount log
  useEffect(() => {
    return () => {
      console.debug("[CAPTCHA_COMPONENT_UNMOUNT]", {
        source,
        ticketId,
        jobId,
        lastKnownStatus: effectiveStatus,
      });
    };
  }, [effectiveStatus]);

  if (!captchaPanelLocked) {
    return null;
  }

  const isVerifying = ["captcha_submitted", "verifying_captcha"].includes(effectiveStatus);
  const isFailed = effectiveStatus === "captcha_failed" || activeJob?.captchaFailed === true || activeTicket?.captchaFailed === true;
  const isTimeout = effectiveStatus === "captcha_timeout";
  const isResolved = effectiveStatus === "captcha_resolved";

  const screenshotUrl = activeJob?.captchaScreenshotUrl || activeTicket?.captchaScreenshotUrl;
  const attemptId = activeJob?.captchaAttemptId || activeTicket?.captchaAttemptId;

  const handleSubmit = async () => {
    const targetJobId = jobId || activeTicket?.jobId;
    const solution = captchaSolution.trim();
    if (!targetJobId || !solution) {
      toast.error("Por favor, ingresa el código CAPTCHA para continuar.");
      return;
    }
    setIsSubmitting(true);
    try {
      console.debug("[CAPTCHA_UI_RENDER] Submitting solution for attempt:", attemptId);
      await submitInvoiceJobCaptcha(targetJobId, solution, attemptId);
      setCaptchaSolution("");
      toast.success("Código enviado. Continuando con la facturación.");
    } catch (error: any) {
      console.error("Error submitting captcha:", error);
      toast.error("No se pudo enviar el código. Inténtalo nuevamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isResolved) {
    return (
      <div className={`w-full min-w-0 ${source === "scanner" ? "max-w-md bg-emerald-50 border border-emerald-250 p-6" : "max-w-xs bg-emerald-50 border border-emerald-100 p-8"} rounded-3xl text-center space-y-4 shadow-sm animate-fade-in`}>
        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto animate-bounce">
          <Check className="w-6 h-6" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-sm font-extrabold text-emerald-950 uppercase tracking-tight">¡CAPTCHA Correcto!</h3>
          <p className="text-[11px] text-emerald-800 leading-normal font-medium max-w-xs mx-auto">
            El código ha sido verificado con éxito en el portal. Continuando la descarga del comprobante fiscal...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full min-w-0 ${source === "scanner" ? "max-w-md bg-amber-50 border border-amber-200 p-3 sm:p-4" : "max-w-md bg-amber-50 border border-amber-100 p-6"} rounded-3xl text-left space-y-6`}>
      <div className="flex items-center gap-3 justify-center text-center">
        <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center">
          <RefreshCw className={`w-5 h-5 ${isVerifying ? "animate-spin" : ""}`} />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-extrabold text-amber-950 uppercase tracking-tight">CAPTCHA Requerido</h3>
          <p className="text-[11px] text-amber-800 leading-normal font-medium">
            El portal oficial requiere validación humana para certificar la factura.
          </p>
        </div>
      </div>

      {screenshotUrl ? (
        <div className="space-y-2 text-center">
          <div className="relative rounded-2xl border border-amber-250/50 shadow-sm max-w-sm mx-auto bg-white flex items-center justify-center overflow-hidden h-56 w-full">
            <img 
              src={screenshotUrl} 
              alt="CAPTCHA del comercio"
              onMouseMove={handleMouseMove}
              className="w-full h-full object-contain transition-transform duration-100 hover:scale-[3.2] cursor-zoom-in origin-center z-20 relative bg-white"
            />
          </div>
          <span className="text-[10px] text-amber-700/80 font-medium block select-none">
            🔍 Pasa el mouse sobre la imagen para hacer zoom y desplazar
          </span>
        </div>
      ) : (
        <div className="p-4 bg-amber-100/50 rounded-2xl text-[10px] font-mono text-amber-800 tracking-wider uppercase animate-pulse max-w-xs mx-auto text-center">
          Cargando captura del CAPTCHA...
        </div>
      )}

      {isVerifying && (
        <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 p-2.5 rounded-xl animate-pulse max-w-xs mx-auto">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Validando código en el portal...</span>
        </div>
      )}
      {isFailed && (
        <p className="text-[10px] font-black text-rose-600 uppercase tracking-wider text-center max-w-xs mx-auto">
          ⚠️ Código incorrecto. Por favor, escribe el nuevo código.
        </p>
      )}
      {isTimeout && (
        <p className="text-[10px] font-black text-rose-600 uppercase tracking-wider text-center max-w-xs mx-auto">
          ⏳ Tiempo de espera agotado. Por favor, intenta de nuevo.
        </p>
      )}

      <div className="space-y-2 text-left max-w-xs mx-auto">
        <label className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
          Introduce el código de la imagen
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Escribe el código aquí"
            disabled={isSubmitting || isVerifying}
            value={captchaSolution}
            onChange={(e) => setCaptchaSolution(e.target.value)}
            className="flex-1 rounded-xl bg-white border border-amber-250 px-3.5 py-2.5 text-xs text-slate-800 font-semibold outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400/50 disabled:bg-slate-100 disabled:text-slate-400"
          />
          <button
            type="button"
            disabled={isSubmitting || isVerifying || !captchaSolution.trim()}
            onClick={handleSubmit}
            className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer uppercase transition-all duration-150"
          >
            {isVerifying ? "Espere..." : isSubmitting ? "Enviando..." : "Enviar"}
          </button>
        </div>
      </div>

      <p className="text-[10px] font-medium text-amber-800/80 text-center">
        La sesión permanece abierta en la nube durante cinco minutos.
      </p>
    </div>
  );
};
