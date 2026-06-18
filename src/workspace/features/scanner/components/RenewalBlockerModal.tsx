import { CreditCard, ShieldAlert } from "lucide-react";
import type { FiscalProfile } from "@/types";

interface RenewalBlockerModalProps {
  blockerReason: "limit" | "month" | null;
  fiscalProfile: FiscalProfile | null;
  isProcessingRenewalPay: boolean;
  onCancel: () => void;
  onRenew: () => void;
  onViewPlans: () => void;
}

export function RenewalBlockerModal({
  blockerReason,
  fiscalProfile,
  isProcessingRenewalPay,
  onCancel,
  onRenew,
  onViewPlans
}: RenewalBlockerModalProps) {
  return (
    <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-md flex flex-col justify-center items-center p-6 text-center animate-fade-in">
      <div className="max-w-md bg-white border border-slate-100 rounded-3xl p-8 shadow-[var(--shadow-elevated)] flex flex-col items-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
            {blockerReason === "limit" ? "Limite de Facturas Alcanzado" : "Mes de Cobertura Vencido"}
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed font-semibold">
            {blockerReason === "limit"
              ? `Has alcanzado el limite de tu plan actual (${fiscalProfile?.plan === "personal" ? "20" : fiscalProfile?.plan === "empresa" ? "60" : "5"} facturas).`
              : "Tu cobertura mensual de facturacion ha vencido desde tu ultima fecha de pago."
            } Para seguir timbrando facturas, debes de renovar tu paquete. Deseas proceder con el pago mensual ahora?
          </p>
        </div>

        <div className="w-full bg-slate-50 rounded-2.5xl p-4.5 text-left border border-slate-200/50 space-y-3">
          <span className="text-[9.5px] font-black text-slate-400 uppercase tracking-widest block font-mono">
            DETALLE DE TRANSACCION
          </span>
          <div className="flex justify-between items-center text-xs font-bold">
            <span className="text-slate-600">Suscripcion actual:</span>
            <span className="text-slate-900 font-extrabold capitalize">
              {fiscalProfile?.plan === "personal" ? "Plan Personal (20 facturas)" : fiscalProfile?.plan === "empresa" ? "Plan Empresa (60 facturas)" : "Plan Gratuito (5 facturas)"}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs font-bold pt-1.5 border-t border-slate-100">
            <span className="text-slate-600">Costo mensual:</span>
            <span className="text-[#0B53F4] font-black text-sm">
              {fiscalProfile?.plan === "personal" ? "$150.00 MXN" : fiscalProfile?.plan === "empresa" ? "$300.00 MXN" : "Contratar Plan ($150 - $300 MXN)"}
            </span>
          </div>
        </div>

        <div className="w-full flex gap-3 pt-2">
          <button
            type="button"
            onClick={onViewPlans}
            className="flex-1 py-3 px-4.5 bg-slate-150 hover:bg-slate-200 text-slate-700 text-xs font-black rounded-xl transition cursor-pointer text-center"
          >
            Ver Planes
          </button>

          {fiscalProfile?.plan !== "gratuito" ? (
            <button
              type="button"
              disabled={isProcessingRenewalPay}
              onClick={onRenew}
              className="flex-3 py-3 px-4.5 bg-[#0B53F4] hover:bg-[#0747D1] disabled:opacity-50 text-white text-xs font-black rounded-xl transition cursor-pointer text-center flex items-center justify-center gap-1.5 shadow-[var(--shadow-surface)]"
            >
              {isProcessingRenewalPay ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Procesando pago...</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  <span>Renovar Ahora</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onViewPlans}
              className="flex-3 py-3 px-4.5 bg-[#0B53F4] hover:bg-[#0747D1] text-white text-xs font-black rounded-xl transition cursor-pointer text-center font-bold shadow-[var(--shadow-surface)]"
            >
              Contratar Plan
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="text-slate-400 hover:text-slate-600 text-[10.5px] font-bold underline cursor-pointer bg-transparent border-none mt-2"
        >
          Cancelar y regresar
        </button>
      </div>
    </div>
  );
}
