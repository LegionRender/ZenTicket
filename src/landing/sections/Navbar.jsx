import React, { useState, useEffect } from "react";
import { Menu, X, Home, Play, Tag, Building2, LogIn } from "lucide-react";
import { ZenLogo } from "@/shared/brand/ZenLogo";
import { TID } from "@/shared/utils/testIds";
import { AnimatePresence, motion } from "motion/react";

const navItems = [
  { id: "inicio", label: "Inicio", href: "#inicio", icon: (props) => <Home strokeWidth={1.5} {...props} /> },
  { id: "como", label: "Cómo funciona", href: "#como-funciona", icon: (props) => (
    <div {...props} className={`w-5 h-5 rounded-full border border-white/20 flex items-center justify-center shrink-0 ${props.className || ""}`}>
      <Play className="w-2.5 h-2.5 fill-current translate-x-[0.5px] stroke-none" />
    </div>
  ) },
  { id: "precios", label: "Precios", href: "#precios", icon: (props) => <Tag strokeWidth={1.5} {...props} /> },
  { id: "empresas", label: "Empresas", href: "#empresas", icon: (props) => <Building2 strokeWidth={1.5} {...props} /> },
];

const Navbar = ({ onCtaClick, onLoginClick }) => {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState("inicio");
  const [hoveredSection, setHoveredSection] = useState(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
      if (window.scrollY < 50) {
        setActiveSection("inicio");
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });

    // IntersectionObserver scroll spy for section highlighting
    const observerOptions = {
      root: null,
      rootMargin: "-30% 0px -60% 0px",
      threshold: 0,
    };

    const handleIntersection = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const domId = entry.target.id;
          const itemId = domId === "como-funciona" ? "como" : domId;
          setActiveSection(itemId);
        }
      });
    };

    const observer = new IntersectionObserver(handleIntersection, observerOptions);

    navItems.forEach((it) => {
      const domId = it.id === "como" ? "como-funciona" : it.id;
      const el = document.getElementById(domId);
      if (el) observer.observe(el);
    });

    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      observer.disconnect();
    };
  }, []);

  const scrollToSection = (e, href) => {
    e.preventDefault();
    const targetId = href.replace("#", "");
    const targetElement = document.getElementById(targetId);
    if (!targetElement) return;

    // Header is ~70px high when scrolled (py-3.5 + 42px logo = ~70px)
    const headerOffset = window.scrollY > 20 ? 70 : 90;
    const targetPosition = targetElement.offsetTop - headerOffset;
    const startPosition = window.scrollY;
    const distance = targetPosition - startPosition;
    const duration = 800; // ms
    let start = null;

    const easeInOutQuad = (t, b, c, d) => {
      t /= d / 2;
      if (t < 1) return (c / 2) * t * t + b;
      t--;
      return (-c / 2) * (t * (t - 2) - 1) + b;
    };

    const step = (timestamp) => {
      if (!start) start = timestamp;
      const progress = timestamp - start;
      window.scrollTo(0, easeInOutQuad(progress, startPosition, distance, duration));
      if (progress < duration) {
        window.requestAnimationFrame(step);
      } else {
        window.scrollTo(0, targetPosition);
      }
    };

    window.requestAnimationFrame(step);
  };

  return (
    <header
      data-testid={TID.nav.root}
      className={`fixed top-0 left-0 right-0 z-45 transition-all duration-300 ${
        scrolled
          ? "bg-[#070a16] border-b border-white/[0.06] py-3.5"
          : "bg-transparent py-6"
      }`}
    >
      <div className="mx-auto max-w-[1240px] px-6 lg:px-8 relative">
        <nav className="flex items-center justify-between">
          <ZenLogo
            size={42}
            theme="dark"
            data-testid={TID.nav.logo}
            className="flex items-center"
          />

          <ul 
            className="hidden lg:flex items-center gap-1.5 text-[14.5px] font-sans font-medium"
            onMouseLeave={() => setHoveredSection(null)}
          >
            {navItems.map((it) => {
              const isActive = activeSection === it.id;
              const isHovered = hoveredSection === it.id;
              const isHighlighted = isHovered || (hoveredSection === null && isActive);
              return (
                <li 
                  key={it.id}
                  className="relative"
                  onMouseEnter={() => setHoveredSection(it.id)}
                >
                  {isHighlighted && (
                    <motion.div
                      layoutId="desktop-nav-pill"
                      className="absolute inset-0 bg-[#406ff4] rounded-lg"
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}
                  <a
                    href={it.href}
                    onClick={(e) => scrollToSection(e, it.id === "como" ? "#como-funciona" : it.href)}
                    data-testid={`nav-link-${it.id}`}
                    className={`transition-colors duration-200 block relative z-10 px-4 py-2 ${
                      isHighlighted
                        ? "text-white font-bold"
                        : "text-white/70 hover:text-white"
                    }`}
                  >
                    {it.label}
                  </a>
                </li>
              );
            })}
          </ul>

          <div className="hidden lg:flex items-center">
            <button
              onClick={(e) => {
                e.preventDefault();
                onLoginClick?.();
              }}
              data-testid={TID.nav.login}
              className="zt-btn-primary text-white text-[14.5px] font-semibold px-6 py-2.5 rounded-full hover:scale-[1.03] active:scale-97 transition cursor-pointer select-none font-sans"
            >
              Iniciar sesión
            </button>
          </div>

          <button
            data-testid={TID.nav.mobileToggle}
            onClick={() => setOpen(!open)}
            className="lg:hidden text-white p-2 hover:bg-white/10 rounded-xl transition cursor-pointer select-none"
            aria-label="Menú"
          >
            {open ? <X size={22} strokeWidth={1.5} /> : <Menu size={22} strokeWidth={1.5} />}
          </button>
        </nav>

        <AnimatePresence>
          {open && (
            <motion.div
              drag="y"
              dragConstraints={{ top: -300, bottom: 0 }}
              dragElastic={{ top: 0.1, bottom: 0 }}
              onDragEnd={(event, info) => {
                if (info.offset.y < -50 || info.velocity.y < -300) {
                  setOpen(false);
                }
              }}
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`lg:hidden absolute left-6 right-6 border border-white/[0.04] bg-[#040712]/50 backdrop-blur-xl rounded-2xl p-5 shadow-2xl z-50 text-left transition-all duration-300 cursor-grab active:cursor-grabbing ${
                scrolled ? "top-[64px]" : "top-[80px]"
              }`}
            >
              {/* Drag handle to dismiss */}
              <div className="w-12 h-1 bg-white/15 rounded-full mx-auto mb-4 pointer-events-none" />

              <ul className="flex flex-col gap-3 text-white">
                {navItems.map((it) => {
                  const isActive = it.id === activeSection;
                  const Icon = it.icon;
                  return (
                    <li key={it.id}>
                      <a
                        href={it.href}
                        onClick={(e) => {
                          setOpen(false);
                          scrollToSection(e, it.id === "como" ? "#como-funciona" : it.href);
                        }}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[14.5px] font-semibold transition duration-150 ${
                          isActive
                            ? "bg-[#0b53f4]/55 text-white border border-[#0b53f4]/35 shadow-sm shadow-[#0b53f4]/10"
                            : "bg-[#0a0f26]/20 text-white/90 border border-white/[0.04] hover:bg-[#0a0f26]/30"
                        }`}
                      >
                        <Icon className="w-5 h-5 shrink-0" />
                        <span>{it.label}</span>
                      </a>
                    </li>
                  );
                })}
                <li className="pt-2">
                  <button
                    onClick={() => {
                      setOpen(false);
                      onLoginClick?.();
                    }}
                    className="w-full py-3.5 bg-[#0b53f4]/55 hover:bg-[#0b53f4]/75 text-white text-[14.5px] font-bold rounded-xl transition duration-150 cursor-pointer flex items-center justify-center gap-2 border border-[#0b53f4]/35 font-sans shadow-sm shadow-[#0b53f4]/10"
                  >
                    <LogIn className="w-5 h-5 shrink-0" strokeWidth={1.5} />
                    <span>Iniciar sesión</span>
                  </button>
                </li>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
};

export default Navbar;
