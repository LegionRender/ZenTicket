import React, { useState, useRef, useEffect } from "react";
import { 
  User, Sparkles, Building, Check, ArrowRight, ArrowLeft, Camera, 
  Upload, AlertCircle, CheckCircle, Smartphone, ShieldCheck, Mail, Globe, X
} from "lucide-react";
import { parseConstancia as parseConstanciaApi } from "@/services/api";
import { motion, AnimatePresence } from "motion/react";
import { useToast } from "@/shared/feedback/Toast";

interface OnboardingFlowProps {
  user: any;
  fiscalProfile: any;
  onComplete: (data: any) => Promise<void>;
}

// Generate deterministic initials gradient avatar
function getInitialsAvatar(fullName: string): string {
  const cleanName = fullName.toUpperCase().trim();
  const parts = cleanName.split(/\s+/).filter(Boolean);
  let initials = "";
  if (parts.length > 0) {
    initials += parts[0][0];
    if (parts.length > 1) {
      initials += parts[parts.length - 1][0];
    }
  }
  if (!initials) initials = "U";
  
  const gradients = [
    { start: "#3B82F6", end: "#1D4ED8" }, // Blue
    { start: "#EC4899", end: "#BE185D" }, // Pink
    { start: "#F59E0B", end: "#B45309" }, // Amber
    { start: "#10B981", end: "#047857" }, // Emerald
    { start: "#8B5CF6", end: "#6D28D9" }, // Violet
    { start: "#06B6D4", end: "#0891B2" }  // Cyan
  ];
  
  // Deterministic gradient selection based on initials charcodes
  const charCodeSum = initials.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const grad = gradients[charCodeSum % gradients.length];

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <defs>
        <linearGradient id="gradInitials" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${grad.start}" />
          <stop offset="100%" stop-color="${grad.end}" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#gradInitials)" rx="50" />
      <text x="50" y="52" font-family="'Inter', system-ui, sans-serif" font-weight="800" font-size="34" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${initials}</text>
    </svg>
  `.trim().replace(/\s+/g, ' ');
  
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ user, fiscalProfile, onComplete }) => {
  const toast = useToast();
  const [step, setStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Filter out mocked initial values
  const hasValidRfc = fiscalProfile?.rfc && fiscalProfile.rfc !== "CABE850101ABC" && fiscalProfile.rfc !== "GOMD850101XYZ";
  const hasValidRazon = fiscalProfile?.razonSocial && fiscalProfile.razonSocial !== "RICARDO CASTRO BECERRIL" && fiscalProfile.razonSocial !== "CONSTRUCTORA LEGION DEL NORTE SA DE CV";

  // Step 1: Profile details
  const [name, setName] = useState<string>(fiscalProfile?.name || user?.displayName || "");
  const [phone, setPhone] = useState<string>(fiscalProfile?.telefono || "");
  const [photoOption, setPhotoOption] = useState<"initials" | "custom">(
    fiscalProfile?.photoURL && !fiscalProfile.photoURL.startsWith("data:image/svg+xml") ? "custom" : "initials"
  );
  const [customAvatarBase64, setCustomAvatarBase64] = useState<string>(
    fiscalProfile?.photoURL && !fiscalProfile.photoURL.startsWith("data:image/svg+xml") ? fiscalProfile.photoURL : ""
  );

  // Camera capture states
  const [showCamera, setShowCamera] = useState<boolean>(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2: Plan
  const [plan, setPlan] = useState<"gratuito" | "brisa" | "serenidad" | "nirvana">(() => {
    const saved = localStorage.getItem("selectedPlanOnSignup");
    if (saved === "gratuito" || saved === "brisa" || saved === "serenidad" || saved === "nirvana") {
      return saved;
    }
    return fiscalProfile?.plan === "personal" ? "brisa" : fiscalProfile?.plan === "empresa" ? "serenidad" : (fiscalProfile?.plan || "gratuito");
  });

  // Step 3: Fiscal
  const [rfc, setRfc] = useState<string>(hasValidRfc ? fiscalProfile.rfc : "");
  const [razonSocial, setRazonSocial] = useState<string>(hasValidRazon ? fiscalProfile.razonSocial : "");
  const [regimenFiscal, setRegimenFiscal] = useState<string>(fiscalProfile?.regimenFiscal || "621");
  const [codigoPostal, setCodigoPostal] = useState<string>(fiscalProfile?.codigoPostal || "");
  const [usoCFDI, setUsoCFDI] = useState<string>(fiscalProfile?.usoCFDI || "G03");
  const [correoRecepcion, setCorreoRecepcion] = useState<string>(fiscalProfile?.correoRecepcion || user?.email || "");

  const [isParsingConstancia, setIsParsingConstancia] = useState<boolean>(false);
  const constanciaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      // Clean up camera stream on unmount
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  // Handle webcam activation
  const handleStartCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 320, facingMode: "user" }
      });
      setCameraStream(stream);
      setShowCamera(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 150);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo acceder a tu cámara. Otorgue permisos de cámara.", "Error de Cámara");
    }
  };

  const handleStopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setShowCamera(false);
  };

  const handleCapturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = 240;
      canvas.height = 240;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const video = videoRef.current;
        const size = Math.min(video.videoWidth, video.videoHeight);
        const sx = (video.videoWidth - size) / 2;
        const sy = (video.videoHeight - size) / 2;
        ctx.drawImage(video, sx, sy, size, size, 0, 0, 240, 240);
        
        const base64 = canvas.toDataURL("image/jpeg", 0.85);
        setCustomAvatarBase64(base64);
        setPhotoOption("custom");
        toast.success("Foto de perfil capturada con éxito.");
        handleStopCamera();
      }
    }
  };

  const handleLocalPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("La fotografía debe pesar menos de 2 MB.", "Archivo muy pesado");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCustomAvatarBase64(reader.result);
        setPhotoOption("custom");
        toast.success("Foto de perfil cargada correctamente.");
      }
    };
    reader.readAsDataURL(file);
  };

  const getProfileImage = () => {
    if (photoOption === "custom" && customAvatarBase64) {
      return customAvatarBase64;
    }
    return getInitialsAvatar(name || user?.displayName || user?.email || "U");
  };

  const parseConstancia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingConstancia(true);
    toast.info("Leyendo Constancia de Situación Fiscal con Copiloto IA...", "Procesando Archivo");

    try {
      const reader = new FileReader();
      const fileDataPromise = new Promise<{ base64: string; mimeType: string }>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1];
          resolve({ base64, mimeType: file.type });
        };
        reader.onerror = (err) => reject(err);
      });
      
      reader.readAsDataURL(file);
      const { base64, mimeType } = await fileDataPromise;

      const res = await parseConstanciaApi({
        fileBase64: base64,
        mimeType,
      });

      if (!res.ok) throw new Error("Fallo en el servicio del SAT con IA");

      const data = await res.json();
      if (data.rfc) setRfc(data.rfc.toUpperCase().trim());
      if (data.razonSocial) setRazonSocial(data.razonSocial.toUpperCase().trim());
      if (data.regimenFiscal) setRegimenFiscal(data.regimenFiscal.trim());
      if (data.codigoPostal) setCodigoPostal(data.codigoPostal.trim());

      toast.success("¡Datos extraídos con éxito! Se cargaron los campos fiscales certificados.");
    } catch (err) {
      console.error(err);
      toast.error("Error al extraer los datos fiscales con IA. Redacta los campos manualmente.");
    } finally {
      setIsParsingConstancia(false);
      if (constanciaInputRef.current) constanciaInputRef.current.value = "";
    }
  };

  const handleNext = () => {
    if (step === 1) {
      if (!name.trim()) {
        toast.error("Por favor, introduce tu nombre de usuario para identificarte.");
        return;
      }
      if (!phone.trim()) {
        toast.error("Por favor, introduce un número de teléfono móvil.");
        return;
      }
      if (phone.replace(/\D/g, "").length < 10) {
        toast.error("El teléfono debe contar con un mínimo de 10 dígitos numéricos.");
        return;
      }
    } else if (step === 3) {
      if (!rfc.trim()) {
        toast.error("Por favor, proporciona tu clave de RFC registrada.");
        return;
      }
      const cleanRfc = rfc.trim().toUpperCase();
      if (cleanRfc.length < 12 || cleanRfc.length > 13) {
        toast.error("El RFC debe contener entre 12 y 13 caracteres vigentes.");
        return;
      }
      if (!razonSocial.trim()) {
        toast.error("Por favor, escribe la Razón Social o tu Nombre Fiscal completo.");
        return;
      }
      if (!codigoPostal.trim() || codigoPostal.length !== 5) {
        toast.error("Por favor, introduce un Código Postal de 5 dígitos fiscales.");
        return;
      }
      if (!correoRecepcion.trim() || !correoRecepcion.includes("@")) {
        toast.error("Por favor, proporciona un correo receptor válido.");
        return;
      }
    }
    setStep(prev => prev + 1);
  };

  const handleFinish = async () => {
    setIsSubmitting(true);
    try {
      const finalData = {
        name: name.trim(),
        telefono: phone.trim(),
        photoURL: getProfileImage(),
        plan,
        rfc: rfc.trim().toUpperCase(),
        razonSocial: razonSocial.trim().toUpperCase(),
        regimenFiscal,
        codigoPostal: codigoPostal.trim(),
        usoCFDI,
        correoRecepcion: correoRecepcion.trim(),
        onboardingCompleted: true,
        updatedAt: new Date().toISOString()
      };
      await onComplete(finalData);
    } catch (err) {
      console.error(err);
      toast.error("Falló la finalización del perfil fiscal en el almacenamiento local.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen zt-soft-bg text-[#0b1020] flex flex-col justify-between font-body antialiased">
      {/* Visual Header */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/40 py-4 px-6 md:px-12 flex justify-between items-center sticky top-0 z-40 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="bg-[#0B53F4] text-white p-2 rounded-xl shadow-xs">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <span className="font-display font-black text-lg tracking-tight text-[#0b1020]">ZenTicket</span>
        </div>
        
        {/* Step dots */}
        <div className="flex items-center gap-2.5">
          {[1, 2, 3, 4].map((num) => (
            <div 
              key={num}
              className={`h-2 rounded-full transition-all duration-300 ${
                step === num 
                  ? "w-8 bg-[#0B53F4]" 
                  : num < step 
                    ? "w-2 bg-[#0B53F4]/60" 
                    : "w-2 bg-slate-200"
              }`}
            />
          ))}
          <span className="text-[11px] font-bold text-slate-400 ml-1 uppercase tracking-wider font-mono">
            Paso {step}/4
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 md:py-12 flex flex-col justify-center">
        <div className="bg-white/90 border border-slate-200/50 rounded-3xl p-5 sm:p-8 md:p-10 shadow-[0_15px_35px_-10px_rgba(37,99,235,0.03)] backdrop-blur-sm">
          <AnimatePresence mode="wait">
            
            {/* STEP 1: PERSONAL DETAILS */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="text-center md:text-left space-y-1.5 pb-2">
                  <h2 className="text-2xl md:text-3xl font-display font-black tracking-tight text-[#0b1020]">
                    Configurar Perfil de Usuario
                  </h2>
                  <p className="text-xs md:text-sm text-slate-500">
                    Introduce tu nombre, teléfono y personaliza tu fotografía para el gestor de timbrado.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
                  
                  {/* Photo Profile block with customizable initials or camera capture */}
                  <div className="md:col-span-4 flex flex-col items-center space-y-4">
                    <div className="relative w-28 h-28 rounded-full border border-slate-200 p-1 bg-white shadow-sm flex items-center justify-center overflow-hidden">
                      <img 
                        src={getProfileImage()} 
                        alt="User Avatar" 
                        className="w-full h-full rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    <div className="flex flex-col gap-2 w-full max-w-[200px]">
                      {/* Select Option Initials vs Custom Upload */}
                      <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => setPhotoOption("initials")}
                          className={`py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                            photoOption === "initials"
                              ? "bg-white text-[#0B53F4] shadow-2xs"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          Iniciales
                        </button>
                        <button
                          type="button"
                          onClick={() => setPhotoOption("custom")}
                          className={`py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                            photoOption === "custom"
                              ? "bg-white text-[#0B53F4] shadow-2xs"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          Elegir/Cámara
                        </button>
                      </div>

                      {/* Display Actions Based on Selection */}
                      {photoOption === "custom" && (
                        <div className="flex flex-col gap-1.5">
                          {/* File input clicker */}
                          <input 
                            type="file"
                            ref={fileInputRef}
                            onChange={handleLocalPhotoUpload}
                            accept="image/*"
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-2 bg-slate-200/60 hover:bg-slate-200 border border-slate-300/50 text-[10px] font-black uppercase tracking-wider text-slate-700 rounded-xl transition cursor-pointer"
                          >
                            Subir Archivo
                          </button>

                          {/* Trigger camera stream inline */}
                          {!showCamera ? (
                            <button
                              type="button"
                              onClick={handleStartCamera}
                              className="w-full py-2 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-150 text-[10px] font-black uppercase tracking-wider text-emerald-700 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Camera className="w-3 h-3" />
                              <span>Tomar Cámara</span>
                            </button>
                          ) : (
                            <div className="space-y-2 pt-1 border-t border-slate-100">
                              <div className="relative w-full aspect-square bg-[#0b1020] rounded-xl overflow-hidden border border-slate-300">
                                <video 
                                  ref={videoRef} 
                                  autoPlay 
                                  playsInline 
                                  muted 
                                  className="w-full h-full object-cover scale-x-[-1]"
                                />
                                <button
                                  type="button"
                                  onClick={handleStopCamera}
                                  className="absolute top-1.5 right-1.5 p-1 bg-black/60 hover:bg-black text-white rounded-full transition"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={handleCapturePhoto}
                                className="w-full py-2 bg-[#0B53F4] hover:bg-[#0747D1] text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition shadow-xs cursor-pointer"
                              >
                                Obtener Foto
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {photoOption === "initials" && (
                        <div className="text-center py-1">
                          <span className="text-[10px] text-slate-400 font-bold block leading-relaxed px-1">
                            Se calcula dinámicamente según el nombre de usuario de arriba.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Form Details Column */}
                  <div className="md:col-span-8 space-y-5">
                    {/* Username or Display name */}
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                        Nombre de Usuario o Completo
                      </label>
                      <div className="relative flex items-center">
                        <User className="absolute left-4 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Juan Pérez"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full bg-slate-50/60 hover:bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3.5 text-xs font-semibold focus:outline-none transition-all placeholder-slate-400 text-slate-800"
                        />
                      </div>
                    </div>

                    {/* Verification Mobile Phone */}
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                        Teléfono Móvil (SMS / Verificación 3DS)
                      </label>
                      <div className="flex gap-2">
                        <div className="bg-slate-100 border border-slate-200 rounded-2xl px-3.5 py-3.5 text-xs text-slate-600 font-mono flex items-center gap-1 select-none">
                          <span>🇲🇽</span>
                          <span className="font-bold">+52</span>
                        </div>
                        <div className="relative flex-1 flex items-center">
                          <Smartphone className="absolute left-4 w-4 h-4 text-slate-400 pointer-events-none" />
                          <input
                            type="tel"
                            maxLength={10}
                            placeholder="5512345678"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                            className="w-full bg-slate-50/60 hover:bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3.5 text-xs font-mono focus:outline-none transition-all placeholder-slate-400 text-slate-800"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-normal ml-1">
                        Este teléfono es crítico para autenticar operaciones y recubrir tus timbrados fiscales con la certificación de seguridad obligatoria.
                      </p>
                    </div>
                  </div>

                </div>
              </motion.div>
            )}

            {/* STEP 2: PLAN SELECTOR */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="text-center md:text-left space-y-1.5 pb-2">
                  <h2 className="text-2xl md:text-3xl font-display font-black tracking-tight text-[#0b1020]">
                    Plan de Suscripción Integral
                  </h2>
                  <p className="text-xs md:text-sm text-slate-500">
                    Asigna la cuota mensual de timbrado y simulación SAT. Puedes alternar tu plan o cancelarlo en el futuro.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  
                  {/* Plan Gratuito */}
                  <div 
                    onClick={() => setPlan("gratuito")}
                    className={`border rounded-3xl p-5 flex flex-col justify-between transition-all duration-300 cursor-pointer text-left relative ${
                      plan === "gratuito" 
                        ? "border-[#0B53F4] bg-blue-50/20 shadow-[0_15px_30px_-6px_rgba(11,83,244,0.04)] scale-[1.01]" 
                        : "border-slate-250 bg-white hover:border-slate-350"
                    }`}
                  >
                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <span className="bg-slate-100 text-slate-600 font-black text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-md">
                          Básico
                        </span>
                        {plan === "gratuito" && (
                          <div className="bg-[#0B53F4] text-white p-1 rounded-full">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                      <div>
                        <h3 className="font-display font-black text-base text-[#0b1020]">Plan Gratuito</h3>
                        <p className="text-[10px] text-slate-400 mt-1 leading-normal">Ideal para probar ZenTicket y automatizar las primeras facturas sin compromiso.</p>
                      </div>
                      <div className="py-1">
                        <span className="text-2xl font-black font-display text-[#0b1020]">$0</span>
                        <span className="text-xs text-slate-500 font-semibold"> MXN/mes</span>
                      </div>
                      <div className="h-px bg-slate-100" />
                      <ul className="text-[10px] text-slate-600 space-y-2">
                        <li className="flex items-center gap-2">
                          <Check className="w-3 h-3 text-[#0B53F4] shrink-0" />
                          <span>5 facturas generadas al mes</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-3 h-3 text-[#0B53F4] shrink-0" />
                          <span>Escaneo desde imagen/archivo</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-3 h-3 text-[#0B53F4] shrink-0" />
                          <span>Historial básico de tickets</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  {/* Plan Brisa */}
                  <div 
                    onClick={() => setPlan("brisa")}
                    className={`border rounded-3xl p-5 flex flex-col justify-between transition-all duration-300 cursor-pointer text-left relative ${
                      plan === "brisa" 
                        ? "border-[#0B53F4] bg-blue-50/20 shadow-[0_15px_30px_-6px_rgba(11,83,244,0.04)] scale-[1.01]" 
                        : "border-slate-250 bg-white hover:border-slate-350"
                    }`}
                  >
                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <span className="bg-blue-50 text-blue-600 font-black text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-md">
                          Inicial
                        </span>
                        {plan === "brisa" && (
                          <div className="bg-[#0B53F4] text-white p-1 rounded-full">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                      <div>
                        <h3 className="font-display font-black text-base text-[#0b1020]">Plan Brisa</h3>
                        <p className="text-[10px] text-slate-400 mt-1 leading-normal">Para profesionales y personas físicas que facturan ocasionalmente.</p>
                      </div>
                      <div className="py-1">
                        <span className="text-2xl font-black font-display text-[#0b1020]">$2</span>
                        <span className="text-xs text-slate-500 font-semibold"> MXN/mes</span>
                      </div>
                      <div className="h-px bg-slate-100" />
                      <ul className="text-[10px] text-slate-600 space-y-2">
                        <li className="flex items-center gap-2">
                          <Check className="w-3 h-3 text-[#0B53F4] shrink-0" />
                          <span>10 facturas generadas al mes</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-3 h-3 text-[#0B53F4] shrink-0" />
                          <span>Todo lo del plan Gratuito</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-3 h-3 text-[#0B53F4] shrink-0" />
                          <span>Envío automático al correo</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  {/* Plan Serenidad */}
                  <div 
                    onClick={() => setPlan("serenidad")}
                    className={`border rounded-3xl p-5 flex flex-col justify-between transition-all duration-300 cursor-pointer text-left relative ${
                      plan === "serenidad" 
                        ? "border-[#0B53F4] bg-blue-50/20 shadow-[0_15px_30px_-6px_rgba(11,83,244,0.04)] scale-[1.01]" 
                        : "border-slate-250 bg-white hover:border-slate-350"
                    }`}
                  >
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#0B53F4] px-3.5 py-0.5 rounded-full text-white font-black text-[8px] tracking-widest uppercase shadow-xs">
                      Recomendado
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <span className="bg-[#EBF1FF] text-[#0B53F4] font-black text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-md">
                          Profesional
                        </span>
                        {plan === "serenidad" && (
                          <div className="bg-[#0B53F4] text-white p-1 rounded-full">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                      <div>
                        <h3 className="font-display font-black text-base text-[#0b1020]">Plan Serenidad</h3>
                        <p className="text-[10px] text-slate-400 mt-1 leading-normal">Para freelancers, profesionistas y usuarios que facturan cada semana.</p>
                      </div>
                      <div className="py-1">
                        <span className="text-2xl font-black font-display text-[#0b1020]">$250</span>
                        <span className="text-xs text-slate-500 font-semibold"> MXN/mes</span>
                      </div>
                      <div className="h-px bg-slate-100" />
                      <ul className="text-[10px] text-slate-600 space-y-2">
                        <li className="flex items-center gap-2">
                          <Check className="w-3 h-3 text-[#0B53F4] shrink-0" />
                          <span>30 facturas generadas al mes</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-3 h-3 text-[#0B53F4] shrink-0" />
                          <span>Todo lo del plan Brisa</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-3 h-3 text-[#0B53F4] shrink-0" />
                          <span>Panel de gastos y seguimiento</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  {/* Plan Nirvana */}
                  <div 
                    onClick={() => setPlan("nirvana")}
                    className={`border rounded-3xl p-5 flex flex-col justify-between transition-all duration-300 cursor-pointer text-left relative ${
                      plan === "nirvana" 
                        ? "border-[#0B53F4] bg-blue-50/20 shadow-[0_15px_30px_-6px_rgba(11,83,244,0.04)] scale-[1.01]" 
                        : "border-slate-250 bg-white hover:border-slate-350"
                    }`}
                  >
                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <span className="bg-amber-105 text-amber-700 font-black text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-md bg-amber-50">
                          Corporativo
                        </span>
                        {plan === "nirvana" && (
                          <div className="bg-[#0B53F4] text-white p-1 rounded-full">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                      <div>
                        <h3 className="font-display font-black text-base text-[#0b1020]">Plan Nirvana</h3>
                        <p className="text-[10px] text-slate-400 mt-1 leading-normal">Para usuarios de alto volumen o equipos que necesitan automatización total.</p>
                      </div>
                      <div className="py-1">
                        <span className="text-2xl font-black font-display text-[#0b1020]">$500</span>
                        <span className="text-xs text-slate-500 font-semibold"> MXN/mes</span>
                      </div>
                      <div className="h-px bg-slate-100" />
                      <ul className="text-[10px] text-slate-600 space-y-2">
                        <li className="flex items-center gap-2">
                          <Check className="w-3 h-3 text-[#0B53F4] shrink-0" />
                          <span>100 facturas generadas al mes</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-3 h-3 text-[#0B53F4] shrink-0" />
                          <span>Todo lo del plan Serenidad</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-3 h-3 text-[#0B53F4] shrink-0" />
                          <span>Exportación masiva y Soporte VIP</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                </div>

                {plan !== "gratuito" && (
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-left flex items-start gap-2.5 max-w-3xl mx-auto animate-fade-in">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-black text-amber-800 uppercase tracking-wider">Requiere Activación de Pago</h4>
                      <p className="text-[10.5px] text-amber-700 leading-relaxed font-semibold mt-0.5">
                        Has seleccionado un plan de pago. Para poder timbrar tus facturas del SAT, deberás activar tu suscripción mediante Mercado Pago o PayPal en la pestaña de Cuenta una vez completes el registro.
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* STEP 3: FISCAL SAT DETAILS */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="text-center md:text-left space-y-1.5 pb-2">
                  <h2 className="text-2xl md:text-3xl font-display font-black tracking-tight text-[#0b1020]">
                    Credenciales de Identidad Fiscal
                  </h2>
                  <p className="text-xs md:text-sm text-slate-500">
                    Introduce los datos obligatorios para cumplir con las normativas SAT en tus emisiones automatizadas.
                  </p>
                </div>

                {/* AI CONSTANCIA UPLOAD FOR SPEED */}
                <div className="bg-blue-50/50 border border-blue-100 rounded-3xl p-5 text-left relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-start gap-3 relative z-10">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-[#0B53F4] shrink-0 select-none animate-pulse">
                      <Sparkles className="w-5 h-5 fill-blue-500/10" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-[#0B53F4] uppercase tracking-wider">
                        Relleno Automático con Copiloto IA 
                      </h4>
                      <p className="text-[11.5px] text-slate-600 font-semibold leading-relaxed mt-0.5">
                        Sube tu constancia de situación fiscal (PDF o Imagen) y de forma inmediata extraeremos los datos.
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 w-full sm:w-auto">
                    <input
                      type="file"
                      ref={constanciaInputRef}
                      onChange={parseConstancia}
                      accept="application/pdf,image/*"
                      className="hidden"
                      disabled={isParsingConstancia}
                    />
                    <button
                      type="button"
                      disabled={isParsingConstancia}
                      onClick={() => constanciaInputRef.current?.click()}
                      className="w-full py-3 px-5 bg-[#0B53F4] hover:bg-[#0747D1] disabled:bg-blue-300 text-white text-xs font-bold rounded-2xl uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:cursor-not-allowed"
                    >
                      {isParsingConstancia ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Asimilando SAT...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5" />
                          <span>Insertar Constancia</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* FORM FIELDS */}
                <div className="space-y-4 border border-slate-200/50 p-6 rounded-2xl bg-slate-50/30">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* RFC */}
                    <div className="space-y-1 text-left">
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                        RFC (12 o 13 carac.)
                      </label>
                      <input
                        type="text"
                        maxLength={13}
                        value={rfc}
                        onChange={(e) => setRfc(e.target.value.toUpperCase().replace(/[^A-Z0-9]/gi, ""))}
                        placeholder="Ej. COMR010101ABC"
                        className="w-full bg-white border border-slate-200 focus:border-[#0B53F4] rounded-2xl px-4 py-3 text-xs font-mono text-slate-800 uppercase focus:outline-none transition-all placeholder-slate-400 font-semibold"
                      />
                    </div>

                    {/* Razón Social */}
                    <div className="space-y-1 text-left">
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                        Nombre / Razón Social Fiscal
                      </label>
                      <input
                        type="text"
                        value={razonSocial}
                        onChange={(e) => setRazonSocial(e.target.value.toUpperCase())}
                        placeholder="Y COMPAÑÍA S.A. DE C.V."
                        className="w-full bg-white border border-slate-200 focus:border-[#0B53F4] rounded-2xl px-4 py-3 text-xs text-slate-800 uppercase focus:outline-none transition-all placeholder-slate-400 font-semibold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Régimen Fiscal */}
                    <div className="space-y-1 text-left col-span-2">
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                        Régimen Fiscal (SAT)
                      </label>
                      <select
                        value={regimenFiscal}
                        onChange={(e) => setRegimenFiscal(e.target.value)}
                        className="w-full bg-white border border-slate-200 focus:border-[#0B53F4] rounded-2xl px-4 py-3 text-xs text-slate-800 focus:outline-none transition-all cursor-pointer font-semibold"
                      >
                        <option value="601">601 - General de Ley Personas Morales</option>
                        <option value="603">603 - Personas Morales con Fines no Lucrativos</option>
                        <option value="605">605 - Sueldos y Salarios e Ingresos Asimilados a Salarios</option>
                        <option value="606">606 - Arrendamiento</option>
                        <option value="612">612 - Personas Físicas con Actividades Empresariales y Profesionales</option>
                        <option value="621">621 - Incorporación Fiscal</option>
                        <option value="625">625 - Actividad Empresarial con Plataformas Tecnológicas</option>
                        <option value="626">626 - Régimen Simplificado de Confianza (RESICO)</option>
                      </select>
                    </div>

                    {/* Código Postal */}
                    <div className="space-y-1 text-left">
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                        Código Postal (5 dig)
                      </label>
                      <input
                        type="text"
                        maxLength={5}
                        value={codigoPostal}
                        onChange={(e) => setCodigoPostal(e.target.value.replace(/\D/g, ""))}
                        placeholder="06000"
                        className="w-full bg-white border border-slate-200 focus:border-[#0B53F4] rounded-2xl px-4 py-3 text-xs font-mono text-slate-800 focus:outline-none transition-all placeholder-slate-400 font-semibold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Uso de CFDI */}
                    <div className="space-y-1 text-left">
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                        Uso CFDI Predeterminado
                      </label>
                      <select
                        value={usoCFDI}
                        onChange={(e) => setUsoCFDI(e.target.value)}
                        className="w-full bg-white border border-slate-200 focus:border-[#0B53F4] rounded-2xl px-4 py-3 text-xs text-slate-800 focus:outline-none transition-all cursor-pointer font-semibold"
                      >
                        <option value="G01">G01 - Adquisición de mercancías</option>
                        <option value="G03">G03 - Gastos en general</option>
                        <option value="S01">S01 - Sin efectos fiscales</option>
                        <option value="D01">D01 - Honorarios médicos, dentales y de salud</option>
                        <option value="D02">D02 - Gastos médicos por incapacidad</option>
                        <option value="D10">D10 - Pagos por servicios educativos (Colegiaturas)</option>
                      </select>
                    </div>

                    {/* Correo de recepción */}
                    <div className="space-y-1 text-left">
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                        Correo de Recepción de CFDIs
                      </label>
                      <div className="relative flex items-center">
                        <Mail className="absolute left-4 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                          type="email"
                          value={correoRecepcion}
                          onChange={(e) => setCorreoRecepcion(e.target.value)}
                          placeholder="nombre@facturacion.com"
                          className="w-full bg-white border border-slate-200 focus:border-[#0B53F4] rounded-2xl pl-11 pr-4 py-3 text-xs text-slate-800 focus:outline-none transition-all placeholder-slate-400 font-semibold"
                        />
                      </div>
                    </div>
                  </div>

                </div>
              </motion.div>
            )}

            {/* STEP 4: CONFIRMATION RECAP */}
            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6 text-center max-w-lg mx-auto"
              >
                <div className="flex flex-col items-center space-y-3">
                  <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-500 border border-emerald-150 flex items-center justify-center shadow-xs">
                    <CheckCircle className="w-8 h-8 animate-bounce" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-xl md:text-2xl font-display font-black tracking-tight text-[#0b1020]">
                      ¡Listo, {name}!
                    </h2>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Tu perfil fiscal ha sido sincronizado virtualmente en la nube. Todo el ecosistema de timbrado está disponible sin candados.
                    </p>
                  </div>
                </div>

                {/* VISUAL CARDS FOR RECAP */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left space-y-3 shadow-2xs">
                  <h4 className="text-[10px] uppercase font-black tracking-widest text-[#0B53F4] border-b border-slate-200/60 pb-2">
                    Resumen de Cuenta de Usuario
                  </h4>
                  
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full border border-slate-200 bg-white p-0.5 shadow-2xs">
                      <img 
                        src={getProfileImage()} 
                        alt="Final Avatar" 
                        className="w-full h-full rounded-full object-cover" 
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#0b1020] uppercase">{name}</p>
                      <p className="text-[10px] text-slate-400 font-mono font-bold leading-normal">{phone}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-[11px] pt-1">
                    <div>
                      <span className="text-slate-400 block uppercase tracking-wider text-[9px] font-bold">Plan Asociado:</span>
                      <span className="text-[#0b1020] font-black capitalize">{plan}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block uppercase tracking-wider text-[9px] font-bold">RFC SAT:</span>
                      <span className="text-[#0b1020] font-mono font-bold uppercase">{rfc || "Omitido"}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-400 block uppercase tracking-wider text-[9px] font-bold">Razón Social:</span>
                      <span className="text-[#0b1020] font-bold uppercase block truncate">{razonSocial || "Empresa No Suministrada"}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-400 block uppercase tracking-wider text-[9px] font-bold">Correo Receptor de CFDI:</span>
                      <span className="text-[#0b1020] font-semibold block truncate">{correoRecepcion}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#0b53f4]/5 border border-blue-100 rounded-2xl p-4 text-left flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-[#0B53F4] shrink-0 mt-0.5" />
                  <p className="text-[11px] text-slate-500 leading-normal font-semibold">
                    Tus credenciales de la E-Firma o datos certificados por el SAT se encriptan de extremo a extremo utilizando llaves asimétricas AES-256 certificadas.
                  </p>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>

      {/* FOOTER ACTIONS */}
      <footer className="border-t border-slate-200/40 bg-white/80 backdrop-blur-md sticky bottom-0 z-40 py-4 px-6 md:px-12 flex justify-between items-center shadow-xs">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => setStep(prev => prev - 1)}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-250 hover:bg-slate-50 text-xs font-bold text-slate-600 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Atrás</span>
          </button>
        ) : (
          <div />
        )}

        {step < 4 ? (
          <button
            type="button"
            onClick={handleNext}
            className="flex items-center gap-1.5 px-5 py-2.5 zt-btn-primary text-white text-xs font-bold rounded-xl uppercase tracking-wider cursor-pointer ml-auto active:scale-98 select-none"
          >
            <span>Continuar</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleFinish}
            className="flex items-center gap-2 px-6 py-3.5 zt-btn-primary disabled:bg-slate-300 disabled:shadow-none text-white text-xs font-black rounded-xl uppercase tracking-wider cursor-pointer ml-auto disabled:cursor-not-allowed active:scale-98 select-none"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Instanciando...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 fill-white/10 animate-pulse" />
                <span>Comenzar a Escanear</span>
              </>
            )}
          </button>
        )}
      </footer>
    </div>
  );
};
