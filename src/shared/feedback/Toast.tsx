import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle, AlertCircle, Info, Loader2, X } from "lucide-react";

export interface Toast {
  id: string;
  type: "success" | "error" | "info" | "loading";
  title?: string;
  message: string;
  duration?: number; // in ms. 0 or undefined for loading toasts (won't auto-dismiss)
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => string;
  removeToast: (id: string) => void;
  success: (message: string, title?: string, options?: Partial<Omit<Toast, "id" | "type" | "message">>) => string;
  error: (message: string, title?: string, options?: Partial<Omit<Toast, "id" | "type" | "message">>) => string;
  info: (message: string, title?: string, options?: Partial<Omit<Toast, "id" | "type" | "message">>) => string;
  loading: (message: string, title?: string, options?: Partial<Omit<Toast, "id" | "type" | "message">>) => string;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

interface ToastProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toastInput: Omit<Toast, "id">) => {
      const id = Math.random().toString(36).substring(2, 9);
      const duration = toastInput.duration ?? (toastInput.type === "loading" ? 0 : 5000);
      
      const newToast: Toast = {
        ...toastInput,
        id,
        duration,
      };

      setToasts((prev) => {
        // If it's a loading toast, or we have too many, we can trim or just append
        return [...prev, newToast];
      });

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }

      return id;
    },
    [removeToast]
  );

  const success = useCallback(
    (message: string, title?: string, options?: Partial<Omit<Toast, "id" | "type" | "message">>) => {
      return addToast({ type: "success", message, title, ...options });
    },
    [addToast]
  );

  const error = useCallback(
    (message: string, title?: string, options?: Partial<Omit<Toast, "id" | "type" | "message">>) => {
      return addToast({ type: "error", message, title, ...options });
    },
    [addToast]
  );

  const info = useCallback(
    (message: string, title?: string, options?: Partial<Omit<Toast, "id" | "type" | "message">>) => {
      return addToast({ type: "info", message, title, ...options });
    },
    [addToast]
  );

  const loading = useCallback(
    (message: string, title?: string, options?: Partial<Omit<Toast, "id" | "type" | "message">>) => {
      return addToast({ type: "loading", message, title, ...options });
    },
    [addToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, info, loading }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  removeToast: (id: string) => void;
}

function ToastContainer({ toasts, removeToast }: ToastContainerProps) {
  return (
    <div id="toast-container" className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 w-full max-w-sm px-4 md:px-0 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

interface ToastItemProps {
  key?: React.Key;
  toast: Toast;
  onDismiss: () => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  // Styles based on toast type
  const typeStyles = {
    success: {
      bg: "bg-white/95 border-emerald-500/30",
      accent: "bg-emerald-500",
      titleColor: "text-emerald-800",
      msgColor: "text-slate-700",
      icon: <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />,
      glow: "shadow-xl shadow-emerald-500/5",
    },
    error: {
      bg: "bg-white/95 border-rose-500/30",
      accent: "bg-rose-500",
      titleColor: "text-rose-800",
      msgColor: "text-slate-700",
      icon: <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />,
      glow: "shadow-xl shadow-rose-500/5",
    },
    info: {
      bg: "bg-white/95 border-blue-500/30",
      accent: "bg-[#0B53F4]",
      titleColor: "text-[#0B53F4]",
      msgColor: "text-slate-700",
      icon: <Info className="w-5 h-5 text-[#0B53F4] shrink-0" />,
      glow: "shadow-xl shadow-blue-500/5",
    },
    loading: {
      bg: "bg-white/90 border-[#FFB200]/40",
      accent: "bg-gradient-to-b from-[#FFB200] to-rose-500",
      titleColor: "text-slate-900",
      msgColor: "text-slate-600 font-medium",
      icon: (
        <div className="relative w-6 h-6 shrink-0 flex items-center justify-center">
          {/* Custom Dual-color Rotating Spinner matching the screenshot */}
          <span className="absolute w-5.5 h-5.5 rounded-full border-3 border-rose-500/10 border-t-rose-500 animate-spin" />
          <span className="absolute w-5.5 h-5.5 rounded-full border-3 border-transparent border-b-[#FFB200] border-r-[#FFB200] animate-spin [animation-duration:1.2s]" />
        </div>
      ),
      glow: "shadow-2xl shadow-rose-500/10",
    },
  };

  const currentStyles = typeStyles[toast.type];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, y: 10, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
      className={`pointer-events-auto flex items-stretch border backdrop-blur-md rounded-2xl overflow-hidden shadow-2xl relative w-full ${currentStyles.bg} ${currentStyles.glow}`}
    >
      {/* Dynamic Colored Left Accent Strip */}
      <div className={`w-1.5 shrink-0 ${currentStyles.accent}`} />

      {/* Content wrapper */}
      <div className="flex-1 p-4 flex items-center gap-3">
        {currentStyles.icon}
        <div className="flex-1 min-w-0 pr-2">
          {toast.title && (
            <h4 className={`text-xs font-black uppercase tracking-wider mb-0.5 select-none ${currentStyles.titleColor}`}>
              {toast.title}
            </h4>
          )}
          <p className={`text-xs leading-relaxed break-words font-sans ${currentStyles.msgColor}`}>
            {toast.message}
          </p>

          {/* Optional Action Button */}
          {toast.action && (
            <button
              onClick={() => {
                toast.action?.onClick();
                onDismiss();
              }}
              className="mt-2.5 text-[10px] font-black uppercase tracking-widest text-[#0B53F4] hover:text-white bg-[#0B53F4]/10 hover:bg-[#0B53F4] border border-[#0B53F4]/20 px-3 py-1.5 rounded-lg transition"
            >
              {toast.action.label}
            </button>
          )}
        </div>

        {/* Manual Dismiss Button */}
        <button
          onClick={onDismiss}
          className="text-slate-400 hover:text-slate-750 p-1 rounded-lg transition"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
