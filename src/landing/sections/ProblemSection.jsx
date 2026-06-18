import React from "react";
import { Search, KeyRound, Lock, Loader, Receipt } from "lucide-react";
import { ASSETS } from "@/lib/assets";
import { TID } from "@/lib/testIds";

const items = [
  {
    icon: Search,
    title: "Buscar dónde facturar",
    desc: "Cada empresa tiene un portal diferente.",
  },
  {
    icon: KeyRound,
    title: "Capturar datos una y otra vez",
    desc: "Números, fechas, RFC, totales… y más.",
  },
  {
    icon: Lock,
    title: "Recordar contraseñas",
    desc: "Decenas de usuarios y portales distintos.",
  },
  {
    icon: Loader,
    title: "Portales lentos o confusos",
    desc: "Procesos tediosos y poco intuitivos.",
  },
  {
    icon: Receipt,
    title: "Perder tickets antes de facturar",
    desc: "Papel que se pierde, o fotos olvidadas.",
  },
];

const ProblemSection = () => {
  return (
    <section
      data-testid={TID.problem.root}
      className="relative overflow-hidden text-white"
      style={{ background: "#070a18" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url(${ASSETS.problemBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.85,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, rgba(7,10,24,0.92) 0%, rgba(7,10,24,0.78) 35%, rgba(7,10,24,0.55) 65%, rgba(7,10,24,0.85) 100%)",
        }}
      />

      <div className="relative max-w-[1240px] mx-auto px-6 lg:px-8 py-8 lg:py-20">
        <div className="grid lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-3 flex flex-col justify-center">
            <h2 className="font-display font-extrabold text-[30px] sm:text-[34px] lg:text-[38px] leading-[1.05] tracking-tight">
              Facturar sigue siendo un problema
            </h2>
            <p className="mt-4 text-[14px] text-white/65 leading-6">
              Demasiado tiempo. Demasiados pasos. Demasiado estrés.
            </p>
          </div>

          <div className="lg:col-span-9 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {items.map((it) => (
              <div
                key={it.title}
                className="zt-card-dark rounded-2xl p-5 transition-transform hover:-translate-y-0.5 flex flex-row sm:flex-col gap-4 sm:gap-0 items-start"
              >
                <div className="w-10 h-10 shrink-0 rounded-xl grid place-items-center bg-rose-500/15 text-rose-400 sm:mb-4">
                  <it.icon size={18} />
                </div>
                <div className="flex-1">
                  <h3 className="font-display font-semibold text-[15px] text-white leading-snug whitespace-pre-line">
                    {it.title}
                  </h3>
                  <p className="text-[12.5px] text-white/55 leading-5 mt-2 whitespace-pre-line">
                    {it.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProblemSection;
