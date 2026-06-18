import React, { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Bell, X } from "lucide-react";

import { getRelativeTimeText } from "@/workspace/features/scanner/scannerHelpers";
import type {
  NotificationTab,
  OperationalNotification
} from "@/workspace/features/scanner/scanner.types";

interface OperationalNotificationsCenterProps {
  notifications: OperationalNotification[];
  onArchiveNotification: (notificationId: string) => void;
  onNotificationAction: (notification: OperationalNotification) => void;
}

const NOTIFICATION_TABS: Array<{ id: NotificationTab; label: string }> = [
  { id: "todas", label: "Todas" },
  { id: "pendientes", label: "Pendientes" },
  { id: "facturas", label: "Facturas" },
  { id: "gastos", label: "Gastos" },
  { id: "cuenta", label: "Cuenta" }
];

function filterNotifications(
  notifications: OperationalNotification[],
  activeTab: NotificationTab
) {
  return notifications.filter((notification) => {
    if (activeTab === "todas") return true;
    if (activeTab === "pendientes") return notification.criticality === "critica";
    return notification.category === activeTab;
  });
}

function getNotificationStyles(notification: OperationalNotification) {
  const isCritical = notification.criticality === "critica";
  const isImportant = notification.criticality === "importante";

  return {
    badgeStyle: isCritical
      ? "bg-rose-105 text-rose-700"
      : isImportant
        ? "bg-amber-105 text-amber-700"
        : "bg-blue-55 text-[#0B53F4]",
    borderStyle: isCritical
      ? "border-rose-100 bg-rose-50/20"
      : isImportant
        ? "border-amber-100 bg-amber-50/20"
        : "border-[#E4ECFE] bg-blue-50/10",
    dotStyle: isCritical
      ? "bg-rose-500"
      : isImportant
        ? "bg-amber-500"
        : "bg-[#0153F4]"
  };
}

