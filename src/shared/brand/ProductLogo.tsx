import React from "react";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  withText?: boolean;
  variant?: "horizontal" | "vertical" | "app-icon" | "mascot";
  theme?: "light" | "dark";
  onClick?: () => void;
}

// Highly stylized custom vector mascot
// Recreates the meditating document paper with Gyan Mudra hand positions and crossed lotus legs with levitation shadow.
const MascotSvg = ({
  className = "w-full h-full",
  showShadow = true,
  showBg = false,
}: {
  className?: string;
  showShadow?: boolean;
  showBg?: boolean;
}) => {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {showBg && (
        <rect width="512" height="512" rx="110" fill="#0C66FF" />
      )}
      
      {/* Levitating Shadow */}
      {showShadow && (
        <ellipse
          cx="256"
          cy="450"
          rx="96"
          ry="12"
          fill={showBg ? "#091E42" : "#1D263B"}
          opacity={showBg ? "0.35" : "0.15"}
        />
      )}

      {/* Main Document Body Frame */}
      <path
        d="M 175 125 L 290 125 L 340 175 L 340 340 Q 340 360 320 360 L 195 360 Q 175 360 175 340 Z"
        fill="#FFFFFF"
        stroke="#101E35"
        strokeWidth="12"
        strokeLinejoin="round"
      />
      
      {/* Soft Blue Folded Corner Tip */}
      <path
        d="M 290 125 L 290 155 Q 290 175 310 175 L 340 175"
        fill="#EBF3FF"
        stroke="#101E35"
        strokeWidth="12"
        strokeLinejoin="round"
      />

      {/* Closed Meditating Eyes (Curves curving downwards) */}
      <path
        d="M 205 220 Q 225 240 245 220"
        fill="none"
        stroke="#101E35"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M 270 220 Q 290 240 310 220"
        fill="none"
        stroke="#101E35"
        strokeWidth="10"
        strokeLinecap="round"
      />

      {/* Gentle Smiling Mouth */}
      <path
        d="M 238 270 Q 257 288 276 270"
        fill="none"
        stroke="#101E35"
        strokeWidth="10"
        strokeLinecap="round"
      />

      {/* Crossed Lotus Legs */}
      <path
        d="M 185 355 Q 165 415 257 400"
        fill="none"
        stroke="#101E35"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 330 355 Q 350 415 257 400"
        fill="none"
        stroke="#101E35"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 225 385 Q 257 395 289 385"
        fill="none"
        stroke="#101E35"
        strokeWidth="12"
        strokeLinecap="round"
      />

      {/* Left Yogic Arm curving outward and upward into Dhyana/Gyan Mudra */}
      <path
        d="M 175 288 Q 115 320 105 275"
        fill="none"
        stroke="#101E35"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Left Gyan Mudra Circle (Index finger and thumb touching) */}
      <path
        d="M 105 275 C 115 265 130 275 125 288 C 120 298 105 295 105 275 Z"
        fill="none"
        stroke="#101E35"
        strokeWidth="10"
        strokeLinecap="round"
      />
      {/* Three extended background fingers */}
      <path
        d="M 100 265 Q 80 260 70 275"
        fill="none"
        stroke="#101E35"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M 98 275 Q 75 275 68 290"
        fill="none"
        stroke="#101E35"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M 102 285 Q 80 292 78 305"
        fill="none"
        stroke="#101E35"
        strokeWidth="10"
        strokeLinecap="round"
      />

      {/* Right Yogic Arm curving outward and upward into Gyan Mudra */}
      <path
        d="M 340 288 Q 400 320 410 275"
        fill="none"
        stroke="#101E35"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Right Gyan Mudra Circle */}
      <path
        d="M 410 275 C 400 265 385 275 390 288 C 395 298 410 295 410 275 Z"
        fill="none"
        stroke="#101E35"
        strokeWidth="10"
        strokeLinecap="round"
      />
      {/* Three extended fingers on the right */}
      <path
        d="M 415 265 Q 435 260 445 275"
        fill="none"
        stroke="#101E35"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M 417 275 Q 440 275 447 290"
        fill="none"
        stroke="#101E35"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M 413 285 Q 435 292 437 305"
        fill="none"
        stroke="#101E35"
        strokeWidth="10"
        strokeLinecap="round"
      />
    </svg>
  );
};

