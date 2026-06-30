export interface SatValidationResult {
  status: "valid" | "cancelled" | "not_found" | "unavailable";
  message?: string;
}

/**
 * Validates the UUID / CFDI status against the SAT webservice.
 * SOAP Client integration with the official SAT endpoint:
 * https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc
 */
export async function validateSatStatus(
  rfcEmisor: string,
  rfcReceptor: string,
  total: number,
  uuid: string
): Promise<SatValidationResult> {
  // Format total as padded string (e.g., 12.34 -> 12.340000) for standard SAT expresssion
  const formattedTotal = total.toFixed(6);
  const expression = `?re=${rfcEmisor}&rr=${rfcReceptor}&tt=${formattedTotal}&id=${uuid}`;
  
  const soapEnvelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
   <soapenv:Header/>
   <soapenv:Body>
      <tem:Consulta>
         <tem:expresionImpresa><![CDATA[${expression}]]></tem:expresionImpresa>
      </tem:Consulta>
   </soapenv:Body>
</soapenv:Envelope>`;

  try {
    const response = await fetch("https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc", {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "http://tempuri.org/IConsultaCFDIService/Consulta"
      },
      body: soapEnvelope,
      signal: AbortSignal.timeout(10000) // 10 seconds timeout
    });

    if (!response.ok) {
      return { 
        status: "unavailable", 
        message: `Servicio SAT no disponible. HTTP ${response.status}` 
      };
    }

    const xmlText = await response.text();

    if (xmlText.includes("Vigente")) {
      return { status: "valid" };
    } else if (xmlText.includes("Cancelado")) {
      return { status: "cancelled" };
    } else if (xmlText.includes("No Encontrado") || xmlText.includes("NoEncontrado")) {
      return { status: "not_found" };
    }

    return { 
      status: "unavailable", 
      message: "Respuesta inesperada o ilegible del servicio del SAT." 
    };
  } catch (err: any) {
    console.error("Error connecting to SAT Consulta service:", err.message);
    return { 
      status: "unavailable", 
      message: `Error de red o timeout del SAT: ${err.message}` 
    };
  }
}
