import { Car, Home, ShoppingBag, Utensils } from "lucide-react";

export function getInvoiceCategory(name: string): string {
  const normalized = (name || "").toLowerCase();

  if (
    normalized.includes("starbucks") ||
    normalized.includes("alsea") ||
    normalized.includes("mcdonald") ||
    normalized.includes("oxxo") ||
    normalized.includes("caf") ||
    normalized.includes("restaurante") ||
    normalized.includes("vips") ||
    normalized.includes("toks") ||
    normalized.includes("dominos") ||
    normalized.includes("burger")
  ) {
    return "Alimentación";
  }

  if (
    normalized.includes("uber") ||
    normalized.includes("didi") ||
    normalized.includes("cabify") ||
    normalized.includes("gas") ||
    normalized.includes("pemex") ||
    normalized.includes("combustible") ||
    normalized.includes("autopista") ||
    normalized.includes("viaducto") ||
    normalized.includes("peaje") ||
    normalized.includes("repsol")
  ) {
    return "Transporte";
  }

  if (
    normalized.includes("cfe") ||
    normalized.includes("telmex") ||
    normalized.includes("izzi") ||
    normalized.includes("luz") ||
    normalized.includes("agua") ||
    normalized.includes("naturgy") ||
    normalized.includes("internet") ||
    normalized.includes("gas natural") ||
    normalized.includes("renta")
  ) {
    return "Vivienda";
  }

  return "Compras";
}

export function getInvoiceCategoryIcon(category: string) {
  switch (category) {
    case "Alimentación":
      return <Utensils className="w-4 h-4 text-amber-600 stroke-[2.3]" />;
    case "Transporte":
      return <Car className="w-4 h-4 text-indigo-600 stroke-[2.3]" />;
    case "Vivienda":
      return <Home className="w-4 h-4 text-emerald-600 stroke-[2.3]" />;
    default:
      return <ShoppingBag className="w-4 h-4 text-[#0B53F4] stroke-[2.3]" />;
  }
}

export function getInvoiceCategoryStyles(category: string) {
  switch (category) {
    case "Alimentación":
      return "bg-amber-50 border-amber-150/50";
    case "Transporte":
      return "bg-indigo-50 border-indigo-150/50";
    case "Vivienda":
      return "bg-emerald-50 border-emerald-150/50";
    default:
      return "bg-blue-50 border-blue-150/50 text-[#0B53F4]";
  }
}
