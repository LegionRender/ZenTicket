const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTERNAL_ID_PATTERN = /^(ticket_|job_|worker-|pilot-|offline-|mock_|test_)/i;

export function validateJobContract(connector: any, ticketDataSnapshot: any): string[] {
  const fields = connector?.extractionContract?.requiredPortalFields;
  if (!Array.isArray(fields) || fields.length === 0) {
    throw { message: "El conector no tiene extractionContract utilizable.", code: "CONNECTOR_SCHEMA_INVALID" };
  }

  const portalFields = ticketDataSnapshot?.portalFields || {};
  const missing: string[] = [];
  for (const field of fields) {
    const key = String(field.canonicalKey || field.key || "").replace(/^portalFields\./, "");
    if (!key) throw { message: "El extractionContract contiene una clave vacía.", code: "CONNECTOR_SCHEMA_INVALID" };
    const value = portalFields[key];
    const empty = value === undefined || value === null || String(value).trim() === "";
    if (field.required !== false && empty) missing.push(`portalFields.${key}`);
    if (!empty && (UUID_PATTERN.test(String(value).trim()) || INTERNAL_ID_PATTERN.test(String(value).trim()))) {
      throw { message: `Valor prohibido en portalFields.${key}.`, code: "INVALID_PORTAL_FIELD_VALUE" };
    }
    if (!empty && field.validationPattern) {
      try {
        if (!new RegExp(field.validationPattern).test(String(value).trim())) missing.push(`portalFields.${key}`);
      } catch {
        throw { message: `validationPattern inválido para portalFields.${key}.`, code: "CONNECTOR_SCHEMA_INVALID" };
      }
    }
  }
  return [...new Set(missing)];
}
