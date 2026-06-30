export function resolveValue(
  template: string,
  ticketData: any,
  fiscalProfile: any,
  connector: any,
  portalMap: any,
  transform?: string
): string {
  if (!template) return "";

  // 1. Substitute templates like {{ticket.total}}, {{fiscalProfile.rfc}}, etc.
  let resolved = template.replace(/\{\{([^}]+)\}\}/g, (match, pathStr) => {
    const parts = pathStr.trim().split(".");
    const base = parts[0];
    const key = parts[1];

    if (base === "ticket") {
      if (key === "total") return (ticketData.total || 0).toString();
      if (key === "billingReference" || key === "folio" || key === "ticketNumber") return ticketData.folio || "";
      if (key === "date") return ticketData.fechaCompra || "";
      return ticketData[key] || "";
    } else if (base === "fiscalProfile") {
      if (key === "rfc") return fiscalProfile.rfc || "";
      if (key === "businessName" || key === "razonSocial") return fiscalProfile.razonSocial || "";
      if (key === "postalCode" || key === "codigoPostal") return fiscalProfile.codigoPostal || "";
      if (key === "taxRegime" || key === "regimenFiscal") return fiscalProfile.regimenFiscal || "";
      if (key === "cfdiUse" || key === "usoCFDI") return fiscalProfile.usoCFDI || "";
      if (key === "email") return fiscalProfile.correoElectronico || "";
      return fiscalProfile[key] || "";
    } else if (base === "connector") {
      if (key === "billingUrl") return connector.portalUrl || "";
      return connector[key] || "";
    } else if (base === "portalMap") {
      if (key === "entryUrl") return portalMap.entryUrl || "";
      return portalMap[key] || "";
    }
    return "";
  });

  // If no template matched, try direct path resolving
  if (resolved === template) {
    if (template.includes(".")) {
      const parts = template.trim().split(".");
      const base = parts[0];
      const key = parts[1];
      if (base === "ticket") {
        if (key === "total") resolved = (ticketData.total || 0).toString();
        else if (key === "billingReference" || key === "folio" || key === "ticketNumber") resolved = ticketData.folio || "";
        else if (key === "date") resolved = ticketData.fechaCompra || "";
        else resolved = ticketData[key] || "";
      } else if (base === "fiscalProfile") {
        if (key === "rfc") resolved = fiscalProfile.rfc || "";
        else if (key === "businessName" || key === "razonSocial") resolved = fiscalProfile.razonSocial || "";
        else if (key === "postalCode" || key === "codigoPostal") resolved = fiscalProfile.codigoPostal || "";
        else if (key === "taxRegime" || key === "regimenFiscal") resolved = fiscalProfile.regimenFiscal || "";
        else if (key === "cfdiUse" || key === "usoCFDI") resolved = fiscalProfile.usoCFDI || "";
        else if (key === "email") resolved = fiscalProfile.correoElectronico || "";
        else resolved = fiscalProfile[key] || "";
      }
    }
  }

  // Apply transformations
  if (transform) {
    const t = transform.toLowerCase().trim();
    if (t === "uppercase") {
      resolved = resolved.toUpperCase();
    } else if (t === "lowercase") {
      resolved = resolved.toLowerCase();
    } else if (t === "trim") {
      resolved = resolved.trim();
    } else if (t === "removespaces") {
      resolved = resolved.replace(/\s+/g, "");
    } else if (t === "onlydigits") {
      resolved = resolved.replace(/\D/g, "");
    } else if (t === "fixed2") {
      const num = parseFloat(resolved);
      resolved = !isNaN(num) ? num.toFixed(2) : resolved;
    } else if (t === "dateformat") {
      resolved = resolved.replace(/[^0-9/-]/g, "");
    }
  }

  return resolved;
}
