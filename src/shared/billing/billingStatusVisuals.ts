export interface BillingStatusVisual {
  statusGroup: "OK" | "FALLOS" | "COLA" | "ALERTAS" | "ARCHIVADO";
  label: "Listo" | "En proceso" | "Atención" | "Error" | "Archivado";
  shortLabel: "OK" | "Fallos" | "Cola" | "Alertas" | "Archivado";
  tone: "green" | "blue" | "amber" | "red" | "gray";
  bgColor: string;
  borderColor: string;
  textColor: string;
  cssVars: Record<string, string>;
  className: string;
  badgeClassName: string;
  cardClassName: string;
  alertClassName: string;
  dotClassName: string;
  iconClassName: string;
  icon: string;
  severityRank: number;
}

export function getBillingStatusVisual(input: string): BillingStatusVisual {
  const norm = (input || "unknown").toLowerCase();

  // 1. OK / verde
  const okStatuses = [
    "ready",
    "listo",
    "cfdi_validated",
    "sat_validated",
    "completed",
    "invoice_obtained",
    "sat_validation_pending_but_ok", // fallback
    "vigente"
  ];
  if (okStatuses.includes(norm) || norm === "ok" || norm === "validationstatus_sat_validated") {
    return {
      statusGroup: "OK",
      label: "Listo",
      shortLabel: "OK",
      tone: "green",
      bgColor: "#0B1F23",
      borderColor: "#0C3631",
      textColor: "#007A55",
      cssVars: {
        "--zt-status-bg": "var(--zt-ok-bg)",
        "--zt-status-border": "var(--zt-ok-border)",
        "--zt-status-text": "var(--zt-ok-text)"
      },
      className: "zt-status-ok",
      badgeClassName: "zt-badge-ok",
      cardClassName: "zt-card-ok",
      alertClassName: "zt-alert-ok",
      dotClassName: "zt-dot-ok",
      iconClassName: "text-[var(--zt-ok-text)]",
      icon: "CheckCircle",
      severityRank: 1
    };
  }

  // 2. FALLOS / rojo
  const failedStatuses = [
    "failed",
    "automation_failed",
    "failed_blocking",
    "cfdi_validation_failed",
    "sat_validation_failed",
    "cfdi_invalid_xml",
    "cfdi_total_mismatch",
    "cfdi_rfc_mismatch",
    "sat_rejected",
    "portal_blocked",
    "runner_crashed",
    "failed_local",
    "blocked",
    "fallos",
    "error"
  ];
  if (failedStatuses.includes(norm) || norm === "error") {
    return {
      statusGroup: "FALLOS",
      label: "Error",
      shortLabel: "Fallos",
      tone: "red",
      bgColor: "#221220",
      borderColor: "#41182A",
      textColor: "#C70036",
      cssVars: {
        "--zt-status-bg": "var(--zt-error-bg)",
        "--zt-status-border": "var(--zt-error-border)",
        "--zt-status-text": "var(--zt-error-text)"
      },
      className: "zt-status-error",
      badgeClassName: "zt-badge-error",
      cardClassName: "zt-card-error",
      alertClassName: "zt-alert-error",
      dotClassName: "zt-dot-error",
      iconClassName: "text-[var(--zt-error-text)]",
      icon: "AlertCircle",
      severityRank: 5
    };
  }

  // 3. COLA / naranja
  const queueStatuses = [
    "processing",
    "pending_local",
    "queued",
    "active_processing",
    "invoice_recovery_pending",
    "invoice_recovery_retrying",
    "waiting_user_captcha",
    "sat_validation_pending",
    "en_proceso",
    "cola",
    "in_process"
  ];
  if (queueStatuses.includes(norm) || norm === "processing" || norm === "pending") {
    return {
      statusGroup: "COLA",
      label: "En proceso",
      shortLabel: "Cola",
      tone: "blue",
      bgColor: "#0B162E",
      borderColor: "#1D3B7A",
      textColor: "#3B82F6",
      cssVars: {
        "--zt-status-bg": "var(--zt-queue-bg)",
        "--zt-status-border": "var(--zt-queue-border)",
        "--zt-status-text": "var(--zt-queue-text)"
      },
      className: "zt-status-queue",
      badgeClassName: "zt-badge-queue",
      cardClassName: "zt-card-queue",
      alertClassName: "zt-alert-process",
      dotClassName: "zt-dot-queue",
      iconClassName: "text-[var(--zt-queue-text)]",
      icon: "Clock",
      severityRank: 3
    };
  }

  // 4. ALERTAS / amarillo
  const alertStatuses = [
    "requires_manual_review",
    "manual_review_required",
    "requires_field_correction",
    "already_invoiced_unverified",
    "invoice_missing_for_validated_cfdi",
    "missing_required_fields",
    "waiting_user_input",
    "duplicate_detected_without_xml",
    "attention",
    "alerta",
    "revisión manual",
    "revisión_manual",
    "correction_required"
  ];
  if (alertStatuses.includes(norm) || norm === "attention" || norm === "alerta" || norm === "revision_manual") {
    return {
      statusGroup: "ALERTAS",
      label: "Atención",
      shortLabel: "Alertas",
      tone: "amber",
      bgColor: "#1F1A0B",
      borderColor: "#4A3510",
      textColor: "#F59E0B",
      cssVars: {
        "--zt-status-bg": "var(--zt-alert-bg)",
        "--zt-status-border": "var(--zt-alert-border)",
        "--zt-status-text": "var(--zt-alert-text)"
      },
      className: "zt-status-alert",
      badgeClassName: "zt-badge-alert",
      cardClassName: "zt-card-alert",
      alertClassName: "zt-alert-attention",
      dotClassName: "zt-dot-alert",
      iconClassName: "text-[var(--zt-alert-text)]",
      icon: "AlertTriangle",
      severityRank: 4
    };
  }

  // 5. ARCHIVADO / default
  return {
    statusGroup: "ARCHIVADO",
    label: "Archivado",
    shortLabel: "Archivado",
    tone: "gray",
    bgColor: "#111827",
    borderColor: "#374151",
    textColor: "#9CA3AF",
    cssVars: {
      "--zt-status-bg": "var(--zt-archived-bg)",
      "--zt-status-border": "var(--zt-archived-border)",
      "--zt-status-text": "var(--zt-archived-text)"
    },
    className: "zt-status-archived",
    badgeClassName: "zt-badge-archived",
    cardClassName: "zt-card-archived",
    alertClassName: "zt-alert-archived",
    dotClassName: "zt-dot-archived",
    iconClassName: "text-[var(--zt-archived-text)]",
    icon: "Archive",
    severityRank: 2
  };
}
