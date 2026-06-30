/**
 * Resolves a field mapping selector value using the captured snapshots.
 */
export function resolveValue(
  fieldKey: string,
  source: "ticket" | "fiscalProfile",
  ticketData: any,
  fiscalProfile: any
): string {
  if (source === "ticket") {
    if (fieldKey === "referenciaFacturacion" || fieldKey === "folio") {
      return ticketData.folio || "";
    }
    if (fieldKey === "total") {
      return (ticketData.total || 0).toString();
    }
    if (fieldKey === "fecha") {
      return ticketData.fechaCompra || "";
    }
    return ticketData[fieldKey] || "";
  } else {
    if (fieldKey === "rfcReceptor" || fieldKey === "rfc") {
      return fiscalProfile.rfc || "";
    }
    if (fieldKey === "razonSocial") {
      return fiscalProfile.razonSocial || "";
    }
    if (fieldKey === "codigoPostal") {
      return fiscalProfile.codigoPostal || "";
    }
    if (fieldKey === "regimenFiscal") {
      return fiscalProfile.regimenFiscal || "";
    }
    if (fieldKey === "usoCFDI") {
      return fiscalProfile.usoCFDI || "";
    }
    if (fieldKey === "email") {
      return fiscalProfile.correoElectronico || "";
    }
    return fiscalProfile[fieldKey] || "";
  }
}
