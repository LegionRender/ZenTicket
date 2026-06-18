import React, { useEffect, useState } from "react";
import {
  User,
  LogOut,
  House,
  Sparkles,
  FileText,
  ChartColumn,
  Layers,
  ShieldCheck,
  Bell,
  Camera,
  Wallet,
  Settings2,
  LayoutDashboard,
  ScanText,
  ClipboardList
} from "lucide-react";
import { toast } from "sonner";
import { ZenLogo } from "@/shared/brand/Logo";
import {
  FloatingScanButton,
  GhostButton,
  IconButton,
  PrimaryButton,
  SecondaryAction,
  WorkspaceHeader,
} from "@/workspace/components/WorkspacePrimitives";

const getNavigationItems = (isAdmin) => ([
  { tab: "inicio", label: "Inicio", mobileLabel: "Inicio", icon: <House className="w-5 h-5" /> },
  { tab: "capturar", label: "Escanear", mobileLabel: "Escanear", icon: <ScanText className="w-5 h-5" /> },
  { tab: "tickets", label: "Mis Tickets", mobileLabel: "Tickets", icon: <FileText className="w-5 h-5" /> },
  { tab: "historial", label: "Gastos", mobileLabel: "Gastos", icon: <ClipboardList className="w-5 h-5" /> },
  { tab: "cuenta", label: "Mi Cuenta", mobileLabel: "Cuenta", icon: <User className="w-5 h-5" /> },
  isAdmin && { tab: "admin", label: "Admin", mobileLabel: "Admin", icon: <ShieldCheck className="w-5 h-5" /> }
].filter(Boolean));

const SCREEN_META = {
  inicio: {
    eyebrow: "",
    title: "",
    subtitle: "",
    icon: LayoutDashboard,
  },
  capturar: {
    eyebrow: "Escanear",
    title: "Escanear",
    subtitle: "Captura tu ticket y valida la informacion detectada.",
    icon: Camera,
  },
  tickets: {
    eyebrow: "Tickets",
    title: "Mis tickets",
    subtitle: "Consulta, filtra y da seguimiento a tus tickets.",
    icon: Layers,
  },
  historial: {
    eyebrow: "Gastos",
    title: "Control de gastos",
    subtitle: "Resumen financiero y registros del mes.",
    icon: Wallet,
  },
  cuenta: {
    eyebrow: "Cuenta",
    title: "Configuracion de cuenta",
    subtitle: "Perfil, datos fiscales y preferencias.",
    icon: Settings2,
  },
  admin: {
    eyebrow: "Administracion",
    title: "Panel administrativo",
    subtitle: "Metricas, usuarios y automatizaciones con mayor densidad pero la misma jerarquia visual.",
    icon: ShieldCheck,
  },
};

