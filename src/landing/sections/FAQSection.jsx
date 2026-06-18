import React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { TID } from "@/lib/testIds";

const faqs = [
  {
    q: "¿Es seguro compartir mi información?",
    a: "Sí. ZenTicket cifra tus datos y nunca comparte tu información con terceros. Todo se almacena en servidores seguros en México con cifrado de grado bancario.",
  },
  {
    q: "¿Qué pasa si mi ticket no tiene QR?",
    a: "Nuestra IA es capaz de leer tickets impresos sin QR. Identifica automáticamente el RFC, total, fecha y comercio para generar tu factura sin necesidad de código.",
  },
  {
    q: "¿Qué comercios son compatibles?",
    a: "Soportamos +350 comercios en México, incluyendo Walmart, Costco, OXXO, Soriana, Liverpool, Chedraui, Home Depot, Sam's Club y muchos más.",
  },
  {
    q: "¿Necesito saber facturar?",
    a: "No. ZenTicket está diseñado para personas sin conocimientos técnicos. Solo toma una foto y nosotros nos encargamos del resto.",
  },
  {
    q: "¿Dónde se almacenan mis facturas?",
    a: "Todas tus facturas se almacenan de forma segura en tu cuenta y se envían a tu correo electrónico automáticamente. Puedes descargarlas en PDF y XML.",
  },
  {
    q: "¿Puedo usar ZenTicket en equipo?",
    a: "Sí. Nuestro plan Nirvana permite hasta 5 usuarios con permisos personalizados y dashboard empresarial para gestionar todos los tickets del equipo.",
  },
];

const FAQSection = () => {
  return (
    <section
      data-testid={TID.faq.root}
      className="relative bg-white"
    >
      <div className="absolute inset-0 zt-soft-bg opacity-40" />
      <div className="relative max-w-[1240px] mx-auto px-6 lg:px-8 py-8 lg:py-20">
        <div className="grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-3">
            <h2 className="font-display font-extrabold text-[28px] sm:text-[32px] lg:text-[36px] leading-[1.05] tracking-tight text-slate-900">
              Preguntas frecuentes
            </h2>
          </div>

          <div className="lg:col-span-9 grid md:grid-cols-2 gap-x-8 gap-y-2">
            <Accordion type="multiple" className="w-full">
              {faqs.slice(0, 3).map((f, i) => (
                <AccordionItem
                  key={i}
                  value={`l-${i}`}
                  data-testid={TID.faq.item(i)}
                  className="border-b border-slate-200"
                >
                  <AccordionTrigger className="text-[14px] font-medium text-slate-800 hover:no-underline py-4">
                    {f.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-[13.5px] text-slate-600 leading-6 pb-4">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
            <Accordion type="multiple" className="w-full">
              {faqs.slice(3).map((f, i) => (
                <AccordionItem
                  key={i + 3}
                  value={`r-${i}`}
                  data-testid={TID.faq.item(i + 3)}
                  className="border-b border-slate-200"
                >
                  <AccordionTrigger className="text-[14px] font-medium text-slate-800 hover:no-underline py-4">
                    {f.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-[13.5px] text-slate-600 leading-6 pb-4">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
