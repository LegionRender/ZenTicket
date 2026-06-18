export function getLocalDictionaryMatch(nombreEmisor: string, rfcEmisor: string) {
  const nameClean = nombreEmisor.toLowerCase().trim();

  // Defined static mapping of major Mexican brands categorized into 18 main logic groups covering 80+ specific brands
  const BRAND_DICTIONARY = [
    {
      // 1. Alsea Brands (10 brands)
      keys: ["starbucks", "alsea", "vips", "domino", "burger king", "chili", "italianni", "cheesecake", "pf chang", "p.f. chang"],
      portalUrl: "https://historico.alsea.com.mx/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input[name='rfc']", type: "text", required: true },
        { key: "ticket", name: "Ticket (9 o 12 dígitos)", selector: "input#ticketNo, input[name='ticket']", type: "text", required: true },
        { key: "tienda", name: "Número de Tienda", selector: "input#storeNo", type: "text", required: true },
        { key: "fecha", name: "Fecha de Compra", selector: "input#fechaTicket", type: "date", required: true },
        { key: "total", name: "Monto Total", selector: "input#montoTotal", type: "number", required: true }
      ],
      steps: [
        "Navegar al Portal Unificado de Facturación Alsea",
        "Ingresar el RFC del cliente, número de ticket, número de tienda y monto total",
        "Hacer clic en 'Siguiente' para validar el ticket de consumo",
        "Ingresar o validar los datos fiscales corporativos",
        "Hacer clic en 'Facturar' y descargar XML y PDF"
      ]
    },
    {
      // 2. Oxxo & Oxxo Gas (2 brands)
      keys: ["oxxo", "oxxogas", "oxxo gas"],
      portalUrl: "https://www3.oxxo.com:8080/facturacionOXXO",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input[name='rfc']", type: "text", required: true },
        { key: "folio", name: "Folio de Venta (ID)", selector: "input[name='folio']", type: "text", required: true },
        { key: "fecha", name: "Fecha de Compra", selector: "input[name='fecha']", type: "date", required: true },
        { key: "total", name: "Monto del Ticket", selector: "input[name='total']", type: "number", required: true }
      ],
      steps: [
        "Navegar al portal de facturación oficial de OXXO / Oxxo Gas",
        "Ingresar los datos del Ticket (Folio de Venta, Fecha, Total) y RFC",
        "Confirmar la búsqueda del ticket y avanzar",
        "Completar la información fiscal e indicar el Uso de CFDI",
        "Presionar 'Emitir Factura' para recibir XML y PDF"
      ]
    },
    {
      // 3. Walmart Group (5 brands)
      keys: ["walmart", "bodega", "aurrera", "sams", "superama", "wal-mart", "express"],
      portalUrl: "https://facturacion.walmartmexico.com/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "tc", name: "Número de Ticket (TC)", selector: "input#ticketNo", type: "text", required: true },
        { key: "tr", name: "Código de Transacción (TR)", selector: "input#transactionNo", type: "text", required: true }
      ],
      steps: [
        "Ingresar al portal de facturación de Walmart México",
        "Introducir los identificadores de compra (Código TC de 20 dígitos y Código TR)",
        "Capturar el RFC de la persona física o moral receptora",
        "Asignar la Razón Social y Régimen de Impuestos correspondiente",
        "Hacer clic en 'Obtener Factura' para guardar y descargar archivos"
      ]
    },
    {
      // 4. Costco (1 brand)
      keys: ["costco"],
      portalUrl: "https://www3.costco.com.mx/facturacion",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input[name='rfc']", type: "text", required: true },
        { key: "ticket", name: "Número de Ticket", selector: "input#ticket", type: "text", required: true },
        { key: "membership", name: "Número de Membresía", selector: "input#membership", type: "text", required: true }
      ],
      steps: [
        "Navegar al sistema de facturación electrónica de Costco México",
        "Ingresar el RFC, número de ticket y el identificador de membresía activa",
        "Validar transacción e ingresar Razón Social",
        "Seleccionar Uso de CFDI default",
        "Confirmar generación y descargar el XML y PDF"
      ]
    },
    {
      // 5. Soriana & La Comer Group (5 brands)
      keys: ["soriana", "fresko", "la comer", "lacomer", "sumesa", "city market", "citymarket"],
      portalUrl: "https://facturacion.soriana.com/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "ticket", name: "Código de Barras del Ticket", selector: "input#ticketCode", type: "text", required: true },
        { key: "total", name: "Importe Total", selector: "input#monto", type: "number", required: true }
      ],
      steps: [
        "Ingresar al portal oficial de facturas de Soriana y Grupo La Comer",
        "Digitar el código de barras impreso en el ticket y el importe final",
        "Capturar la información fiscal (RFC, Régimen, CP)",
        "Hacer clic en 'Previsualizar Factura'",
        "Hacer clic en 'Generar' para crear el comprobante CFDI"
      ]
    },
    {
      // 6. Ride Sharing & Delivery (4 brands)
      keys: ["uber", "didi", "rappi", "cabify"],
      portalUrl: "https://riders.uber.com/trips",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input[name='rfc']", type: "text", required: true },
        { key: "trip", name: "ID de Viaje / Orden", selector: "input#orderId", type: "text", required: true },
        { key: "total", name: "Monto del Servicio", selector: "input#amount", type: "number", required: true }
      ],
      steps: [
        "Ingresar a la cuenta oficial de la app de transporte o delivery",
        "Ir a la sección de viajes facturables o facturación automática",
        "Ingresar los datos de RFC, ID del viaje y monto",
        "Confirmar perfil fiscal mexicano y régimen SAT",
        "Generar y descargar el comprobante timbrado fiscal"
      ]
    },
    {
      // 7. Chedraui Group (3 brands)
      keys: ["chedraui", "súper chedraui", "super chedraui", "selecto chedraui"],
      portalUrl: "https://facturacion.chedraui.com.mx/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#UserRFC", type: "text", required: true },
        { key: "ticket", name: "Código de Ticket Chedraui", selector: "input#TicketCode", type: "text", required: true },
        { key: "total", name: "Importe Total Facturable", selector: "input#TicketAmount", type: "number", required: true }
      ],
      steps: [
        "Ir al portal de Autofacturación de Grupo Chedraui",
        "Completar los inputs de RFC, el código impreso en el ticket y la cantidad monetaria",
        "Hacer clic en 'Validar' para pre-cargar la compra comercial",
        "Ingresar los datos de facturación (Nombre, CFDI, CP)",
        "Enviar solicitud y descargar la factura electrónica"
      ]
    },
    {
      // 8. Telecom & Tech (7 brands)
      keys: ["telmex", "telcel", "movistar", "at&t", "att", "izzi", "totalplay", "megacable"],
      portalUrl: "https://telmex.com/mi-telmex",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "cuenta", name: "Número de Teléfono / Cuenta (10 dígitos)", selector: "input#accountNumber", type: "text", required: true }
      ],
      steps: [
        "Acceder al área de clientes 'Mi Telmex', 'Mi Telcel' o portal de su proveedor",
        "Autenticarse con el número de teléfono o cuenta activa",
        "Navegar a la pestaña 'Recibos' o 'Facturación'",
        "Seleccionar el periodo e ingresar RFC fiscal",
        "Descargar el XML y PDF oficial del proveedor"
      ]
    },
    {
      // 9. Toll & Highway (5 brands)
      keys: ["caminos", "capufe", "caseta", "teletransito", "televia", "tag", "pase", "viapass"],
      portalUrl: "https://facturacioncapufe.com.mx/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc_client", type: "text", required: true },
        { key: "codigo", name: "Código de Peaje (18 letras/números)", selector: "input#peajeCode", type: "text", required: true }
      ],
      steps: [
        "Acceder al Sistema de Facturación de Peajes CAPUFE/TeleVía/PASE",
        "Ingresar el RFC del contribuyente receptor",
        "Escribir los códigos del ticket de la caseta de cobro",
        "Asignar Razón Social y forma de pago",
        "Hacer clic en 'Generar Factura' y descargar CFDI"
      ]
    },
    {
      // 10. Gasoline Stations (8 brands)
      keys: ["pemex", "g500", "g-500", "hidrosina", "bp gas", "shell", "mobil", "petro 7", "petro7", "chevron gas"],
      portalUrl: "https://www.facturagas.mx/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "ticket", name: "Número de Ticket de Combustible", selector: "input#ticket_combustible", type: "text", required: true },
        { key: "webid", name: "Web ID / Dígito Verificador", selector: "input#web_id", type: "text", required: true }
      ],
      steps: [
        "Entrar al portal oficial de facturación de la Gasolinera",
        "Ingresar el RFC y el Web ID/Folio que viene impreso en el ticket de carga",
        "Verificar que los datos de litros, precio y producto coincidan",
        "Completar datos fiscales (Uso CFDI, Código Postal)",
        "Confirmar timbrado y recibir los archivos XML/PDF en pantalla"
      ]
    },
    {
      // 11. Pharmacies & Wellness (4 brands)
      keys: ["farmacias guadalajara", "guadalajara", "farmacias del ahorro", "del ahorro", "ahorro", "benavides", "san pablo", "farmacia san pablo"],
      portalUrl: "https://facturacion.neofactura.com.mx/farmacias",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "ticket", name: "Número de Alianza o Folio de Ticket", selector: "input#folioTicket", type: "text", required: true },
        { key: "total", name: "Total del Ticket", selector: "input#totalTicket", type: "number", required: true }
      ],
      steps: [
        "Acceder al sitio de autofacturación de la red de farmacias",
        "Ingresar los dígitos del folio impreso del ticket de compra",
        "Validar el total monetario pagado y su RFC",
        "Añadir Razón Social y régimen fiscal",
        "Descargar su factura e imprimir comprobante"
      ]
    },
    {
      // 12. Convenience Stores (5 brands)
      keys: ["7-eleven", "seven eleven", "seven", "circle k", "circlek", "extra", "neto", "tiendas neto"],
      portalUrl: "https://www.7-eleven.com.mx/facturacion/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input[name='rfc']", type: "text", required: true },
        { key: "ticket", name: "Número de Ticket (Código de barras)", selector: "input#barcode", type: "text", required: true },
        { key: "total", name: "Importe con Centavos", selector: "input#montoTotal", type: "number", required: true }
      ],
      steps: [
        "Abrir el módulo de facturas del portal comercial",
        "Introducir el número de referencia de ticket e importe exacto",
        "Agregar el RFC y Correo Electrónico para el envío automático",
        "Validar datos generales y hacer clic en 'Registrar Factura'"
      ]
    },
    {
      // 13. Department Stores & General Retail (6 brands)
      keys: ["liverpool", "palacio de hierro", "palacio de hierro", "sears", "coppel", "suburbia", "sanborns"],
      portalUrl: "https://facturacion.liverpool.com.mx/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "ticket", name: "Código de Facturación (20 o 22 dígitos)", selector: "input#codFactura", type: "text", required: true }
      ],
      steps: [
        "Entrar al asistente de facturación del almacén mercantil",
        "Introducir el código de facturación impreso arriba o abajo del ticket",
        "Validar el total de la compra correspondiente",
        "Establecer la información fiscal mexicana (Regimen, CP, RFC)",
        "Generar factura y exportar a correo o disco local"
      ]
    },
    {
      // 14. Fast Fashion Retail (6 brands)
      keys: ["h&m", "h & m", "zara", "pull&bear", "pull and bear", "bershka", "stradivarius", "massimo dutti", "inditex"],
      portalUrl: "https://factura.inditex.com/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "ticket", name: "Número de Ticket de Compra", selector: "input#ticket_num", type: "text", required: true },
        { key: "establecimiento", name: "Número de Establecimiento/Tienda", selector: "input#store_id", type: "text", required: true }
      ],
      steps: [
        "Acceder al portal unificado de Tickets de Moda Internacional",
        "Ingresar el código de ticket junto con la fecha de la compra and RFC",
        "Seleccionar el uso correspondiente del CFDI",
        "Haz clic en 'Aceptar' para generar la factura timbrada"
      ]
    },
    {
      // 15. Entertainment & Cinema (4 brands)
      keys: ["cinepolis", "cinépolis", "cinemex", "ticketmaster", "superboletos", "súperboletos"],
      portalUrl: "https://www.cinepolis.com/facturacion-electronica",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "transaccion", name: "Número de Transacción / Folio de Boleto", selector: "input#transaction_id", type: "text", required: true },
        { key: "total", name: "Importe Total", selector: "input#amount", type: "number", required: true }
      ],
      steps: [
        "Ingresar al sistema de comprobantes de Boletaje o Cine",
        "Ingresar el número de referencia o ID de la confirmación de compra",
        "Escribir RFC y Correo del recipiente",
        "Hacer clic en 'Facturar boletos' y esperar el PDF y XML"
      ]
    },
    {
      // 16. Home Improvement & Construction (2 brands)
      keys: ["home depot", "homedepot", "sodimac"],
      portalUrl: "https://www.homedepot.com.mx/facturacion-electronica",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc_input", type: "text", required: true },
        { key: "itu", name: "Código ITU (Impreso en Ticket)", selector: "input#itu_code", type: "text", required: true }
      ],
      steps: [
        "Navegar al portal de Autofacturación de Artículos del Hogar",
        "Asignar su RFC e ingresar los caracteres del código ITU de seguridad",
        "Checar lista de artículos comprados",
        "Darle clic en 'Finalizar' para enviar e imprimir factura"
      ]
    },
    {
      // 17. Diners & Food Chains (7 brands)
      keys: ["toks", "el cardenal", "casa de toño", "casa de tono", "sonora grill", "fisher's", "fishers", "krispy kreme", "dunkin"],
      portalUrl: "https://facturacion.toks.com.mx/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#UserRFC", type: "text", required: true },
        { key: "ticket", name: "Folio de Facturación del Consumo", selector: "input#ticket_folio", type: "text", required: true },
        { key: "fecha", name: "Fecha del Consumo", selector: "input#date_input", type: "date", required: true }
      ],
      steps: [
        "Acceder al portal de facturación oficial de la cadena de alimentos",
        "Ingresar RFC, fecha de consumo y el folio de ticket impreso",
        "Confirmar desglose de alimentos, bebidas e impuestos",
        "Validar régimen fiscal mexicano y solicitar CFDI timbrado"
      ]
    },
    {
      // 18. Logistics & Shipping (4 brands)
      keys: ["dhl", "fedex", "estafeta", "redpack", "ups"],
      portalUrl: "https://facturacion.estafeta.com/",
      fields: [
        { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
        { key: "guia", name: "Número de Guía o Código de Rastreo", selector: "input#tracking_number", type: "text", required: true }
      ],
      steps: [
        "Abrir el módulo de facturación del transportista",
        "Proporcionar el número de guía de envío de 10 o 22 dígitos",
        "Ingresar el RFC fiscal del contribuyente emisor",
        "Confirmar dirección e impuestos",
        "Hacer clic en 'Emitir Comprobante'"
      ]
    }
  ];

  // Search in active brand directories using flexible keywords
  for (const brand of BRAND_DICTIONARY) {
    if (brand.keys.some(key => nameClean.includes(key))) {
      return {
        portalUrl: brand.portalUrl,
        fields: brand.fields,
        steps: brand.steps
      };
    }
  }

  return null;
}

