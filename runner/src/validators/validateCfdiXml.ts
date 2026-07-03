export interface XmlValidationResult {
  isValid: boolean;
  rfcEmisor?: string;
  rfcReceptor?: string;
  total?: number;
  uuid?: string;
  error?: string;
  regimenFiscalEmisor?: string;
  regimenFiscalReceptor?: string;
  usoCfdiReceptor?: string;
  lugarExpedicion?: string;
  formaPago?: string;
  noCertificadoSAT?: string;
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
  const emisorTagMatch = xmlContent.match(/<cfdi:Emisor([^>]+)>/i) || xmlContent.match(/<Emisor([^>]+)>/i);
  if (!emisorTagMatch) {
    return { isValid: false, error: "XML_STRUCTURE_INVALID" };
  }
  const emisorAttrs = emisorTagMatch[1];
  const rfcEmisorMatch = emisorAttrs.match(/Rfc="([^"]+)"/i);
  if (!rfcEmisorMatch) {
    return { isValid: false, error: "XML_STRUCTURE_INVALID" };
  }
  const rfcEmisor = rfcEmisorMatch[1].toUpperCase();
  const regimenFiscalEmisorMatch = emisorAttrs.match(/RegimenFiscal="([^"]+)"/i);
  const regimenFiscalEmisor = regimenFiscalEmisorMatch ? regimenFiscalEmisorMatch[1] : undefined;

  // 7. Parse RFC Receptor (using tag-specific regex)
  const receptorTagMatch = xmlContent.match(/<cfdi:Receptor([^>]+)>/i) || xmlContent.match(/<Receptor([^>]+)>/i);
  if (!receptorTagMatch) {
    return { isValid: false, error: "XML_STRUCTURE_INVALID" };
  }
  const receptorAttrs = receptorTagMatch[1];
  const rfcReceptorMatch = receptorAttrs.match(/Rfc="([^"]+)"/i);
  if (!rfcReceptorMatch) {
    return { isValid: false, error: "XML_STRUCTURE_INVALID" };
  }
  const rfcReceptor = rfcReceptorMatch[1].toUpperCase();
  const regimenFiscalReceptorMatch = receptorAttrs.match(/RegimenFiscalReceptor="([^"]+)"/i);
  const regimenFiscalReceptor = regimenFiscalReceptorMatch ? regimenFiscalReceptorMatch[1] : undefined;
  const usoCfdiReceptorMatch = receptorAttrs.match(/UsoCFDI="([^"]+)"/i);
  const usoCfdiReceptor = usoCfdiReceptorMatch ? usoCfdiReceptorMatch[1] : undefined;

  // 8. Parse Comprobante attributes
  const comprobanteTagMatch = xmlContent.match(/<cfdi:Comprobante([^>]+)>/i) || xmlContent.match(/<Comprobante([^>]+)>/i);
  let lugarExpedicion: string | undefined = undefined;
  let formaPago: string | undefined = undefined;
  if (comprobanteTagMatch) {
    const compAttrs = comprobanteTagMatch[1];
    const lugarMatch = compAttrs.match(/LugarExpedicion="([^"]+)"/i);
    lugarExpedicion = lugarMatch ? lugarMatch[1] : undefined;
    const formaMatch = compAttrs.match(/FormaPago="([^"]+)"/i);
    formaPago = formaMatch ? formaMatch[1] : undefined;
  }

  // 9. Parse TimbreFiscalDigital attributes
  const tfdTagMatch = xmlContent.match(/<tfd:TimbreFiscalDigital([^>]+)>/i) || xmlContent.match(/<TimbreFiscalDigital([^>]+)>/i);
  let noCertificadoSAT: string | undefined = undefined;
  if (tfdTagMatch) {
    const tfdAttrs = tfdTagMatch[1];
    const certSatMatch = tfdAttrs.match(/NoCertificadoSAT="([^"]+)"/i);
    noCertificadoSAT = certSatMatch ? certSatMatch[1] : undefined;
  }

  // Validate that the Receptor RFC in the XML matches the expected user fiscal profile RFC
  if (rfcReceptor !== expectedRfcReceptor.toUpperCase().trim()) {
    return { isValid: false, error: "XML_RFC_MISMATCH" };
  }

  return {
    isValid: true,
    rfcEmisor,
    rfcReceptor,
    total: parsedTotal,
    uuid,
    regimenFiscalEmisor,
    regimenFiscalReceptor,
    usoCfdiReceptor,
    lugarExpedicion,
    formaPago,
    noCertificadoSAT
  };
}
