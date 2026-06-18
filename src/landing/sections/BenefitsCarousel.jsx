import React from "react";
import { Leaf, ShieldCheck, Folder, Zap, ChevronLeft, ChevronRight } from "lucide-react";
import { TID } from "@/lib/testIds";

const benefits = [
  {
    icon: Leaf,
    iconBg: "bg-emerald-500/15 text-emerald-400",
    title: "Más tiempo para ti",
    desc: "Deja de perder horas en procesos repetitivos y enfócate en lo que realmente importa.",
    accent: "emerald",
  },
  {
    icon: ShieldCheck,
    iconBg: "bg-sky-500/15 text-sky-400",
    title: "Menos errores",
    desc: "La IA reduce errores de captura y evita rechazos en los portales de facturación.",
    accent: "sky",
  },
  {
    icon: Folder,
    iconBg: "bg-fuchsia-500/15 text-fuchsia-400",
    title: "Todo centralizado",
    desc: "Tus tickets y facturas organizados y siempre disponibles en un solo lugar seguro.",
    accent: "fuchsia",
  },
  {
    icon: Zap,
    iconBg: "bg-amber-400/15 text-amber-300",
    title: "Automatización real",
    desc: "No es un atajo, es un sistema inteligente que trabaja 24/7 por ti.",
    accent: "amber",
    highlight: true,
  },
];

const accentRing = {
  emerald: "ring-emerald-400/30",
  sky: "ring-sky-400/30",
  fuchsia: "ring-fuchsia-400/30",
  amber: "ring-amber-300/30",
};

const BenefitsCarousel = () => {
  return (
    <section
      data-testid={TID.benefits.root}
      className="relative text-white"
      style={{
        background:
          "linear-gradient(180deg, #060914 0%, #080c1c 50%, #060914 100%)",
      }}
    >
      <div className="max-w-[1240px] mx-auto px-6 lg:px-8 py-5 sm:py-8 lg:py-16">
        <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {benefits.map((b) => (
            <div
              key={b.title}
              className={`zt-card-dark rounded-2xl p-5 transition-all hover:-translate-y-0.5 flex gap-4 items-start ${
                b.highlight ? "ring-1 ring-amber-300/20" : ""
              }`}
            >
              <div
                className={`w-10 h-10 shrink-0 rounded-xl grid place-items-center ${b.iconBg} ring-1 ${accentRing[b.accent]}`}
              >
                <b.icon size={18} />
              </div>
              <div className="flex-1">
                <h3
                  className={`font-display font-semibold text-[16px] leading-snug ${
                    b.highlight ? "text-amber-300" : "text-white"
                  }`}
                >
                  {b.title}
                </h3>
                <p className="text-[13px] text-white/60 leading-normal mt-1.5">
                  {b.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Mock carousel arrows */}
        <div className="hidden sm:flex justify-center gap-2 mt-6">
          <button className="zt-btn-ghost-dark w-9 h-9 rounded-full grid place-items-center">
            <ChevronLeft size={16} />
          </button>
          <button className="zt-btn-ghost-dark w-9 h-9 rounded-full grid place-items-center">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
};

export default BenefitsCarousel;
