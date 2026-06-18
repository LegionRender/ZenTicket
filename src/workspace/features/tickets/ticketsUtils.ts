import { Car, Coffee, FileText, ShieldCheck, ShoppingBag } from "lucide-react";

export function getBrandBrandIcon(nombre: string) {
  const name = nombre.toLowerCase();

  if (name.includes("starbucks") || name.includes("coffee") || name.includes("café")) {
    return {
      IconComponent: Coffee,
      color: "bg-[#0B53F4]/10 text-[#0B53F4]",
    };
  }

  if (name.includes("pemex") || name.includes("gas") || name.includes("gasolina")) {
    return {
      IconComponent: Car,
      color: "bg-[#0B53F4]/10 text-[#0B53F4]",
    };
  }

  if (name.includes("walmart") || name.includes("super") || name.includes("mercado") || name.includes("oxxo")) {
    return {
      IconComponent: ShoppingBag,
      color: "bg-[#0B53F4]/10 text-[#0B53F4]",
    };
  }

  if (name.includes("farmacia") || name.includes("pablo") || name.includes("salud")) {
    return {
      IconComponent: ShieldCheck,
      color: "bg-[#0B53F4]/10 text-[#0B53F4]",
    };
  }

  return {
    IconComponent: FileText,
    color: "bg-[#0B53F4]/10 text-[#0B53F4]",
  };
}
