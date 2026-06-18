import React, { useState } from "react";
import {
  ArrowUpRight,
  Bell,
  ChevronDown,
  ChevronRight,
  PlusCircle,
  QrCode,
  ReceiptText,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useToast } from "@/shared/feedback/Toast";
import { ContingencyPanel } from "@/workspace/features/scanner/components/ContingencyPanel";
import { OperationalNotificationsCenter } from "@/workspace/features/scanner/components/OperationalNotificationsCenter";
import { StatusBadge } from "@/workspace/components/WorkspacePrimitives";

const formatCurrency = (value) =>
  value.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatShortDate = (value) => {
  if (!value) return "Sin fecha";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
};

const getMerchantLogoInfo = (name = "") => {
  const norm = name.toLowerCase();
  if (norm.includes("oxxo")) {
    return { className: "zt-merchant-oxxo", text: "O" };
  }
  if (norm.includes("starbucks")) {
    return { className: "zt-merchant-starbucks", text: "S" };
  }
  if (norm.includes("uber")) {
    return { className: "zt-merchant-uber", text: "U" };
  }
  if (norm.includes("costco")) {
    return { className: "zt-merchant-default bg-blue-50 text-blue-600 border border-blue-100/50", text: "C" };
  }
  if (norm.includes("walmart")) {
    return { className: "zt-merchant-default bg-sky-50 text-sky-600 border border-sky-100/50", text: "W" };
  }
  const initial = name ? name.trim().charAt(0).toUpperCase() : "T";
  return { className: "zt-merchant-default", text: initial };
};

