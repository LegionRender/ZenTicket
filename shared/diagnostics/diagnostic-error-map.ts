export const getFriendlyErrorMsg = (errorCode: string | null | undefined): string => {
  if (!errorCode) return "Ocurrió un inconveniente desconocido con la facturación.";
  const catalog: { [key: string]: string } = {
    ALREADY_INVOICED_XML_NOT_RECOVERED: "El portal indica que el ticket ya fue facturado, pero ZenTicket no pudo recuperar el XML fiscal.",
    CFDI_RFC_RECEPTOR_MISMATCH: "El RFC emisor o receptor del CFDI obtenido no coincide con el perfil del usuario.",
    CFDI_TOTAL_MISMATCH: "El monto total de la factura recuperada no coincide con el total esperado del ticket.",
    CFDI_NOT_FOUND_IN_SAT: "El CFDI obtenido no fue localizado o no está vigente en los controles del SAT.",
    CFDI_INVALID_XML: "El archivo XML obtenido no cumple con la estructura básica obligatoria del SAT.",
    CONNECTOR_NOT_FOUND: "No se encontró un conector disponible para el emisor de este ticket.",
    CAPTCHA_FAILED: "No se pudo resolver el código CAPTCHA del portal en el tiempo límite.",
    PORTAL_ERROR: "El portal del comercio devolvió un mensaje de error o no se encuentra disponible.",
    TIMEOUT: "El robot superó el tiempo máximo de espera sin recibir respuesta del portal."
  };
  return catalog[errorCode] || `Error técnico: ${errorCode}. Requiere revisión manual.`;
};