export default function Logo({
  className = "",
  size = "md",
  withText = true,
  variant = "horizontal",
  theme = "light",
  onClick,
}: LogoProps) {
  // Size specification mapping to standard Tailwind classes
  const sizeClasses = {
    sm: {
      mascot: "w-7 h-7",
      title: "text-base sm:text-lg",
      subtitle: "text-[7.5px] tracking-wider",
      gap: "gap-2",
    },
    md: {
      mascot: "w-10 h-10",
      title: "text-2xl sm:text-2xl",
      subtitle: "text-[9.5px] tracking-widest",
      gap: "gap-3",
    },
    lg: {
      mascot: "w-14 h-14",
      title: "text-3xl sm:text-4xl",
      subtitle: "text-[11px] sm:text-xs tracking-widest",
      gap: "gap-4",
    },
    xl: {
      mascot: "w-20 h-20",
      title: "text-4xl sm:text-5xl",
      subtitle: "text-xs sm:text-sm tracking-widest",
      gap: "gap-5",
    },
    "2xl": {
      mascot: "w-32 h-32",
      title: "text-6xl",
      subtitle: "text-base sm:text-lg tracking-widest leading-relaxed",
      gap: "gap-6",
    },
  };

  const currentSize = sizeClasses[size] || sizeClasses.md;

  // Determine brand colors dynamically based on light/dark themes
  const zenColor = "text-[#0C66FF]";
  const ticketColor = theme === "dark" ? "text-white" : "text-[#1E293B]";
  const taglineColor = theme === "dark" ? "text-slate-400" : "text-slate-500";

  const cursorClass = onClick ? "cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all" : "";

  // If text is not requested, or layout is strictly requested as only mascot
  if (!withText || variant === "mascot") {
    return (
      <div onClick={onClick} className={`inline-flex items-center justify-center select-none ${cursorClass} ${className} shrink-0`}>
        <div className={currentSize.mascot}>
          <MascotSvg showShadow={true} showBg={false} />
        </div>
      </div>
    );
  }

  // If variant requested is "app-icon" (the beautiful blue background launcher)
  if (variant === "app-icon") {
    return (
      <div onClick={onClick} className={`inline-flex items-center justify-center select-none ${cursorClass} ${className} shrink-0`}>
        <div className={`${currentSize.mascot} shadow-md shadow-[#0C66FF]/15 transform transition-transform hover:scale-105 duration-200`}>
          <MascotSvg showShadow={true} showBg={true} />
        </div>
      </div>
    );
  }

  // If variant requested is vertical (centered mascot on top, brand text below)
  if (variant === "vertical") {
    return (
      <div onClick={onClick} className={`flex flex-col items-center justify-center text-center select-none ${currentSize.gap} ${cursorClass} ${className}`}>
        <div className="w-24 h-24 md:w-32 md:h-32 transform transition-transform hover:scale-105 duration-350">
          <MascotSvg showShadow={true} showBg={false} />
        </div>
        
        <div className="flex flex-col items-center">
          <h1 className={`${currentSize.title} font-black uppercase tracking-tighter select-all flex items-center leading-none`}>
            <span className={zenColor}>Zen</span>
            <span className={ticketColor}>Ticket</span>
          </h1>
          <p className={`${currentSize.subtitle} uppercase font-bold font-sans ${taglineColor} mt-2`}>
            Facturar nunca fue tan relajante
          </p>
        </div>
      </div>
    );
  }

  // DEFAULT/HORIZONTAL: Mascot on Left, Text & Tagline on the Right
  return (
    <div onClick={onClick} className={`flex items-center select-none ${currentSize.gap} ${cursorClass} ${className} shrink-0`}>
      <div className={`${currentSize.mascot} transform transition-transform hover:scale-105 duration-200`}>
        <MascotSvg showShadow={true} showBg={false} />
      </div>
      
      <div className="flex flex-col justify-center text-left">
        <h1 className={`${currentSize.title} font-black uppercase tracking-tighter flex items-center select-all leading-none`}>
          <span className={zenColor}>Zen</span>
          <span className={ticketColor}>Ticket</span>
        </h1>
        <p className={`${currentSize.subtitle} uppercase font-semibold font-sans ${taglineColor} mt-1.5`}>
          Facturar nunca fue tan relajante
        </p>
      </div>
    </div>
  );
}
