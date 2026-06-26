import React from "react";
import { Check, Leaf, Waves, Cloud, ShieldCheck, Sparkles } from "lucide-react";
import { TID } from "@/shared/utils/testIds";

const plans = [
  {
    id: "gratuito",
    name: "Gratuito",
    icon: Leaf,
    iconColor: "text-emerald-500 bg-emerald-50",
    sub: "Para uso ocasional o para probar la plataforma.",
    desc: "Ideal para probar ZenTicket y automatizar las primeras facturas sin compromiso.",
    price: "$0",
    features: [
      "5 facturas generadas al mes.",
      "Escaneo de tickets desde imagen o archivo.",
      "Historial básico de tickets.",
      "Estado de procesamiento de cada ticket.",
      "Descarga de factura cuando esté disponible.",
      "Perfil fiscal básico.",
      "Soporte por email.",
    ],
    cta: "Registrarse gratis",
    ctaVariant: "ghost",
    testId: "pricing-gratuito",
    ctaTestId: "pricing-gratuito-cta",
  },
  {
    id: "brisa",
    name: "Brisa",
    icon: Waves,
    iconColor: "text-sky-500 bg-sky-50",
    sub: "Para uso personal frecuente.",
    desc: "Para personas que facturan algunos consumos al mes y quieren evitar hacerlo manualmente.",
    price: "$5",
    features: [
      "10 facturas generadas al mes.",
      "Todo lo del plan Gratuito.",
      "Historial ampliado de tickets.",
      "Seguimiento de tickets en proceso.",
      "Visualización de facturas emitidas, pendientes y con error.",
      "Acceso a conectores disponibles.",
      "Registro básico de gastos.",
      "Soporte por email.",
    ],
    cta: "Elegir Brisa",
    ctaVariant: "ghost",
    testId: TID.pricing.brisa,
    ctaTestId: TID.pricing.brisaCta,
  },
  {
    id: "serenidad",
    name: "Serenidad",
    icon: Cloud,
    iconColor: "text-indigo-500 bg-indigo-50",
    sub: "Para freelancers, profesionistas\ny usuarios que facturan cada semana.",
    desc: "El plan recomendado para usuarios que facturan de forma constante y necesitan mayor control de sus tickets y gastos.",
    price: "$250",
    features: [
      "30 facturas generadas al mes.",
      "Todo lo del plan Brisa.",
      "Historial completo de tickets del mes.",
      "Panel de gastos y resumen mensual.",
      "Filtros por estado: procesando, emitido, pendiente o con error.",
      "Seguimiento de tickets en segundo plano.",
      "Acceso completo a conectores disponibles.",
      "Organización de facturas por comercio, fecha y estado.",
      "Soporte prioritario por email.",
    ],
    cta: "Elegir Serenidad",
    ctaVariant: "primary",
    popular: true,
    label: "RECOMENDADO",
    testId: TID.pricing.serenidad,
    ctaTestId: TID.pricing.serenidadCta,
  },
  {
    id: "nirvana",
    name: "Nirvana",
    icon: Sparkles,
    iconColor: "text-amber-500 bg-amber-50",
    sub: "Para negocios, equipos o usuarios\nque facturan de forma intensiva.",
    desc: "Para usuarios de alto volumen, negocios pequeños o equipos que necesitan automatizar muchas facturas cada mes.",
    price: "$500",
    features: [
      "100 facturas generadas al mes.",
      "Todo lo del plan Serenidad.",
      "Historial extendido de tickets y facturas.",
      "Mayor capacidad de procesamiento mensual.",
      "Seguimiento avanzado de tickets en segundo plano.",
      "Panel de gastos con mayor volumen de registros.",
      "Acceso completo a conectores disponibles.",
      "Mejor costo por factura.",
      "Soporte prioritario.",
    ],
    cta: "Elegir Nirvana",
    ctaVariant: "ghost",
    label: "MEJOR VALOR POR VOLUMEN",
    testId: TID.pricing.nirvana,
    ctaTestId: TID.pricing.nirvanaCta,
  },
];

const comparisonRows = [
  { name: "Facturas al mes", vals: ["5", "10", "30", "100"] },
  { name: "Escaneo de tickets", vals: ["Sí", "Sí", "Sí", "Sí"] },
  { name: "Historial de tickets", vals: ["Básico", "Ampliado", "Completo mensual", "Extendido"] },
  { name: "Estados de procesamiento", vals: ["Sí", "Sí", "Sí", "Sí"] },
  { name: "Seguimiento en segundo plano", vals: ["Básico", "Sí", "Sí", "Avanzado"] },
  { name: "Panel de gastos", vals: ["Básico", "Básico", "Completo", "Completo"] },
  { name: "Conectores disponibles", vals: ["Limitado", "Sí", "Sí", "Sí"] },
  { name: "Soporte", vals: ["Email", "Email", "Prioritario por email", "Prioritario"] },
  { name: "Mejor para", vals: ["Probar", "Uso personal", "Uso frecuente", "Alto volumen"] }
];

