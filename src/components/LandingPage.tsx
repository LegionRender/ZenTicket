import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Sparkles, FileText, Cpu, PlayCircle, ShieldCheck, CheckCircle2, XCircle, 
  ArrowRight, Users, Check, ChevronDown, MessageSquare, Star, 
  Laptop, HelpCircle, Shield, Layers, TrendingUp, AlertCircle, Play,
  Smile, Clock, Database, Award, Info, MapPin, Zap, Eye, CheckCircle, ArrowUpRight
} from "lucide-react";
import Logo from "@/shared/brand/ProductLogo";
import ZenMascot from "./ZenMascot";

interface LandingPageProps {
  onOpenAuth: (mode: "login" | "signup" | "sandbox") => void;
  isLoggedIn?: boolean;
  onGoToDashboard?: () => void;
}

export default function LandingPage({ onOpenAuth, isLoggedIn = false, onGoToDashboard }: LandingPageProps) {
  // FAQ state
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Active step for demonstration interactive pipeline
  const [activeWorkStep, setActiveWorkStep] = useState<number>(0);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const steps = [
    {
      num: "01",
      title: "Escanea tu ticket",
      desc: "Toma una foto o sube una captura desde tu celular de forma instantánea.",
      icon: <FileText className="w-5 h-5" />
    },
    {
      num: "02",
      title: "ZenTicket analiza",
      desc: "Nuestra IA avanzada identifica el comercio y extrae toda la información fiscal necesaria.",
      icon: <Cpu className="w-5 h-5" />
    },
    {
      num: "03",
      title: "Automatización inteligente",
      desc: "Ingresamos al portal correcto, completamos los datos del SAT y enviamos la solicitud.",
      icon: <Zap className="w-5 h-5" />
    },
    {
      num: "04",
      title: "Factura lista",
      desc: "Recibe tu factura en segundos directo en tu correo y en tus gastos.",
      icon: <CheckCircle className="w-5 h-5" />
    }
  ];

  const faqs = [
    {
      q: "¿Es seguro compartir mi información?",
      a: "Totalmente. En ZenTicket aplicamos encriptación de nivel bancario (AES-256) para resguardar toda tu información fiscal de forma 100% segura, y solo la transmitimos directamente a los portales oficiales bajo protocolos autorizados."
    },
    {
      q: "¿Necesito saber facturar?",
      a: "No, en absoluto. ZenTicket lo hace todo por ti. Nuestra Inteligencia Artificial identifica el portal, ubica los campos requeridos (RFC, folios, subtotales, claves SAT) y genera el CFDI v4.0 sin que tengas que lidiar de forma manual con interfaces lentas."
    },
    {
      q: "¿Qué pasa si mi ticket no tiene QR?",
      a: "No hay ningún problema. Si tu ticket de compra no cuenta con un código QR legible o no tiene, nuestra IA lee los textos e identifica el folio físico, fecha, sucursal e importe para localizar el método de facturación alterno en menos de un segundo."
    },
    {
      q: "¿Dónde se almacenan mis facturas?",
      a: "Se guardan en tu sección de Gastos de forma ordenada y perpetua. Puedes descargarlas, filtrarlas por categoría fiscal o RFC, y exportarlas en formatos PDF y XML de manera masiva en cualquier momento."
    },
    {
      q: "¿Qué comercios son compatibles?",
      a: "Soportamos más de 350 comercios clave en México, incluyendo tiendas de autoservicio (Walmart, Oxxo, Costco), gasolineras, cafeterías (Starbucks), restaurantes, tiendas departamentales (Liverpool, Palacio de Hierro) y aerolíneas principales."
    },
    {
      q: "¿Puedo usar ZenTicket en equipo?",
      a: "Sí, nuestro plan Nirvana permite el acceso multiusuario, facilitando que tus contadores, auxiliares administrativos o socios gestionen la facturación del negocio de manera colaborativa desde un solo panel fiscal unificado."
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased overflow-x-hidden selection:bg-[#0B53F4]/20 selection:text-[#0B53F4]" id="landing_root">
      
      {/* SECTION 1: HEADER/NAVBAR WITH GLASSMORPHISM */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-white/5 px-6 py-4 md:px-12 flex justify-between items-center transition-all duration-300" id="landing_header">
        <div className="flex items-center gap-3">
          <Logo size="md" withText={true} />
          <span className="hidden lg:inline-block text-[9.5px] font-black bg-blue-500/10 border border-blue-500/30 text-[#4D82FC] px-3 py-1 rounded-full uppercase tracking-widest animate-pulse shadow-[0_0_15px_rgba(59,130,246,0.1)]">
            CFDI v4.0 SAT Inteligente
          </span>
        </div>

        {/* Central Navigation */}
        <nav className="hidden md:flex items-center gap-8 text-xs font-bold text-slate-400 select-none">
          <a href="#landing_problems" className="hover:text-white transition duration-200">Problemas</a>
          <a href="#how_it_works" className="hover:text-white transition duration-200">Cómo funciona</a>
          <a href="#prices" className="hover:text-white transition duration-200">Precios</a>
          <a href="#testimonials" className="hover:text-white transition duration-205">Empresas</a>
          <a href="#faqs" className="hover:text-white transition duration-200 font-bold text-[#4D82FC]">FAQs</a>
          <button 
            onClick={() => onOpenAuth("sandbox")}
            className="hover:text-emerald-400 transition flex items-center gap-1.5 font-extrabold cursor-pointer text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full text-[10px]"
          >
            <PlayCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            MODO SANDBOX
          </button>
        </nav>

        {/* Header Right Action Buttons */}
        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <button 
              type="button"
              onClick={onGoToDashboard}
              className="inline-flex items-center justify-center text-xs font-black text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 px-5 py-2.5 rounded-xl transition duration-150 cursor-pointer shadow-lg shadow-emerald-500/15 active:scale-[0.98]"
            >
              Ir al Panel de Control
            </button>
          ) : (
            <>
              <button 
                type="button"
                onClick={() => onOpenAuth("login")}
                className="text-xs font-black text-slate-300 hover:text-white px-4 py-2 hover:bg-white/5 rounded-xl transition-all duration-200 tracking-wide cursor-pointer"
              >
                Iniciar sesión
              </button>
              
              <button 
                type="button"
                onClick={() => onOpenAuth("login")}
                className="hidden sm:inline-flex items-center justify-center text-xs font-black text-white bg-gradient-to-r from-[#0B53F4] to-blue-600 hover:from-blue-650 hover:to-blue-700 px-5 py-2.5 rounded-xl transition duration-150 cursor-pointer shadow-lg shadow-[#0B53F4]/25 active:scale-[0.98]"
              >
                Probar Gratis
              </button>
            </>
          )}
        </div>
      </header>

      {/* SECTION 2: HERO SECTION (COSMIC DARK BLUE WITH HIGH GLOW EFFECTS) */}
      <section className="relative bg-gradient-to-b from-slate-950 via-[#0a0f24] to-slate-950 text-white pt-24 pb-32 px-6 lg:px-16 overflow-hidden" id="landing_hero">
        {/* Glow Spheres backgrounds */}
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-gradient-to-tr from-purple-600/15 to-transparent rounded-full blur-[140px] pointer-events-none -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute top-1/3 right-1/4 w-[700px] h-[700px] bg-gradient-to-bl from-blue-600/15 to-transparent rounded-full blur-[160px] pointer-events-none translate-x-1/2 -translate-y-1/2" />
        
        {/* Real Grid Pattern background lines */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4.5rem_4.5rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_80%,transparent_100%)] opacity-25 pointer-events-none" />

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center relative z-10">
          
          {/* Left Hero Column */}
          <div className="lg:col-span-7 flex flex-col space-y-8 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-[#0B53F4]/15 border border-[#4D82FC]/30 px-4 py-2 rounded-full text-[10.5px] font-black text-[#5C8FFF] uppercase tracking-widest mx-auto lg:mx-0 w-fit shadow-[0_0_20px_rgba(11,83,244,0.15)]">
              <Sparkles className="w-4 h-4 text-blue-400" />
              Inteligencia Artificial que trabaja por ti
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[1.1] uppercase font-sans">
              Convierte tus <br className="hidden sm:inline" />
              tickets en facturas. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-[#5C8FFF] to-sky-350 font-sans tracking-tight drop-shadow-[0_0_20px_rgba(92,143,255,0.2)]">Sin estrés.</span>
            </h1>

            <p className="text-sm md:text-base text-slate-350 leading-relaxed max-w-xl mx-auto lg:mx-0 font-medium font-sans">
              Toma una foto. ZenTicket encuentra el portal correcto de forma inmediata, completa tus datos fiscales del SAT y genera tu factura XML y PDF al instante. Tú sigue con tu negocio, nosotros hacemos el resto.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start pt-2">
              <button
                onClick={() => onOpenAuth("login")}
                className="w-full sm:w-auto flex items-center justify-center gap-2.5 text-xs font-black text-white bg-gradient-to-r from-[#0B53F4] to-blue-600 hover:from-blue-600 hover:to-blue-700 px-8 py-4.5 rounded-2xl transition duration-150 transform hover:-translate-y-0.5 active:translate-y-0 shadow-lg shadow-[#0B53F4]/30 cursor-pointer text-center"
              >
                Probar Gratis
                <ArrowRight className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-1" />
              </button>

              <a
                href="#how_it_works"
                className="w-full sm:w-auto flex items-center justify-center gap-2 text-xs font-black text-slate-200 border border-slate-800 bg-slate-900/60 hover:bg-slate-800 hover:border-slate-700 px-6 py-4.5 rounded-2xl transition duration-150 cursor-pointer shadow-sm hover:shadow-md"
              >
                <Play className="w-3.5 h-3.5 fill-current text-slate-400" />
                Ver cómo funciona
              </a>
            </div>

            {/* Quick value badges list - Capsule Pill style */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-8 border-t border-slate-850/80 max-w-xl mx-auto lg:mx-0">
              <div className="flex items-center gap-2.5 px-3.5 py-2 bg-slate-900/50 backdrop-blur-sm border border-slate-800/80 rounded-xl">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
                <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Sin capturas manuales</span>
              </div>
              <div className="flex items-center gap-2.5 px-3.5 py-2 bg-slate-900/50 backdrop-blur-sm border border-slate-800/80 rounded-xl">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_#6366f1]" />
                <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Sin portal técnico</span>
              </div>
              <div className="flex items-center gap-2.5 px-3.5 py-2 bg-slate-900/50 backdrop-blur-sm border border-slate-800/80 rounded-xl">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Automatización 24/7</span>
              </div>
            </div>
          </div>

          {/* Right Hero Column: Premium Phone Mockup with Glowing halo */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end relative">
            <div className="absolute inset-0 bg-[#0B53F4]/10 rounded-full blur-[100px] pointer-events-none transform translate-y-8 scale-75" />
            
            <div className="relative w-full max-w-[310px] md:max-w-[340px] aspect-[9/18.5] bg-slate-950 rounded-[48px] border-[10px] border-slate-800/90 shadow-2xl p-3 flex flex-col justify-between overflow-hidden ring-1 ring-white/10 z-10 transition-transform duration-500 hover:scale-[1.01]">
              
              {/* Dynamic Camera Notch island */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-2xl z-40 flex items-center justify-center">
                <div className="w-1.5 h-1.5 bg-neutral-900 rounded-full absolute left-4" />
                <div className="w-8 h-1 bg-neutral-900 rounded-md absolute left-10" />
              </div>

              {/* Status bar */}
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 px-6 pt-1.5 z-30 select-none">
                <span>11:05</span>
                <div className="flex items-center gap-1.5 text-slate-500">
                  <span className="text-[8px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded-sm font-black">5G</span>
                  <div className="w-5 h-2.5 border border-slate-700 rounded-xs p-0.5"><div className="w-full h-full bg-slate-500 rounded-2xs" /></div>
                </div>
              </div>

              {/* Inner UI area */}
              <div className="flex-grow rounded-[38px] bg-slate-900 p-4 pt-6 text-left flex flex-col justify-between relative overflow-hidden mt-1 mb-2">
                {/* Radial glow within phone */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/15 rounded-full blur-2xl pointer-events-none" />
                
                {/* Brand in App */}
                <div className="border-b border-white/5 pb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-5.5 h-5.5 bg-[#0B53F4] text-white flex items-center justify-center rounded-lg font-black text-xs shadow-[0_2px_8px_rgba(11,83,244,0.4)]">
                      Z
                    </div>
                    <span className="text-[10px] font-bold tracking-widest text-slate-200 uppercase">ZenTicket App</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                    <span className="text-[8px] font-bold text-[#4D82FC] uppercase tracking-wider">Online</span>
                  </div>
                </div>

                {/* Automation tracker mock */}
                <div className="flex-grow flex flex-col justify-center space-y-3 py-3 relative z-10 text-[10.5px]">
                  
                  {/* Step 1: Captured */}
                  <div className="bg-slate-950/90 border border-white/5 rounded-2xl p-3 flex items-center gap-3 shadow-md">
                    <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0 shadow-inner">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="flex-grow min-w-0">
                      <h5 className="font-extrabold text-slate-200">1. Ticket Capturado</h5>
                      <p className="text-[9px] text-slate-500 truncate font-mono mt-0.5">IMG_2104_1234.png</p>
                    </div>
                  </div>

                  {/* Step 2: Processing */}
                  <div className="bg-slate-950/95 border border-[#0B53F4]/30 rounded-2xl p-3 space-y-2 shadow-lg relative overflow-hidden shadow-[0_0_15px_rgba(11,83,244,0.1)]">
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-blue-500/5 to-transparent pointer-events-none" />
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                        <Cpu className="w-4 h-4 animate-spin text-blue-400" />
                      </div>
                      <div className="flex-grow">
                        <h5 className="font-extrabold text-blue-450 uppercase text-[9.5px] tracking-wider">2. IA procesando...</h5>
                        <p className="text-[9px] text-slate-400 mt-0.5">Mapeando portal emisor</p>
                      </div>
                      <span className="text-[9px] font-black text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-md">100%</span>
                    </div>
                    {/* Linear Progress bar */}
                    <div className="w-full h-1 bg-slate-850 rounded-full overflow-hidden">
                      <div className="w-full h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" />
                    </div>
                  </div>

                  {/* Step 3: Generated */}
                  <div className="bg-[#0b53f4]/15 border border-[#0b53f4]/35 rounded-2xl p-3 flex items-center gap-3 shadow-md shadow-emerald-500/5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div className="flex-grow min-w-0">
                      <h4 className="font-extrabold text-emerald-400">3. Factura Generada</h4>
                      <p className="text-[9px] text-emerald-500/80 truncate font-mono mt-0.5">CFDI_Factura_1236.pdf</p>
                    </div>
                  </div>
                </div>

                {/* App Bottom info summary bar */}
                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-white/5 text-center">
                  <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block">
                    Total Ahorrado: 15 Minutos de estrés
                  </span>
                </div>
              </div>
            </div>

            {/* floating badges with glows */}
            <div className="absolute -left-6 bottom-12 bg-slate-950/90 border border-white/10 px-4 py-3 rounded-2xl flex items-center gap-3 shadow-2xl inline-flex text-left z-20 backdrop-blur-md shadow-blue-500/5">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_#10b981] shrink-0" />
              <div>
                <span className="text-[8.5px] text-slate-500 font-black block uppercase tracking-widest">SISTEMA SAT</span>
                <span className="text-xs font-bold text-slate-100 block mt-0.5">Timbrado Exitoso</span>
              </div>
            </div>
            
            <div className="absolute -right-4 top-16 bg-slate-950/90 border border-white/10 p-3 rounded-full flex items-center justify-center shadow-2xl z-20 backdrop-blur-md">
              <Sparkles className="w-5 h-5 text-amber-400 filter drop-shadow-[0_0_5px_#f59e0b]" />
            </div>
          </div>

        </div>
      </section>

      {/* SECTION 3: COMPATIBLE PARTNERS RIBBON (ELEGANT GRIDS WITH BOLD BLACK TEXT AND GRAYSCALES) */}
      <section className="bg-white border-y border-slate-100 py-12 px-6 relative" id="landing_brands">
        <div className="max-w-7xl mx-auto flex flex-col items-center space-y-6">
          <span className="text-[10px] font-black uppercase text-slate-405 tracking-widest text-center select-none">
            Compatible con más de 350 empresas y emisores en México
          </span>

          {/* Styled Logos Grid */}
          <div className="w-full max-w-5xl">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 items-center justify-items-center gap-6 opacity-80 select-none">
              <span className="text-sm font-black tracking-tight text-slate-900 border border-slate-200 px-3 py-1.5 rounded-lg bg-slate-50/50">Walmart<span className="text-[#0B53F4]">*</span></span>
              <span className="text-sm font-black tracking-tight text-indigo-900">Bodega Aurrera</span>
              <span className="text-sm font-black tracking-tight text-[#0B53F4]">Costco</span>
              <span className="text-sm font-black tracking-tight text-emerald-950">OXXO</span>
              <span className="text-sm font-black tracking-tight text-slate-800">Soriana</span>
              <span className="text-sm font-black tracking-tight text-red-950">Chedraui</span>
              <span className="text-sm font-black tracking-tight text-rose-950">Liverpool</span>
              <span className="text-sm font-black tracking-tight text-orange-950">Palacio de Hierro</span>
              <span className="text-sm font-black tracking-tight text-blue-950">Home Depot</span>
            </div>
          </div>
          
          <p className="text-[10.5px] text-slate-400 font-bold text-center tracking-wide">
            ZenTicket identifica automáticamente el portal de facturación correspondiente buscando por RFC o emisor comercial.
          </p>
        </div>
      </section>

      {/* SECTION 4: PAIN POINTS (DEEP DARK SLATE WITH ROSE ICON OUTLINES) */}
      <section className="bg-slate-950 text-white py-24 px-6 md:px-12 relative" id="landing_problems">
        <div className="max-w-4xl mx-auto text-center space-y-4 mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight uppercase leading-tight font-sans">
            Facturar sigue siendo un problema diario
          </h2>
          <p className="text-xs sm:text-sm text-slate-505 font-bold uppercase tracking-widest max-w-xl mx-auto text-slate-400">
            Demasiado tiempo. Demasiados pasos. Demasiado estrés.
          </p>
        </div>

        {/* 5 Cards grid containing concrete problems with neon border glow capabilities */}
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
          
          <div className="bg-slate-900 border border-white/[0.04] p-6 rounded-2xl flex flex-col justify-between space-y-6 hover:border-rose-500/30 transition-all duration-300 shadow-md hover:shadow-rose-500/[0.03] group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/[0.01] rounded-full blur-xl" />
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.1)] font-bold font-mono">
              01
            </div>
            <div>
              <h4 className="text-xs font-black uppercase text-slate-100 tracking-wide">Buscar dónde facturar</h4>
              <p className="text-[11.5px] text-slate-400 mt-2 font-medium leading-relaxed">Cada empresa tiene un portal diferente, oculto o caído en rincones escondidos de su web.</p>
            </div>
          </div>

          <div className="bg-slate-900 border border-white/[0.04] p-6 rounded-2xl flex flex-col justify-between space-y-6 hover:border-rose-500/30 transition-all duration-300 shadow-md hover:shadow-rose-500/[0.03] group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/[0.01] rounded-full blur-xl" />
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.1)] font-bold font-mono">
              02
            </div>
            <div>
              <h4 className="text-xs font-black uppercase text-slate-100 tracking-wide">Captura repetitiva</h4>
              <p className="text-[11.5px] text-slate-400 mt-2 font-medium leading-relaxed">Digitar RFCs, folios, fechas, correos, importes de forma manual ticket por ticket sin parar.</p>
            </div>
          </div>

          <div className="bg-slate-900 border border-white/[0.04] p-6 rounded-2xl flex flex-col justify-between space-y-6 hover:border-rose-500/30 transition-all duration-300 shadow-md hover:shadow-rose-500/[0.03] group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/[0.01] rounded-full blur-xl" />
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.1)] font-bold font-mono">
              03
            </div>
            <div>
              <h4 className="text-xs font-black uppercase text-slate-100 tracking-wide">Contraseñas perdidas</h4>
              <p className="text-[11.5px] text-slate-400 mt-2 font-medium leading-relaxed">Decenas de usuarios, credenciales y portales distintos para cada emisor comercial.</p>
            </div>
          </div>

          <div className="bg-slate-900 border border-white/[0.04] p-6 rounded-2xl flex flex-col justify-between space-y-6 hover:border-rose-500/30 transition-all duration-300 shadow-md hover:shadow-rose-500/[0.03] group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/[0.01] rounded-full blur-xl" />
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.1)] font-bold font-mono">
              04
            </div>
            <div>
              <h4 className="text-xs font-black uppercase text-slate-100 tracking-wide">Interfaces lentas</h4>
              <p className="text-[11.5px] text-slate-400 mt-2 font-medium leading-relaxed">Sistemas inestables, captchas insoportables e interfaces del siglo pasado.</p>
            </div>
          </div>

          <div className="bg-slate-900 border border-white/[0.04] p-6 rounded-2xl flex flex-col justify-between space-y-6 hover:border-rose-500/30 transition-all duration-300 shadow-md hover:shadow-rose-500/[0.03] group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/[0.01] rounded-full blur-xl" />
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.1)] font-bold font-mono">
              05
            </div>
            <div>
              <h4 className="text-xs font-black uppercase text-slate-100 tracking-wide">Pérdida de tickets</h4>
              <p className="text-[11.5px] text-slate-400 mt-2 font-medium leading-relaxed">Papel térmico que se desvanece rápido, arruga o fotos borrosas olvidadas.</p>
            </div>
          </div>

        </div>
      </section>

      {/* SECTION 5: THE SOLUTION (CUTE MEDITATING MASCOT ILLUSTRATION) */}
      <section className="bg-white py-24 px-6 md:px-12 relative overflow-hidden" id="how_it_works">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          
          {/* Left Column: Mascot breathing animation with exquisite shadows and aura */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center relative">
            <ZenMascot size={330} />
            
            <p className="text-[10px] font-black uppercase text-slate-400/80 mt-1 select-none tracking-widest text-center">
              Ahorra hasta el 98% del tiempo de facturación manual
            </p>
          </div>

          {/* Right Column: Text & Features LISTS with blue circular checkmarks */}
          <div className="lg:col-span-7 flex flex-col space-y-6 text-left">
            <span className="text-[11px] font-black uppercase text-[#0B53F4] tracking-widest bg-blue-50 px-3.5 py-1.5 rounded-full w-fit">
              La solución es simple
            </span>
            <h3 className="text-3xl sm:text-4xl font-extrabold tracking-tight uppercase leading-tight text-slate-900 font-sans">
              Tu asistente personal <br />
              de <span className="text-[#0B53F4]">facturación instantánea</span>
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed font-semibold max-w-xl">
              ZenTicket automatiza todo el proceso para que solo te preocupes por tomar una foto de tus tickets de compra.
            </p>

            {/* Micro-pills features listed below layout */}
            <div className="flex flex-wrap gap-2 pt-2">
              <span className="text-[10px] font-bold text-slate-650 bg-slate-100 border border-slate-200/80 px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5">
                <Check className="w-3 h-3 text-[#0B53F4]" /> Encuentra el portal correcto
              </span>
              <span className="text-[10px] font-bold text-slate-650 bg-slate-100 border border-slate-200/80 px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5">
                <Check className="w-3 h-3 text-[#0B53F4]" /> Llena los datos por ti
              </span>
              <span className="text-[10px] font-bold text-slate-650 bg-slate-100 border border-slate-200/80 px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5">
                <Check className="w-3 h-3 text-[#0B53F4]" /> Genera tu factura en segundos
              </span>
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="flex items-start gap-3.5">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <Check className="w-3.5 h-3.5 stroke-[3px]" />
                </div>
                <div>
                  <h5 className="text-[12.5px] font-black uppercase text-slate-850">Identificador Autónomo</h5>
                  <p className="text-xs text-slate-500 font-medium">Buscamos el método del SAT o del emisor comercial de forma inmediata mediante algoritmos de IA.</p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <Check className="w-3.5 h-3.5 stroke-[3px]" />
                </div>
                <div>
                  <h5 className="text-[12.5px] font-black uppercase text-slate-850">Carga Inteligente de RFC</h5>
                  <p className="text-xs text-slate-500 font-medium font-sans">Completamos automáticamente tus datos de facturación (RFC, CP, uso de CFDI, correo corporativo) sin un solo error.</p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <Check className="w-3.5 h-3.5 stroke-[3px]" />
                </div>
                <div>
                  <h5 className="text-[12.5px] font-black uppercase text-slate-850">Timbrado CFDI Integrado</h5>
                  <p className="text-xs text-slate-500 font-medium">Valida y timbra el documento fiscal v4.0 con autorización directa oficial para que no tengas que preocuparte.</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* SECTION 6: HOW IT WORKS DOTTED PIPELINE */}
      <section className="bg-slate-50 border-t border-slate-100 py-24 px-6 md:px-12 relative" id="timeline_steps">
        <div className="max-w-7xl mx-auto text-center space-y-4 mb-16">
          <span className="text-[10px] font-black uppercase text-[#0B53F4] tracking-widest">
            Así de fácil funciona ZenTicket
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight uppercase leading-tight text-slate-950 font-sans">
            Factura en 4 simples pasos
          </h2>
        </div>

        {/* Modular dotted step visual pipeline */}
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 relative z-10">
          
          {steps.map((st, i) => (
            <div key={i} className="flex flex-col items-center text-center p-6 bg-white border border-slate-205/60 rounded-3xl relative shadow-md shadow-slate-100/40 hover:-translate-y-1 transition duration-300">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#0B53F4] border border-blue-100/55 flex items-center justify-center text-xs font-black mb-4 select-none shadow-inner">
                {st.num}
              </div>
              <h4 className="text-xs font-black uppercase text-slate-850 tracking-wide">{st.title}</h4>
              <p className="text-[11.5px] text-slate-505 font-medium mt-2 leading-relaxed">{st.desc}</p>
            </div>
          ))}

        </div>

        {/* Sub horizontal indicators with beautiful icons and chevrons */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-4 mt-16 pt-10 border-t border-slate-150">
          
          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm flex items-center justify-between group hover:border-[#0B53F4]/20 transition duration-150">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="text-[10.5px] font-black uppercase text-slate-800 tracking-wide block">Más tiempo para ti</span>
                <span className="text-[9px] text-slate-400 font-bold font-mono">CERO CAPTURAS</span>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-350 group-hover:text-[#0B53F4] transition-colors" />
          </div>

          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm flex items-center justify-between group hover:border-[#0B53F4]/20 transition duration-150">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="text-[10.5px] font-black uppercase text-slate-800 tracking-wide block">Menos errores</span>
                <span className="text-[9px] text-slate-400 font-bold font-mono">CORRECCIÓN SAT</span>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-350 group-hover:text-[#0B53F4] transition-colors" />
          </div>

          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm flex items-center justify-between group hover:border-[#0B53F4]/20 transition duration-150">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Database className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="text-[10.5px] font-black uppercase text-slate-800 tracking-wide block">Todo centralizado</span>
                <span className="text-[9px] text-slate-400 font-bold font-mono">GASTOS CENTRALIZADOS</span>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-350 group-hover:text-[#0B53F4] transition-colors" />
          </div>

          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm flex items-center justify-between group hover:border-[#0B53F4]/20 transition duration-150">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="text-[10.5px] font-black uppercase text-slate-800 tracking-wide block">Automatización</span>
                <span className="text-[9px] text-slate-400 font-bold font-mono">INTELIGENCIA ACTIVA</span>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-350 group-hover:text-[#0B53F4] transition-colors" />
          </div>

        </div>
      </section>

      {/* SECTION 7: COMPARISON BOARD */}
      <section className="bg-white py-24 px-6 md:px-12 relative" id="comparison">
        <div className="max-w-4xl mx-auto text-center space-y-4 mb-16">
          <h2 className="text-3xl font-extrabold tracking-tight uppercase leading-tight text-slate-900 font-sans">
            ZenTicket vs. método tradicional
          </h2>
          <p className="text-xs text-slate-400 uppercase tracking-widest font-black">
            La diferencia es completamente clara.
          </p>
        </div>

        {/* Elegant comparison table */}
        <div className="max-w-4xl mx-auto bg-slate-50/80 border border-slate-200 rounded-3xl overflow-hidden shadow-md">
          <div className="grid grid-cols-12 bg-slate-950 text-white py-4.5 px-6 text-[11px] font-black uppercase tracking-wider select-none">
            <div className="col-span-4">Criterio</div>
            <div className="col-span-4 text-slate-450">Método Tradicional</div>
            <div className="col-span-4 text-blue-400">Plataforma ZenTicket</div>
          </div>

          <div className="divide-y divide-slate-150 font-sans">
            <div className="grid grid-cols-12 py-4 px-6 text-xs items-center">
              <div className="col-span-4 font-extrabold text-slate-850">Buscar portal</div>
              <div className="col-span-4 text-slate-500 font-medium">Tomas 5-15 minutos por marca</div>
              <div className="col-span-4 text-slate-850 font-black flex items-center gap-1.5 text-blue-600">
                <Check className="w-4 h-4 shrink-0 text-[#0B53F4] stroke-[3px]" /> Automático en segundos
              </div>
            </div>

            <div className="grid grid-cols-12 py-4 px-6 text-xs items-center">
              <div className="col-span-4 font-extrabold text-slate-850">Captura de datos</div>
              <div className="col-span-4 text-slate-500 font-medium">Muchos datos y repetir de nuevo</div>
              <div className="col-span-4 text-slate-850 font-black flex items-center gap-1.5 text-blue-600">
                <Check className="w-4 h-4 shrink-0 text-[#0B53F4] stroke-[3px]" /> 100% automatizado por IA
              </div>
            </div>

            <div className="grid grid-cols-12 py-4 px-6 text-xs items-center">
              <div className="col-span-4 font-extrabold text-slate-850">Tiempo invertido</div>
              <div className="col-span-4 text-slate-500 font-medium">15-30 minutos por factura</div>
              <div className="col-span-4 text-slate-850 font-black flex items-center gap-1.5 text-blue-600">
                <Check className="w-4 h-4 shrink-0 text-[#0B53F4] stroke-[3px]" /> Menos de 1 minuto
              </div>
            </div>

            <div className="grid grid-cols-12 py-4 px-6 text-xs items-center">
              <div className="col-span-4 font-extrabold text-slate-850">Porcentaje de errores</div>
              <div className="col-span-4 text-slate-500 font-medium">Altos y frecuentes (RFC/Datos)</div>
              <div className="col-span-4 text-slate-850 font-black flex items-center gap-1.5 text-blue-600">
                <Check className="w-4 h-4 shrink-0 text-[#0B53F4] stroke-[3px]" /> Mínimo (Verificación fiscal)
              </div>
            </div>

            <div className="grid grid-cols-12 py-4 px-6 text-xs items-center">
              <div className="col-span-4 font-extrabold text-slate-850">Seguimiento / Status</div>
              <div className="col-span-4 text-slate-500 font-medium">Difícil y desorganizado</div>
              <div className="col-span-4 text-slate-850 font-black flex items-center gap-1.5 text-blue-600">
                <Check className="w-4 h-4 shrink-0 text-[#0B53F4] stroke-[3px]" /> Todo en un solo panel seguro
              </div>
            </div>

            <div className="grid grid-cols-12 py-4 px-6 text-xs bg-blue-50/25 items-center">
              <div className="col-span-4 font-extrabold text-slate-900">Historial histórico</div>
              <div className="col-span-4 text-slate-550 font-semibold text-slate-600">Archivos y carpetas dispersos</div>
              <div className="col-span-4 text-[#0B53F4] font-black flex items-center gap-1.5">
                <Check className="w-4 h-4 shrink-0 text-[#0B53F4] stroke-[3px]" /> Módulo de Gastos integrado
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 8: LARGE STATS METRICS BOARD (DARK SLATE BLUE BAR CAPSULE) MATCHING SCREENSHOT */}
      <section className="bg-slate-50 py-16 px-6" id="metrics_bar">
        <div className="max-w-7xl mx-auto">
          <div className="bg-slate-950 text-white py-8 px-8 sm:px-12 rounded-[28px] border border-white/5 shadow-2xl relative overflow-hidden flex flex-col lg:flex-row justify-between items-center gap-8 lg:gap-4 select-none shadow-blue-500/[0.02]">
            {/* Ambient neon lines inside */}
            <div className="absolute top-0 right-1/4 w-40 h-40 bg-[#0B53F4]/10 rounded-full blur-[80px] pointer-events-none" />
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 w-full">
              
              {/* Item 1 */}
              <div className="flex items-center gap-4 text-left justify-center lg:justify-start">
                <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-xl sm:text-2xl font-black text-slate-100 block tracking-tight">+120,000</span>
                  <span className="text-[9.5px] font-bold uppercase text-slate-400 tracking-widest block leading-none">Tickets procesados</span>
                </div>
              </div>

              {/* Item 2 */}
              <div className="flex items-center gap-4 text-left justify-center lg:justify-start">
                <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                  <Smile className="w-5 h-5" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-xl sm:text-2xl font-black text-slate-100 block tracking-tight">+15,000</span>
                  <span className="text-[9.5px] font-bold uppercase text-slate-400 tracking-widest block leading-none">Usuarios felices</span>
                </div>
              </div>

              {/* Item 3 */}
              <div className="flex items-center gap-4 text-left justify-center lg:justify-start">
                <div className="w-11 h-11 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0 shadow-[0_0_15px_rgba(20,184,166,0.15)]">
                  <Database className="w-5 h-5" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-xl sm:text-2xl font-black text-slate-100 block tracking-tight">+350</span>
                  <span className="text-[9.5px] font-bold uppercase text-slate-400 tracking-widest block leading-none">Empresas compatibles</span>
                </div>
              </div>

              {/* Item 4 */}
              <div className="flex items-center gap-4 text-left justify-center lg:justify-start">
                <div className="w-11 h-11 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0 shadow-[0_0_15px_rgba(139,92,246,0.15)]">
                  <Award className="w-5 h-5" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-xl sm:text-2xl font-black text-slate-100 block tracking-tight">98%</span>
                  <span className="text-[9.5px] font-bold uppercase text-slate-400 tracking-widest block leading-none">Satisfacción usuarios</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* SECTION 9: PRICING PLANS WITH HANDWRITTEN DOODLE ARROW ACCENT */}
      <section className="bg-slate-50 py-24 px-6 md:px-12 relative" id="prices font-sans">
        
        {/* Main Grid: Header & Cards together */}
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Heading + Cute hand-drawn custom doodle arrow */}
          <div className="lg:col-span-4 flex flex-col text-center lg:text-left space-y-6 relative">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight uppercase leading-tight text-slate-950 font-sans">
              Elige el nivel de <br />
              <span className="text-[#0B53F4]">tranquilidad</span> que necesitas
            </h2>
            <p className="text-xs text-slate-550 font-medium leading-relaxed max-w-sm mx-auto lg:mx-0">
              Planes simples, sin letras chiquitas. Cancela en cualquier momento con un solo clic.
            </p>

            {/* Custom SVG Curved handwritten-style arrow pointing right-down towards pricing cards */}
            <div className="hidden lg:block absolute -bottom-16 right-4 w-28 h-28 text-slate-300 transform rotate-12">
              <svg viewBox="0 0 100 100" fill="none" className="w-full h-full stroke-current stroke-[3] text-blue-500/60">
                <path d="M10 20 C 40 10, 60 40, 40 70 C 35 75, 25 80, 50 80" strokeLinecap="round"/>
                <path d="M45 70 L55 80 L40 85" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          {/* Right Column: 3 Columns of Pricing cards */}
          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-3 gap-6 items-start relative z-10 w-full">
            
            {/* Card 1: Brisa */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6.5 flex flex-col justify-between space-y-8 shadow-sm hover:shadow-md transition">
              <div className="space-y-4">
                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <Smile className="w-4 h-4" />
                </div>
                <h3 className="text-lg font-black text-slate-850">Plan Brisa</h3>
                <p className="text-[11px] text-slate-400 font-bold leading-relaxed">Ideal para usuarios individuales y profesionales autónomos que facturan poco.</p>
                
                <div className="py-2 flex items-baseline">
                  <span className="text-3xl font-black text-slate-900">$249</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">/MXN mes</span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-5 space-y-3.5 text-[11px] text-slate-600 font-semibold">
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-[#0B53F4] shrink-0 stroke-[2.5px]" /> 20 facturas / mes</div>
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-[#0B53F4] shrink-0 stroke-[2.5px]" /> Historial básico</div>
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-[#0B53F4] shrink-0 stroke-[2.5px]" /> Soporte por email</div>
              </div>

              <button
                onClick={() => onOpenAuth("login")}
                className="w-full text-xs font-extrabold text-slate-700 bg-slate-100 hover:bg-slate-200 py-3 rounded-2xl transition text-center cursor-pointer font-sans"
              >
                Empezar ahora
              </button>
            </div>

            {/* Card 2: Serenidad (Most Popular Highlighted with Blue Background) */}
            <div className="bg-[#0B53F4] text-white border border-blue-400 rounded-3xl p-6.5 flex flex-col justify-between space-y-8 shadow-xl shadow-[#0B53F4]/10 relative transform lg:scale-105 z-20">
              {/* Ribbon badge */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-950 text-[8.5px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full select-none shadow-md">
                MÁS POPULAR
              </div>

              <div className="space-y-4">
                <div className="w-8 h-8 rounded-full bg-blue-500/30 text-amber-300 flex items-center justify-center font-bold">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                </div>
                <h3 className="text-lg font-black text-slate-100">Plan Serenidad</h3>
                <p className="text-[11px] text-blue-100 font-bold leading-relaxed">Para profesionales independientes y empresas en crecimiento constante.</p>
                
                <div className="py-2 flex items-baseline">
                  <span className="text-3xl font-black text-white">$599</span>
                  <span className="text-[10px] font-bold text-blue-200 uppercase tracking-wider ml-1">/MXN mes</span>
                </div>
              </div>

              <div className="border-t border-blue-550/50 pt-5 space-y-3.5 text-[11px] text-blue-50 font-semibold">
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-amber-300 shrink-0 stroke-[3px]" /> 100 facturas / mes</div>
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-amber-300 shrink-0 stroke-[3px]" /> Historial completo</div>
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-amber-300 shrink-0 stroke-[3px]" /> IA avanzada</div>
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-amber-300 shrink-0 stroke-[3px]" /> Facturación prioritaria</div>
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-amber-300 shrink-0 stroke-[3px]" /> Soporte prioritario</div>
              </div>

              <button
                onClick={() => onOpenAuth("login")}
                className="w-full text-xs font-extrabold text-slate-950 bg-amber-400 hover:bg-amber-300 py-3 rounded-2xl transition text-center cursor-pointer shadow-md shadow-slate-900/10 font-sans"
              >
                Elegir Serenidad
              </button>
            </div>

            {/* Card 3: Nirvana */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6.5 flex flex-col justify-between space-y-8 shadow-sm hover:shadow-md transition">
              <div className="space-y-4">
                <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <Layers className="w-4 h-4" />
                </div>
                <h3 className="text-lg font-black text-slate-850">Plan Nirvana</h3>
                <p className="text-[11px] text-slate-400 font-bold leading-relaxed">Para usuarios intensivos, corporativos o agencias sin límites.</p>
                
                <div className="py-2 flex items-baseline">
                  <span className="text-3xl font-black text-slate-900">$1,299</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">/MXN mes</span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-5 space-y-3.5 text-[11px] text-slate-600 font-semibold">
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-[#0B53F4] shrink-0 stroke-[2.5px]" /> Facturas ilimitadas</div>
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-[#0B53F4] shrink-0 stroke-[2.5px]" /> Multiusuario (5)</div>
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-[#0B53F4] shrink-0 stroke-[2.5px]" /> API para desarrolladores</div>
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-[#0B53F4] shrink-0 stroke-[2.5px]" /> Dashboard empresarial</div>
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-[#0B53F4] shrink-0 stroke-[2.5px]" /> Soporte 24/7 dedicado</div>
              </div>

              <button
                onClick={() => onOpenAuth("login")}
                className="w-full text-xs font-extrabold text-slate-700 bg-slate-100 hover:bg-slate-200 py-3 rounded-2xl transition text-center cursor-pointer font-sans"
              >
                Elegir Nirvana
              </button>
            </div>

          </div>

        </div>
      </section>

      {/* SECTION 10: TESTIMONIALS (DARK NAVY INTERIOR BACKGROUND BAR CAPSULE) MATCHING SCREENSHOT */}
      <section className="bg-slate-50 py-16 px-6" id="testimonials_glow">
        <div className="max-w-7xl mx-auto">
          <div className="bg-slate-950 text-white py-16 px-8 sm:px-12 rounded-[32px] border border-white/5 shadow-2xl relative overflow-hidden flex flex-col lg:flex-row items-stretch gap-12 shadow-blue-500/[0.01]">
            
            {/* Ambient background glows */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-[#0B53F4]/10 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />
            
            {/* Left title section */}
            <div className="lg:w-1/4 flex flex-col justify-between space-y-6 relative z-10 text-center lg:text-left">
              <div className="space-y-4">
                <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight uppercase leading-tight font-sans">
                  Lo que dicen <br />
                  nuestros <br className="hidden lg:inline" /> usuarios
                </h3>
                <p className="text-[11px] text-slate-400 font-extrabold uppercase tracking-widest leading-relaxed">
                  Nuestros clientes disfrutan de la paz fiscal.
                </p>
              </div>
              <a 
                href="#timeline_steps" 
                className="text-xs font-bold text-[#4D82FC] hover:text-white transition-colors duration-150 inline-flex items-center gap-1.5 justify-center lg:justify-start"
              >
                Ver más reseñas <ArrowUpRight className="w-4 h-4" />
              </a>
            </div>

            {/* Right testimonials quote list */}
            <div className="lg:w-3/4 grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10 items-stretch">
              
              {/* Card 1 */}
              <div className="bg-slate-900/60 backdrop-blur-md border border-white/[0.04] p-6.5 rounded-2xl flex flex-col justify-between space-y-6 shadow-lg shadow-black/30">
                <p className="text-[11px] text-slate-350 leading-relaxed italic font-medium font-sans">
                  "ZenTicket me ahorró horas cada semana. Ya no tengo que pelearme con portales lentos y capturas infecundas."
                </p>
                <div className="flex items-center gap-3 border-t border-white/5 pt-4">
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center font-extrabold text-blue-400 text-xs shadow-inner">LM</div>
                  <div>
                    <h5 className="text-[11px] font-extrabold text-slate-100">Laura Martínez</h5>
                    <span className="text-[9px] text-slate-500 font-black block uppercase tracking-wider">Contadora</span>
                  </div>
                </div>
              </div>

              {/* Card 2 */}
              <div className="bg-slate-900/60 backdrop-blur-md border border-white/[0.04] p-6.5 rounded-2xl flex flex-col justify-between space-y-6 shadow-lg shadow-black/30">
                <p className="text-[11px] text-slate-350 leading-relaxed italic font-medium font-sans">
                  "La automatización es increíble, funciona con todos los comercios que uso. 100% recomendado."
                </p>
                <div className="flex items-center gap-3 border-t border-white/5 pt-4">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center font-extrabold text-emerald-400 text-xs shadow-inner">CR</div>
                  <div>
                    <h5 className="text-[11px] font-extrabold text-slate-100">Carlos Rodríguez</h5>
                    <span className="text-[9px] text-slate-500 font-black block uppercase tracking-wider">Emprendedor</span>
                  </div>
                </div>
              </div>

              {/* Card 3 */}
              <div className="bg-slate-900/60 backdrop-blur-md border border-white/[0.04] p-6.5 rounded-2xl flex flex-col justify-between space-y-6 shadow-lg shadow-black/30">
                <p className="text-[11px] text-slate-350 leading-relaxed italic font-medium font-sans">
                  "Por fin una app que realmente entiende lo que necesitamos los empresarios."
                </p>
                <div className="flex items-center gap-3 border-t border-white/5 pt-4">
                  <div className="w-8 h-8 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center font-extrabold text-[#A855F7] text-xs shadow-inner">FC</div>
                  <div>
                    <h5 className="text-[11px] font-extrabold text-slate-100">Fernanda Castillo</h5>
                    <span className="text-[9px] text-slate-500 font-black block uppercase tracking-wider">CEO, Tienda en Línea</span>
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>
      </section>

      {/* SECTION 11: FAQS ACCORDION */}
      <section className="bg-white py-24 px-6 md:px-12 relative" id="faqs">
        <div className="max-w-4xl mx-auto text-center space-y-4 mb-16">
          <h2 className="text-3xl font-extrabold tracking-tight uppercase leading-tight text-slate-950 font-sans">
            Preguntas frecuentes
          </h2>
          <p className="text-xs text-slate-400 uppercase tracking-widest font-black">
            Resolvemos todas tus dudas técnicas y fiscales.
          </p>
        </div>

        {/* 2 Column Grid for Accordions */}
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 items-start select-none">
          {faqs.map((f, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div key={idx} className="border border-slate-200/80 rounded-2xl overflow-hidden bg-slate-55/40 transition duration-150">
                <button
                  type="button"
                  onClick={() => toggleFaq(idx)}
                  className="w-full flex justify-between items-center p-4.5 text-left text-xs font-bold text-slate-800 hover:text-slate-950 hover:bg-slate-100/50 focus:outline-none transition cursor-pointer"
                >
                  <span className="pr-4 leading-relaxed">{f.q}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transform transition-transform duration-200 shrink-0 ${isOpen ? "rotate-180 text-blue-600" : ""}`} />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                    >
                      <div className="p-4.5 pt-0 border-t border-slate-150 text-[11px] text-slate-500 leading-relaxed font-semibold">
                        {f.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 12: CTA GLOWING BLUE BLOCK WITH MEDITATING MASCOT & FOOTER */}
      <section className="bg-slate-950 text-white pt-24 pb-16 px-6 md:px-12 relative overflow-hidden flex flex-col items-center justify-center">
        {/* Glow backdrop light effect */}
        <div className="absolute bottom-0 w-[600px] h-[340px] bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center space-y-8 relative z-10 flex flex-col items-center">
          
          {/* Miniature cute meditating mascot illustration vector next to text */}
          <div className="relative w-20 h-20 bg-slate-900 border border-white/5 rounded-3xl shadow-2xl flex flex-col items-center justify-between p-3 mb-4 select-none">
            {/* Mascot eyes/smile */}
            <div className="flex gap-4 mt-2">
              <svg className="w-3 h-1.5 text-blue-400" viewBox="0 0 24 12" fill="none">
                <path d="M2 2C6 8 18 8 22 2" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              </svg>
              <svg className="w-3 h-1.5 text-blue-400" viewBox="0 0 24 12" fill="none">
                <path d="M2 2C6 8 18 8 22 2" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              </svg>
            </div>
            
            {/* Zenticket character body tag */}
            <div className="w-6 h-6 rounded-full bg-[#0B53F4] text-white flex items-center justify-center font-black text-[9px] shadow-[0_2px_8px_rgba(11,83,244,0.3)]">
              Z
            </div>
          </div>

          <h3 className="text-3xl md:text-5xl font-black uppercase tracking-tight leading-tight max-w-2xl font-sans">
            Dedica tu tiempo a tu negocio, <br />
            no a tus <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-450 via-[#5C8FFF] to-sky-400 drop-shadow-[0_0_15px_rgba(92,143,255,0.15)]">facturas</span>
          </h3>
          
          <p className="text-sm text-slate-400 font-semibold max-w-xl mx-auto leading-relaxed font-sans">
            Únete a miles de personas que ya eliminaron por completo el estrés de facturar compras corporativas.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 justify-center w-full max-w-sm">
            <button
              onClick={() => onOpenAuth("login")}
              className="w-full sm:w-auto text-xs font-black text-slate-950 bg-amber-400 hover:bg-amber-300 px-8 py-3.5 rounded-2xl transition cursor-pointer"
            >
              Comenzar Gratis
            </button>
            <button
              onClick={() => onOpenAuth("login")}
              className="w-full sm:w-auto text-xs font-black text-slate-200 border border-slate-800 bg-slate-900/60 hover:bg-slate-900 px-8 py-3.5 rounded-2xl transition cursor-pointer"
            >
              Solicitar Demo
            </button>
          </div>

          {/* Core assurances tags */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            <span>✓ Sin tarjeta de crédito</span>
            <span className="hidden sm:inline text-slate-700">•</span>
            <span>✓ Cancela cuando quieras</span>
            <span className="hidden sm:inline text-slate-700">•</span>
            <span>✓ Configúralo en 1 minuto</span>
          </div>

        </div>

        {/* Real Bottom Trademarks block */}
        <div className="max-w-7xl w-full mx-auto border-t border-white/5 mt-20 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] text-slate-500 font-mono text-center md:text-left select-none uppercase tracking-wider">
          <div className="flex items-center gap-4 flex-wrap justify-center md:justify-start">
            <Logo size="sm" withText={true} />
            <span className="text-slate-600">|</span>
            <span>© {new Date().getFullYear()} ZenTicket. Todos los derechos reservados.</span>
          </div>
          <div>
            <span>AUTORIZACIÓN SAT CFDI v4.0 • TECNOLOGÍA EN LA NUBE INTEGRADA</span>
          </div>
        </div>
      </section>

    </div>
  );
}
