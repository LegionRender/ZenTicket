import React, { useState } from "react";
import { Menu, X } from "lucide-react";
import { ZenLogo } from "@/shared/brand/Logo";
import { TID } from "@/lib/testIds";

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
      <div className="mx-auto max-w-[1240px] px-6 lg:px-8 pt-6">
        <nav className="flex items-center justify-between">
          <ZenLogo
            size={42}
            data-testid={TID.nav.logo}
            className="flex items-center"
          />

          <ul className="hidden lg:flex items-center gap-9 text-[14px] text-white/70">
            {navItems.map((it, i) => (
              <li key={it.id}>
                <a
                  href={it.href}
                  data-testid={`nav-link-${it.id}`}
                  className={`transition-colors hover:text-white ${
                    i === 0 ? "text-white" : ""
                  }`}
                >
                  {it.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden lg:flex items-center gap-5">
            <button
              onClick={(e) => {
                e.preventDefault();
                onLoginClick?.();
              }}
              data-testid={TID.nav.login}
              className="text-[14px] text-white/80 hover:text-white transition-colors cursor-pointer bg-transparent border-0 font-medium font-sans"
            >
              Iniciar sesión
            </button>
            <button
              data-testid={TID.nav.cta}
              onClick={onCtaClick}
              className="zt-btn-primary text-white text-[14px] font-semibold px-5 py-2.5 rounded-full"
            >
              Probar Gratis
            </button>
          </div>

          <button
            data-testid={TID.nav.mobileToggle}
            onClick={() => setOpen(!open)}
            className="lg:hidden text-white p-2"
            aria-label="Menú"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </nav>

        {open && (
          <div className="lg:hidden mt-4 bg-slate-950 border border-white/15 rounded-2xl p-6 shadow-2xl relative z-50">
            <ul className="flex flex-col gap-5 text-white">
              {navItems.map((it) => (
                <li key={it.id}>
                  <a
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className="block text-[16px] py-1 font-medium hover:text-blue-400 transition-colors"
                  >
                    {it.label}
                  </a>
                </li>
              ))}
              <li className="pt-2 border-t border-white/10">
                <button
                  onClick={() => {
                    setOpen(false);
                    onLoginClick?.();
                  }}
                  className="block text-[16px] text-left w-full py-1.5 text-white/90 hover:text-white transition-colors cursor-pointer bg-transparent border-0 font-medium"
                >
                  Iniciar sesión
                </button>
              </li>
              <li className="pt-2">
                <button
                  onClick={() => {
                    setOpen(false);
                    onCtaClick?.();
                  }}
                  className="zt-btn-primary text-white text-[15px] font-semibold px-5 py-3 rounded-full w-full"
                >
                  Probar Gratis
                </button>
              </li>
            </ul>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
