export interface XmlValidationResult {
  isValid: boolean;
  rfcEmisor?: string;
  rfcReceptor?: string;
  total?: number;
  uuid?: string;
  error?: string;
}

export function validateCfdiXml(
  xmlContent: string,
  expectedRfcEmisor: string,
  expectedRfcReceptor: string,
  expectedTotal: number
): XmlValidationResult {
  if (!xmlContent || xmlContent.trim().length === 0) {
    return { isValid: false, error: "XML_NOT_DOWNLOADED" };
  }

  // 1. Basic parseability check (starts with xml declaration or has Comprobante tag)
  if (!xmlContent.includes("<cfdi:Comprobante") && !xmlContent.includes("<Comprobante")) {
    return { isValid: false, error: "XML_STRUCTURE_INVALID" };
  }

  // 2. CFDI Version check
  const versionMatch = xmlContent.match(/Version="([^"]+)"/i) || xmlContent.match(/version="([^"]+)"/i);
  if (!versionMatch) {
    return { isValid: false, error: "XML_STRUCTURE_INVALID" };
  }
  const version = versionMatch[1];
  if (version !== "4.0" && version !== "3.3") {
    return { isValid: false, error: "XML_STRUCTURE_INVALID" };
  }

  // 3. Structure check: must contain TimbreFiscalDigital
  if (!xmlContent.includes("TimbreFiscalDigital") || !xmlContent.includes("UUID=")) {
    return { isValid: false, error: "XML_STRUCTURE_INVALID" };
  }

  // 4. Parse UUID (regex)
  const uuidMatch = xmlContent.match(/UUID="([a-fA-F0-9-]{36})"/i);
  if (!uuidMatch) {
    return { isValid: false, error: "XML_UUID_MISSING" };
  }
  const uuid = uuidMatch[1];

  // 5. Parse Total (regex)
  const totalMatch = xmlContent.match(/Total="([0-9.]+)"/) || xmlContent.match(/total="([0-9.]+)"/);
  if (!totalMatch) {
    return { isValid: false, error: "XML_TOTAL_MISMATCH" };
  }
  const parsedTotal = parseFloat(totalMatch[1]);
  if (Math.abs(parsedTotal - expectedTotal) > 0.5) { // 50 cents variance allowed for rounding/cents
    return { isValid: false, error: "XML_TOTAL_MISMATCH" };
  }

  // 6. Parse RFC Emisor (using tag-specific regex)
  const emisorMatch = xmlContent.match(/<cfdi:Emisor[^>]+Rfc="([^"]+)"/i) || xmlContent.match(/<Emisor[^>]+Rfc="([^"]+)"/i);
  if (!emisorMatch) {
    return { isValid: false, error: "XML_STRUCTURE_INVALID" };
  }
  const rfcEmisor = emisorMatch[1].toUpperCase();

  // 7. Parse RFC Receptor (using tag-specific regex)
  const receptorMatch = xmlContent.match(/<cfdi:Receptor[^>]+Rfc="([^"]+)"/i) || xmlContent.match(/<Receptor[^>]+Rfc="([^"]+)"/i);
  if (!receptorMatch) {
    return { isValid: false, error: "XML_STRUCTURE_INVALID" };
  }
  const rfcReceptor = receptorMatch[1].toUpperCase();

  // Validate that the Receptor RFC in the XML matches the expected user fiscal profile RFC
  if (rfcReceptor !== expectedRfcReceptor.toUpperCase().trim()) {
    return { isValid: false, error: "XML_RFC_MISMATCH" };
  }

  return {
    isValid: true,
    rfcEmisor,
    rfcReceptor,
    total: parsedTotal,
    uuid
  };
}
