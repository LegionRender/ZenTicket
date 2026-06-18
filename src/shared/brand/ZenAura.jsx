import React from "react";

/**
 * ZenAura — luxury volumetric blue glow.
 * Pure light, no icons. Centred radial bloom with multiple soft layers
 * morphing and pulsing slowly to evoke a calm, futuristic atmosphere
 * inspired by the brand background images.
 *
 * All layers are CENTRED and CIRCULAR so the aura never reads as a
 * rectangular box — only as a soft halo of light.
 */
const ZenAura = ({ theme = "dark", intensity = 1, className = "" }) => {
  const isDark = theme === "dark";

  // Concentric circular glow layers (back → front), all centred.
  const layers = isDark
    ? [
        {
          // Wide outer atmosphere
          bg: "radial-gradient(closest-side, rgba(40,80,200,0.55), rgba(20,40,120,0.18) 45%, rgba(10,20,60,0) 75%)",
          size: "140%",
          blur: 50,
          anim: "ztAuraSlow",
          dur: "16s",
          delay: "0s",
        },
        {
          // Mid bright bloom
          bg: "radial-gradient(closest-side, rgba(86,140,255,0.85), rgba(56,109,255,0.35) 35%, rgba(37,99,255,0) 75%)",
          size: "95%",
          blur: 30,
          anim: "ztAuraPulse",
          dur: "8s",
          delay: "-2s",
        },
        {
          // Inner core highlight
          bg: "radial-gradient(closest-side, rgba(180,210,255,0.95), rgba(120,170,255,0.45) 30%, rgba(86,140,255,0) 70%)",
          size: "55%",
          blur: 18,
          anim: "ztAuraDrift",
          dur: "11s",
          delay: "-3s",
        },
        {
          // Brightest hot spot
          bg: "radial-gradient(closest-side, rgba(255,255,255,0.85), rgba(200,225,255,0.35) 25%, rgba(150,190,255,0) 65%)",
          size: "30%",
          blur: 10,
          anim: "ztAuraPulse",
          dur: "6s",
          delay: "-1s",
        },
      ]
    : [
        {
          bg: "radial-gradient(closest-side, rgba(86,140,255,0.40), rgba(86,140,255,0.10) 55%, rgba(86,140,255,0) 80%)",
          size: "140%",
          blur: 50,
          anim: "ztAuraSlow",
          dur: "18s",
          delay: "0s",
        },
        {
          bg: "radial-gradient(closest-side, rgba(86,140,255,0.55), rgba(56,109,255,0.20) 40%, rgba(37,99,255,0) 75%)",
          size: "95%",
          blur: 30,
          anim: "ztAuraPulse",
          dur: "9s",
          delay: "-2s",
        },
        {
          bg: "radial-gradient(closest-side, rgba(120,170,255,0.55), rgba(150,190,255,0.18) 35%, rgba(120,170,255,0) 75%)",
          size: "55%",
          blur: 18,
          anim: "ztAuraDrift",
          dur: "12s",
          delay: "-4s",
        },
        {
          bg: "radial-gradient(closest-side, rgba(255,255,255,0.85), rgba(220,232,255,0.35) 30%, rgba(150,190,255,0) 70%)",
          size: "32%",
          blur: 10,
          anim: "ztAuraPulse",
          dur: "7s",
          delay: "-1s",
        },
      ];

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{ opacity: intensity }}
    >
      {layers.map((l, i) => (
        <div
          key={i}
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: l.size,
            aspectRatio: "1 / 1",
            background: l.bg,
            filter: `blur(${l.blur}px)`,
            mixBlendMode: isDark ? "screen" : "normal",
            transform: "translate(-50%, -50%)",
            animation: `${l.anim} ${l.dur} ease-in-out infinite`,
            animationDelay: l.delay,
            willChange: "transform, opacity",
          }}
        />
      ))}
    </div>
  );
};

export default ZenAura;