export function getLocalConnectorFallback(nombreEmisor: string, rfcEmisor: string) {
  const nameClean = nombreEmisor.toLowerCase();
  let portalUrlFallback = `https://facturacion.${nameClean.replace(/[^a-z0-9]/g, "") || "comercio"}.com.mx`;
  
  if (nameClean.includes("starbucks") || nameClean.includes("alsea") || nameClean.includes("vips") || nameClean.includes("domino")) {
    portalUrlFallback = "https://historico.alsea.com.mx/";
  } else if (nameClean.includes("oxxo")) {
    portalUrlFallback = "https://www3.oxxo.com:8080/facturacionOXXO";
  } else if (nameClean.includes("walmart") || nameClean.includes("bodega") || nameClean.includes("sams")) {
    portalUrlFallback = "https://facturacion.walmartmexico.com/";
  }

  return {
    portalUrl: portalUrlFallback,
    fields: [
      { key: "rfc", name: "RFC Cliente", selector: "input[name='rfc']", type: "text", required: true },
      { key: "folio", name: "Código de Facturación / Folio", selector: "#txtPrefactura, .input-folio, input[name='folio']", type: "text", required: true },
      { key: "fecha", name: "Fecha de Compra", selector: "input#fechaTicket, .datepicker-input", type: "date", required: true },
      { key: "total", name: "Monto Total (con decimales)", selector: "input[name='total'], #txtMontoTotal", type: "number", required: true }
    ],
    steps: [
      `Navegar al portal oficial de facturación de ${nombreEmisor} en ${portalUrlFallback}`,
      `Ingresar los datos identificadores del ticket: Folio, Fecha, Total y su RFC de cliente`,
      `Hacer clic en el botón 'Validar' o 'Buscar Ticket' para cargar el desglose detallado`,
      `Ingresar los datos de facturación de su Perfil Fiscal (Razón Social, Régimen Postal)`,
      `Hacer clic en el botón 'Generar Factura' o 'Solicitar CFDI'`,
      `Esperar la confirmación y descargar el XML y PDF timbrado`
    ]
  };
}