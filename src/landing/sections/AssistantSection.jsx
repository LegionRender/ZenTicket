import React from "react";
import { CheckCircle2, MapPin, FileEdit, FileCheck2 } from "lucide-react";
import { ZenMascot } from "@/shared/brand/ZenLogo";
import ZenAura from "@/shared/brand/ZenAura";
import { ASSETS } from "@/shared/utils/assets";
import { TID } from "@/shared/utils/testIds";

const chips = [
  { icon: MapPin, label: "Encuentra el portal correcto" },
  { icon: FileEdit, label: "Llena tus datos por ti" },
  { icon: FileCheck2, label: "Genera tu factura en segundos" },
];

const AssistantSection = () => {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const media = window.matchMedia("(max-w: 1023px)");
    setIsMobile(media.matches);
    const listener = (e) => setIsMobile(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  const mascotSize = isMobile ? 290 : 578;
  const videoSize = isMobile ? 365 : 700;

  return (
    <section
      data-testid={TID.assistant.root}
      className="relative overflow-hidden bg-white"
    >
      <div className="absolute inset-0 zt-soft-bg opacity-90" />
      <div className="absolute inset-0 zt-light-grid opacity-40" />

      <div className="relative max-w-[1240px] mx-auto px-6 lg:px-8 py-6 sm:py-12 lg:py-28">
        <div className="grid lg:grid-cols-2 gap-4 lg:gap-12 items-center">
          {/* Mascot with animated video aura */}
          <div className="relative flex justify-center items-center min-h-[290px] lg:min-h-[680px]">
            {/* Fallback aura — shows through when the video can't decode */}
            <div className="absolute inset-0 -mx-6 lg:-mx-12 overflow-hidden">
              <ZenAura theme="light" intensity={1} />
            </div>
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full overflow-hidden pointer-events-none"
              style={{
                width: videoSize,
                height: videoSize,
                maxWidth: "calc(100vw - 48px)",
                WebkitMaskImage:
                  "radial-gradient(circle, #000 18%, rgba(0,0,0,0.55) 38%, rgba(0,0,0,0.18) 55%, transparent 70%)",
                maskImage:
                  "radial-gradient(circle, #000 18%, rgba(0,0,0,0.55) 38%, rgba(0,0,0,0.18) 55%, transparent 70%)",
              }}
            >
              <video
                className="w-full h-full object-cover"
                src={ASSETS.assistantVideo}
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                aria-hidden
              />
            </div>
            <ZenMascot
              size={mascotSize}
              className="relative z-10"
              style={{ filter: "drop-shadow(0 30px 60px rgba(37,99,255,0.35))" }}
            />
          </div>

          {/* Copy */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 text-blue-600 px-3.5 py-1.5 text-[12px] font-medium border border-blue-100">
              <CheckCircle2 size={14} />
              La solución es simple
            </div>

            <h2 className="font-display font-extrabold mt-5 text-[34px] sm:text-[42px] lg:text-[48px] leading-[1.05] tracking-tight text-slate-900">
              Tu asistente personal{" "}
              <br className="hidden sm:inline" /> de <span className="text-blue-600">facturación</span>
            </h2>

            <p className="mt-5 text-[15px] sm:text-[16px] leading-7 text-slate-600 max-w-[520px]">
              ZenTicket automatiza todo el proceso para que solo te preocupes
              por tomar una foto.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              {chips.map((c) => (
                <div
                  key={c.label}
                  className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 text-slate-700 text-[13px] px-4 py-2.5 shadow-sm"
                >
                  <c.icon size={14} className="text-blue-600" />
                  {c.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AssistantSection;
