export type ExtractionField = {
  key?: string;
  canonicalKey?: string;
  label?: string;
  type?: string;
  required?: boolean;
  validationPattern?: string;
};

export type ExtractionContract = {
  version?: number | string;
  requiredPortalFields?: ExtractionField[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTERNAL_ID_PATTERN = /^(ticket_|job_|worker-|pilot-|offline-|mock_|test_)/i;

export function contractFieldKey(field: ExtractionField): string {
  return String(field.canonicalKey || field.key || "").replace(/^portalFields\./, "").trim();
}

export function getContractFields(contract: ExtractionContract | null | undefined): ExtractionField[] {
  return Array.isArray(contract?.requiredPortalFields)
    ? contract!.requiredPortalFields!.filter((field) => Boolean(contractFieldKey(field)))
    : [];
}

export function hasUsableExtractionContract(contract: ExtractionContract | null | undefined): boolean {
  return getContractFields(contract).length > 0;
}

export function isForbiddenPortalValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const clean = value.trim();
  return UUID_PATTERN.test(clean) || INTERNAL_ID_PATTERN.test(clean);
}

export function validatePortalFields(
  contract: ExtractionContract | null | undefined,
  portalFields: Record<string, unknown> | null | undefined
): { isValid: boolean; missingFields: string[]; invalidFields: string[] } {
  const values = portalFields || {};
  const missingFields: string[] = [];
  const invalidFields: string[] = [];

  for (const field of getContractFields(contract)) {
    const key = contractFieldKey(field);
    const value = values[key];
    const empty = value === undefined || value === null ||
      (typeof value === "string" && value.trim() === "") ||
      (typeof value === "number" && !Number.isFinite(value));

    if (field.required !== false && empty) {
      missingFields.push(`portalFields.${key}`);
      continue;
    }
    if (empty) continue;
    if (isForbiddenPortalValue(value)) {
      invalidFields.push(`portalFields.${key}`);
      continue;
    }
    if (field.validationPattern && typeof value === "string") {
      try {
        if (!new RegExp(field.validationPattern).test(value.trim())) invalidFields.push(`portalFields.${key}`);
      } catch {
        invalidFields.push(`portalFields.${key}`);
      }
    }
  }

  return { isValid: missingFields.length === 0 && invalidFields.length === 0, missingFields, invalidFields };
}

export function buildPortalFieldsSnapshot(
  contract: ExtractionContract,
  portalFields: Record<string, unknown>
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const field of getContractFields(contract)) {
    const key = contractFieldKey(field);
    if (portalFields[key] !== undefined) snapshot[key] = portalFields[key];
  }
  return snapshot;
}
