const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTERNAL_ID_PATTERN = /^(ticket_|job_|worker-|pilot-|offline-|mock_|test_)/i;

function readPath(base: any, key: string): unknown {
  return base && Object.prototype.hasOwnProperty.call(base, key) ? base[key] : undefined;
}

function portalValue(ticketData: any, key: string): string {
  const value = readPath(ticketData?.portalFields, key);
  if (value === undefined || value === null) return "";
  const resolved = String(value);
  if (UUID_PATTERN.test(resolved.trim()) || INTERNAL_ID_PATTERN.test(resolved.trim())) {
    throw { message: `Valor no permitido en portalFields.${key}`, code: "INVALID_PORTAL_FIELD_VALUE" };
  }
  return resolved;
}

function resolvePath(path: string, ticketData: any, fiscalProfile: any, connector: any, portalMap: any): string {
  const [base, key, ...rest] = path.trim().split(".");
  if (!key || rest.length) return "";

  // The runner may only read merchant inputs from the immutable portalFields snapshot.
  if (base === "portalFields") return portalValue(ticketData, key);
  if (base === "ticket") {
    throw { message: `La plantilla ${path} usa el namespace ticket prohibido; usa portalFields.${key}`, code: "CONNECTOR_SCHEMA_INVALID" };
  }
  if (base === "fiscalProfile") {
    const aliases: Record<string, string> = {
      businessName: "razonSocial",
      postalCode: "codigoPostal",
      taxRegime: "regimenFiscal",
      cfdiUse: "usoCFDI",
      email: "correoElectronico"
    };
    return String(readPath(fiscalProfile, aliases[key] || key) ?? "");
  }
  if (base === "connector") {
    if (key === "billingUrl") return String(connector?.portalUrl || "");
    return String(readPath(connector, key) ?? "");
  }
  if (base === "portalMap") {
    if (key === "entryUrl") return String(portalMap?.entryUrl || "");
    return String(readPath(portalMap, key) ?? "");
  }
  return "";
}

function toPortalDate(value: string): string {
  const clean = value.trim();
  let match = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) return `${match[3].padStart(2, "0")}/${match[2].padStart(2, "0")}/${match[1]}`;

  match = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}/${year}`;
  }
  return clean;
}

export function resolveValue(
  template: string,
  ticketData: any,
  fiscalProfile: any,
  connector: any,
  portalMap: any,
  transform?: string
): string {
  if (!template) return "";
  let matched = false;
  let resolved = template.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    matched = true;
    return resolvePath(path, ticketData, fiscalProfile, connector, portalMap);
  });
  if (!matched && template.includes(".")) {
    resolved = resolvePath(template, ticketData, fiscalProfile, connector, portalMap);
  }

  switch (transform?.toLowerCase().trim()) {
    case "uppercase": return resolved.toUpperCase();
    case "lowercase": return resolved.toLowerCase();
    case "trim": return resolved.trim();
    case "removespaces": return resolved.replace(/\s+/g, "");
    case "onlydigits": return resolved.replace(/\D/g, "");
    case "fixed2": {
      const number = Number.parseFloat(resolved);
      return Number.isFinite(number) ? number.toFixed(2) : resolved;
    }
    case "dateformat": return resolved.replace(/[^0-9/-]/g, "");
    case "ddmmyyyy": {
      const match = resolved.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) return `${match[3]}/${match[2]}/${match[1]}`;
      return resolved;
    }
    case "portaldate": return toPortalDate(resolved);
    default: return resolved;
  }
}
