const STEP_TYPES: Record<string, string> = {
  navigate: "goto",
  goto: "goto",
  type: "fill",
  fill: "fill",
  evaluate: "evaluate",
  select: "select",
  click: "click",
  check: "check",
  radio: "radio",
  wait_for_selector: "waitForSelector",
  waitforselector: "waitForSelector",
  wait_for_navigation: "waitForNavigation",
  waitfornavigation: "waitForNavigation",
  wait_for_timeout: "waitForTimeout",
  waitfortimeout: "waitForTimeout",
  assert_text: "assertText",
  asserttext: "assertText",
  extract_text: "extractText",
  extracttext: "extractText",
  conditional: "conditional",
  wait_for_download: "waitForDownload",
  waitfordownload: "waitForDownload"
};

const SELECTOR_TYPES = new Set([
  "fill", "evaluate", "select", "click", "check", "radio",
  "waitForSelector", "assertText", "extractText", "conditional"
]);
const VALUE_TYPES = new Set(["fill", "evaluate", "select", "assertText"]);

const FISCAL_KEY_ALIASES: Record<string, string> = {
  rfc: "rfc",
  companyName: "razonSocial",
  businessName: "razonSocial",
  razonSocial: "razonSocial",
  zipCode: "codigoPostal",
  postalCode: "codigoPostal",
  codigoPostal: "codigoPostal",
  taxRegime: "regimenFiscal",
  regimenFiscal: "regimenFiscal",
  cfdiUse: "usoCFDI",
  usoCFDI: "usoCFDI",
  email: "correoElectronico",
  correoElectronico: "correoElectronico"
};

function fieldKey(field: any): string {
  return String(field?.canonicalKey || field?.key || "")
    .replace(/^(portalFields|fiscalProfile)\./, "")
    .trim();
}

function normalizeTemplate(
  value: unknown,
  portalFields: Map<string, any>,
  fiscalFields: Set<string>
): string {
  const text = String(value ?? "").trim();
  if (!text || text.includes("{{")) return text;
  if (text === "portalUrl" || text === "billingUrl") return "{{connector.portalUrl}}";
  if (text === "entryUrl") return "{{portalMap.entryUrl}}";
  if (text.includes(".")) return text;
  if (portalFields.has(text)) return `{{portalFields.${text}}}`;
  if (fiscalFields.has(text) || FISCAL_KEY_ALIASES[text]) {
    return `{{fiscalProfile.${FISCAL_KEY_ALIASES[text] || text}}}`;
  }
  return text;
}

export function normalizePortalSteps(rawSteps: unknown, connector: any): any[] {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    throw { message: "El portalMap no contiene pasos ejecutables.", code: "CONNECTOR_SCHEMA_INVALID" };
  }

  const contract = connector?.extractionContract || {};
  const portalFields = new Map<string, any>(
    (contract.requiredPortalFields || []).map((field: any) => [fieldKey(field), field])
  );
  const fiscalFields = new Set<string>(
    (contract.fiscalFields || []).map((field: any) => fieldKey(field))
  );

  const normalizeStep = (raw: any, index: number): any => {
    if (!raw || typeof raw !== "object") {
      throw { message: `Paso ${index + 1} inválido.`, code: "CONNECTOR_SCHEMA_INVALID" };
    }

    const sourceType = String(raw.type || raw.action || "").trim();
    const normalizedType = STEP_TYPES[sourceType] || STEP_TYPES[sourceType.toLowerCase()];
    if (!normalizedType) {
      throw {
        message: `Paso ${index + 1} usa una acción no soportada: ${sourceType || "vacía"}.`,
        code: "CONNECTOR_SCHEMA_INVALID"
      };
    }

    const step: any = { ...raw, type: normalizedType };
    delete step.action;

    if (normalizedType === "goto") {
      step.url = normalizeTemplate(raw.url || raw.value, portalFields, fiscalFields);
      delete step.value;
      if (!step.url) {
        throw { message: `Paso ${index + 1} no contiene URL.`, code: "CONNECTOR_SCHEMA_INVALID" };
      }
    } else if (VALUE_TYPES.has(normalizedType)) {
      step.value = normalizeTemplate(raw.value, portalFields, fiscalFields);
      if (!step.value) {
        throw { message: `Paso ${index + 1} no contiene un valor.`, code: "CONNECTOR_SCHEMA_INVALID" };
      }
      const rawKey = String(raw.value || "").trim();
      const contractField = portalFields.get(rawKey);
      if (!step.transform && contractField?.type === "date") {
        step.transform = "portalDate";
      }
    }

    if (SELECTOR_TYPES.has(normalizedType) && !step.selector) {
      throw { message: `Paso ${index + 1} no contiene selector.`, code: "CONNECTOR_SCHEMA_INVALID" };
    }
    if (normalizedType === "conditional") {
      step.steps = (raw.steps || []).map((nested: any, nestedIndex: number) =>
        normalizeStep(nested, nestedIndex)
      );
    }
    return step;
  };

  const steps = rawSteps.map(normalizeStep);
  if (!steps.some((step) => step.type === "goto")) {
    steps.unshift({ type: "goto", url: "{{connector.portalUrl}}" });
  }
  if (!steps.some((step) => ["fill", "select", "click", "evaluate"].includes(step.type))) {
    throw { message: "El portalMap no contiene interacciones ejecutables.", code: "CONNECTOR_SCHEMA_INVALID" };
  }
  return steps;
}
