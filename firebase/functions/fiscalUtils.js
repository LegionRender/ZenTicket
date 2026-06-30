const axios = require("axios");

function parseSatQrUrl(text) {
  if (!text) return null;
  const idMatch = /[?&]id=([^&]+)/i.exec(text);
  const reMatch = /[?&]re=([^&]+)/i.exec(text);
  const rrMatch = /[?&]rr=([^&]+)/i.exec(text);
  const ttMatch = /[?&]tt=([^&]+)/i.exec(text);

  if (!idMatch || !reMatch || !rrMatch || !ttMatch) return null;

  const uuid = idMatch[1].trim();
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!uuidRegex.test(uuid)) return null;

  return {
    uuid,
    rfcEmisor: reMatch[1].trim(),
    rfcReceptor: rrMatch[1].trim(),
    total: parseFloat(ttMatch[1].trim()) || 0
  };
}

function validateXmlStructure(xmlContent) {
  if (!xmlContent) return false;
  const hasComprobante = /<cfdi:Comprobante\b/i.test(xmlContent) || /<Comprobante\b/i.test(xmlContent);
  const hasEmisor = /<cfdi:Emisor\b[^>]*\bRfc=/i.test(xmlContent) || /<Emisor\b[^>]*\bRfc=/i.test(xmlContent);
  const hasReceptor = /<cfdi:Receptor\b[^>]*\bRfc=/i.test(xmlContent) || /<Receptor\b[^>]*\bRfc=/i.test(xmlContent);
  const hasTimbre = (/<tfd:TimbreFiscalDigital\b/i.test(xmlContent) || /<TimbreFiscalDigital\b/i.test(xmlContent)) &&
                    /\bUUID=/i.test(xmlContent) &&
                    /\bFechaTimbrado=/i.test(xmlContent) &&
                    /\bSelloCFD=/i.test(xmlContent) &&
                    /\bSelloSAT=/i.test(xmlContent) &&
                    /\bNoCertificadoSAT=/i.test(xmlContent);

  return !!(hasComprobante && hasEmisor && hasReceptor && hasTimbre);
}

function parseCfdiInfo(xmlContent) {
  const uuidMatch = /UUID="([^"]+)"/i.exec(xmlContent);
  const emisorRfcMatch = /<cfdi:Emisor\b[^>]*\bRfc="([^"]+)"/i.exec(xmlContent) || /<Emisor\b[^>]*\bRfc="([^"]+)"/i.exec(xmlContent);
  const receptorRfcMatch = /<cfdi:Receptor\b[^>]*\bRfc="([^"]+)"/i.exec(xmlContent) || /<Receptor\b[^>]*\bRfc="([^"]+)"/i.exec(xmlContent);
  const totalMatch = /<cfdi:Comprobante\b[^>]*\bTotal="([^"]+)"/i.exec(xmlContent) || /<Comprobante\b[^>]*\bTotal="([^"]+)"/i.exec(xmlContent);

  return {
    uuid: uuidMatch ? uuidMatch[1].trim() : "",
    rfcEmisor: emisorRfcMatch ? emisorRfcMatch[1].trim() : "",
    rfcReceptor: receptorRfcMatch ? receptorRfcMatch[1].trim() : "",
    total: totalMatch ? parseFloat(totalMatch[1].trim()) : 0,
    totalStr: totalMatch ? totalMatch[1].trim() : ""
  };
}

const maskUuid = (u) => u.length > 8 ? `${u.substring(0, 4)}...${u.substring(u.length - 4)}` : u;
const maskRfc = (r) => r.length > 6 ? `${r.substring(0, 3)}***${r.substring(r.length - 3)}` : r;

async function verifyCfdiWithSat(rfcEmisor, rfcReceptor, total, uuid) {
  const expression = `?re=${rfcEmisor}&rr=${rfcReceptor}&tt=${total.toFixed(2)}&id=${uuid}`;
  const soapEnvelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
   <soapenv:Header/>
   <soapenv:Body>
      <tem:Consulta>
         <tem:expresionImpresa><![CDATA[${expression}]]></tem:expresionImpresa>
      </tem:Consulta>
   </soapenv:Body>
</soapenv:Envelope>`;

  try {
    const response = await axios.post("https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc", soapEnvelope, {
      headers: {
        "Content-Type": "text/xml;charset=utf-8",
        "SOAPAction": "http://tempuri.org/IConsultaCFDIService/Consulta"
      }
    });

    const xmlResponse = response.data;
    console.log(`[SAT Verify] Expression: ?re=${maskRfc(rfcEmisor)}&rr=${maskRfc(rfcReceptor)}&tt=${total}&id=${maskUuid(uuid)}`);

    const estadoMatch = /<a:Estado>([^<]+)<\/a:Estado>/i.exec(xmlResponse) || /<Estado>([^<]+)<\/Estado>/i.exec(xmlResponse);
    const codigoEstatusMatch = /<a:CodigoEstatus>([^<]+)<\/a:CodigoEstatus>/i.exec(xmlResponse) || /<CodigoEstatus>([^<]+)<\/CodigoEstatus>/i.exec(xmlResponse);

    const estado = estadoMatch ? estadoMatch[1].trim() : "";
    const codigoEstatus = codigoEstatusMatch ? codigoEstatusMatch[1].trim() : "";

    const estadoLower = estado.toLowerCase();
    if (estadoLower === "vigente") {
      return { status: "valid", satStatus: estado, detail: `Estado: ${estado}. Codigo: ${codigoEstatus}` };
    } else if (estadoLower === "cancelado") {
      return { status: "canceled", satStatus: estado, detail: `Estado: ${estado}. Codigo: ${codigoEstatus}` };
    } else {
      return { status: "not_found", satStatus: estado || "No Encontrado", detail: `Estado: ${estado || "No Encontrado"}. Codigo: ${codigoEstatus}` };
    }
  } catch (err) {
    console.error("Error calling SAT CFDI verification service:", err);
    return { status: "error", satStatus: "Timeout o error crítico", detail: err.message || "Network error calling SAT service" };
  }
}

module.exports = {
  parseSatQrUrl,
  validateXmlStructure,
  parseCfdiInfo,
  verifyCfdiWithSat,
  maskUuid,
  maskRfc
};
