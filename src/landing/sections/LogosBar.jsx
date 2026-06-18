import React from "react";
import { TID } from "@/lib/testIds";
import { ASSETS } from "@/lib/assets";

const LogosBar = () => {
  return (
    <section
      id="empresas"
      data-testid={TID.logos.root}
      className="relative bg-white"
    >
      <div className="max-w-[1240px] mx-auto px-6 lg:px-8 pt-14 pb-10">
        <p className="text-center text-[12px] tracking-[0.18em] text-slate-500 font-semibold">
          COMPATIBLE CON MÁS DE 350 EMPRESAS EN MÉXICO
        </p>

        <div className="relative mt-8 overflow-hidden">
          {/* Edge fade gradients */}
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-24 z-10"
            style={{
              background: "linear-gradient(90deg,#fff,rgba(255,255,255,0))",
            }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-24 z-10"
            style={{
              background: "linear-gradient(270deg,#fff,rgba(255,255,255,0))",
            }}
          />

          {/* Marquee — duplicated image for seamless infinite loop */}
          <div className="flex items-center zt-marquee min-w-max gap-12">
            <img
              src={ASSETS.marcas}
              alt="Marcas compatibles con ZenTicket"
              className="block h-12 sm:h-14 lg:h-16 w-auto select-none"
              draggable={false}
              loading="lazy"
            />
            <img
              src={ASSETS.marcas}
              alt=""
              aria-hidden
              className="block h-12 sm:h-14 lg:h-16 w-auto select-none"
              draggable={false}
              loading="lazy"
            />
          </div>
        </div>

        <p className="text-center text-[13.5px] text-slate-500 mt-8 max-w-[760px] mx-auto">
          ZenTicket identifica automáticamente el portal de facturación correspondiente.
        </p>
      </div>
    </section>
  );
};

export default LogosBar;