interface NotificationItemProps {
  notification: OperationalNotification;
  onArchiveNotification: (notificationId: string) => void;
  onNotificationAction: (notification: OperationalNotification) => void;
  textTone?: string;
  textLeft?: boolean;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onArchiveNotification,
  onNotificationAction,
  textTone = "text-slate-400",
  textLeft = false
}) => {
  const { badgeStyle, borderStyle, dotStyle } = getNotificationStyles(notification);

  return (
    <div
      className={`border ${borderStyle} rounded-[1rem] p-3.5 space-y-2 transition duration-150 relative ${textLeft ? "text-left " : ""}${!notification.read ? "shadow-[var(--shadow-surface)] border-l-4 border-l-[#0B53F4]" : "opacity-85"}`}
    >
      <div className="flex justify-between items-start gap-4">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${dotStyle} shrink-0 ${!notification.read ? "animate-pulse" : ""}`} />
          <span className="text-[11px] font-black uppercase text-slate-800 tracking-wide font-sans leading-none">
            {notification.title}
          </span>
        </div>
        <span className={`text-[10px] font-bold shrink-0 ${textTone}`}>
          {getRelativeTimeText(notification.createdAt)}
        </span>
      </div>

      <p className={`text-[11px] text-slate-550 leading-relaxed font-sans font-medium${textLeft ? "" : " select-text"}`}>
        {notification.message}
      </p>

      <div className="flex items-center justify-between pt-1 border-t border-slate-100/50">
        <div className="flex items-center gap-1.5">
          <span className={`text-[8.5px] font-black px-2 py-0.5 rounded-md ${badgeStyle} uppercase font-mono`}>
            {notification.criticality === "critica"
              ? "Critico"
              : notification.criticality === "importante"
                ? "Alerta"
                : "Informacion"}
          </span>
          <span className="text-[9px] text-slate-450 font-bold uppercase tracking-wider font-mono bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded-md">
            {notification.category}
          </span>
        </div>

        <div className="flex gap-2">
          {!notification.read && (
            <button
              type="button"
              onClick={() => onArchiveNotification(notification.id)}
              className="text-[9.5px] font-bold text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer outline-none"
            >
              Archivar
            </button>
          )}
          <button
            type="button"
            onClick={() => onNotificationAction(notification)}
            className="bg-slate-100 hover:bg-[#0B53F4]/5 text-[#0B53F4] text-[10px] font-black px-3 py-1.5 rounded-lg cursor-pointer transition border border-slate-200/50"
          >
            {notification.actionText}
          </button>
        </div>
      </div>
    </div>
  );
};

export function OperationalNotificationsCenter({
  notifications,
  onArchiveNotification,
  onNotificationAction
}: OperationalNotificationsCenterProps) {
  const [activeNotificationTab, setActiveNotificationTab] = useState<NotificationTab>("todas");
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);

  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const filteredNotifications = filterNotifications(notifications, activeNotificationTab);
  const previewNotifications = filteredNotifications.slice(0, 3);

  return (
    <>
      <div className="bg-white text-slate-800 rounded-[1.15rem] p-4 shadow-[var(--shadow-surface)] space-y-4 text-left relative overflow-hidden border border-slate-200/70">
        <div className="absolute top-0 right-0 w-36 h-36 bg-blue-500/4 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#0B53F4] flex items-center justify-center">
              <Bell className="w-5 h-5 stroke-[2.3]" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-black text-[#0B53F4]/80 tracking-wider block font-mono">
                  Alertas
              </span>
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                Notificaciones Operativas
              </h3>
            </div>
          </div>
          <span className="bg-rose-50 border border-rose-200 text-rose-700 text-[10.5px] font-bold px-2.5 py-1 rounded-xl flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
            </span>
            <span>{unreadCount} Ineditas</span>
          </span>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed font-sans font-medium">
            Revisa incidencias activas, facturas recientes y eventos que requieren seguimiento.
        </p>

        <div className="space-y-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none select-none">
            {NOTIFICATION_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveNotificationTab(tab.id)}
                className={`px-3 py-1.5 text-[11px] font-extrabold rounded-xl transition duration-150 cursor-pointer ${
                  activeNotificationTab === tab.id
                    ? "bg-[#0B53F4] text-white"
                    : "bg-slate-50 hover:bg-slate-100 text-slate-600"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="space-y-3.5 pr-1">
            {filteredNotifications.length === 0 ? (
              <div className="py-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                <span className="text-slate-400 text-xs font-bold font-sans">
                  No hay alertas en esta categoria. Operacion limpia.
                </span>
              </div>
            ) : (
              <>
                <div className="space-y-3.5">
                  {previewNotifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onArchiveNotification={onArchiveNotification}
                      onNotificationAction={onNotificationAction}
                    />
                  ))}
                </div>

                {filteredNotifications.length > 3 && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setIsNotificationsModalOpen(true)}
                      className="w-full py-3 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-[#0B53F4] text-xs font-black uppercase rounded-xl border border-slate-200/60 transition duration-150 cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <span>Ver Todas las Alertas ({filteredNotifications.length})</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isNotificationsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsNotificationsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/35 backdrop-blur-md cursor-zoom-out"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white border border-slate-200/80 rounded-[1.15rem] p-5 shadow-[var(--shadow-elevated)] relative max-w-2xl w-full z-10 flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center justify-between border-b border-slate-105 pb-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#0B53F4] flex items-center justify-center">
                    <Bell className="w-5 h-5 stroke-[2.3]" />
                  </div>
                  <div className="text-left">
                    <span className="text-[9px] uppercase font-black text-[#0B53F4] tracking-wider block font-mono">
                        Detalle
                    </span>
                    <h3 className="text-base font-black text-slate-900 leading-tight">
                      Centro de Notificaciones (Historial Completo)
                    </h3>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsNotificationsModalOpen(false)}
                  className="w-8 h-8 rounded-full hover:bg-slate-100/80 flex items-center justify-center text-slate-400 hover:text-slate-700 transition cursor-pointer"
                >
                  <X className="w-5 h-5 stroke-[2.5]" />
                </button>
              </div>

              <div className="flex gap-1.5 overflow-x-auto py-3 border-b border-slate-100 select-none scrollbar-none">
                {NOTIFICATION_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveNotificationTab(tab.id)}
                    className={`px-3 py-1.5 text-[11px] font-extrabold rounded-xl transition duration-150 cursor-pointer whitespace-nowrap leading-none ${
                      activeNotificationTab === tab.id
                        ? "bg-[#0B53F4] text-white shadow-3xs"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-600"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto pt-4 pr-1 space-y-3.5 max-h-[50vh]">
                {filteredNotifications.length === 0 ? (
                  <div className="py-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl my-auto">
                    <span className="text-slate-400 text-xs font-bold">
                      No hay alertas disponibles en esta categoria.
                    </span>
                  </div>
                ) : (
                  filteredNotifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onArchiveNotification={onArchiveNotification}
                      onNotificationAction={(item) => {
                        setIsNotificationsModalOpen(false);
                        onNotificationAction(item);
                      }}
                      textTone="text-slate-450"
                      textLeft
                    />
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
