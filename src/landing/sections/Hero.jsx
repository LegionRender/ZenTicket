import React from "react";
import { Sparkles, Camera, FileText, ScanLine, Play, ShieldCheck, Cpu, Clock } from "lucide-react";
import { ASSETS } from "@/lib/assets";
import { TID } from "@/lib/testIds";

const Hero = ({ onCtaClick }) => {
  return (
    <section
      id="inicio"
      data-testid={TID.hero.root}
      className="relative overflow-hidden zt-dark text-white"
    >
      {/* Background image */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url(${ASSETS.heroBg})`,
          backgroundSize: "cover",
          backgroundPosition: "right center",
          backgroundRepeat: "no-repeat",
          opacity: 0.95,
        }}
      />
      {/* Left vignette to keep text legible */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, rgba(7,10,22,0.96) 0%, rgba(7,10,22,0.75) 35%, rgba(7,10,22,0.2) 60%, rgba(7,10,22,0) 80%)",
        }}
      />

      <div className="relative max-w-[1240px] mx-auto px-6 lg:px-8 pt-24 pb-8 sm:pb-12 lg:pt-44 lg:pb-32">
        <div className="grid lg:grid-cols-12 gap-6 lg:gap-10 items-center">
          {/* Left content */}
          <div className="lg:col-span-7">
            <div
              data-testid={TID.hero.badge}
              className="zt-chip inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] text-white/85 select-none"
            >
              <Sparkles size={14} className="text-[#7aa5ff]" />
              <span>Inteligencia Artificial que trabaja por ti</span>
            </div>

            <h1 className="font-display font-extrabold mt-5 text-[36px] sm:text-[56px] lg:text-[68px] leading-[1.05] tracking-[-0.025em] text-white">
              Convierte tus{" "}
              <br className="hidden sm:inline" /> tickets en facturas.{" "}
              <br className="hidden sm:inline" />
              <span className="zt-grad-text">Sin estrés.</span>
            </h1>

            <p className="mt-5 text-[15px] sm:text-[16px] leading-7 text-white/70 max-w-[560px]">
              Toma una foto. ZenTicket encuentra el portal correcto,
              completa tus datos y genera tu factura automáticamente.{" "}
              <br className="hidden sm:inline" />
              Tú sigue con tu día, nosotros hacemos el resto.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <button
                data-testid={TID.hero.primaryCta}
                onClick={onCtaClick}
                className="zt-btn-primary text-white text-[15px] font-semibold px-6 py-3.5 rounded-full"
              >
                Probar Gratis
              </button>
              <button
                data-testid={TID.hero.secondaryCta}
                className="zt-btn-ghost-dark text-white text-[15px] font-medium px-5 py-3.5 rounded-full inline-flex items-center gap-2"
              >
                <span className="grid place-items-center w-6 h-6 rounded-full bg-white/10">
                  <Play size={11} className="text-white translate-x-[1px]" fill="currentColor" />
                </span>
                Ver cómo funciona
              </button>
            </div>

            <div className="mt-10 flex flex-wrap gap-3">
              {[
                { icon: ScanLine, label: "Sin capturas manuales" },
                { icon: Cpu, label: "Sin conocimientos técnicos" },
                { icon: Clock, label: "Disponible 24/7" },
              ].map((b) => (
                <div
                  key={b.label}
                  className="zt-chip rounded-full px-4 py-2.5 text-[13px] text-white/80 inline-flex items-center gap-2"
                >
                  <b.icon size={14} className="text-[#7aa5ff]" />
                  {b.label}
                </div>
              ))}
            </div>
          </div>

          {/* Right phone mock */}
          <div className="lg:col-span-5 relative flex items-center justify-center">
            {/* Animated video aura behind the phone */}
            <div
              className="absolute top-1/2 pointer-events-none rounded-full overflow-hidden"
              style={{
                width: 1224,
                height: 1224,
                maxWidth: "220%",
                left: "calc(50% - 90px)",
                transform: "translate(-50%, -50%)",
                WebkitMaskImage:
                  "radial-gradient(circle, #000 18%, rgba(0,0,0,0.55) 38%, rgba(0,0,0,0.18) 55%, transparent 70%)",
                maskImage:
                  "radial-gradient(circle, #000 18%, rgba(0,0,0,0.55) 38%, rgba(0,0,0,0.18) 55%, transparent 70%)",
              }}
            >
              <video
                className="w-full h-full object-cover"
                src={ASSETS.heroVideo}
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                aria-hidden
              />
            </div>
            <div className="relative z-10 scale-[0.7] sm:scale-100 my-[-80px] sm:my-0 origin-center transition-transform">
              <PhoneMock />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/* iPhone-style mock that mirrors the screenshot's 3-step preview */
const PhoneMock = () => {
  return (
    <div className="relative mx-auto w-[300px] sm:w-[330px] lg:w-[360px] aspect-[9/19]">
      <div
        className="absolute inset-0 rounded-[44px] p-[10px]"
        style={{
          background:
            "linear-gradient(160deg, #1c2240 0%, #0b1228 60%, #0b1228 100%)",
          boxShadow:
            "0 30px 80px -20px rgba(37,99,255,0.45), 0 0 0 1px rgba(255,255,255,0.06)",
        }}
      >
        <div
          className="relative w-full h-full rounded-[36px] overflow-hidden"
          style={{
            background:
              "radial-gradient(120% 60% at 50% 0%, rgba(56,109,255,0.25) 0%, rgba(11,16,32,0) 50%), linear-gradient(180deg, #0a0f24 0%, #070a18 100%)",
          }}
        >
          {/* Notch */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[110px] h-[26px] rounded-full bg-black/90 z-20" />
          {/* Status bar */}
          <div className="absolute top-2 left-0 right-0 z-10 px-6 flex items-center justify-between text-white/80 text-[11px]">
            <span>11:05</span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-white/70" />
            </span>
          </div>

          {/* Card top: brand */}
          <div className="absolute top-12 left-0 right-0 px-5 flex items-center justify-center gap-2 text-white/85 text-[12px] font-semibold z-10">
            <span className="grid place-items-center w-5 h-5 rounded-md bg-[#2152EE]">
              <span className="text-[10px] font-black">Z</span>
            </span>
            ZenTicket
          </div>

          {/* Steps */}
          <div className="absolute top-[78px] left-4 right-4 flex flex-col gap-3 z-10">
            <StepCard
              icon={<FileText size={14} />}
              title="1. Ticket capturado"
              subtitle="IMG_2024_1234.jpg"
            />
            <StepCard
              active
              icon={<Cpu size={14} />}
              title="2. IA procesando"
              subtitle={
                <span className="text-white/60">
                  Identificando comercio
                  <br />
                  <span className="text-[10px]">Extrayendo datos…</span>
                  <br />
                  <span className="text-[10px]">Validando formato…</span>
                </span>
              }
              right={
                <div className="text-right">
                  <div className="text-[10px] text-white/60">100%</div>
                </div>
              }
            />
            <StepCard
              icon={<ShieldCheck size={14} className="text-emerald-400" />}
              title="3. Factura generada"
              subtitle="Factura_1234.pdf"
              tint="emerald"
            />
          </div>

          {/* Bottom home indicator */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-[120px] h-[4px] rounded-full bg-white/30" />
        </div>
      </div>

      {/* Floating icons */}
      <div className="absolute -left-6 top-1/3 w-12 h-12 rounded-2xl zt-glow grid place-items-center bg-[#1a2a55] border border-white/10 backdrop-blur">
        <Camera size={18} className="text-[#a8c3ff]" />
      </div>
      <div className="absolute -right-4 top-1/4 w-12 h-12 rounded-2xl zt-glow grid place-items-center bg-[#1a2a55] border border-white/10 backdrop-blur">
        <FileText size={18} className="text-[#a8c3ff]" />
      </div>
    </div>
  );
};

const StepCard = ({ icon, title, subtitle, right, active, tint }) => {
  const bg = active
    ? "linear-gradient(180deg, rgba(56,109,255,0.22) 0%, rgba(11,16,32,0.6) 100%)"
    : tint === "emerald"
    ? "linear-gradient(180deg, rgba(16,185,129,0.12) 0%, rgba(11,16,32,0.55) 100%)"
    : "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)";
  return (
    <div
      className="rounded-2xl p-3 border border-white/10"
      style={{ background: bg }}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl grid place-items-center bg-white/10 text-white">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11.5px] font-semibold text-white">{title}</div>
          <div className="text-[10px] leading-snug text-white/55 truncate">
            {subtitle}
          </div>
        </div>
        {right}
      </div>
    </div>
  );
};

export default Hero;
