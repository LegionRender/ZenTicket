import React from "react";
import { Camera, Cpu, Zap, Check } from "lucide-react";
import { TID } from "@/shared/utils/testIds";

const steps = [
  {
    n: "01",
    icon: Camera,
    title: "Sube tu ticket",
    desc: "Toma una foto o sube una captura desde tu celular.",
    color: "from-sky-400 to-sky-500",
  },
  {
    n: "02",
    icon: Cpu,
    title: "Identificación",
    desc: "Nuestra IA identifica el comercio y los datos principales del ticket.",
    color: "from-blue-500 to-blue-600",
  },
  {
    n: "03",
    icon: Zap,
    title: "Solicitud automatizada",
    desc: "El sistema completa la solicitud en el portal del comercio con tus datos de receptor.",
    color: "from-indigo-500 to-indigo-600",
  },
  {
    n: "04",
    icon: Check,
    title: "CFDI obtenido",
    desc: "Si el portal entrega el XML/PDF, se guarda y descarga en tu cuenta automáticamente.",
    color: "from-emerald-500 to-emerald-600",
  },
];

const HowItWorks = () => {
  return (
    <section
      id="como-funciona"
      data-testid={TID.how.root}
      className="relative bg-white"
    >
      <div className="absolute inset-0 zt-soft-bg opacity-50" />
      <div className="relative max-w-[1240px] mx-auto px-6 lg:px-8 py-8 lg:py-20">
        <h2 className="text-center font-display font-extrabold text-[28px] sm:text-[32px] lg:text-[36px] tracking-tight text-slate-900">
          Así de fácil funciona ZenTicket
        </h2>

        <div className="relative mt-14">
          {/* dotted connector */}
          <div className="hidden lg:block absolute top-[34px] left-[10%] right-[10%] h-[2px] zt-dotline" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-y-12 sm:gap-y-10 gap-x-6">
            {steps.map((s, idx) => (
              <div key={s.n} className="flex flex-col items-center text-center">
                <div
                  className={`relative w-[68px] h-[68px] rounded-full grid place-items-center text-white bg-gradient-to-br ${s.color} shadow-lg`}
                  style={{ boxShadow: "0 14px 30px -10px rgba(37,99,255,0.45)" }}
                >
                  <s.icon size={26} strokeWidth={2.2} />
                  <span className="absolute -bottom-4 text-[11px] font-bold text-slate-400 tracking-wider">
                    {s.n}
                  </span>
                </div>
                <h3 className="font-display font-semibold mt-8 text-[16px] text-slate-900">
                  {s.title}
                </h3>
                <p className="text-[13px] text-slate-500 leading-6 mt-2 whitespace-pre-line max-w-[230px]">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Aviso de Responsabilidad Fiscal */}
        <div className="mt-14 max-w-2xl mx-auto bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
          <p className="text-[11.5px] text-slate-500 leading-relaxed font-semibold">
            <strong className="text-[#0B53F4]">Aviso importante:</strong> ZenTicket no emite CFDI por cuenta propia. Los CFDI son obtenidos desde los portales oficiales de los comercios emisores.
          </p>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