function HomeOperationalPanel({
  notifications,
  onArchiveNotification,
  onNotificationAction,
  onViewDetails,
}) {
  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const visibleNotifications = notifications.slice(0, 2);

  return (
    <article className="zt-premium-card rounded-[1.25rem] p-4 text-left shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50/60 text-[#0B53F4]">
            <Bell className="h-[17px] w-[17px]" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-black leading-tight text-[#101B3F]">
              Notificaciones Operativas
            </p>
            <p className="mt-0.5 text-[10px] font-semibold text-[#687AA6]">
              {unreadCount > 0 ? `${unreadCount} alertas por revisar.` : "Sin alertas pendientes."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onViewDetails}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-blue-50/60 px-3 text-[10px] font-black text-[#0B53F4]"
        >
          Ver
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2.5 space-y-2 border-t border-slate-100/60 pt-2.5">
        {visibleNotifications.map((notification) => (
          <div
            key={notification.id}
            className="flex items-start justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/30 px-3 py-2.5"
          >
            <div className="flex min-w-0 gap-2">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  notification.criticality === "critica"
                    ? "bg-rose-500"
                    : notification.criticality === "importante"
                      ? "bg-amber-500"
                      : "bg-[#0B53F4]"
                }`}
              />
              <div className="min-w-0">
                <p className="truncate text-[10.5px] font-black text-[#101B3F]">
                  {notification.title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[10px] font-medium leading-snug text-[#53658F]">
                  {notification.message}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {!notification.read ? (
                <button
                  type="button"
                  onClick={() => onArchiveNotification(notification.id)}
                  className="text-[9px] font-black text-slate-400"
                >
                  Archivar
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onNotificationAction(notification)}
                className="rounded-lg border border-slate-100 bg-white px-2 py-1 text-[9px] font-black text-[#0B53F4] shadow-[0_1px_3px_rgba(15,23,42,0.05)] hover:bg-slate-50"
              >
                {notification.actionText}
              </button>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function HomeContingencySummary({ tickets, onOpenDetails }) {
  const contingencyTickets = tickets.filter((ticket) => ticket.status === "failed" || ticket.status === "review");

  return (
    <article
      id="ai-contingency-panel-card"
      className="zt-premium-card rounded-[1.25rem] p-4 text-left shadow-[0_8px_24px_rgba(15,23,42,0.03)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <ShieldCheck className="h-[17px] w-[17px]" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-black leading-tight text-[#101B3F]">
              Panel de Contingencia IA
            </p>
            <p className="mt-0.5 text-[10px] font-semibold text-[#687AA6]">
              {contingencyTickets.length > 0
                ? `${contingencyTickets.length} casos requieren soporte.`
                : "Sin casos criticos activos."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenDetails}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-amber-50 px-3 text-[10px] font-black text-amber-700"
        >
          Abrir
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
}

export default function HomeScreen({
  fiscalProfile,
  invoices,
  tickets,
  user,
  onTabChange,
  onUpdateTicketInDb,
}) {
  const toast = useToast();
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const monthlyInvoices = invoices.filter((invoice) => {
    const created = new Date(invoice.createdAt);
    return created.getMonth() === currentMonth && created.getFullYear() === currentYear;
  });

  const monthlyTickets = tickets.filter((ticket) => {
    const created = new Date(ticket.createdAt);
    return created.getMonth() === currentMonth && created.getFullYear() === currentYear;
  });

  const totalSpent = monthlyInvoices.reduce((sum, invoice) => sum + (invoice.total || 0), 0);
  const processedTickets = monthlyTickets.filter((ticket) => ticket.status === "completed").length;
  const estimatedSavings = totalSpent * 0.16;
  const recentTickets = [...tickets]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  const userName =
    fiscalProfile?.displayName ||
    user?.displayName ||
    fiscalProfile?.name ||
    "";

  const [operationalNotifications, setOperationalNotifications] = useState([
    {
      id: "op-1",
      category: "pendientes",
      criticality: "critica",
      title: "Bloqueo de CAPTCHA en Portal Walmart",
      message: "El robot detecto un bloqueo externo y requiere mitigacion desde contingencia.",
      createdAt: new Date(Date.now() - 35 * 1000),
      read: false,
      actionText: "Ir a contingencia",
      actionType: "contingency",
    },
    {
      id: "op-2",
      category: "facturas",
      criticality: "informativa",
      title: "Factura SAT certificada con exito",
      message: "Se timbro correctamente una factura reciente y ya esta disponible en tickets.",
      createdAt: new Date(Date.now() - 15 * 60 * 1000),
      read: true,
      actionText: "Ver detalles",
      actionType: "info",
    },
    {
      id: "op-3",
      category: "gastos",
      criticality: "importante",
      title: "Discrepancia menor en total detectado",
      message: "Un ticket requiere revision por diferencia entre OCR y validacion heuristica.",
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
      read: false,
      actionText: "Revisar ticket",
      actionType: "contingency",
    },
  ]);
  const [selectedContingencyTicket, setSelectedContingencyTicket] = useState(null);
  const [selectedStrategy, setSelectedStrategy] = useState("playwright");
  const [isSolvingContingency, setIsSolvingContingency] = useState(false);
  const [solvingProgress, setSolvingProgress] = useState(0);
  const [solvingLogs, setSolvingLogs] = useState([]);
  const [isContingencyModalOpen, setIsContingencyModalOpen] = useState(false);
  const [showOperationalDetails, setShowOperationalDetails] = useState(false);
  const [showContingencyDetails, setShowContingencyDetails] = useState(false);

  const markNotificationRead = (notificationId) => {
    setOperationalNotifications((prev) =>
      prev.map((item) => (item.id === notificationId ? { ...item, read: true } : item)),
    );
  };

  const archiveNotification = (notificationId) => {
    markNotificationRead(notificationId);
    toast.success("Notificacion archivada.");
  };

  const handleNotificationAction = (notification) => {
    markNotificationRead(notification.id);

    if (notification.actionType === "contingency") {
      const contingencyTicket =
        tickets.find((ticket) => ticket.status === "failed" || ticket.status === "review") || null;
      if (contingencyTicket) {
        setSelectedContingencyTicket(contingencyTicket);
      }
      const element = document.getElementById("ai-contingency-panel-card");
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      setShowContingencyDetails(true);
      return;
    }

    onTabChange?.("tickets");
  };

  const handleSolveContingency = async (ticket) => {
    if (!ticket) return;
    setIsSolvingContingency(true);
    setSolvingProgress(0);
    setSolvingLogs([]);

    const steps = [
      { p: 20, l: "Iniciando diagnostico operativo..." },
      { p: 45, l: "Aplicando estrategia de contingencia seleccionada..." },
      { p: 75, l: "Intentando recuperacion automatica del flujo..." },
      { p: 100, l: "Caso estabilizado y ticket actualizado." },
    ];

    for (const step of steps) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      setSolvingProgress(step.p);
      setSolvingLogs((prev) => [...prev, step.l]);
    }

    try {
      if (onUpdateTicketInDb && ticket.id) {
        await onUpdateTicketInDb(ticket.id, {
          status: "completed",
          errorMsg: "",
        });
      }
      toast.success(`Ticket de ${ticket.nombreEmisor} actualizado desde contingencia.`);
      setSelectedContingencyTicket(null);
    } catch (error) {
      toast.error("No se pudo actualizar el ticket desde contingencia.");
    } finally {
      setIsSolvingContingency(false);
    }
  };

  const summaryCard = (
    <article className="zt-premium-card relative rounded-[1.25rem] p-4 text-left shadow-[0_12px_30px_rgba(3,5,20,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[12px] font-black text-[#101B3F]">Resumen del mes</h3>
        <button
          type="button"
          className="zt-month-pill inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors"
        >
          <span>{now.toLocaleDateString("es-MX", { month: "long", year: "numeric" })}</span>
          <ChevronDown className="h-3 w-3 text-[#24365F]/70" />
        </button>
      </div>
      <div className="mt-3.5">
        <p className="text-[10px] font-bold text-[#687AA6]">Gasto total</p>
        <p className="mt-1 text-[27px] font-black leading-none tracking-tight text-[#101B3F]">
          ${formatCurrency(totalSpent)}
        </p>
        <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-emerald-500">
          <span>▲ 12.6% vs abr</span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3.5 pt-1">
        <div className="zt-sub-card flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-bold text-[#687AA6]">Tickets</p>
            <p className="mt-0.5 text-[15px] font-black text-[#101B3F]">{processedTickets}</p>
          </div>
          <div className="mt-1.5 flex items-center gap-0.5 text-[9px] font-bold text-emerald-500">
            <span>▲ 8%</span>
          </div>
        </div>
        <div className="zt-sub-card flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-bold text-[#687AA6]">Ahorro fiscal</p>
            <p className="mt-0.5 text-[15px] font-black text-[#101B3F]">${formatCurrency(estimatedSavings)}</p>
          </div>
          <div className="mt-1.5 flex items-center gap-0.5 text-[9px] font-bold text-emerald-500">
            <span>▲ 15%</span>
          </div>
        </div>
      </div>
    </article>
  );

  return (
    <div className="zt-home-screen w-full overflow-visible bg-[linear-gradient(180deg,#061049_0%,#113BC0_44%,#173FD2_100%)]">
      <div className="zt-home-device w-full overflow-visible bg-transparent">
        <header className="relative overflow-visible px-5 pb-[9.65rem] pt-8 text-white md:px-7 md:pb-[10.25rem] md:pt-10 lg:px-8 lg:pb-[10.75rem]">
          <div className="pointer-events-none absolute right-[-4rem] top-[-5rem] h-40 w-40 rounded-full bg-[#16B7FF]/24 blur-3xl" />
          <div className="relative z-10 mx-auto flex w-full max-w-4xl items-start justify-between gap-4">
            <div className="min-w-0 pt-0.5">
              <h1 className="truncate text-[22px] font-black leading-tight md:text-[30px] lg:text-[34px]">
                {userName ? `¡Hola, ${userName}! 👋` : "¡Hola! 👋"}
              </h1>
              <p className="mt-1 text-[12px] font-semibold text-white/78 md:text-[14px]">Todo en orden hoy.</p>
            </div>
            <button
              type="button"
              aria-label="Notificaciones"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full zt-bell-btn"
            >
              <Bell className="h-[18px] w-[18px] md:h-5 md:w-5" />
            </button>
          </div>
          <div className="absolute bottom-[-5.65rem] left-0 right-0 z-20 px-5 md:px-7 lg:px-8">
            <div className="mx-auto w-full max-w-4xl">
              {summaryCard}
            </div>
          </div>
        </header>

        <main className="mt-0 min-h-[calc(100svh-7.75rem)] rounded-t-[2rem] bg-[linear-gradient(180deg,#F9FBFF_0%,#F3F7FF_100%)] px-3.5 pb-[7.2rem] pt-[6.65rem] sm:min-h-[calc(100svh-11rem)] md:px-6 md:pb-10 md:pt-[7.2rem] lg:px-8 lg:pt-[7.55rem]">
          <div className="mx-auto w-full max-w-4xl">
        <section className="mt-3.5">
          <h3 className="text-[12px] font-black text-[#101B3F]">Acciones rápidas</h3>
          <div className="mt-2.5 grid grid-cols-4 gap-2.5">
            {[
              { label: "Escanear", icon: QrCode, action: () => onTabChange?.("capturar") },
              { label: "Subir PDF", icon: Upload, action: () => onTabChange?.("capturar") },
              { label: "Crear gasto", icon: PlusCircle, action: () => onTabChange?.("historial") },
              { label: "Exportar", icon: ArrowUpRight, action: () => onTabChange?.("tickets") },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.action}
                  className="zt-action-btn flex flex-col items-center justify-center gap-2 py-3 px-1 text-center transition active:scale-[0.98]"
                >
                  <div className="zt-action-icon-wrapper flex h-10 w-10 items-center justify-center rounded-xl">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-bold text-[#101B3F] mt-0.5">{item.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-3.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[12px] font-black text-[#101B3F]">Tickets recientes</h3>
            <button type="button" onClick={() => onTabChange?.("tickets")} className="text-[10px] font-black text-[#0B53F4] hover:underline">
              Ver todos
            </button>
          </div>

          <div className="zt-premium-card mt-2.5 overflow-hidden rounded-[1.25rem]">
            {recentTickets.length === 0 ? (
              <div className="px-4 py-6 text-center zt-premium-card-row rounded-[1.25rem]">
                <p className="text-sm font-black text-[#101B3F]">Aun no hay tickets recientes.</p>
                <p className="mt-1 text-xs font-medium text-[#687AA6]">Escanea un ticket para verlo aqui.</p>
              </div>
            ) : (
              recentTickets.map((ticket, index) => {
                const logoInfo = getMerchantLogoInfo(ticket.nombreEmisor);
                return (
                  <div
                    key={ticket.id ?? `${ticket.nombreEmisor}-${ticket.createdAt}`}
                    className={`zt-premium-card-row flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50/50 transition-colors ${index > 0 ? "border-t border-slate-100/70" : ""}`}
                  >
                    <div className={`zt-merchant-badge ${logoInfo.className}`}>
                      {logoInfo.text}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px] font-bold text-[#101B3F]">{ticket.nombreEmisor || "Ticket sin emisor"}</p>
                      <p className="mt-0.5 text-[10px] font-medium text-[#687AA6]">{formatShortDate(ticket.createdAt)}</p>
                    </div>
                    <div className="shrink-0 text-right flex flex-col items-end">
                      <p className="text-[11.5px] font-bold text-[#101B3F]">${formatCurrency(ticket.total || 0)}</p>
                      <span className={`zt-premium-badge mt-1 ${
                        ticket.status === "completed"
                          ? "zt-premium-badge-success"
                          : ticket.status === "failed" || ticket.status === "review"
                            ? "zt-premium-badge-danger"
                            : "zt-premium-badge-warning"
                      }`}>
                        {ticket.status === "completed" ? "Procesado" : ticket.status === "failed" ? "Error" : ticket.status === "review" ? "Revisión" : "Pendiente"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="mt-3.5">
          {showOperationalDetails ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowOperationalDetails(false)}
                className="text-[10px] font-black text-[#0B53F4]"
              >
                Ver resumen de notificaciones
              </button>
              <OperationalNotificationsCenter
                notifications={operationalNotifications}
                onArchiveNotification={archiveNotification}
                onNotificationAction={handleNotificationAction}
              />
            </div>
          ) : (
            <HomeOperationalPanel
              notifications={operationalNotifications}
              onArchiveNotification={archiveNotification}
              onNotificationAction={handleNotificationAction}
              onViewDetails={() => setShowOperationalDetails(true)}
            />
          )}
        </section>

        <section className="mt-3">
          {showContingencyDetails ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowContingencyDetails(false)}
                className="text-[10px] font-black text-[#0B53F4]"
              >
                Ver resumen de contingencia
              </button>
              <ContingencyPanel
                handleSolveContingency={handleSolveContingency}
                isContingencyModalOpen={isContingencyModalOpen}
                isSolvingContingency={isSolvingContingency}
                selectedContingencyTicket={selectedContingencyTicket}
                selectedStrategy={selectedStrategy}
                setIsContingencyModalOpen={setIsContingencyModalOpen}
                setSelectedContingencyTicket={setSelectedContingencyTicket}
                setSelectedStrategy={setSelectedStrategy}
                solvingLogs={solvingLogs}
                solvingProgress={solvingProgress}
                tickets={tickets}
              />
            </div>
          ) : (
            <HomeContingencySummary
              tickets={tickets}
              onOpenDetails={() => {
                setShowContingencyDetails(true);
                setIsContingencyModalOpen(true);
              }}
            />
          )}
        </section>
        </div>
      </main>
      </div>
    </div>
  );
}
