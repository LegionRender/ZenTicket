import { getGeminiClient } from "../gemini/client";
import { generateLocalPdfHtml, generateLocalXml, generateUUID } from "../invoicing/localCfdi";

interface RunAutomationInput {
  ticket: any;
  profile: any;
  connector: any;
  customKey?: string;
}

function buildLocalInvoice(ticket: any, profile: any, connector: any, folioFiscal: string) {
  return {
    xmlContent: generateLocalXml(ticket, profile, connector, folioFiscal),
    pdfHtml: generateLocalPdfHtml(ticket, profile, connector, folioFiscal),
    folioFiscal,
    cost: connector?.learnedFrom === "automatizacion_ticket" ? 1.50 : 2.50,
    rawCost: 0,
  };
}

export async function runTicketAutomation({ ticket, profile, connector, customKey }: RunAutomationInput) {
  const generatedFolioFiscal = generateUUID();

  let ai;
  try {
    ai = getGeminiClient(customKey);
  } catch (err: any) {
    console.warn("Gemini client missing or failed to initialize, using robust offline invoice generator.");
    return buildLocalInvoice(ticket, profile, connector, generatedFolioFiscal);
  }

  const payloadText = `TICKET COMPRADO: ${JSON.stringify(ticket)}
                       DATOS FISCALES RECEPTOR: ${JSON.stringify(profile)}
                       CONECTOR PORTAL: ${JSON.stringify(connector)}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: payloadText,
      config: {
        systemInstruction: `Eres FactuBot AI, el motor de generaciÃ³n CFDI 4.0 oficial de simulaciÃ³n.
                            Dado un ticket de compra mexicano extraÃ­do, la direcciÃ³n del portal de facturaciÃ³n y el perfil fiscal del receptor, procesa la automatizaciÃ³n.
                            Debes generar tres piezas de informaciÃ³n extremadamente estructuradas:
                            1. Un CFDI v4.0 XML realista. Debe poseer etiquetas estÃ¡ndar (cfdi:Comprobante, cfdi:Emisor, cfdi:Receptor, cfdi:Conceptos, cfdi:Concepto, cfdi:Impuestos, cfdi:Traslados, cfdi:Traslado con TipoFactor='Tasa', TasaOCuota='0.160000', timbrado con un timbre tfd:TimbreFiscalDigital realista con FolioFiscal UUID, NoCertificadoSAT y SellosBase64 simulados).
                            2. Un PDF en HTML responsive moderno, estilizado con excelentes clases de Tailwind CSS, que asombre visualmente. Debe poseer un tÃ­tulo formal de 'REPRESENTACIÃ“N IMPRESA DE CFDI 4.0', un diseÃ±o tabular impecable, logo estilizado, cÃ³digo de barras QR (representado con un recuadro interactivo o SVG visual), sello digital de emisor, receptor, totales desglosados (Subtotal, IVA 16%, Total), desglose de conceptos, y un botÃ³n para exportar o imprimir. El HTML no debe incluir doctype de pÃ¡gina completa, solo un contenedor div principal.
                            3. El Folio Fiscal UUID de la transacciÃ³n simulada.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            xmlContent: { type: "STRING", description: "El XML de CFDI 4.0 alinedado estrictamente con el SAT en MÃ©xico" },
            pdfHtml: { type: "STRING", description: "El cÃ³digo HTML responsive completo y elegante estilizado con Tailwind CSS (sin incluir headers html o doctype, solo el container del cuerpo de la factura para renderizado seguro)." },
            folioFiscal: { type: "STRING", description: "UUID de 36 caracteres del Timbre Fiscal Digital SAT (ej: 3FA8F392-80FF-11ED-A1EB-0242AC120002)" },
          },
          required: ["xmlContent", "pdfHtml", "folioFiscal"],
        },
      },
    });

    const textResult = response.text;
    if (!textResult) {
      throw new Error("Failed to compile CFDI data from Gemini");
    }

    const promptTokens = response.usageMetadata?.promptTokenCount || 1500;
    const outputTokens = response.usageMetadata?.candidatesTokenCount || 4500;
    const exchangeRate = 18.50;
    const rawCost = (((promptTokens * 0.075 + outputTokens * 0.30) / 1000000)) * exchangeRate;
    const generatedInvoicing = JSON.parse(textResult.trim());

    return {
      ...generatedInvoicing,
      cost: connector?.learnedFrom === "automatizacion_ticket" ? 15.00 : 2.50,
      rawCost: parseFloat(rawCost.toFixed(6)),
    };
  } catch (error: any) {
    console.warn("Automation simulation failed using Gemini API. Falling back to robust offline generation engine...", error.message || error);
    return buildLocalInvoice(ticket, profile, connector, generatedFolioFiscal);
  }
}
