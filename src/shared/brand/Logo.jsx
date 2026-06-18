import React from "react";
import { ASSETS } from "@/lib/assets";

/**
 * ZenTicket brand logo — uses the supplied PNG asset as-is.
 * The asset is a wide horizontal lockup with mascot + wordmark + tagline.
 */
export const ZenLogo = ({ className = "", size = 40, ...props }) => {
  return (
    <a
      href="#inicio"
      className={`inline-flex items-center ${className}`}
      aria-label="ZenTicket — inicio"
      {...props}
    >
      <img
        src={ASSETS.logo}
        alt="ZenTicket"
        draggable={false}
        loading="eager"
        decoding="async"
        className="block select-none"
        style={{
          height: size,
          width: "auto",
          objectFit: "contain",
        }}
      />
    </a>
  );
};

/* Small "Z" mark used in inline contexts (phone mock, comparison badge). */
export const ZenMark = ({ white = false }) => (
  <svg
    width="26"
    height="26"
    viewBox="0 0 28 28"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    <defs>
      <linearGradient id="zt-mark" x1="0" y1="0" x2="28" y2="28">
        <stop offset="0%" stopColor="#5B8CFF" />
        <stop offset="100%" stopColor="#2152EE" />
      </linearGradient>
    </defs>
    <rect
      x="1"
      y="1"
      width="26"
      height="26"
      rx="7"
      fill="url(#zt-mark)"
      stroke={white ? "rgba(255,255,255,0.18)" : "rgba(15,23,42,0.06)"}
    />
    <path
      d="M9 9h10l-9.2 10H19"
      stroke="white"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

/**
 * ZenMascot — the Zen character render, used in multiple sections.
 * Provided as a brand asset and never re-drawn.
 *
 * The PNG canvas is wider than the character (it includes transparent
 * padding on the sides). We render it tight to the character itself so
 * the image's bounding rectangle never feels visible.
 */
export const ZenMascot = ({
  className = "",
  float = true,
  size = 360,
  style = {},
}) => {
  return (
    <img
      src={ASSETS.zenMascot}
      alt="Zen — mascota de ZenTicket meditando"
      className={`${float ? "zt-float" : ""} select-none pointer-events-none block ${className}`}
      style={{
        width: size,
        height: "auto",
        ...style,
      }}
      draggable={false}
      loading="lazy"
    />
  );
};
