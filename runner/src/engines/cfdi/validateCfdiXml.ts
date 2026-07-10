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
  tipoComprobante?: string;
  fechaTimbrado?: string;
  friendlyMessage?: string;
}

const FRIENDLY_MESSAGES: Record<string, string> = {
  CFDI_XML_NOT_DOWNLOADED: "No se localizó la descarga del archivo XML de la factura.",
  CFDI_EMPTY_OR_HTML_RESPONSE: "El portal devolvió una página HTML o un archivo vacío en lugar del XML de la factura.",
  CFDI_XML_PARSE_FAILED: "El archivo XML descargado está dañado o no tiene un formato parseable.",
  CFDI_MISSING_TIMBRE: "El XML de la factura no contiene el timbre fiscal digital requerido.",
  CFDI_MISSING_UUID: "El XML de la factura no contiene un folio fiscal (UUID) válido.",
  CFDI_TOTAL_MISMATCH: "El total facturado en el XML no coincide con el total del ticket.",
  CFDI_RFC_EMISOR_MISMATCH: "El RFC del emisor en la factura no coincide con el del comercio.",
  CFDI_RFC_RECEPTOR_MISMATCH: "El RFC del receptor en la factura no coincide con tu perfil fiscal.",
  XML_STRUCTURE_INVALID: "El archivo descargado no es una factura electrónica válida."
};

function invalid(error: string): XmlValidationResult {
  return { isValid: false, error, friendlyMessage: FRIENDLY_MESSAGES[error] || FRIENDLY_MESSAGES.XML_STRUCTURE_INVALID };
}

