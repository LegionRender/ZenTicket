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
  XML_NOT_DOWNLOADED: "El portal no entregó el archivo XML de la factura.",
  XML_STRUCTURE_INVALID: "El archivo descargado no es una factura electrónica válida.",
  XML_IS_ACTUALLY_HTML: "El portal entregó una página web en lugar del archivo de la factura.",
  XML_UUID_MISSING: "El archivo descargado no contiene un folio fiscal válido.",
  XML_TOTAL_MISMATCH: "El total de la factura no coincide con el total del ticket.",
  XML_RFC_MISMATCH: "La factura fue emitida a un RFC diferente al tuyo.",
  XML_TIPO_COMPROBANTE_INVALID: "El archivo contiene un tipo de comprobante fiscal desconocido.",
  XML_FECHA_TIMBRADO_INVALID: "La fecha de timbrado del archivo no es válida."
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
    return invalid("XML_NOT_DOWNLOADED");
  }
  const htmlPosition = xmlContent.search(/<!doctype html|<html[\s>]/i);
  const cfdiPosition = xmlContent.search(/<(?:cfdi:)?Comprobante[\s>]/i);
  if (htmlPosition >= 0 && (cfdiPosition < 0 || htmlPosition < cfdiPosition)) return invalid("XML_IS_ACTUALLY_HTML");

  // 1. Basic parseability check (starts with xml declaration or has Comprobante tag)
  if (!xmlContent.includes("<cfdi:Comprobante") && !xmlContent.includes("<Comprobante")) {
    return invalid("XML_STRUCTURE_INVALID");
  }

  // 2. CFDI Version check
  const versionMatch = xmlContent.match(/Version="([^"]+)"/i) || xmlContent.match(/version="([^"]+)"/i);
  if (!versionMatch) {
    return invalid("XML_STRUCTURE_INVALID");
  }
  const version = versionMatch[1];
  if (version !== "4.0" && version !== "3.3") {
    return invalid("XML_STRUCTURE_INVALID");
  }

  // 3. Structure check: must contain TimbreFiscalDigital
  if (!xmlContent.includes("TimbreFiscalDigital") || !xmlContent.includes("UUID=")) {
    return invalid("XML_STRUCTURE_INVALID");
  }

  // 4. Parse UUID (regex)
  const uuidMatch = xmlContent.match(/UUID="([a-fA-F0-9-]{36})"/i);
  if (!uuidMatch) {
    return invalid("XML_UUID_MISSING");
  }
  const uuid = uuidMatch[1];

  // 5. Parse Total (regex)
  const totalMatch = xmlContent.match(/Total="([0-9.]+)"/) || xmlContent.match(/total="([0-9.]+)"/);
  if (!totalMatch) {
    return invalid("XML_TOTAL_MISMATCH");
  }
  const parsedTotal = parseFloat(totalMatch[1]);
  if (Math.abs(parsedTotal - expectedTotal) > 0.5) { // 50 cents variance allowed for rounding/cents
    return invalid("XML_TOTAL_MISMATCH");
  }

  // 6. Parse RFC Emisor (using tag-specific regex)
  const emisorTagMatch = xmlContent.match(/<cfdi:Emisor([^>]+)>/i) || xmlContent.match(/<Emisor([^>]+)>/i);
  if (!emisorTagMatch) {
    return invalid("XML_STRUCTURE_INVALID");
  }
  const emisorAttrs = emisorTagMatch[1];
  const rfcEmisorMatch = emisorAttrs.match(/Rfc="([^"]+)"/i);
  if (!rfcEmisorMatch) {
    return invalid("XML_STRUCTURE_INVALID");
  }
  const rfcEmisor = rfcEmisorMatch[1].toUpperCase();
  const regimenFiscalEmisorMatch = emisorAttrs.match(/RegimenFiscal="([^"]+)"/i);
  const regimenFiscalEmisor = regimenFiscalEmisorMatch ? regimenFiscalEmisorMatch[1] : undefined;

  // 7. Parse RFC Receptor (using tag-specific regex)
  const receptorTagMatch = xmlContent.match(/<cfdi:Receptor([^>]+)>/i) || xmlContent.match(/<Receptor([^>]+)>/i);
  if (!receptorTagMatch) {
    return invalid("XML_STRUCTURE_INVALID");
  }
  const receptorAttrs = receptorTagMatch[1];
  const rfcReceptorMatch = receptorAttrs.match(/Rfc="([^"]+)"/i);
  if (!rfcReceptorMatch) {
    return invalid("XML_STRUCTURE_INVALID");
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
    return invalid("XML_TIPO_COMPROBANTE_INVALID");
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
  if (!fechaTimbrado) return invalid("XML_FECHA_TIMBRADO_INVALID");
  const timbradoMs = Date.parse(fechaTimbrado);
  if (Number.isNaN(timbradoMs) || timbradoMs > Date.now() + 60 * 60 * 1000) {
    return invalid("XML_FECHA_TIMBRADO_INVALID");
  }

  // Validate that the Receptor RFC in the XML matches the expected user fiscal profile RFC
  if (rfcReceptor !== expectedRfcReceptor.toUpperCase().trim()) {
    return invalid("XML_RFC_MISMATCH");
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