function DesktopSidebar({
  activeTab,
  handleTabClick,
  isAdmin,
  isProfileComplete,
  isNavigationDisabled,
  logout,
  user
}) {
  const navItems = getNavigationItems(isAdmin);

  return (
    <aside className="hidden md:flex flex-col w-[19rem] border-r border-white/10 bg-[rgba(7,21,79,0.86)] backdrop-blur-xl fixed inset-y-0 left-0 z-40 p-6 text-white shadow-[inset_-1px_0_0_rgba(255,255,255,0.06)]">
      <div className="flex flex-col h-full justify-between">
        <div>
          <div className="cursor-pointer mb-8 py-2 border-b border-white/10 pb-5" onClick={() => handleTabClick("inicio")}>
            <ZenLogo size={38} className="h-9 w-auto" />
          </div>

          <nav className="flex flex-col gap-1.5 px-0.5">
            {navItems.map((item) => {
              const isDisabled = (!isProfileComplete && item.tab !== "cuenta") || isNavigationDisabled;
              return (
                <button
                  key={item.tab}
                  onClick={() => handleTabClick(item.tab)}
                  disabled={isDisabled}
                  className={`flex items-center gap-3 w-full px-4.5 py-3.5 rounded-xl text-[11.5px] uppercase font-display font-extrabold tracking-wider transition-all duration-200 ${
                    isDisabled
                      ? "opacity-40 cursor-not-allowed text-white/35 hover:bg-transparent"
                      : "cursor-pointer"
                  } ${
                    activeTab === item.tab && !isDisabled
                      ? "zt-ws-btn-primary text-white scale-[1.02]"
                      : isDisabled ? "" : "text-white/80 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <span className={`transition-transform duration-150 ${activeTab === item.tab && !isDisabled ? "text-white scale-110" : "text-white/55 group-hover:scale-110"}`}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-4 pt-5 border-t border-white/10 px-1">
          <div className="flex flex-col gap-1 border border-white/10 bg-white/10 p-3.5 rounded-2xl">
            <span className="text-[10px] font-black text-white/65 uppercase tracking-widest font-display">Sesion Activa</span>
            <span className="text-xs font-extrabold text-white truncate" title={user?.email}>
              {user?.email}
            </span>
          </div>

          <GhostButton
            onClick={() => {
              logout();
              toast.success("Has cerrado sesion exitosamente.");
            }}
            className="w-full text-[11px] font-black uppercase tracking-widest text-white hover:text-white"
          >
            <LogOut className="w-3.5 h-3.5 stroke-[2.3]" />
            <span>Cerrar Sesion</span>
          </GhostButton>

          <div className="pt-2 flex justify-center opacity-65 hover:opacity-100 transition-opacity">
            <ZenLogo size={24} className="h-6 w-auto" />
          </div>
        </div>
      </div>
    </aside>
  );
}

function MobileHeader({ activeTab, handleTabClick, isCompact, user }) {
  const meta = SCREEN_META[activeTab] ?? SCREEN_META.inicio;

  if (activeTab === "inicio") {
    return null;
  }

  return (
    <header className={`zt-ws-mobile-header md:hidden sticky top-0 z-40 w-full ${isCompact ? "is-compact" : ""}`}>
      <div className="zt-ws-mobile-header-shell px-4 pt-3 pb-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            {activeTab !== "inicio" ? (
              <h1 className="truncate text-[24px] font-extrabold tracking-tight text-white">
                {meta.title}
              </h1>
            ) : (
              <span className="block h-7" aria-hidden="true" />
            )}
          </div>
          <div className="flex items-center gap-2">
            {user?.email === "legionrender@gmail.com" ? (
              <IconButton
                aria-label="Admin"
                className="text-[#FFB200] border-[#FFB200]/25 bg-[#FFB200]/10"
                onClick={() => handleTabClick("admin")}
              >
                <ShieldCheck className="w-4 h-4" />
              </IconButton>
            ) : null}
            <IconButton aria-label="Notificaciones">
              <Bell className="w-4 h-4" />
            </IconButton>
          </div>
        </div>

        {activeTab !== "inicio" && !isCompact ? (
          <p className="mt-1 max-w-xs text-sm font-medium leading-snug text-white/72">
            {meta.subtitle}
          </p>
        ) : null}
      </div>
    </header>
  );
}

function MobileBottomNav({
  activeTab,
  handleTabClick,
  isAdmin,
  isProfileComplete,
  isNavigationDisabled
}) {
  const navItems = getNavigationItems(isAdmin);
  const baseItems = navItems.filter((item) => item.tab !== "capturar" && item.tab !== "admin");
  const start = baseItems.slice(0, 2).map((item) => {
    const isDisabled = (!isProfileComplete && item.tab !== "cuenta") || isNavigationDisabled;
    return {
      key: item.tab,
      label: item.mobileLabel,
      icon: item.icon,
      active: activeTab === item.tab && !isDisabled,
      disabled: isDisabled,
      onClick: () => handleTabClick(item.tab),
    };
  });
  const end = baseItems.slice(2, 4).map((item) => {
    const isDisabled = (!isProfileComplete && item.tab !== "cuenta") || isNavigationDisabled;
    return {
      key: item.tab,
      label: item.mobileLabel,
      icon: item.icon,
      active: activeTab === item.tab && !isDisabled,
      disabled: isDisabled,
      onClick: () => handleTabClick(item.tab),
    };
  });

  return (
    <div className="zt-ws-mobile-nav-frame md:hidden">
      <div className="zt-ws-mobile-nav-shell">
        <div className="grid grid-cols-[1fr_1fr_auto_1fr_1fr] items-end gap-1">
          {start.map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={item.disabled}
              onClick={item.onClick}
              className={`zt-ws-bottom-nav-item ${item.active ? "is-active" : ""} ${item.disabled ? "is-disabled opacity-35 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <span className={`zt-ws-bottom-nav-icon transition-colors duration-200 ${item.active ? "text-[var(--workspace-brand-blue)]" : "text-[#101b3f]/60"}`}>
                {React.cloneElement(item.icon, {
                  className: "w-5 h-5",
                  fill: item.active ? "currentColor" : "none"
                })}
              </span>
              <span className="zt-ws-bottom-nav-label">{item.label}</span>
            </button>
          ))}

          <div className="flex justify-center">
            <FloatingScanButton
              className="zt-ws-mobile-nav-fab"
              active={activeTab === "capturar"}
              disabled={isNavigationDisabled}
              onClick={() => {
                sessionStorage.setItem("zt-open-camera", "1");
                handleTabClick("capturar");
              }}
              aria-label="Abrir camara para escanear ticket"
            >
              <ScanText className="w-6 h-6 stroke-[2.3]" />
            </FloatingScanButton>
          </div>

          {end.map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={item.disabled}
              onClick={item.onClick}
              className={`zt-ws-bottom-nav-item ${item.active ? "is-active" : ""} ${item.disabled ? "is-disabled opacity-35 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <span className={`zt-ws-bottom-nav-icon transition-colors duration-200 ${item.active ? "text-[var(--workspace-brand-blue)]" : "text-[#101b3f]/60"}`}>
                {React.cloneElement(item.icon, {
                  className: "w-5 h-5",
                  fill: item.active ? "currentColor" : "none"
                })}
              </span>
              <span className="zt-ws-bottom-nav-label">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DesktopTopBar({ activeTab, handleTabClick, user }) {
  if (activeTab === "inicio") {
    return null;
  }

  const meta = SCREEN_META[activeTab] ?? SCREEN_META.inicio;

  return (
    <div className="hidden md:block zt-ws-hero">
      <WorkspaceHeader
        eyebrow={meta.eyebrow}
        title={meta.title}
        subtitle={meta.subtitle}
        actions={
          <div className="flex items-center gap-3">
            <PrimaryButton onClick={() => handleTabClick("capturar")}>
              <Camera className="w-4 h-4" />
              Escanear
            </PrimaryButton>
            <div className="hidden lg:flex items-center rounded-full border border-white/12 bg-white/10 px-3 py-2 text-sm text-white/80">
              {user?.email}
            </div>
          </div>
        }
      />
    </div>
  );
}

function ProfileRequiredBanner({ handleTabClick }) {
  return (
    <div className="mb-6 rounded-[1.6rem] border border-amber-200/70 bg-gradient-to-r from-amber-50 to-orange-50 p-5 shadow-[var(--shadow-surface)] text-left flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="space-y-1">
        <h4 className="text-xs font-black text-amber-800 uppercase tracking-widest flex items-center gap-1.5 font-display">
          <Sparkles className="w-4 h-4 text-amber-600" />
          Registro de Prueba (Datos Demostrativos)
        </h4>
        <p className="text-[11px] text-amber-700/90 leading-relaxed font-semibold max-w-4xl">
          Estas navegando en modo demostrativo. Para habilitar la digitalizacion de tickets con OCR real en produccion, registrar metodos de pago bancarios autenticos con autenticacion 3DS y contratar planes reales, debes completar el registro con tus datos fiscales reales de tu negocio.
        </p>
      </div>
      <SecondaryAction
        onClick={() => handleTabClick("cuenta")}
        className="shrink-0 bg-amber-100 text-amber-900 border-amber-200"
      >
        Completar Registro Real
      </SecondaryAction>
    </div>
  );
}

export default function WorkspaceLayout({
  activeTab,
  children,
  handleTabClick,
  isAdmin,
  isNavigationDisabled,
  isProfileComplete,
  logout,
  user
}) {
  const [isCompactHeader, setIsCompactHeader] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const nextCompact = window.scrollY > 28;
      setIsCompactHeader((prev) => (prev === nextCompact ? prev : nextCompact));
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className={`zt-workspace zt-ws-shell min-h-screen font-body selection:bg-cyan-200/30 selection:text-[#0b1736] flex flex-col md:flex-row ${activeTab === "inicio" ? "pb-0" : "pb-24"} md:pb-0`}>
      <DesktopSidebar
        activeTab={activeTab}
        handleTabClick={handleTabClick}
        isAdmin={isAdmin}
        isProfileComplete={isProfileComplete}
        isNavigationDisabled={isNavigationDisabled}
        logout={logout}
        user={user}
      />

      <MobileHeader
        activeTab={activeTab}
        handleTabClick={handleTabClick}
        isCompact={isCompactHeader}
        user={user}
      />

      <div className="flex-1 flex flex-col md:pl-[19rem] min-w-0">
        <main className="zt-ws-shell-main w-full flex-1">
          <div className="flex h-full w-full flex-col px-0 pb-8 md:pt-6">
            <DesktopTopBar activeTab={activeTab} handleTabClick={handleTabClick} user={user} />
            <div className={`zt-ws-shell-body ${activeTab === "inicio" ? "zt-ws-shell-body-home" : ""}`}>
            {!isProfileComplete && activeTab !== "cuenta" && (
              <ProfileRequiredBanner handleTabClick={handleTabClick} />
            )}

              <div className="zt-ws-shell-stack min-h-[500px]">
              {children}
              </div>
            </div>
          </div>
        </main>
      </div>

      <MobileBottomNav
        activeTab={activeTab}
        handleTabClick={handleTabClick}
        isAdmin={isAdmin}
        isProfileComplete={isProfileComplete}
        isNavigationDisabled={isNavigationDisabled}
      />
    </div>
  );
}
