import React from "react";
import { Invoice } from "@/types";
import {
  PieChart, ShoppingBag,
  Utensils, Car, Home
} from "lucide-react";

interface VaultScreenProps {
  invoices: Invoice[];
  onTabChange?: (tab: "inicio" | "capturar" | "tickets" | "conectores" | "historial" | "resumen" | "cuenta" | "admin") => void;
}

export default function VaultScreen({ invoices }: VaultScreenProps) {
  // Format currency helper
  const formatCurrency = (value: number) => {
    return value.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Calculate real values from User invoices
  const realTotalSpent = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const realTransactionsCount = invoices.length;

  // Simple category solver for real data
  const getRealCategorySum = (categoryLabel: string) => {
    return invoices.reduce((sum, inv) => {
      const emisor = (inv.nombreEmisor || "").toLowerCase();
      
      if (categoryLabel === "Alimentación" && (
        emisor.includes("starbucks") || 
        emisor.includes("coffee") || 
        emisor.includes("oxxo") || 
        emisor.includes("restaurante") || 
        emisor.includes("cafe") || 
        emisor.includes("comer") ||
        emisor.includes("vips")
      )) {
        return sum + inv.total;
      }
      if (categoryLabel === "Transporte" && (
        emisor.includes("uber") || 
        emisor.includes("didi") || 
        emisor.includes("gas") || 
        emisor.includes("pemex") || 
        emisor.includes("repsol") || 
        emisor.includes("combust")
      )) {
        return sum + inv.total;
      }
      if (categoryLabel === "Vivienda" && (
        emisor.includes("renta") || 
        emisor.includes("cfe") || 
        emisor.includes("luz") || 
        emisor.includes("agua") || 
        emisor.includes("telmex") || 
        emisor.includes("telcel") || 
        emisor.includes("internet")
      )) {
        return sum + inv.total;
      }
      if (categoryLabel === "Compras" && (
        emisor.includes("walmart") || 
        emisor.includes("costco") || 
        emisor.includes("amazon") || 
        emisor.includes("mercado") || 
        emisor.includes("soriana") || 
        emisor.includes("chedraui") || 
        emisor.includes("merca")
      )) {
        return sum + inv.total;
      }
      
      // If it doesn't match and we are requesting Compras, act as fallback
      if (categoryLabel === "Compras" && 
        !(emisor.includes("starbucks") || emisor.includes("coffee") || emisor.includes("oxxo") || emisor.includes("restaurante") || emisor.includes("cafe") || emisor.includes("comer") || emisor.includes("vips")) &&
        !(emisor.includes("uber") || emisor.includes("didi") || emisor.includes("gas") || emisor.includes("pemex") || emisor.includes("repsol") || emisor.includes("combust")) &&
        !(emisor.includes("renta") || emisor.includes("cfe") || emisor.includes("luz") || emisor.includes("agua") || emisor.includes("telmex") || emisor.includes("telcel") || emisor.includes("internet"))
      ) {
        return sum + inv.total;
      }
      return sum;
    }, 0);
  };

  const alimentacionSum = getRealCategorySum("Alimentación");
  const transporteSum = getRealCategorySum("Transporte");
  const viviendaSum = getRealCategorySum("Vivienda");
  const comprasSum = getRealCategorySum("Compras");

  // Dynamic monthly aggregates
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const currentMonthIdx = new Date().getMonth();
  const last4MonthsIndices = [
    (currentMonthIdx - 3 + 12) % 12,
    (currentMonthIdx - 2 + 12) % 12,
    (currentMonthIdx - 1 + 12) % 12,
    currentMonthIdx
  ];

  const monthlyAggregates = last4MonthsIndices.map((monthIdx) => {
    const total = invoices.reduce((sum, inv) => {
      const invDate = new Date(inv.createdAt);
      if (invDate.getMonth() === monthIdx) {
        return sum + (inv.total || 0);
      }
      return sum;
    }, 0);
    return {
      label: months[monthIdx],
      total: total
    };
  });

  const maxMonthTotal = Math.max(...monthlyAggregates.map(m => m.total), 1);

  return (
    <div className="w-full space-y-5 font-body text-left mt-1 relative select-none pb-20">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* LEFT COLUMN - STATS & CHART (lg:col-span-7) */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* TOTAL GASTOS CARD */}
          <div className="zt-btn-primary hover:transform-none text-white rounded-[1.35rem] p-5 shadow-[var(--shadow-surface)] relative overflow-hidden select-none">
            {/* Subtle white circle back accent */}
            <div className="absolute top-0 right-0 w-36 h-36 bg-gradient-to-tr from-white/10 to-transparent rounded-full blur-2xl pointer-events-none" />
            
            {/* Top title and month selection label */}
            <div className="flex items-center justify-between font-display">
              <span className="text-[10px] font-black text-blue-150 uppercase tracking-widest block">
                TOTAL GASTOS REALES (MES)
              </span>
              <span className="bg-white/15 backdrop-blur-md text-[10.5px] font-bold text-white px-3.5 py-1 rounded-full leading-none">
                {months[currentMonthIdx]}
              </span>
            </div>

            {/* Large cash indicator */}
            <div className="flex items-baseline mt-4 leading-none select-none">
              <span className="text-2xl font-black text-blue-200 mr-1.5 font-display">$</span>
              <span className="text-4xl font-extrabold tracking-tight font-display">
                {formatCurrency(realTotalSpent)}
              </span>
            </div>

            {/* Lower pill values */}
            <div className="flex items-center gap-3.5 mt-5 text-[11px] font-bold leading-none">
              <span className="bg-white/15 px-3 py-1.5 rounded-full flex items-center gap-1.5">
                Realizado
              </span>
              <span className="text-blue-100/90 font-mono">
                {realTransactionsCount} {realTransactionsCount === 1 ? "transacción" : "transacciones"}
              </span>
            </div>
          </div>

          {/* EVOLUCIÓN HISTORIC MINI-CHART CARD */}
          <div className="bg-white border border-slate-200/60 rounded-[1.15rem] p-4 shadow-[var(--shadow-surface)]">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-extrabold text-[17px] text-slate-800 tracking-tight">Evolución de Gastos</h3>
              <span className="text-xs font-black text-[#0B53F4] font-display">
                {months[currentMonthIdx]}: ${realTotalSpent.toFixed(2)}
              </span>
            </div>

            {/* Dynamic graphic bars aligned horizontally */}
            <div className="flex items-end justify-between h-36 pt-6 pb-2.5 px-3">
              {monthlyAggregates.map((m, idx) => {
                const heightPercent = maxMonthTotal > 0 ? (m.total / maxMonthTotal) * 100 : 0;
                const isActive = idx === 3;
                return (
                  <div key={idx} className="flex flex-col items-center flex-1 max-w-[42px] h-full justify-end">
                    <div className="w-full flex-1 flex items-end justify-center mb-1.5">
                      <div 
                        className={`w-9 rounded-t-lg transition-all ${
                          isActive 
                            ? "bg-[#0B53F4] shadow-sm hover:bg-[#0747D1]" 
                            : "bg-[#EBF1FF] hover:bg-[#D7E4FF]"
                        }`} 
                        style={{ height: `${Math.max(heightPercent, 4)}%` }} // Minimum height 4% for design aesthetics
                        title={`${m.label}: $${m.total.toFixed(2)}`}
                      />
                    </div>
                    <span className={`text-[11px] font-bold ${isActive ? "text-[#0B53F4] font-extrabold" : "text-slate-400"}`}>
                      {m.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN - DISTRIBUTION & BREAKDOWN (lg:col-span-5) */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* DISTRIBUCIÓN PROGRESS INDICATORS CARD */}
          <div className="bg-white border border-slate-200/60 rounded-[1.15rem] p-4 shadow-[var(--shadow-surface)]">
            <div className="flex items-center justify-between pb-3.5">
              <h3 className="font-display font-extrabold text-base text-slate-800 tracking-tight">Distribución por Categorías</h3>
              <PieChart className="w-4.5 h-4.5 text-slate-400 stroke-[2.3]" />
            </div>

            {/* Core breakdown progress values bar by bar */}
            <div className="space-y-4">
              {/* Alimentación Bar */}
              <div className="space-y-1.5 text-left">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-extrabold text-slate-800 font-sans">Alimentación</span>
                  <span className="text-xs text-slate-500 font-medium font-sans">
                    ${alimentacionSum.toFixed(2)} ({realTotalSpent > 0 ? Math.round((alimentacionSum / realTotalSpent) * 100) : 0}%)
                  </span>
                </div>
                <div className="w-full bg-[#EBF1FF]/70 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-[#0B53F4] h-full rounded-full transition-all duration-300" 
                    style={{ width: `${realTotalSpent > 0 ? (alimentacionSum / realTotalSpent) * 100 : 0}%` }} 
                  />
                </div>
              </div>

              {/* Compras Bar */}
              <div className="space-y-1.5 text-left">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-extrabold text-slate-800 font-sans">Compras</span>
                  <span className="text-xs text-slate-500 font-medium font-sans">
                    ${comprasSum.toFixed(2)} ({realTotalSpent > 0 ? Math.round((comprasSum / realTotalSpent) * 100) : 0}%)
                  </span>
                </div>
                <div className="w-full bg-[#EBF1FF]/70 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-[#3B82F6] h-full rounded-full transition-all duration-300" 
                    style={{ width: `${realTotalSpent > 0 ? (comprasSum / realTotalSpent) * 100 : 0}%` }} 
                  />
                </div>
              </div>

              {/* Transporte Bar */}
              <div className="space-y-1.5 text-left">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-extrabold text-slate-800 font-sans">Transporte</span>
                  <span className="text-xs text-slate-500 font-medium font-sans">
                    ${transporteSum.toFixed(2)} ({realTotalSpent > 0 ? Math.round((transporteSum / realTotalSpent) * 100) : 0}%)
                  </span>
                </div>
                <div className="w-full bg-[#EBF1FF]/70 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-[#10B981] h-full rounded-full transition-all duration-300" 
                    style={{ width: `${realTotalSpent > 0 ? (transporteSum / realTotalSpent) * 100 : 0}%` }} 
                  />
                </div>
              </div>
            </div>
          </div>

          {/* DESGLOSE POR CATEGORÍA */}
          <div className="space-y-3">
            <div className="text-left pt-2">
              <h2 className="font-display font-extrabold text-lg text-slate-800 tracking-tight">Desglose por Categoría</h2>
            </div>

            {/* 2X2 CATEGORIES GRID CAPSULES */}
            <div className="grid grid-cols-1 gap-2.5">
              {/* Alimentación Box */}
              <div className="bg-white border border-slate-200/60 p-3 rounded-[1rem] shadow-[var(--shadow-surface)] hover:border-slate-300 transition text-left flex items-center justify-between gap-3">
                <div className="w-9 h-9 bg-[#0B53F4]/10 rounded-xl flex items-center justify-center text-[#0B53F4] shrink-0">
                  <Utensils className="w-5 h-5 stroke-[2.3]" />
                </div>
                <div className="leading-tight flex-1">
                  <span className="text-xs text-slate-450 font-bold block font-sans">Alimentación</span>
                  <span className="text-base font-black text-slate-850 mt-1 block font-sans">
                    ${alimentacionSum.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Transporte Box */}
              <div className="bg-white border border-slate-200/60 p-3 rounded-[1rem] shadow-[var(--shadow-surface)] hover:border-slate-300 transition text-left flex items-center justify-between gap-3">
                <div className="w-9 h-9 bg-[#10B981]/10 rounded-xl flex items-center justify-center text-[#10B981] shrink-0">
                  <Car className="w-5 h-5 stroke-[2.3]" />
                </div>
                <div className="leading-tight flex-1">
                  <span className="text-xs text-slate-450 font-bold block font-sans">Transporte</span>
                  <span className="text-base font-black text-slate-850 mt-1 block font-sans">
                    ${transporteSum.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Vivienda Box */}
              <div className="bg-white border border-slate-200/60 p-3 rounded-[1rem] shadow-[var(--shadow-surface)] hover:border-slate-300 transition text-left flex items-center justify-between gap-3">
                <div className="w-9 h-9 bg-[#EF4444]/15 rounded-xl flex items-center justify-center text-[#EF4444] shrink-0">
                  <Home className="w-5 h-5 stroke-[2.3]" />
                </div>
                <div className="leading-tight flex-1">
                  <span className="text-xs text-slate-450 font-bold block font-sans">Vivienda</span>
                  <span className="text-base font-black text-slate-850 mt-1 block font-sans">
                    ${viviendaSum.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Compras Box */}
              <div className="bg-white border border-slate-200/60 p-3 rounded-[1rem] shadow-[var(--shadow-surface)] hover:border-slate-300 transition text-left flex items-center justify-between gap-3">
                <div className="w-9 h-9 bg-[#3B82F6]/10 rounded-xl flex items-center justify-center text-[#3B82F6] shrink-0">
                  <ShoppingBag className="w-5 h-5 stroke-[2.3]" />
                </div>
                <div className="leading-tight flex-1">
                  <span className="text-xs text-slate-450 font-bold block font-sans">Compras</span>
                  <span className="text-base font-black text-slate-850 mt-1 block font-sans">
                    ${comprasSum.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
