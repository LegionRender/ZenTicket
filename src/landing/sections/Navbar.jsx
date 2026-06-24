import React, { useState, useEffect } from "react";
import { Menu, X, Home, Play, Tag, Building2, FileText, LogIn } from "lucide-react";
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
  { id: "blog", label: "Blog", href: "#blog", icon: (props) => <FileText strokeWidth={1.5} {...props} /> },
];

const Navbar = ({ onCtaClick, onLoginClick }) => {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState("inicio");

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

  return (
    <header
      data-testid={TID.nav.root}
      className={`fixed top-0 left-0 right-0 z-45 transition-all duration-300 ${
        scrolled
          ? "bg-[#040712]/75 backdrop-blur-md border-b border-white/[0.06] py-3.5"
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

          <ul className="hidden lg:flex items-center gap-9 text-[14.5px] font-sans font-medium">
            {navItems.map((it) => (
              <li key={it.id}>
                <a
                  href={it.href}
                  data-testid={`nav-link-${it.id}`}
                  className={`transition-colors duration-200 ${
                    activeSection === it.id
                      ? "text-[#0b53f4] font-bold"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  {it.label}
                </a>
              </li>
            ))}
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
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`lg:hidden absolute left-6 right-6 border border-white/[0.08] bg-[#040712]/50 backdrop-blur-xl rounded-2xl p-5 shadow-2xl z-50 text-left transition-all duration-300 ${
                scrolled ? "top-[64px]" : "top-[80px]"
              }`}
            >
              <ul className="flex flex-col gap-3 text-white">
                {navItems.map((it) => {
                  const isActive = it.id === activeSection;
                  const Icon = it.icon;
                  return (
                    <li key={it.id}>
                      <a
                        href={it.href}
                        onClick={() => setOpen(false)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[14.5px] font-semibold transition duration-150 ${
                          isActive
                            ? "bg-[#0b53f4] text-white shadow-md shadow-[#0b53f4]/25"
                            : "bg-[#0a0f26]/60 text-white/90 border border-white/[0.06] hover:bg-[#0a0f26]/85 hover:border-white/10"
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
                    className="w-full py-3.5 bg-[#0b53f4] hover:bg-[#0847d1] text-white text-[14.5px] font-bold rounded-xl transition duration-150 cursor-pointer flex items-center justify-center gap-2 border-none font-sans shadow-md shadow-[#0b53f4]/25"
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
