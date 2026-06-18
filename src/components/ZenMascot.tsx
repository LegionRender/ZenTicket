import React from "react";
import { motion } from "motion/react";

interface ZenMascotProps {
  className?: string;
  size?: number; // Size in pixels
}

export default function ZenMascot({ className = "", size = 280 }: ZenMascotProps) {
  return (
    <div 
      className={`relative flex items-center justify-center select-none ${className}`} 
      style={{ width: size, height: size }}
      id="zen_mascot_container"
    >
      {/* 1. Concentric Radial Ambient Glow (Background aura resembling original image) */}
      <div className="absolute inset-0 bg-radial from-blue-400/20 via-blue-500/5 to-transparent rounded-full blur-3xl pointer-events-none z-0" />
      
      {/* 2. Animated Aura Rings */}
      <motion.div 
        className="absolute inset-2 border-2 border-dashed border-[#0B53F4]/15 rounded-full z-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
      />
      <motion.div 
        className="absolute inset-10 border border-dashed border-sky-400/20 rounded-full z-0"
        animate={{ rotate: -360 }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
      />

      {/* 3. Floating Sparkle Stars (4-point vector stars) */}
      <motion.div 
        className="absolute top-8 left-6 text-sky-400 opacity-60"
        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5Z" />
        </svg>
      </motion.div>

      <motion.div 
        className="absolute bottom-10 right-4 text-sky-400 opacity-60"
        animate={{ scale: [1.2, 1, 1.2], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5Z" />
        </svg>
      </motion.div>

      {/* 4. Meditating Mascot Vector Render Container */}
      <motion.div
        className="w-[85%] h-[85%] relative z-10 flex items-center justify-center"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <svg
          viewBox="0 0 512 512"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-[0_20px_40px_rgba(11,83,244,0.12)]"
        >
          {/* Subtle drop shadow under character legs */}
          <ellipse cx="256" cy="455" rx="110" ry="14" fill="#0C66FF" opacity="0.1" />

          {/* BACKGROUND PAPER GLOW (Soft blue halo right behind sheet of paper) */}
          <circle cx="256" cy="240" r="140" fill="url(#blue_halo)" opacity="0.8" />

          {/* MAIN DOCUMENT BODY FRAME */}
          {/* A soft rounded sheet of paper with beautifully curved edges */}
          <rect
            x="148"
            y="90"
            width="216"
            height="295"
            rx="36"
            fill="#FFFFFF"
            stroke="#1E293B"
            strokeWidth="11"
            strokeLinejoin="round"
          />

          {/* BLUE FOLDED CORNER ON TOP RIGHT */}
          {/* Folded blue corner (perfect 3D representation with color gradient and shadows) */}
          <path
            d="M 304 90 L 364 150 L 328 150 C 314 150 304 140 304 126 Z"
            fill="url(#blue_gradient)"
            stroke="#1E293B"
            strokeWidth="11"
            strokeLinejoin="round"
          />
          {/* Corner backing overlap */}
          <path
            d="M 304 90 L 364 150"
            stroke="#1E293B"
            strokeWidth="11"
            strokeLinecap="round"
          />

          {/* Two small blue header indicators (sat files mock) */}
          <circle cx="185" cy="130" r="6" fill="#0C66FF" opacity="0.4" />
          <circle cx="205" cy="130" r="6" fill="#0C66FF" opacity="0.2" />

          {/* FACE EXPRESSION */}
          {/* Happy closed eyelashes/eyes curving downwards (exact meditating u-curves) */}
          <path
            d="M 190 205 Q 215 228 238 205"
            fill="none"
            stroke="#1E293B"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M 274 205 Q 297 228 322 205"
            fill="none"
            stroke="#1E293B"
            strokeWidth="10"
            strokeLinecap="round"
          />

          {/* ROSE-PINK CHEEKS (Soft circular ovals like original attachment image) */}
          <circle cx="196" cy="225" r="14" fill="#FF8EA4" opacity="0.5" />
          <circle cx="316" cy="225" r="14" fill="#FF8EA4" opacity="0.5" />

          {/* CUTE SMILING MOUTH */}
          <path
            d="M 238 250 Q 256 268 274 250"
            fill="none"
            stroke="#1E293B"
            strokeWidth="9"
            strokeLinecap="round"
          />

          {/* BLUE LOGO STARRING ON STOMACH */}
          <circle cx="256" cy="324" r="22" fill="#0C66FF" />
          <text
            x="256"
            y="331"
            fill="#FFFFFF"
            fontSize="20"
            fontFamily="system-ui, sans-serif"
            fontWeight="900"
            textAnchor="middle"
          >
            Z
          </text>

          {/* CROSSED LOTUS LEGS (Sitting Pose with Black Pants) */}
          {/* Left leg cross */}
          <path
            d="M 172 375 Q 115 425 240 435"
            fill="none"
            stroke="#1E293B"
            strokeWidth="14"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Right leg cross */}
          <path
            d="M 340 375 Q 397 425 272 435"
            fill="none"
            stroke="#1E293B"
            strokeWidth="14"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Crossing stabilizer block */}
          <path
            d="M 220 415 Q 256 425 292 415"
            fill="none"
            stroke="#1E293B"
            strokeWidth="14"
            strokeLinecap="round"
          />

          {/* YOGIC ARMS SPREADING OUT INTO GYAN MUDRA */}
          
          {/* LEFT ARM */}
          <path
            d="M 148 265 C 105 285 96 325 115 340"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="15"
            strokeLinecap="round"
          />
          <path
            d="M 148 265 C 105 285 96 325 115 340"
            fill="none"
            stroke="#1E293B"
            strokeWidth="11"
            strokeLinecap="round"
          />
          {/* Left Hand Gyan Mudra Ring */}
          <circle cx="115" cy="340" r="14" fill="#FFFFFF" stroke="#1E293B" strokeWidth="9" />
          {/* Fingers extending outward */}
          <path d="M 105 348 Q 90 361 88 350" fill="none" stroke="#1E293B" strokeWidth="8" strokeLinecap="round" />
          <path d="M 100 353 Q 84 365 79 352" fill="none" stroke="#1E293B" strokeWidth="8" strokeLinecap="round" />

          {/* RIGHT ARM */}
          <path
            d="M 364 265 C 407 285 416 325 397 340"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="15"
            strokeLinecap="round"
          />
          <path
            d="M 364 265 C 407 285 416 325 397 340"
            fill="none"
            stroke="#1E293B"
            strokeWidth="11"
            strokeLinecap="round"
          />
          {/* Right Hand Gyan Mudra Ring */}
          <circle cx="397" cy="340" r="14" fill="#FFFFFF" stroke="#1E293B" strokeWidth="9" />
          {/* Fingers extending outward */}
          <path d="M 407 348 Q 422 361 424 350" fill="none" stroke="#1E293B" strokeWidth="8" strokeLinecap="round" />
          <path d="M 412 353 Q 428 365 433 352" fill="none" stroke="#1E293B" strokeWidth="8" strokeLinecap="round" />

          {/* GRADIENTS DEF */}
          <defs>
            <radialGradient id="blue_halo" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
              <stop offset="0%" stopColor="#0C66FF" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#0C66FF" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="blue_gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2A85FF" />
              <stop offset="100%" stopColor="#0C66FF" />
            </linearGradient>
          </defs>
        </svg>
      </motion.div>
    </div>
  );
}