export function validateCfdiXml(
  xmlContent: string,
  expectedRfcEmisor: string,
  expectedRfcReceptor: string,
  expectedTotal: number
): XmlValidationResult {
  if (!xmlContent || xmlContent.trim().length === 0) {
    return invalid("CFDI_XML_NOT_DOWNLOADED");
  }
  const htmlPosition = xmlContent.search(/<!doctype html|<html[\s>]/i);
  const cfdiPosition = xmlContent.search(/<(?:cfdi:)?Comprobante[\s>]/i);
  if (htmlPosition >= 0 && (cfdiPosition < 0 || htmlPosition < cfdiPosition)) return invalid("CFDI_EMPTY_OR_HTML_RESPONSE");

  // 1. Basic parseability check (starts with xml declaration or has Comprobante tag)
  if (!xmlContent.includes("<cfdi:Comprobante") && !xmlContent.includes("<Comprobante")) {
    return invalid("CFDI_XML_PARSE_FAILED");
  }

  // 2. CFDI Version check
  const versionMatch = xmlContent.match(/Version="([^"]+)"/);
  if (!versionMatch) {
    return invalid("CFDI_XML_PARSE_FAILED");
  }
  const version = versionMatch[1];
  if (version !== "4.0" && version !== "3.3") {
    return invalid("CFDI_XML_PARSE_FAILED");
  }

  // 3. Structure check: must contain TimbreFiscalDigital and UUID
  if (!xmlContent.includes("TimbreFiscalDigital")) {
    return invalid("CFDI_MISSING_TIMBRE");
  }
  if (!xmlContent.includes("UUID=")) {
    return invalid("CFDI_MISSING_UUID");
  }

  // 4. Parse UUID (regex)
  const uuidMatch = xmlContent.match(/UUID="([a-fA-F0-9-]{36})"/i);
  if (!uuidMatch) {
    return invalid("CFDI_MISSING_UUID");
  }
  const uuid = uuidMatch[1];

  // 5. Parse Total (regex)
  const totalMatch = xmlContent.match(/Total="([0-9.]+)"/) || xmlContent.match(/total="([0-9.]+)"/);
  if (!totalMatch) {
    return invalid("CFDI_XML_PARSE_FAILED");
  }
  const parsedTotal = parseFloat(totalMatch[1]);
  if (parsedTotal <= 0 && expectedTotal > 0) {
    return invalid("CFDI_TOTAL_MISMATCH");
  }
  if (Math.abs(parsedTotal - expectedTotal) > 0.5) { // 50 cents variance allowed for rounding/cents
    return invalid("CFDI_TOTAL_MISMATCH");
  }

  // 6. Parse RFC Emisor (using tag-specific regex)
  const emisorTagMatch = xmlContent.match(/<cfdi:Emisor([^>]+)>/i) || xmlContent.match(/<Emisor([^>]+)>/i);
  if (!emisorTagMatch) {
    return invalid("CFDI_XML_PARSE_FAILED");
  }
  const emisorAttrs = emisorTagMatch[1];
  const rfcEmisorMatch = emisorAttrs.match(/Rfc="([^"]+)"/i);
  if (!rfcEmisorMatch) {
    return invalid("CFDI_XML_PARSE_FAILED");
  }
  const rfcEmisor = rfcEmisorMatch[1].toUpperCase();
  const regimenFiscalEmisorMatch = emisorAttrs.match(/RegimenFiscal="([^"]+)"/i);
  const regimenFiscalEmisor = regimenFiscalEmisorMatch ? regimenFiscalEmisorMatch[1] : undefined;

  // 7. Parse RFC Receptor (using tag-specific regex)
  const receptorTagMatch = xmlContent.match(/<cfdi:Receptor([^>]+)>/i) || xmlContent.match(/<Receptor([^>]+)>/i);
  if (!receptorTagMatch) {
    return invalid("CFDI_XML_PARSE_FAILED");
  }
  const receptorAttrs = receptorTagMatch[1];
  const rfcReceptorMatch = receptorAttrs.match(/Rfc="([^"]+)"/i);
  if (!rfcReceptorMatch) {
    return invalid("CFDI_XML_PARSE_FAILED");
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
  let tipoComprobante: string | undefined = undefined;
  if (comprobanteTagMatch) {
    const compAttrs = comprobanteTagMatch[1];
    const lugarMatch = compAttrs.match(/LugarExpedicion="([^"]+)"/i);
    lugarExpedicion = lugarMatch ? lugarMatch[1] : undefined;
    const formaMatch = compAttrs.match(/FormaPago="([^"]+)"/i);
    formaPago = formaMatch ? formaMatch[1] : undefined;
    const tipoMatch = compAttrs.match(/TipoDeComprobante="([^"]+)"/i);
    tipoComprobante = tipoMatch ? tipoMatch[1].toUpperCase() : undefined;
  }
  if (!tipoComprobante || !["I", "E", "P", "T", "N"].includes(tipoComprobante)) {
    return invalid("CFDI_XML_PARSE_FAILED");
  }

  // 9. Parse TimbreFiscalDigital attributes
  const tfdTagMatch = xmlContent.match(/<tfd:TimbreFiscalDigital([^>]+)>/i) || xmlContent.match(/<TimbreFiscalDigital([^>]+)>/i);
  let noCertificadoSAT: string | undefined = undefined;
  let fechaTimbrado: string | undefined = undefined;
  if (tfdTagMatch) {
    const tfdAttrs = tfdTagMatch[1];
    const certSatMatch = tfdAttrs.match(/NoCertificadoSAT="([^"]+)"/i);
    noCertificadoSAT = certSatMatch ? certSatMatch[1] : undefined;
    const fechaMatch = tfdAttrs.match(/FechaTimbrado="([^"]+)"/i);
    fechaTimbrado = fechaMatch ? fechaMatch[1] : undefined;
  }
  if (!fechaTimbrado) return invalid("CFDI_XML_PARSE_FAILED");
  let parseableFecha = fechaTimbrado;
  if (!/Z$|[+-]\d{2}:\d{2}$/.test(parseableFecha)) {
    parseableFecha += "Z";
  }
  const timbradoMs = Date.parse(parseableFecha);
  if (Number.isNaN(timbradoMs) || timbradoMs > Date.now() + 60 * 60 * 1000) {
    return invalid("CFDI_XML_PARSE_FAILED");
  }

  // Validate that the Emisor RFC in the XML matches the expected connector RFC
  if (rfcEmisor !== expectedRfcEmisor.toUpperCase().trim()) {
    return invalid("CFDI_RFC_EMISOR_MISMATCH");
  }

  // Validate that the Receptor RFC in the XML matches the expected user fiscal profile RFC
  if (rfcReceptor !== expectedRfcReceptor.toUpperCase().trim()) {
    return invalid("CFDI_RFC_RECEPTOR_MISMATCH");
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
    noCertificadoSAT,
    tipoComprobante,
    fechaTimbrado
  };
}
