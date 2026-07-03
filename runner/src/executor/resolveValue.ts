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

    if (base === "ticket" || base === "portalFields") {
      const pFields = ticketData.portalFields || {};
      if (key === "billingReference" || key === "folio" || key === "ticketNumber") {
        let val = pFields.billingReference || ticketData.billingReference || ticketData.folio || "";
        const isUuid = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/i.test(val);
        const hasMockPrefix = /^ticket_|^job_|^OFFLINE-|^worker-/i.test(val);
        if (isUuid || hasMockPrefix) {
          throw { message: "UUID o ID interno no permitido en Referencia de facturación", code: "INVALID_PORTAL_FIELD_VALUE" };
        }
        return val;
      }
      if (key === "total") {
        return (pFields.total !== undefined && pFields.total !== null) ? pFields.total.toString() : (ticketData.total || 0).toString();
      }
      if (key === "date" || key === "fecha") {
        return pFields.date || ticketData.fechaCompra || "";
      }
      return pFields[key] || ticketData[key] || "";
    } else if (base === "fiscalProfile") {
      if (key === "rfc") return fiscalProfile.rfc || "";
      if (key === "businessName" || key === "razonSocial") return fiscalProfile.razonSocial || "";
      if (key === "postalCode" || key === "codigoPostal") return fiscalProfile.postalCode || "";
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
      if (base === "ticket" || base === "portalFields") {
        const pFields = ticketData.portalFields || {};
         if (key === "billingReference" || key === "folio" || key === "ticketNumber") {
          let val = pFields.billingReference || ticketData.billingReference || ticketData.folio || "";
          const isUuid = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/i.test(val);
          const hasMockPrefix = /^ticket_|^job_|^OFFLINE-|^worker-/i.test(val);
          if (isUuid || hasMockPrefix) {
            throw { message: "UUID o ID interno no permitido en Referencia de facturación", code: "INVALID_PORTAL_FIELD_VALUE" };
          }
          resolved = val;
        } else if (key === "total") {
          resolved = (pFields.total !== undefined && pFields.total !== null) ? pFields.total.toString() : (ticketData.total || 0).toString();
        } else if (key === "date" || key === "fecha") {
          resolved = pFields.date || ticketData.fechaCompra || "";
        } else {
          resolved = pFields[key] || ticketData[key] || "";
        }
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
