export function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

// Helper function: Escape XML characters safely
export function escapeXml(unsafe: string): string {
  if (typeof unsafe !== "string") return "";
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case "\"": return "&quot;";
      default: return c;
    }
  });
}

// Helper function: Generate standard Mexican Portal specifi// Helper function: Generate standard Mexican Portal specifications
// Helper function: Generate elegant compliant simulated XML (fallback)
export function generateLocalXml(ticket: any, profile: any, connector: any, folioFiscal: string): string {
  const dateStr = new Date().toISOString().substring(0, 19);
  const total = parseFloat(ticket.total) || 0;
  const subtotal = (total / 1.16).toFixed(2);
  const iva = (total - parseFloat(subtotal)).toFixed(2);
  
  let itemsXml = "";
  if (Array.isArray(ticket.items) && ticket.items.length > 0) {
    itemsXml = ticket.items.map((item: any, idx: number) => {
      const itemAmount = parseFloat(item.amount) || 0;
      const itemSubtotal = (itemAmount / 1.16).toFixed(2);
      const itemIva = (itemAmount - parseFloat(itemSubtotal)).toFixed(2);
      return `    <cfdi:Concepto ClaveProdServ="90101501" NoIdentificacion="REF_${idx + 1}" Cantidad="1.00" ClaveUnidad="E48" Unidad="Servicio" Descripcion="${escapeXml(item.description || "Consumo general")}" ValorUnitario="${itemSubtotal}" Importe="${itemSubtotal}">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="${itemSubtotal}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${itemIva}" />
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>`;
    }).join("\n");
  } else {
    itemsXml = `    <cfdi:Concepto ClaveProdServ="90101501" NoIdentificacion="CON-01" Cantidad="1.00" ClaveUnidad="E48" Unidad="Servicio" Descripcion="Consumo de alimentos según ticket folio ${escapeXml(ticket.folio || "001")}" ValorUnitario="${subtotal}" Importe="${subtotal}">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="${subtotal}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva}" />
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd http://www.sat.gob.mx/TimbreFiscalDigital http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd" Version="4.0" Serie="FACT" Folio="${Math.floor(100000 + Math.random() * 900000)}" Fecha="${dateStr}" Sello="SIM_SELLOS_AUTOMATION_OK_FACTUBOT" NoCertificado="00001000000504454321" SubTotal="${subtotal}" Total="${total.toFixed(2)}" Moneda="MXN" TipoDeComprobante="I" Exportacion="01" LugarExpedicion="${profile.codigoPostal || "01000"}">
  <cfdi:Emisor Rfc="${escapeXml(ticket.rfcEmisor || "XAXX010101000")}" Nombre="${escapeXml(ticket.nombreEmisor || "EMISOR SIMULADO S.A. DE C.V.")}" RegimenFiscal="601" />
  <cfdi:Receptor Rfc="${escapeXml(profile.rfc || "XAXX010101000")}" Nombre="${escapeXml(profile.razonSocial || "CLIENTE RECEPTOR S.A.")}" DomicilioFiscalReceptor="${profile.codigoPostal || "01000"}" RegimenFiscalReceptor="${profile.regimenFiscal || "605"}" UsoCFDI="${profile.usoCFDI || "G03"}" />
  <cfdi:Conceptos>
${itemsXml}
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${iva}">
    <cfdi:Traslados>
      <cfdi:Traslado Base="${subtotal}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva}" />
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="${folioFiscal}" FechaTimbrado="${dateStr}" NoCertificadoSAT="00001000000502000436" SelloCFD="SelloDigitalEmisorSimuladoFactuBot" SelloSAT="SelloDigitalSatSimuladoFactuBot" RfcProvCertif="SAT970701NN3" />
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}

// Helper function: Generate high-fidelity simulated PDF design with Tailwind (fallback)
export function generateLocalPdfHtml(ticket: any, profile: any, connector: any, folioFiscal: string): string {
  const dateStr = new Date().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const total = parseFloat(ticket.total) || 0;
  const subtotal = total / 1.16;
  const iva = total - subtotal;
  
  let itemsRows = "";
  if (Array.isArray(ticket.items) && ticket.items.length > 0) {
    itemsRows = ticket.items.map((item: any, idx: number) => {
      const itemAmount = parseFloat(item.amount) || 0;
      const itemSub = itemAmount / 1.16;
      return `
        <tr class="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/50 transition">
          <td class="py-3 px-4 font-medium text-zinc-800">1</td>
          <td class="py-3 px-4 font-mono text-xs text-zinc-500">90101501</td>
          <td class="py-3 px-4 text-zinc-750 text-xs">${escapeXml(item.description || "Consumo general")}</td>
          <td class="py-3 px-4 text-right font-mono text-xs text-zinc-600">$${itemSub.toFixed(2)}</td>
          <td class="py-3 px-4 text-right font-mono font-semibold text-xs text-zinc-900">$${itemAmount.toFixed(2)}</td>
        </tr>
      `;
    }).join("");
  } else {
    itemsRows = `
      <tr class="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/50 transition">
        <td class="py-3 px-4 font-semibold text-zinc-850">1</td>
        <td class="py-3 px-4 font-mono text-xs text-zinc-500">90101501</td>
        <td class="py-3 px-4 text-zinc-750 text-xs">Consumo de alimentos según ticket folio: ${escapeXml(ticket.folio || "M-8495")}</td>
        <td class="py-3 px-4 text-right font-mono text-xs text-zinc-600">$${subtotal.toFixed(2)}</td>
        <td class="py-3 px-4 text-right font-mono font-bold text-xs text-zinc-900">$${total.toFixed(2)}</td>
      </tr>
    `;
  }

  return `
    <div class="max-w-4xl mx-auto bg-white p-6 md:p-12 shadow-2xl rounded-2xl border border-zinc-150 text-zinc-800 text-sm font-sans relative overflow-hidden my-6">
      <!-- Watermark Badge for Demo Fallback -->
      <div class="absolute top-4 right-4 bg-amber-50 border border-amber-200 text-amber-700 font-bold px-3 py-1 rounded-full text-[10px] uppercase tracking-wider flex items-center gap-1">
        <span>Prueba Simulada</span>
      </div>

      <!-- Header -->
      <div class="flex flex-col md:flex-row justify-between items-start border-b border-zinc-200 pb-8 gap-6">
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-lg select-none">F</div>
            <span class="text-xl font-bold tracking-tight text-neutral-900 uppercase">FactuBot Automación</span>
          </div>
          <p class="text-[12px] text-zinc-500 max-w-sm leading-relaxed">Este documento es una representación impresa de un CFDI 4.0 generado mediante simulación de inteligencia artificial de alto nivel con backup local.</p>
        </div>
        
        <div class="text-right space-y-1">
          <div class="inline-block bg-indigo-50 text-indigo-700 font-bold px-3 py-1 rounded-lg text-xs uppercase tracking-wider">Factura Electrónica</div>
          <p class="text-xs text-zinc-400">Folio Interno: <span class="font-mono text-zinc-700 font-semibold">FACT-${Math.floor(100000 + Math.random() * 900000)}</span></p>
          <p class="text-xs text-zinc-400">Fecha de Timbrado: <span class="font-mono text-zinc-700">${dateStr}</span></p>
        </div>
      </div>

      <!-- Emisor / Receptor Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 py-8 border-b border-zinc-150">
        <div class="space-y-3">
          <div class="text-xs text-zinc-400 font-bold uppercase tracking-wider">DATOS DEL EMISOR</div>
          <div class="space-y-1 bg-zinc-50 p-4 rounded-xl border border-zinc-100">
            <p class="font-bold text-zinc-900 text-base">${escapeXml(ticket.nombreEmisor || "EMISOR AUTOMATIZADO S.A. DE C.V.")}</p>
            <p class="font-mono text-xs text-zinc-650">RFC: <span class="font-semibold text-zinc-900">${escapeXml(ticket.rfcEmisor || "XAXX010101000")}</span></p>
            <p class="text-xs text-zinc-500">Régimen Fiscal: 601 General de Ley Personas Morales</p>
            <p class="text-xs text-zinc-500">Portal de Origen: <span class="text-indigo-650 underline font-mono text-[10px] break-all">${escapeXml(connector.portalUrl || "https://facturacion.net")}</span></p>
          </div>
        </div>

        <div class="space-y-3">
          <div class="text-xs text-zinc-400 font-bold uppercase tracking-wider">DATOS DEL RECEPTOR</div>
          <div class="space-y-1 bg-zinc-50 p-4 rounded-xl border border-zinc-100">
            <p class="font-bold text-zinc-900 text-base">${escapeXml(profile.razonSocial || "CLIENTE RECEPTOR S.C.")}</p>
            <p class="font-mono text-xs text-zinc-650">RFC: <span class="font-semibold text-zinc-900">${escapeXml(profile.rfc || "XAXX010101000")}</span></p>
            <p class="text-xs text-zinc-500">Régimen Fiscal: ${escapeXml(profile.regimenFiscal || "605 - Sueldos y Salarios")}</p>
            <p class="text-xs text-zinc-500">Código Postal Fiscal: <span class="font-mono">${escapeXml(profile.codigoPostal || "01000")}</span></p>
            <p class="text-xs text-zinc-500">Uso de CFDI: <span class="font-semibold">${escapeXml(profile.usoCFDI || "G03 - Gastos en general")}</span></p>
          </div>
        </div>
      </div>

      <!-- Partidas / Conceptos Table -->
      <div class="py-8">
        <div class="text-[11px] text-zinc-400 font-bold uppercase tracking-wider mb-3">CONCEPTOS INCLUIDOS EN FACTURA</div>
        <div class="border border-zinc-155 rounded-xl overflow-hidden">
          <table class="w-full text-left border-collapse">
            <thead class="bg-zinc-50 text-xs text-zinc-500 font-semibold border-b border-zinc-150">
              <tr>
                <th class="py-3 px-4 w-12">Cant</th>
                <th class="py-3 px-4 w-28">Clave SAT</th>
                <th class="py-3 px-4">Descripción</th>
                <th class="py-3 px-4 text-right w-28">Pr. Unitario</th>
                <th class="py-3 px-4 text-right w-28">Importe</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Totales y Sello Fiscal Digital -->
      <div class="grid grid-cols-1 md:grid-cols-12 gap-8 pt-6 border-t border-zinc-150 items-start">
        <!-- SAT Stamp Metadata -->
        <div class="md:col-span-7 col-span-1 border border-zinc-100 rounded-xl p-4 bg-zinc-50 space-y-4">
          <div class="flex items-start gap-4">
            <!-- Simulated QR Code representing CFDI verification -->
            <div class="w-24 h-24 bg-white border border-zinc-250 flex flex-col items-center justify-center p-1 rounded-lg shadow-sm shrink-0">
              <svg class="w-full h-full text-zinc-800" viewBox="0 0 100 100">
                <rect x="5" y="5" width="25" height="25" fill="currentColor" />
                <rect x="10" y="10" width="15" height="15" fill="white" />
                <rect x="13" y="13" width="9" height="9" fill="currentColor" />
                <rect x="70" y="5" width="25" height="25" fill="currentColor" />
                <rect x="75" y="10" width="15" height="15" fill="white" />
                <rect x="78" y="13" width="9" height="9" fill="currentColor" />
                <rect x="5" y="70" width="25" height="25" fill="currentColor" />
                <rect x="10" y="75" width="15" height="15" fill="white" />
                <rect x="13" y="78" width="9" height="9" fill="currentColor" />
                <rect x="35" y="12" width="5" height="5" fill="currentColor" />
                <rect x="45" y="8" width="8" fill="currentColor" />
                <rect x="58" y="12" width="4" height="4" fill="currentColor" />
                <rect x="38" y="24" width="12" height="4" fill="currentColor" />
                <rect x="38" y="32" width="6" height="6" fill="currentColor" />
                <rect x="50" y="45" width="10" height="10" fill="currentColor" />
                <rect x="18" y="45" width="4" height="8" fill="currentColor" />
                <rect x="35" y="58" width="15" height="3" fill="currentColor" />
                <rect x="5" y="40" width="12" height="2" fill="currentColor" />
                <rect x="85" y="45" width="8" height="8" fill="currentColor" />
                <rect x="72" y="58" width="14" height="4" fill="currentColor" />
                <rect x="42" y="70" width="8" height="12" fill="currentColor" />
                <rect x="62" y="75" width="28" height="5" fill="currentColor" />
                <rect x="75" y="85" width="4" height="10" fill="currentColor" />
                <rect x="42" y="88" width="15" height="4" fill="currentColor" />
              </svg>
            </div>
            
            <div class="flex-1 space-y-1 min-w-0">
              <span class="text-[9px] uppercase tracking-wider text-zinc-400 font-bold block">Folio Fiscal Digital (UUID)</span>
              <p class="font-mono text-[11px] text-indigo-700 font-bold select-all break-all">${folioFiscal}</p>
              <div class="grid grid-cols-2 gap-2 pt-2">
                <div>
                  <span class="text-[8px] uppercase tracking-wider text-zinc-400 font-bold block">No. Certificado SAT</span>
                  <p class="font-mono text-[10px] text-zinc-700 font-medium font-bold">00001000000502000436</p>
                </div>
                <div>
                  <span class="text-[8px] uppercase tracking-wider text-zinc-400 font-bold block">Proveedor Certif.</span>
                  <p class="font-mono text-[10px] text-zinc-700 font-medium font-bold">SAT970701NN3</p>
                </div>
              </div>
            </div>
          </div>

          <div class="space-y-1 border-t border-zinc-200 pt-3">
            <span class="text-[8px] uppercase tracking-wider text-zinc-400 font-bold block">Sello Digital del Emisor</span>
            <p class="font-mono text-[8px] text-zinc-500 break-all leading-normal select-all bg-white p-1.5 rounded border border-zinc-100">SIM_S8e7XU9rR/g8eY7wI2w9f8W9uR9xX8y3t1W7+R3v7f1m6eY=</p>
          </div>
          
          <div class="space-y-1 border-t border-zinc-200/60 pt-3">
            <span class="text-[8px] uppercase tracking-wider text-zinc-400 font-bold block">Sello Digital del SAT</span>
            <p class="font-mono text-[8px] text-zinc-500 break-all leading-normal select-all bg-white p-1.5 rounded border border-zinc-100">SIM_SAT_f1e2a82_b500_4db2_9cf3_751b301c35ee_OK_S6g=</p>
          </div>
        </div>

        <!-- Financial Totals -->
        <div class="md:col-span-5 col-span-1 space-y-2 text-right">
          <div class="flex justify-between items-center text-zinc-500 text-xs px-2">
            <span>Subtotal Gravado</span>
            <span class="font-mono font-medium text-zinc-700">$${subtotal.toFixed(2)}</span>
          </div>
          <div class="flex justify-between items-center text-zinc-500 text-xs px-2">
            <span>IVA Trasladado (16.00%)</span>
            <span class="font-mono font-medium text-zinc-700">$${iva.toFixed(2)}</span>
          </div>
          <div class="flex justify-between items-center text-zinc-900 font-bold text-base bg-indigo-50 p-3 rounded-xl border border-indigo-100/40">
            <span class="text-indigo-900 font-black tracking-tight text-xs uppercase">Total de Factura</span>
            <span class="font-mono text-indigo-700 text-lg">$${total.toFixed(2)}</span>
          </div>
          
          <p class="text-[9.5px] text-zinc-400 italic pt-2 leading-relaxed">Esta es una factura de prueba generada el ${dateStr}. Cumple técnicamente con las especificaciones v4.0 en entornos simulados.</p>
        </div>
      </div>
    </div>
  `;
}