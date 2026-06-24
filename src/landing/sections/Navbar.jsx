import React, { useState } from "react";
import { Menu, X } from "lucide-react";
import { ZenLogo } from "@/shared/brand/ZenLogo";
import { TID } from "@/shared/utils/testIds";
import { AnimatePresence, motion } from "motion/react";

const navItems = [
  { id: "inicio", label: "Inicio", href: "#inicio" },
  { id: "como", label: "Cómo funciona", href: "#como-funciona" },
  { id: "precios", label: "Precios", href: "#precios" },
  { id: "empresas", label: "Empresas", href: "#empresas" },
  { id: "blog", label: "Blog", href: "#blog" },
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
              className="px-6 py-2.5 rounded-full text-[13.5px] font-bold tracking-wide uppercase transition-all duration-200 cursor-pointer text-white bg-white/10 hover:bg-white/20 border border-white/20 hover:scale-[1.02] active:scale-97 shadow-2xs flex items-center justify-center font-sans"
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
              className="lg:hidden absolute top-[76px] left-6 right-6 bg-[#040712]/95 border border-white/10 backdrop-blur-xl rounded-2xl p-5 shadow-2xl z-50 text-left"
            >
              <ul className="flex flex-col gap-4 text-white">
                {navItems.map((it) => (
                  <li key={it.id}>
                    <a
                      href={it.href}
                      onClick={() => setOpen(false)}
                      className="block text-[14.5px] font-medium text-white/80 hover:text-white transition-colors"
                    >
                      {it.label}
                    </a>
                  </li>
                ))}
                <li className="pt-3 border-t border-white/10">
                  <button
                    onClick={() => {
                      setOpen(false);
                      onLoginClick?.();
                    }}
                    className="w-full text-center py-3 rounded-xl text-[13.5px] font-extrabold uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 transition-all cursor-pointer border-none font-sans"
                  >
                    Iniciar sesión
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