const PricingSection = ({ onChoose }) => {
  return (
    <section
      id="precios"
      data-testid={TID.pricing.root}
      className="relative bg-white"
    >
      <div className="absolute inset-0 zt-soft-bg opacity-50 pointer-events-none" />
      <div className="relative max-w-[1240px] mx-auto px-6 lg:px-8 py-10 sm:py-16 lg:py-24">
        
        {/* Centered Title Section */}
        <div className="flex flex-col items-center text-center mb-16">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-100">
            Planes y Precios
          </span>
          <h2 className="font-display font-extrabold mt-4 text-[32px] sm:text-[44px] lg:text-[48px] leading-[1.05] tracking-tight text-slate-900">
            Elige el nivel de <span className="text-blue-600">tranquilidad</span> que necesitas
          </h2>
          <p className="mt-3 text-slate-500 text-[15px] sm:text-[16px] max-w-[600px] leading-relaxed">
            Planes flexibles adaptados a tu volumen de facturación. Transparente y sin letras chiquitas.
          </p>
        </div>

        {/* 4-column Plans grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
          {plans.map((p) => (
            <PlanCard key={p.id} plan={p} onChoose={onChoose} />
          ))}
        </div>

        {/* Regla clara de consumo Banner */}
        <div className="mt-16 bg-[#F4F7FF] border border-blue-100 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 max-w-[900px] mx-auto text-left">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shrink-0 text-white shadow-md shadow-blue-500/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h4 className="font-display font-extrabold text-slate-900 text-[18px] mb-1">
              Transparencia y Regla Clara de Consumo
            </h4>
            <p className="text-slate-600 text-[14px] leading-relaxed">
              Una factura debe descontarse de tu plan <strong>únicamente cuando se genere correctamente</strong>. 
              Los tickets en estado <em>procesando</em>, <em>en seguimiento</em>, <em>pendiente</em> o <em>requiere acción</em> <strong>no se descuentan</strong> de tu saldo hasta que la factura quede completamente emitida.
            </p>
          </div>
        </div>

        {/* Plan Comparison Table */}
        <div className="mt-24 max-w-[950px] mx-auto">
          <div className="text-center mb-8">
            <h3 className="font-display font-extrabold text-[24px] sm:text-[32px] text-slate-900">
              Comparativa detallada de características
            </h3>
            <p className="text-slate-500 text-[14.5px] mt-2">
              Compara todas las características de nuestros planes para tomar la mejor decisión.
            </p>
          </div>

          <div className="border border-slate-200/80 rounded-3xl overflow-hidden bg-white shadow-sm overflow-x-auto">
            <table className="w-full border-collapse text-left min-w-[750px]">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200">
                  <th className="py-4 px-6 text-[12px] font-extrabold text-slate-500 uppercase tracking-wider">Función</th>
                  <th className="py-4 px-6 text-[12px] font-extrabold text-slate-500 uppercase tracking-wider">Gratuito</th>
                  <th className="py-4 px-6 text-[12px] font-extrabold text-slate-500 uppercase tracking-wider">Brisa</th>
                  <th className="py-4 px-6 text-[12px] font-extrabold text-blue-600 uppercase tracking-wider bg-blue-50/20">Serenidad</th>
                  <th className="py-4 px-6 text-[12px] font-extrabold text-indigo-600 uppercase tracking-wider">Nirvana</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13.5px]">
                {comparisonRows.map((row) => (
                  <tr key={row.name} className="hover:bg-slate-50/30 transition-colors">
                    <td className="py-3.5 px-6 font-semibold text-slate-800 border-r border-slate-100">{row.name}</td>
                    {row.vals.map((val, colIdx) => (
                      <td 
                        key={colIdx} 
                        className={`py-3.5 px-6 ${
                          colIdx === 2 ? "bg-blue-50/10 border-x border-blue-100/20" : ""
                        }`}
                      >
                        {val === "Sí" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                            <Check className="w-4 h-4 stroke-[3.5]" /> Sí
                          </span>
                        ) : (
                          <span className={
                            colIdx === 2 
                              ? "text-blue-700 font-semibold" 
                              : colIdx === 3 
                                ? "text-indigo-700 font-semibold" 
                                : "text-slate-600"
                          }>
                            {val}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
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
      className={`relative rounded-2xl p-7 border bg-white transition-all flex flex-col justify-between ${
        isPopular
          ? "border-blue-200 shadow-[0_30px_70px_-25px_rgba(37,99,255,0.45)] -translate-y-2 lg:-translate-y-4"
          : "border-slate-200 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.18)] hover:-translate-y-0.5"
      }`}
    >
      {plan.label && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap z-10">
          <span
            className="inline-block text-white text-[9px] font-extrabold tracking-[0.1em] rounded-full px-3.5 py-1.5 shadow-md uppercase"
            style={{
              background: plan.popular
                ? "linear-gradient(180deg, #5b8cff 0%, #2152ee 100%)"
                : "linear-gradient(180deg, #6366f1 0%, #4f46e5 100%)",
            }}
          >
            {plan.label}
          </span>
        </div>
      )}

      <div>
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

        {plan.desc && (
          <p className="text-[13px] text-slate-600 mt-4 leading-snug">
            {plan.desc}
          </p>
        )}

        <ul className="mt-6 space-y-3">
          {plan.features.map((f) => (
            <li
              key={f}
              className="flex items-start gap-2.5 text-[13.5px] text-slate-700 leading-snug"
            >
              <span
                className={`w-5 h-5 rounded-full grid place-items-center shrink-0 mt-0.5 ${
                  isPopular ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"
                }`}
              >
                <Check size={12} strokeWidth={3} />
              </span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-7">
        <button
          data-testid={plan.ctaTestId}
          onClick={() => onChoose?.(plan.id)}
          className={`w-full rounded-full py-3 text-[14px] font-semibold transition-all cursor-pointer ${
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
