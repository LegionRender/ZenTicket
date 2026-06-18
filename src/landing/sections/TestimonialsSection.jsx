import React from "react";
import { ArrowRight, ChevronRight } from "lucide-react";
import { TID } from "@/lib/testIds";

const testimonials = [
  {
    quote:
      "ZenTicket me ahorra horas cada semana. Ya no tengo que pelearme con portales lentos y capturas interminables.",
    name: "Laura Martínez",
    role: "Contadora",
    avatar: "https://i.pravatar.cc/96?img=47",
  },
  {
    quote:
      "La automatización es increíble, funciona con todos los comercios que uso. 100% recomendada.",
    name: "Carlos Rodríguez",
    role: "Emprendedor",
    avatar: "https://i.pravatar.cc/96?img=12",
  },
  {
    quote:
      "Por fin una app que realmente entiende lo que necesitamos los empresarios.",
    name: "Fernanda Castillo",
    role: "CEO, Tienda en Línea",
    avatar: "https://i.pravatar.cc/96?img=45",
  },
];

const TestimonialsSection = () => {
  return (
    <section
      data-testid={TID.testimonials.root}
      className="text-white"
      style={{
        background:
          "linear-gradient(180deg, #060914 0%, #080d22 50%, #060a18 100%)",
      }}
    >
      <div className="max-w-[1240px] mx-auto px-6 lg:px-8 py-5 sm:py-8 lg:py-20">
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-3">
            <h2 className="font-display font-extrabold text-[28px] sm:text-[32px] lg:text-[36px] leading-[1.05] tracking-tight">
              Lo que dicen{" "}
              <br className="hidden sm:inline" /> nuestros usuarios
            </h2>
            <button
              data-testid={TID.testimonials.seeMore}
              className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] text-white/70 hover:text-white transition-colors"
            >
              Ver más reseñas
              <ArrowRight size={14} />
            </button>
          </div>

          <div className="lg:col-span-9 grid md:grid-cols-3 gap-4">
            {testimonials.map((t, i) => (
              <div
                key={i}
                className="zt-card-dark rounded-2xl p-5 relative transition-transform hover:-translate-y-0.5"
              >
                <p className="text-[13.5px] leading-6 text-white/80">
                  “{t.quote}”
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <img
                    src={t.avatar}
                    alt={t.name}
                    className="w-9 h-9 rounded-full object-cover ring-1 ring-white/10"
                    loading="lazy"
                  />
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold text-white">
                      {t.name}
                    </div>
                    <div className="text-[11.5px] text-white/55">{t.role}</div>
                  </div>
                  <button
                    aria-label="Siguiente"
                    className="hidden sm:grid w-7 h-7 place-items-center rounded-full bg-white/5 border border-white/10 hover:bg-white/10"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
