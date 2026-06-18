import React from "react";
import { Check, Leaf, Waves, Cloud } from "lucide-react";
import { TID } from "@/lib/testIds";

const plans = [
  {
    id: "brisa",
    name: "Brisa",
    icon: Leaf,
    iconColor: "text-emerald-500 bg-emerald-50",
    sub: "Ideal para usuarios\nocasionales.",
    price: "$249",
    features: [
      "20 facturas / mes",
      "Historial básico",
      "Soporte por email",
    ],
    cta: "Empezar ahora",
    ctaVariant: "ghost",
    testId: TID.pricing.brisa,
    ctaTestId: TID.pricing.brisaCta,
  },
  {
    id: "serenidad",
    name: "Serenidad",
    icon: Waves,
    iconColor: "text-sky-500 bg-sky-50",
    sub: "Para profesionales y empresas\nen crecimiento.",
    price: "$599",
    features: [
      "100 facturas / mes",
      "Historial completo",
      "IA avanzada",
      "Facturación prioritaria",
      "Soporte prioritario",
    ],
    cta: "Elegir Serenidad",
    ctaVariant: "primary",
    popular: true,
    testId: TID.pricing.serenidad,
    ctaTestId: TID.pricing.serenidadCta,
  },
  {
    id: "nirvana",
    name: "Nirvana",
    icon: Cloud,
    iconColor: "text-indigo-500 bg-indigo-50",
    sub: "Para usuarios intensivos\ny equipos.",
    price: "$1,299",
    features: [
      "Facturas ilimitadas",
      "Multiusuario (5)",
      "API para desarrolladores",
      "Dashboard empresarial",
      "Soporte 24/7 dedicado",
    ],
    cta: "Elegir Nirvana",
    ctaVariant: "ghost",
    testId: TID.pricing.nirvana,
    ctaTestId: TID.pricing.nirvanaCta,
  },
];

const PricingSection = ({ onChoose }) => {
  return (
    <section
      id="precios"
      data-testid={TID.pricing.root}
      className="relative bg-white"
    >
      <div className="absolute inset-0 zt-soft-bg opacity-50" />
      <div className="relative max-w-[1240px] mx-auto px-6 lg:px-8 py-5 sm:py-8 lg:py-24">
        <div className="grid lg:grid-cols-12 gap-10 items-start">
          {/* Title column */}
          <div className="lg:col-span-3 lg:pt-12">
            <h2 className="font-display font-extrabold text-[30px] sm:text-[34px] lg:text-[40px] leading-[1.05] tracking-tight text-slate-900">
              Elige el nivel de{" "}
              <span className="text-blue-600">tranquilidad</span> que necesitas
            </h2>
            <svg
              className="hidden sm:block mt-6 text-slate-300"
              width="100"
              height="60"
              viewBox="0 0 100 60"
              fill="none"
            >
              <path
                d="M2 6 C 30 50, 60 50, 90 40"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                strokeDasharray="3 3"
              />
              <path d="M82 32 L 92 40 L 84 50" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </div>

          {/* Plans grid */}
          <div className="lg:col-span-9 grid md:grid-cols-3 gap-5 items-stretch">
            {plans.map((p) => (
              <PlanCard key={p.id} plan={p} onChoose={onChoose} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const PlanCard = ({ plan, onChoose }) => {
  const isPopular = !!plan.popular;
  return (
    <div
      data-testid={plan.testId}
      className={`relative rounded-2xl p-7 border bg-white transition-all ${
        isPopular
          ? "border-blue-200 shadow-[0_30px_70px_-25px_rgba(37,99,255,0.45)] -translate-y-2 lg:-translate-y-4"
          : "border-slate-200 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.18)] hover:-translate-y-0.5"
      }`}
    >
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span
            className="inline-block text-white text-[11px] font-bold tracking-[0.18em] rounded-full px-3 py-1.5 shadow-md"
            style={{
              background:
                "linear-gradient(180deg, #5b8cff 0%, #2152ee 100%)",
            }}
          >
            MÁS POPULAR
          </span>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div
          className={`w-11 h-11 rounded-xl grid place-items-center ${plan.iconColor}`}
        >
          <plan.icon size={18} />
        </div>
        <div className="text-right">
          <div className="font-display font-extrabold text-[22px] text-slate-900">
            {plan.name}
          </div>
          <div className="text-[12px] text-slate-500 whitespace-pre-line leading-tight mt-1">
            {plan.sub}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-end gap-1.5">
        <span className="font-display font-extrabold text-[42px] leading-none text-slate-900">
          {plan.price}
        </span>
        <span className="text-[12.5px] text-slate-500 pb-1.5">/MXN mes</span>
      </div>

      <ul className="mt-6 space-y-3">
        {plan.features.map((f) => (
          <li
            key={f}
            className="flex items-center gap-2.5 text-[13.5px] text-slate-700"
          >
            <span
              className={`w-5 h-5 rounded-full grid place-items-center ${
                isPopular ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"
              }`}
            >
              <Check size={12} strokeWidth={3} />
            </span>
            {f}
          </li>
        ))}
      </ul>

      <div className="mt-7">
        <button
          data-testid={plan.ctaTestId}
          onClick={() => onChoose?.(plan.id)}
          className={`w-full rounded-full py-3 text-[14px] font-semibold transition-all ${
            plan.ctaVariant === "primary"
              ? "zt-btn-primary text-white"
              : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200"
          }`}
        >
          {plan.cta}
        </button>
      </div>
    </div>
  );
};

export default PricingSection;
