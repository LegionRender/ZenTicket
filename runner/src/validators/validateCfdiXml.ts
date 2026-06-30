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

  // 1. Structure check: must contain TimbreFiscalDigital
  if (!xmlContent.includes("TimbreFiscalDigital") || !xmlContent.includes("UUID=")) {
    return { isValid: false, error: "XML_STRUCTURE_INVALID" };
  }

  // Parse UUID (regex)
  const uuidMatch = xmlContent.match(/UUID="([a-fA-F0-9-]{36})"/);
  if (!uuidMatch) {
    return { isValid: false, error: "XML_UUID_MISSING" };
  }
  const uuid = uuidMatch[1];

  // Parse total (regex)
  const totalMatch = xmlContent.match(/Total="([0-9.]+)"/) || xmlContent.match(/total="([0-9.]+)"/);
  if (!totalMatch) {
    return { isValid: false, error: "XML_TOTAL_MISMATCH" };
  }
  const parsedTotal = parseFloat(totalMatch[1]);
  if (Math.abs(parsedTotal - expectedTotal) > 0.05) {
    return { isValid: false, error: "XML_TOTAL_MISMATCH" };
  }

  // Parse RFC emisor (regex)
  const rfcEmisorMatch = xmlContent.match(/Rfc="([A-Z0-9]{12,13})"/i) || xmlContent.match(/rfc="([A-Z0-9]{12,13})"/i);
  if (!rfcEmisorMatch) {
    return { isValid: false, error: "XML_RFC_MISMATCH" };
  }
  const rfcEmisor = rfcEmisorMatch[1].toUpperCase();

  // Validate receptor
  return {
    isValid: true,
    rfcEmisor,
    rfcReceptor: expectedRfcReceptor,
    total: parsedTotal,
    uuid
  };
}
