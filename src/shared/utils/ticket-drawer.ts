export interface MockTicketSpec {
  nombreEmisor: string;
  rfcEmisor: string;
  fechaCompra: string;
  folio: string;
  total: number;
  sucursal: string;
  items: Array<{ description: string; price: number }>;
}

export const SAMPLE_TICKETS: Record<string, MockTicketSpec> = {
  starbucks: {
    nombreEmisor: "STARBUCKS COFFEE",
    rfcEmisor: "SFC120305T19",
    fechaCompra: "2026-06-05",
    folio: "8472-3918-4903",
    total: 185.00,
    sucursal: "REFORMA CENTRO",
    items: [
      { description: "CAPPUCCINO VENTI", price: 85.00 },
      { description: "CHILE CHIPOTLE PANINI", price: 100.00 }
    ]
  },
  walmart: {
    nombreEmisor: "NUEVA WAL-MART DE MEXICO",
    rfcEmisor: "NWM9709244W4",
    fechaCompra: "2026-06-07",
    folio: "928374910283",
    total: 734.50,
    sucursal: "PORTAL SAN ANGEL",
    items: [
      { description: "DETERGENTE ARIEL 3KG", price: 189.00 },
      { description: "LECHE ENTERA LALA 4PZ", price: 108.50 },
      { description: "SARTEN T-FAL EXPERT", price: 437.00 }
    ]
  },
  oxxo: {
    nombreEmisor: "CADENA COMERCIAL OXXO",
    rfcEmisor: "CCO8605231N4",
    fechaCompra: "2026-06-08",
    folio: "3920192039201",
    total: 104.50,
    sucursal: "TACUBAYA DF",
    items: [
      { description: "COCA COLA LIGHT 600ML", price: 21.50 },
      { description: "SABRITAS SAL 110G", price: 42.00 },
      { description: "TRIDENT VALU PACK YER", price: 41.00 }
    ]
  }
};

/**
 * Draws a thermal receipt onto a canvas and returns the base64 PNG data URL.
 */
export function drawMockTicketToDataUrl(spec: MockTicketSpec): string {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 650;
  
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Receipt background (light thermal paper cream)
  ctx.fillStyle = "#faf7ee";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Noise texture/crumple lines for paper feel
  ctx.strokeStyle = "rgba(0,0,0,0.03)";
  ctx.lineWidth = 1;
  for (let i = 20; i < canvas.height; i += 30) {
    ctx.beginPath();
    ctx.moveTo(5, i + Math.sin(i) * 5);
    ctx.lineTo(canvas.width - 5, i + Math.cos(i) * 5);
    ctx.stroke();
  }

  // Draw border dashed line
  ctx.strokeStyle = "#8c8273";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  ctx.setLineDash([]);

  // Typography settings
  ctx.fillStyle = "#1e1b18"; // Thermal ink grey-black
  
  // Header Store Name
  ctx.font = "bold 20px monospace";
  ctx.textAlign = "center";
  ctx.fillText(spec.nombreEmisor, canvas.width / 2, 50);

  // Subheader RFC and sucursal
  ctx.font = "12px monospace";
  ctx.fillText(`RFC: ${spec.rfcEmisor}`, canvas.width / 2, 80);
  ctx.fillText(`SUCURSAL: ${spec.sucursal}`, canvas.width / 2, 100);
  ctx.fillText("==============================", canvas.width / 2, 125);

  // Metadata: Folio & Date
  ctx.textAlign = "left";
  ctx.font = "11px monospace";
  ctx.fillText(`FOLIO TICKET: ${spec.folio}`, 25, 150);
  ctx.fillText(`FECHA COMPRA: ${spec.fechaCompra}`, 25, 168);
  ctx.fillText(`OPERACION: AUTOSERVICIO SAT`, 25, 186);

  ctx.textAlign = "center";
  ctx.fillText("------------------------------", canvas.width / 2, 210);

  // Items Heading
  ctx.textAlign = "left";
  ctx.font = "bold 12px monospace";
  ctx.fillText("DESCRIPCION", 25, 230);
  ctx.textAlign = "right";
  ctx.fillText("IMPORTE", canvas.width - 25, 230);

  ctx.textAlign = "center";
  ctx.font = "11px monospace";
  ctx.fillText("------------------------------", canvas.width / 2, 245);

  // Draw Items list
  let y = 265;
  ctx.font = "12px monospace";
  spec.items.forEach(item => {
    ctx.textAlign = "left";
    ctx.fillText(item.description.length > 22 ? item.description.substring(0, 22) : item.description, 25, y);
    ctx.textAlign = "right";
    ctx.fillText(`$${item.price.toFixed(2)}`, canvas.width - 25, y);
    y += 24;
  });

  // Totals spacer
  y += 10;
  ctx.textAlign = "center";
  ctx.font = "11px monospace";
  ctx.fillText("==============================", canvas.width / 2, y);
  y += 24;

  // Subtotal & IVA desglosado
  const subtotal = spec.total / 1.16;
  const iva = spec.total - subtotal;

  ctx.textAlign = "left";
  ctx.fillText("SUBTOTAL (MXN):", 50, y);
  ctx.textAlign = "right";
  ctx.fillText(`$${subtotal.toFixed(2)}`, canvas.width - 50, y);
  y += 22;

  ctx.textAlign = "left";
  ctx.fillText("IVA 16% (MXN):", 50, y);
  ctx.textAlign = "right";
  ctx.fillText(`$${iva.toFixed(2)}`, canvas.width - 50, y);
  y += 22;

  ctx.font = "bold 15px monospace";
  ctx.textAlign = "left";
  ctx.fillText("TOTAL DE COMPRA:", 50, y);
  ctx.textAlign = "right";
  ctx.fillText(`$${spec.total.toFixed(2)}`, canvas.width - 50, y);
  y += 35;

  // Barcode / QR line representations
  ctx.textAlign = "center";
  ctx.font = "10px monospace";
  ctx.fillStyle = "#5c544a";
  ctx.fillText("CÓDIGO DE FACTURACIÓN DIGITAL", canvas.width / 2, y);
  y += 15;

  // Simple visual barcode
  ctx.fillStyle = "#1e1b18";
  const barcodeX = canvas.width / 2 - 120;
  for (let b = 0; b < 240; b += 6) {
    const barWidth = (b % 4 === 0) ? 3 : (b % 5 === 0) ? 1 : 2;
    ctx.fillRect(barcodeX + b, y, barWidth, 30);
  }
  y += 45;

  ctx.font = "bold 11px monospace";
  ctx.fillText(`*${spec.folio.replace(/-/g, "")}*`, canvas.width / 2, y);
  y += 25;

  ctx.font = "9px monospace";
  ctx.fillStyle = "#7c7267";
  ctx.fillText("¡Gracias por su preferencia!", canvas.width / 2, y);
  ctx.fillText("Autoservicio de Facturación Electrónica", canvas.width / 2, y + 15);
  ctx.fillText("ZenTicket AI Engine integration active", canvas.width / 2, y + 28);

  return canvas.toDataURL("image/png");
}
