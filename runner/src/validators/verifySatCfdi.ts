/**
 * Queries the official SAT SOAP web service to check if a CFDI is active and valid (Vigente).
 * SOAP service: https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc
 */
export async function verifySatCfdi(re: string, rr: string, tt: number | string, uuid: string): Promise<boolean> {
  const soapUrl = "https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc";
  
  // Format total: SAT expects it to be formatted as a string. If it's a number, format it.
  let formattedTotal = typeof tt === "number" ? tt.toFixed(6) : tt;
  
  const expression = `?re=${re}&rr=${rr}&tt=${formattedTotal}&id=${uuid}`;
  
  const soapEnvelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:temp="http://tempuri.org/">
   <soapenv:Header/>
   <soapenv:Body>
      <temp:Consulta>
         <temp:expresionImpresa><![CDATA[${expression}]]></temp:expresionImpresa>
      </temp:Consulta>
   </soapenv:Body>
</soapenv:Envelope>`;

  console.log(`[SAT Validator] Querying SOAP expression: ${expression}`);

  try {
    // @ts-ignore
    const response = await fetch(soapUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "http://tempuri.org/IConsultaCFDIService/Consulta"
      },
      body: soapEnvelope
    });

    if (!response.ok) {
      console.warn(`[SAT Validator] SOAP request failed with HTTP ${response.status}`);
      return false;
    }

    const xmlText = await response.text();
    console.log(`[SAT Validator] SOAP response received. Length: ${xmlText.length}`);

    // Parse the <a:Estado> tag using regex
    const statusMatch = xmlText.match(/<a:Estado>(.*?)<\/a:Estado>/i) || xmlText.match(/<Estado>(.*?)<\/Estado>/i);
    if (statusMatch && statusMatch[1]) {
      const status = statusMatch[1].trim();
      console.log(`[SAT Validator] CFDI SAT status: ${status}`);
      return status.toLowerCase() === "vigente";
    }

    console.warn("[SAT Validator] Could not find <Estado> tag in SOAP response");
    return false;
  } catch (error: any) {
    console.error(`[SAT Validator] Error querying SAT SOAP service: ${error.message}`);
    return false;
  }
}
