import React, { useState } from "react";
import { Menu, X, Home, Play, Tag, Building2, FileText, LogIn } from "lucide-react";
import { ZenLogo } from "@/shared/brand/ZenLogo";
import { TID } from "@/shared/utils/testIds";
import { AnimatePresence, motion } from "motion/react";

const navItems = [
  { id: "inicio", label: "Inicio", href: "#inicio", icon: (props) => <Home {...props} /> },
  { id: "como", label: "Cómo funciona", href: "#como-funciona", icon: (props) => (
    <div {...props} className={`w-5 h-5 rounded-full border border-current flex items-center justify-center shrink-0 ${props.className || ""}`}>
      <Play className="w-2.5 h-2.5 fill-current translate-x-[0.5px] stroke-none" />
    </div>
  ) },
  { id: "precios", label: "Precios", href: "#precios", icon: (props) => <Tag {...props} /> },
  { id: "empresas", label: "Empresas", href: "#empresas", icon: (props) => <Building2 {...props} /> },
  { id: "blog", label: "Blog", href: "#blog", icon: (props) => <FileText {...props} /> },
];

const Navbar = ({ onCtaClick, onLoginClick }) => {
  const [open, setOpen] = useState(false);

  return (
    <header
      data-testid={TID.nav.root}
      className="absolute top-0 left-0 right-0 z-30"
    >
      <div className="mx-auto max-w-[1240px] px-6 lg:px-8 pt-6 relative">
        <nav className="flex items-center justify-between">
          <ZenLogo
            size={42}
            theme="dark"
            data-testid={TID.nav.logo}
            className="flex items-center"
          />

          <ul className="hidden lg:flex items-center gap-9 text-[14px] text-white/70 font-sans font-medium">
            {navItems.map((it, i) => (
              <li key={it.id}>
                <a
                  href={it.href}
                  data-testid={`nav-link-${it.id}`}
                  className={`transition-colors hover:text-white ${
                    i === 0 ? "text-white font-bold" : ""
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
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </nav>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="lg:hidden absolute top-[76px] left-6 right-6 bg-[#040712]/98 border border-white/5 backdrop-blur-xl rounded-2xl p-5 shadow-2xl z-50 text-left"
            >
              <ul className="flex flex-col gap-3 text-white">
                {navItems.map((it) => {
                  const isActive = it.id === "inicio";
                  const Icon = it.icon;
                  return (
                    <li key={it.id}>
                      <a
                        href={it.href}
                        onClick={() => setOpen(false)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[14.5px] font-semibold transition duration-150 ${
                          isActive
                            ? "bg-[#0b53f4] text-white shadow-md shadow-[#0b53f4]/25"
                            : "bg-[#0a0f26]/60 text-white/90 border border-white/10 hover:bg-[#0a0f26]/85 hover:border-white/15"
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
                    <LogIn className="w-5 h-5 shrink-0" />
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
