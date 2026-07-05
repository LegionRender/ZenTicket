import { Page } from "playwright";

export type PortalErrorCategory =
  | "ALREADY_INVOICED" | "TICKET_NOT_FOUND" | "INVALID_TOTAL" | "INVALID_DATE"
  | "INVALID_RFC" | "PERIOD_EXPIRED" | "FIELD_REQUIRED" | "SERVICE_DOWN"
  | "CAPTCHA" | "UNKNOWN";

export interface PortalDiagnosis {
  category: PortalErrorCategory;
  errorText: string;
  isAutoRecoverable: boolean;
  recoveryStrategy?: string;
  userMessage: string;
}

const PATTERNS: Array<{
  pattern: RegExp; category: PortalErrorCategory; recoverable: boolean; strategy?: string; message: string;
}> = [
  { pattern: /ya (?:fue|ha sido|est[aá]) facturad/i, category: "ALREADY_INVOICED", recoverable: true, strategy: "recover_existing_invoice", message: "El ticket ya fue facturado. Intentaremos recuperar sus archivos." },
  { pattern: /no (?:se encontr|existe|hay registro)/i, category: "TICKET_NOT_FOUND", recoverable: false, message: "El portal no encontró el ticket con los datos proporcionados." },
  { pattern: /total.*(?:incorrecto|no coincide|inv[aá]lido)/i, category: "INVALID_TOTAL", recoverable: true, strategy: "retry_total_formats", message: "El portal no aceptó el formato del total. Intentaremos otra presentación." },
  { pattern: /fecha.*(?:inv[aá]lid|incorrec|fuera de rango)/i, category: "INVALID_DATE", recoverable: true, strategy: "retry_date_formats", message: "El portal no aceptó el formato de la fecha." },
  { pattern: /rfc.*(?:inv[aá]lido|incorrecto|no v[aá]lido)/i, category: "INVALID_RFC", recoverable: false, message: "El portal rechazó el RFC proporcionado." },
  { pattern: /periodo.*(?:venci|expir|fuera)/i, category: "PERIOD_EXPIRED", recoverable: false, message: "El periodo permitido para facturar este ticket ya venció." },
  { pattern: /campo.*(?:obligatori|requerid|faltante)/i, category: "FIELD_REQUIRED", recoverable: true, strategy: "fill_required_field", message: "El portal solicita un dato adicional." },
  { pattern: /servicio.*(?:no disponible|temporalmente|mantenimiento)/i, category: "SERVICE_DOWN", recoverable: true, strategy: "reload_with_backoff", message: "El portal está temporalmente fuera de servicio." },
  { pattern: /verificaci[oó]n.*(?:manual|humana|captcha)|captcha/i, category: "CAPTCHA", recoverable: false, message: "El portal solicita una verificación humana." }
];

export function diagnosePortalError(errorText: string): PortalDiagnosis {
  const normalized = String(errorText || "").trim();
  const match = PATTERNS.find(item => item.pattern.test(normalized));
  return match ? {
    category: match.category,
    errorText: normalized,
    isAutoRecoverable: match.recoverable,
    recoveryStrategy: match.strategy,
    userMessage: match.message
  } : {
    category: "UNKNOWN",
    errorText: normalized,
    isAutoRecoverable: false,
    userMessage: "El portal devolvió un mensaje que requiere revisión."
  };
}

export async function collectVisiblePortalErrors(page: Page, configuredSelectors: string[] = []): Promise<string> {
  const generic = [
    "[role='alert']", ".alert-danger", ".error", ".errors", ".text-danger",
    ".invalid-feedback", ".swal2-html-container", ".swal-text", "mat-error", "ion-text[color='danger']"
  ];
  const texts: string[] = [];
  for (const selector of [...new Set([...configuredSelectors, ...generic])]) {
    const locator = page.locator(selector);
    const count = Math.min(await locator.count().catch(() => 0), 10);
    for (let i = 0; i < count; i++) {
      const item = locator.nth(i);
      if (await item.isVisible().catch(() => false)) {
        const text = (await item.innerText().catch(() => "")).trim();
        if (text) texts.push(text);
      }
    }
  }
  return [...new Set(texts)].join("\n");
}

export async function applyRecoveryStrategy(
  page: Page,
  strategy: string | undefined,
  step: any,
  value: string
): Promise<boolean> {
  if (!strategy) return false;
  if (strategy === "reload_with_backoff") {
    for (const delay of [3000, 6000, 12000]) {
      await page.waitForTimeout(delay);
      if ((await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null))) return true;
    }
  }
  if (strategy === "retry_total_formats" && step?.selector) {
    const amount = Number(String(value).replace(/[$,\s]/g, ""));
    if (!Number.isNaN(amount)) {
      for (const candidate of [amount.toFixed(2), String(Math.round(amount)), amount.toLocaleString("en-US", { minimumFractionDigits: 2 })]) {
        await page.locator(step.selector).first().fill(candidate).catch(() => null);
        if (await page.locator(step.selector).first().inputValue().catch(() => "") === candidate) return true;
      }
    }
  }
  if (strategy === "retry_date_formats" && step?.selector) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      const yyyy = parsed.getFullYear();
      const mm = String(parsed.getMonth() + 1).padStart(2, "0");
      const dd = String(parsed.getDate()).padStart(2, "0");
      for (const candidate of [`${dd}/${mm}/${yyyy}`, `${yyyy}-${mm}-${dd}`, `${dd}-${mm}-${yyyy}`]) {
        await page.locator(step.selector).first().fill(candidate).catch(() => null);
        if (await page.locator(step.selector).first().inputValue().catch(() => "") === candidate) return true;
      }
    }
  }
  return false;
}
