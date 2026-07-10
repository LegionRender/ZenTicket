import React, { useState } from "react";
import { DiagnosticsTable } from "./DiagnosticsTable";
import { Info, AlertTriangle } from "lucide-react";

interface UsersMasterDetailProps {
  users: any[];
  selectedUserId: string | null;
  onSelectUser: (userId: string) => void;
  onOpenTicketDetail: (ticketId: string) => void;
  userVisibility?: "real" | "incomplete" | "mock" | "all";
  onUserVisibilityChange?: (visibility: "real" | "incomplete" | "mock" | "all") => void;
}

export const UsersMasterDetail: React.FC<UsersMasterDetailProps> = ({
  users,
  selectedUserId,
  onSelectUser,
  onOpenTicketDetail,
  userVisibility = "real",
  onUserVisibilityChange
}) => {
  const [subFilter, setSubFilter] = useState<"all" | "issues" | "no_tickets" | "incomplete">("all");
  const [cleanupRequestedUserId, setCleanupRequestedUserId] = useState<string | null>(null);

  // Helper to get initials for avatar
  const getInitials = (name: string) => {
    if (!name) return "U";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // 1. Filter users based on left-sidebar tab subFilter
  const filteredUsers = users.filter(u => {
    if (userVisibility === "incomplete" || userVisibility === "mock") {
      return true;
    }
    if (subFilter === "issues") {
      return u.userStatus === "with_issues";
    }
    if (subFilter === "no_tickets") {
      return u.userStatus === "without_tickets";
    }
    return true;
  });

  // Resolve currently active user ID in the filtered subset
  const activeUserId = filteredUsers.some(u => u.userId === selectedUserId)
    ? selectedUserId
    : (filteredUsers[0]?.userId || null);

  const selectedUser = filteredUsers.find(u => u.userId === activeUserId) || filteredUsers[0];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "with_issues":
        return <span className="zt-badge zt-badge-attention select-none">Activo</span>;
      case "with_activity":
        return <span className="zt-badge zt-badge-process select-none">Activo</span>;
      case "ready_only":
        return <span className="zt-badge zt-badge-ok select-none">Solo listos</span>;
      case "incomplete_profile":
        return <span className="zt-badge zt-badge-error select-none">Perfil incompleto</span>;
      case "without_tickets":
        return <span className="zt-badge zt-badge-archived select-none">Sin tickets</span>;
      default:
        return null;
    }
  };

  const handleCleanupReview = (user: any) => {
    setCleanupRequestedUserId(user.userId);
    alert(
      `Marcado administrativamente para revisión de limpieza:\n` +
      `- cleanupReviewRequested: true\n` +
      `- cleanupReviewRequestedAt: ${new Date().toISOString()}\n` +
      `- cleanupReviewRequestedBy: admin@zenticket.mx\n` +
      `- cleanupReason: Perfil incompleto sin actividad útil`
    );
  };

  const handleTabClick = (tabKey: string) => {
    if (tabKey === "incomplete") {
      setSubFilter("incomplete");
      onUserVisibilityChange?.("incomplete");
    } else if (tabKey === "mock") {
      setSubFilter("all");
      onUserVisibilityChange?.("mock");
    } else {
      setSubFilter(tabKey as any);
      onUserVisibilityChange?.("real");
    }
  };

  return (
    <div className="zt-master-detail min-h-[720px] lg:max-h-[calc(100vh-260px)] w-full">
      
      {/* Left Column: Users list (Width: 32%) */}
      <div className="h-full flex flex-col min-h-[720px] lg:max-h-[calc(100vh-260px)] bg-[var(--zt-bg-surface)] border border-[var(--zt-border-subtle)] rounded-3xl p-5 shadow-sm space-y-4 overflow-hidden">
        <div className="flex justify-between items-center pb-2.5 border-b border-[var(--zt-border-subtle)] shrink-0">
          <h3 className="zt-title-section text-xs uppercase tracking-wider">
            Usuarios del sistema
          </h3>
          <span className="zt-badge zt-badge-process text-[10px]">
            {filteredUsers.length}
          </span>
        </div>

        {/* Sub-Filters / Tabs */}
        <div className="flex flex-wrap gap-1 bg-[var(--zt-bg-surface-soft)] p-1 rounded-xl border border-[var(--zt-border-subtle)] shrink-0">
          {[
            { key: "all", label: "Todos" },
            { key: "issues", label: "Con incidencias" },
            { key: "no_tickets", label: "Sin tickets" },
            { key: "incomplete", label: "Incompletos" },
            { key: "mock", label: "Mocks" }
          ].map(tab => {
            const isActive =
              (tab.key === "incomplete" && userVisibility === "incomplete") ||
              (tab.key === "mock" && userVisibility === "mock") ||
              (tab.key !== "incomplete" && tab.key !== "mock" && userVisibility === "real" && subFilter === tab.key);

            return (
              <button
                key={tab.key}
                onClick={() => handleTabClick(tab.key)}
                className={`flex-1 text-[10px] font-bold py-1.5 px-2 rounded-lg transition-all cursor-pointer whitespace-nowrap text-center border ${
                  isActive
                    ? "bg-[var(--zt-bg-surface-strong)] border-[var(--zt-accent-secondary)] text-[var(--zt-accent-secondary)]"
                    : "bg-[var(--zt-bg-surface-soft)] border-[var(--zt-border-default)] text-[var(--zt-text-secondary)] hover:bg-[var(--zt-bg-elevated)] hover:border-[var(--zt-border-strong)] hover:text-[var(--zt-text-primary)]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[9px] text-[var(--zt-text-muted)] font-semibold justify-center pb-2 border-b border-[var(--zt-border-subtle)] shrink-0">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full zt-dot-error"></span>Errores</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full zt-dot-alert"></span>Atención</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full zt-dot-queue"></span>En proceso</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full zt-dot-ok"></span>Listos</span>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-2">
          {filteredUsers.length > 0 ? (
            filteredUsers.map(u => {
              const isSelected = u.userId === activeUserId;
              
              // Map counts: failed/errors, attention, inProcess, ready
              const errors = (u.counts?.failed || 0) + (u.counts?.errors || 0);
              const attention = u.counts?.attention || 0;
              const process = u.counts?.inProcess || 0;
              const ready = u.counts?.ready || 0;
 
              return (
                <div
                  key={u.userId}
                  onClick={() => onSelectUser(u.userId)}
                  className={`zt-user-card ${
                    isSelected ? "zt-user-card-selected" : ""
                  } flex flex-col gap-2`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Initials Avatar */}
                      <div className="w-8 h-8 rounded-full bg-[var(--zt-accent-primary)] text-[var(--zt-bg-surface)] font-bold text-xs flex items-center justify-center shrink-0">
                        {getInitials(u.userDisplayName || u.displayName)}
                      </div>
                      <div className="min-w-0 truncate">
                        <div className="font-bold text-[var(--zt-text-primary)] text-xs truncate">
                          {u.userDisplayName || u.displayName || "Usuario"}
                        </div>
                        <div className="text-[10px] text-[var(--zt-text-muted)] font-semibold truncate">
                          {u.email || "Sin correo"}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 ml-1">
                      {getStatusBadge(u.userStatus)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-[var(--zt-border-subtle)] pt-1.5 mt-0.5">
                    <div className="flex items-center gap-1">
                      {errors > 0 && <span className="zt-badge zt-badge-error px-1.5 py-0.5 rounded-lg text-[9px] font-bold">{errors}</span>}
                      {attention > 0 && <span className="zt-badge zt-badge-attention px-1.5 py-0.5 rounded-lg text-[9px] font-bold">{attention}</span>}
                      {process > 0 && <span className="zt-badge zt-badge-process px-1.5 py-0.5 rounded-lg text-[9px] font-bold">{process}</span>}
                      {ready > 0 && <span className="zt-badge zt-badge-ok px-1.5 py-0.5 rounded-lg text-[9px] font-bold">{ready}</span>}
                      {errors === 0 && attention === 0 && process === 0 && ready === 0 && (
                        u.userStatus === "incomplete_profile" ? (
                          <span className="zt-badge zt-badge-error px-1.5 py-0.5 rounded-lg text-[9px] font-bold">Incompleto</span>
                        ) : (
                          <span className="zt-badge zt-badge-archived px-1.5 py-0.5 rounded-lg text-[9px] font-bold">Sin tickets</span>
                        )
                      )}
                    </div>
                    <span className="zt-muted text-sm font-semibold select-none ml-1">›</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-xs zt-muted font-medium">
              No hay usuarios en esta categoría
            </div>
          )}
        </div>

        <button
          onClick={() => setSubFilter("all")}
          className="zt-btn zt-btn-ghost text-xs w-full text-center pt-2 border-t border-[var(--zt-border-subtle)] shrink-0"
        >
          Ver todos los usuarios
        </button>
      </div>

      {/* Right Column: Selected User details (Width: 68%) */}
      <div className="h-full flex flex-col min-h-[720px] lg:max-h-[calc(100vh-260px)] space-y-4">
        {selectedUser ? (
          <div className="h-full flex flex-col min-h-[720px] lg:max-h-[calc(100vh-260px)] rounded-3xl bg-[var(--zt-bg-surface)] border border-[var(--zt-border-subtle)] p-6 overflow-hidden shadow-sm">
            
            {/* User selection header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-[var(--zt-border-subtle)] shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-[36px] h-[36px] rounded-full bg-[var(--zt-accent-primary)] text-[var(--zt-bg-surface)] font-bold text-sm flex items-center justify-center shrink-0 select-none">
                  {getInitials(selectedUser.userDisplayName || selectedUser.displayName)}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[16px] font-bold leading-tight text-[var(--zt-text-primary)] truncate" title={`Usuario seleccionado: ${selectedUser.userDisplayName || selectedUser.displayName}`}>
                    Usuario seleccionado: {selectedUser.userDisplayName || selectedUser.displayName}
                  </h3>
                  <span className="text-[12px] font-medium text-[var(--zt-text-muted)] leading-[1.35] truncate block mt-0.5">
                    {selectedUser.email} · ID: USR-{selectedUser.userId ? selectedUser.userId.slice(0, 5).toUpperCase() : "S/D"}
                  </span>
                </div>
              </div>
              <div className="text-[12px] font-bold shrink-0 flex items-center gap-1.5 self-end sm:self-center">
                <span className="text-[var(--zt-error-text)] font-semibold">
                  {((selectedUser.counts?.failed || 0) + (selectedUser.counts?.errors || 0)) + (selectedUser.counts?.attention || 0)} incidencias
                </span>
                <span className="text-[var(--zt-text-muted)]">·</span>
                <span className="text-[var(--zt-ok-text)] font-semibold">{selectedUser.counts?.ready || 0} listo{selectedUser.counts?.ready !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* Content Switcher: Table if tickets exist, otherwise detailed card */}
            {selectedUser.items && selectedUser.items.length > 0 ? (
              (() => {
                const activeItems = selectedUser.items.filter((item: any) => item.bucket !== "archived");

                return (
                  <>
                    {/* Table list of selectedUser's active items */}
                    <div className="flex-1 overflow-y-auto pr-1 mt-[20px] border-t border-[var(--zt-border-subtle)] pt-[16px] space-y-6">
                      {activeItems.length > 0 ? (
                        <DiagnosticsTable items={activeItems} onSelect={onOpenTicketDetail} />
                      ) : (
                        <div className="text-center py-8 text-xs font-semibold text-[var(--zt-text-muted)]">
                          Sin incidencias de facturación activas.
                        </div>
                      )}
                    </div>

                    {/* Table Footer / Pagination */}
                    <div className="flex justify-between items-center text-[var(--zt-text-muted)] text-[10px] font-bold uppercase tracking-wider pt-2 border-t border-[var(--zt-border-subtle)] shrink-0">
                      <span>Mostrando 1-{activeItems.length} de {activeItems.length} activos</span>
                      <div className="flex items-center gap-1">
                        <button className="zt-btn zt-btn-secondary zt-btn-sm !py-1 !px-2 rounded opacity-50 cursor-not-allowed">‹</button>
                        <button className="zt-btn zt-btn-primary py-1 px-3 text-xs">1</button>
                        <button className="zt-btn zt-btn-secondary zt-btn-sm !py-1 !px-2 rounded opacity-50 cursor-not-allowed">›</button>
                      </div>
                    </div>
                  </>
                );
              })()
            ) : (
              <div className="flex-1 overflow-y-auto pr-1 space-y-4">
                <div className="bg-[var(--zt-bg-surface)] border border-[var(--zt-border-subtle)] rounded-2xl p-5 space-y-4">
                  <div className="text-center py-6 space-y-2 flex flex-col items-center">
                    <Info className="w-8 h-8 text-[var(--zt-text-muted)]" />
                    <h4 className="font-bold text-[var(--zt-text-primary)] text-sm">
                      {selectedUser.userStatus === "incomplete_profile"
                        ? "Este usuario tiene un perfil incompleto."
                        : "Este usuario está registrado pero aún no tiene tickets."}
                    </h4>
                    <p className="zt-caption max-w-md mx-auto">
                      {selectedUser.userStatus === "incomplete_profile"
                        ? "El usuario tiene registros pendientes en la base de datos (perfil Firestore o SAT incompleto)."
                        : "Este registro de usuario no tiene facturas o incidencias asociadas en este entorno."}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="bg-[var(--zt-bg-surface-soft)] p-3 rounded-lg border border-[var(--zt-border-subtle)] space-y-2">
                      <div className="zt-label uppercase tracking-wider text-[10px]">Detalles de Firebase Auth</div>
                      <div><span className="zt-muted">UID:</span> <code className="zt-mono text-[var(--zt-accent-secondary)]">{selectedUser.userId}</code></div>
                      <div><span className="zt-muted">Email:</span> <span className="zt-body">{selectedUser.email}</span></div>
                      <div><span className="zt-muted">Fecha Creación:</span> <span className="zt-body">{selectedUser.metadata?.creationTime ? new Date(selectedUser.metadata.creationTime).toLocaleString() : "S/D"}</span></div>
                      <div><span className="zt-muted">Último Acceso:</span> <span className="zt-body">{selectedUser.metadata?.lastSignInTime ? new Date(selectedUser.metadata.lastSignInTime).toLocaleString() : "S/D"}</span></div>
                    </div>

                    <div className="bg-[var(--zt-bg-surface-soft)] p-3 rounded-lg border border-[var(--zt-border-subtle)] space-y-2">
                      <div className="zt-label uppercase tracking-wider text-[10px]">Integridad del Perfil</div>
                      <div className="flex justify-between">
                        <span className="zt-muted">Registro Firebase Auth:</span>
                        <span className={selectedUser.source?.auth ? "text-[var(--zt-ok-text)] font-bold" : "text-[var(--zt-error-text)] font-bold"}>
                          {selectedUser.source?.auth ? "Sí" : "No"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="zt-muted">Perfil Firestore:</span>
                        <span className={selectedUser.source?.firestoreProfile ? "text-[var(--zt-ok-text)] font-bold" : "text-[var(--zt-error-text)] font-bold"}>
                          {selectedUser.source?.firestoreProfile ? "Sí" : "No"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="zt-muted">Perfil Fiscal (SAT):</span>
                        <span className={selectedUser.source?.fiscalProfile ? "text-[var(--zt-ok-text)] font-bold" : "text-[var(--zt-error-text)] font-bold"}>
                          {selectedUser.source?.fiscalProfile ? "Sí" : "No"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-[var(--zt-bg-surface-soft)] p-2.5 rounded-lg border border-[var(--zt-border-subtle)]">
                      <div className="zt-label text-[10px]">TICKETS</div>
                      <div className="font-bold text-[var(--zt-text-primary)] mt-1">{selectedUser.ticketCount || 0}</div>
                    </div>
                    <div className="bg-[var(--zt-bg-surface-soft)] p-2.5 rounded-lg border border-[var(--zt-border-subtle)]">
                      <div className="zt-label text-[10px]">INVOICES</div>
                      <div className="font-bold text-[var(--zt-text-primary)] mt-1">{selectedUser.invoiceCount || 0}</div>
                    </div>
                    <div className="bg-[var(--zt-bg-surface-soft)] p-2.5 rounded-lg border border-[var(--zt-border-subtle)]">
                      <div className="zt-label text-[10px]">JOBS</div>
                      <div className="font-bold text-[var(--zt-text-primary)] mt-1">{selectedUser.jobCount || 0}</div>
                    </div>
                  </div>

                  {cleanupRequestedUserId === selectedUser.userId && (
                    <div className="zt-alert zt-alert-attention p-3 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-[var(--zt-alert-text)] shrink-0" />
                      <span>Este usuario ha sido marcado administrativamente para revisión de limpieza.</span>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t border-[var(--zt-border-subtle)]">
                    {selectedUser.userStatus === "incomplete_profile" && (
                      <button
                        onClick={() => handleCleanupReview(selectedUser)}
                        className="zt-btn zt-btn-outline zt-badge-attention text-xs py-2 px-4"
                      >
                        Revisar para limpieza
                      </button>
                    )}
                    <button
                      onClick={() => alert(`Visualizando perfil completo de USR-${selectedUser.userId.slice(0, 5).toUpperCase()}`)}
                      className="zt-btn zt-btn-primary text-xs py-2 px-4"
                    >
                      Ver perfil
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        ) : (
          <div className="zt-panel text-center text-[var(--zt-text-muted)] flex items-center justify-center h-full">
            Selecciona un usuario de la lista para ver su historial de facturación.
          </div>
        )}
      </div>

    </div>
  );
};
