import { getBillingStatusVisual } from "@/shared/billing/billingStatusVisuals";

export interface ToneStyle {
  tone: "red" | "amber" | "blue" | "green" | "gray";
  bgClass: string;
  borderClass: string;
  textClass: string;
  badgeClass: string;
}

export const getDiagnosticTone = (severity: string | undefined): ToneStyle => {
  const visual = getBillingStatusVisual(
    severity === "info" ? "in_process" :
    severity === "warning" ? "attention" :
    severity === "critical" ? "failed" :
    severity || "unknown"
  );
  
  const tone = visual.statusGroup === "OK" ? "green" :
               visual.statusGroup === "COLA" ? "blue" :
               visual.statusGroup === "ALERTAS" ? "amber" :
               visual.statusGroup === "FALLOS" ? "red" : "gray";

  return {
    tone,
    bgClass: visual.className,
    borderClass: "border-transparent",
    textClass: "",
    badgeClass: visual.badgeClassName
  };
};

export interface VisibilityBadge {
  label: string;
  tone: "red" | "amber" | "blue" | "green" | "gray";
  badgeClass: string;
}

export const getDiagnosticVisibilityBadge = (item: any): VisibilityBadge => {
  const visual = getBillingStatusVisual(item.bucket || item.canonicalStatus || "archived");
  let label: string = visual.label;
  
  const tone = visual.statusGroup === "OK" ? "green" :
               visual.statusGroup === "COLA" ? "blue" :
               visual.statusGroup === "ALERTAS" ? "amber" :
               visual.statusGroup === "FALLOS" ? "red" : "gray";

  if (visual.statusGroup === "ARCHIVADO") {
    const reason = (item.reasonIncluded || item.visibilityReason || "").toLowerCase();
    if (reason.includes("borrado") || reason.includes("eliminado")) {
      return {
        label: "Eliminado",
        tone: "red",
        badgeClass: "zt-badge-error"
      };
    }
    if (reason.includes("huérfano")) {
      return {
        label: "Huérfano",
        tone: "amber",
        badgeClass: "zt-badge-attention"
      };
    }
  }

  // Keep specific labels from the old design for these buckets
  if (item.bucket === "failed") {
    label = "Fallido";
  } else if (item.bucket === "correction_required") {
    label = "Corrección";
  }

  return {
    label,
    tone,
    badgeClass: visual.badgeClassName
  };
};
