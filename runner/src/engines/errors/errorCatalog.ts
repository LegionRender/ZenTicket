export interface StructuredError {
  code: string;
  userMessage: string;
  probableCause: string;
  severity: "info" | "warning" | "critical";
  recommendedAction: string;
  technicalMessage?: string;
  retryable?: boolean;
  requiresHumanReview?: boolean;
  category?: string;
}

export const ERROR_CATALOG: Record<string, StructuredError> = {
  // Setup & Configuration
  CONNECTOR_NOT_FOUND: {
    code: "CONNECTOR_NOT_FOUND",
    userMessage: "Este comercio aún no cuenta con automatización.",
    probableCause: "No se ha desarrollado un conector para este RFC/Emisor.",
    severity: "critical",
    recommendedAction: "Registra la solicitud del conector o procesa el ticket de forma manual.",
    technicalMessage: "No se encontró un conector para el emisor del ticket.",
    retryable: false,
    requiresHumanReview: true,
    category: "setup"
  },
  PORTAL_MAP_NOT_FOUND: {
    code: "PORTAL_MAP_NOT_FOUND",
    userMessage: "No se encontró el mapa de navegación del portal.",
    probableCause: "No existe una configuración de pasos activa para este conector.",
    severity: "critical",
    recommendedAction: "Configura e ingresa los pasos en la pestaña del Portal Map.",
    technicalMessage: "El documento de portalMap no existe en la base de datos.",
    retryable: false,
    requiresHumanReview: true,
    category: "setup"
  },
  PORTAL_MAP_NOT_APPROVED: {
    code: "PORTAL_MAP_NOT_APPROVED",
    userMessage: "El mapa de navegación no ha sido aprobado.",
    probableCause: "El mapa de pasos del conector está en estado borrador o pendiente de revisión.",
    severity: "warning",
    recommendedAction: "Ingresa al administrador y aprueba el mapa de navegación del conector.",
    technicalMessage: "El portalMap tiene un estado distinto a 'approved'.",
    retryable: false,
    requiresHumanReview: true,
    category: "setup"
  },
  PORTAL_MAP_INVALID: {
    code: "PORTAL_MAP_INVALID",
    userMessage: "El mapa de navegación del portal es inválido o corrupto.",
    probableCause: "El formato JSON o esquema del portal map tiene errores estructurales.",
    severity: "critical",
    recommendedAction: "Revisa y corrige la estructura del Portal Map.",
    technicalMessage: "La estructura del portalMap no pudo ser validada o normalizada.",
    retryable: false,
    requiresHumanReview: true,
    category: "setup"
  },
  CONNECTOR_SCHEMA_INVALID: {
    code: "CONNECTOR_SCHEMA_INVALID",
    userMessage: "La configuración de pasos del conector tiene un esquema inválido.",
    probableCause: "Algún paso del conector contiene claves vacías, URLs prohibidas o formatos incorrectos.",
    severity: "critical",
    recommendedAction: "Revisa y corrige la estructura JSON del Portal Map del conector.",
    technicalMessage: "Error de validación de contrato o normalización de pasos en el conector.",
    retryable: false,
    requiresHumanReview: true,
    category: "setup"
  },

  // Navigator & Browser Execution
  PLAYWRIGHT_BROWSER_LAUNCH_FAILED: {
    code: "PLAYWRIGHT_BROWSER_LAUNCH_FAILED",
    userMessage: "No se pudo iniciar el navegador de automatización.",
    probableCause: "Falta de recursos en el sistema o error de instalación de Playwright.",
    severity: "critical",
    recommendedAction: "Verifica que las dependencias de Playwright estén instaladas en el servidor.",
    technicalMessage: "Playwright chromium.launch falló al levantar el navegador.",
    retryable: true,
    requiresHumanReview: true,
    category: "navigator"
  },
  PORTAL_NAVIGATION_FAILED: {
    code: "PORTAL_NAVIGATION_FAILED",
    userMessage: "Error al navegar al sitio web del comercio.",
    probableCause: "El dominio está caído, bloqueado por firewall, o hay problemas de red local.",
    severity: "critical",
    recommendedAction: "Verifica la conexión a internet del servidor o la disponibilidad del portal.",
    technicalMessage: "La navegación inicial a la URL del portal falló o excedió el tiempo límite.",
    retryable: true,
    requiresHumanReview: true,
    category: "navigator"
  },
  FIELD_RESOLUTION_FAILED: {
    code: "FIELD_RESOLUTION_FAILED",
    userMessage: "No se pudieron resolver las variables dinámicas del ticket.",
    probableCause: "Un campo dinámico (como fecha calculada o valor JIT) falló al resolverse.",
    severity: "critical",
    recommendedAction: "Revisa los campos dinámicos definidos en el conector.",
    technicalMessage: "Fallo durante la evaluación dinámica de campos en resolveValue.",
    retryable: false,
    requiresHumanReview: true,
    category: "navigator"
  },
  REQUIRED_FIELD_MISSING: {
    code: "REQUIRED_FIELD_MISSING",
    userMessage: "Faltan campos requeridos en el perfil fiscal del receptor o del ticket.",
    probableCause: "El perfil fiscal del usuario carece de RFC, código postal, régimen u otros campos obligatorios.",
    severity: "critical",
    recommendedAction: "Completa la información del perfil fiscal del receptor en la cuenta.",
    technicalMessage: "La validación del contrato de campos obligatorios del conector falló.",
    retryable: false,
    requiresHumanReview: true,
    category: "setup"
  },
  PORTAL_TIMEOUT: {
    code: "PORTAL_TIMEOUT",
    userMessage: "El portal del comercio no respondió a tiempo.",
    probableCause: "El servidor del comercio está saturado o fuera de línea tras enviar el ticket.",
    severity: "warning",
    recommendedAction: "Reintenta la automatización más tarde o verifica la velocidad de carga del portal.",
    technicalMessage: "Tiempo de espera del portal excedido esperando continuar o procesar.",
    retryable: true,
    requiresHumanReview: true,
    category: "navigator"
  },
  PORTAL_AJAX_TIMEOUT: {
    code: "PORTAL_AJAX_TIMEOUT",
    userMessage: "El portal del comercio tardó demasiado en cargar información secundaria.",
    probableCause: "El AJAX de consulta del portal está lento o fallando en responder tras ingresar el Código Postal.",
    severity: "warning",
    recommendedAction: "Intenta de nuevo en unos minutos o verifica si el portal oficial del comercio está lento.",
    technicalMessage: "El llamado AJAX del portal excedió el tiempo límite de espera.",
    retryable: true,
    requiresHumanReview: true,
    category: "navigator"
  },
  PORTAL_SELECTOR_NOT_FOUND: {
    code: "PORTAL_SELECTOR_NOT_FOUND",
    userMessage: "No pudimos localizar un elemento necesario en la página del comercio para continuar.",
    probableCause: "El selector CSS principal o alternativo del paso no está presente en la pantalla actual.",
    severity: "critical",
    recommendedAction: "Revisa si el portal cambió de diseño o requiere asistencia manual del administrador.",
    technicalMessage: "El locator no pudo encontrar el elemento CSS en el DOM.",
    retryable: true,
    requiresHumanReview: true,
    category: "navigator"
  },
  PORTAL_DROPDOWN_DISABLED: {
    code: "PORTAL_DROPDOWN_DISABLED",
    userMessage: "No fue posible seleccionar tu Régimen Fiscal o Uso de CFDI en los desplegables del portal.",
    probableCause: "El menú interactivo de selección del portal está bloqueado o deshabilitado.",
    severity: "critical",
    recommendedAction: "Revisar el conector o verificar la compatibilidad del formulario del portal.",
    technicalMessage: "El selector o dropdown interactivo no se encuentra habilitado para cliquear.",
    retryable: true,
    requiresHumanReview: true,
    category: "navigator"
  },
  PORTAL_PRIMEFACES_SELECTION_FAILED: {
    code: "PORTAL_PRIMEFACES_SELECTION_FAILED",
    userMessage: "No fue posible seleccionar tu Régimen Fiscal o Uso de CFDI.",
    probableCause: "El menú interactivo de PrimeFaces no se desplegó o la opción buscada no coincide.",
    severity: "critical",
    recommendedAction: "Verifica que el Régimen Fiscal y Uso de CFDI sean compatibles.",
    technicalMessage: "La selección del componente dropdown de PrimeFaces falló.",
    retryable: true,
    requiresHumanReview: true,
    category: "navigator"
  },
  PRIMEFACES_DROPDOWN_ERROR: {
    code: "PRIMEFACES_DROPDOWN_ERROR",
    userMessage: "No fue posible seleccionar tu Régimen Fiscal o Uso de CFDI en los desplegables del portal.",
    probableCause: "El menú interactivo de PrimeFaces no se desplegó o la opción buscada no coincide con las del portal.",
    severity: "critical",
    recommendedAction: "Verifica que el Régimen Fiscal y Uso de CFDI configurados en tu perfil sean válidos para tu RFC.",
    technicalMessage: "Componente PrimeFaces dropdown reportó error.",
    retryable: true,
    requiresHumanReview: true,
    category: "navigator"
  },

  // Security & Captcha
  CAPTCHA_REQUIRED: {
    code: "CAPTCHA_REQUIRED",
    userMessage: "El portal del comercio solicita una verificación manual (CAPTCHA).",
    probableCause: "Apareció un control de seguridad tipo CAPTCHA en el portal que bloquea la navegación automática.",
    severity: "warning",
    recommendedAction: "Resuelve el CAPTCHA a través del panel o reintenta el proceso.",
    technicalMessage: "Se requiere resolver un CAPTCHA interactivo para continuar.",
    retryable: true,
    requiresHumanReview: true,
    category: "navigator"
  },
  CAPTCHA_DETECTED: {
    code: "CAPTCHA_DETECTED",
    userMessage: "Se detectó un control CAPTCHA en el portal del comercio.",
    probableCause: "El portal activó protección anti-bot y requiere resolución humana o por servicio solver.",
    severity: "warning",
    recommendedAction: "Resuelve el captcha mediante intervención manual o reintenta con un solver activo.",
    technicalMessage: "Detección de reto captcha activo en el portal.",
    retryable: true,
    requiresHumanReview: true,
    category: "navigator"
  },

  // Fiscal Validation & Expirations
  PERIOD_EXPIRED: {
    code: "PERIOD_EXPIRED",
    userMessage: "El periodo permitido por el comercio para facturar este ticket ya venció.",
    probableCause: "La compra se realizó fuera del plazo de días o del mes fiscal permitido por el comercio.",
    severity: "info",
    recommendedAction: "La factura debe solicitarse directo en sucursal o con atención al cliente.",
    technicalMessage: "El ticket está fuera de fecha límite según las reglas del comercio.",
    retryable: false,
    requiresHumanReview: false,
    category: "verifier"
  },
  TICKET_TOO_NEW: {
    code: "TICKET_TOO_NEW",
    userMessage: "El comercio todavía está validando este ticket. Podrás reintentarlo más tarde.",
    probableCause: "El ticket es muy reciente y no se ha sincronizado en los sistemas de facturación del comercio.",
    severity: "warning",
    recommendedAction: "Espera de 24 a 48 horas tras la compra para que el comercio sincronice el ticket.",
    technicalMessage: "El ticket está muy nuevo para ser procesado por el portal.",
    retryable: true,
    requiresHumanReview: false,
    category: "verifier"
  },
  MERCHANT_SYNC_PENDING: {
    code: "MERCHANT_SYNC_PENDING",
    userMessage: "El comercio todavía está validando este ticket. Podrás reintentarlo más tarde.",
    probableCause: "El ticket es muy reciente y no se ha sincronizado en los sistemas de facturación del comercio.",
    severity: "warning",
    recommendedAction: "Espera de 24 a 48 horas tras la compra para que el comercio sincronice el ticket.",
    technicalMessage: "El ticket se encuentra en proceso de validación o sincronización interna del comercio.",
    retryable: true,
    requiresHumanReview: false,
    category: "verifier"
  },
  SAT_RFC_NOT_FOUND: {
    code: "SAT_RFC_NOT_FOUND",
    userMessage: "Tu RFC no fue localizado en las listas autorizadas del SAT ante este emisor.",
    probableCause: "El validador de timbrado del portal arrojó que el RFC receptor no se localiza para facturar.",
    severity: "critical",
    recommendedAction: "Revisa que tu RFC esté activo y registrado correctamente en el SAT.",
    technicalMessage: "El RFC receptor no es válido para facturar en el portal.",
    retryable: false,
    requiresHumanReview: true,
    category: "verifier"
  },
  RFC_NOT_FOUND_IN_SAT: {
    code: "RFC_NOT_FOUND_IN_SAT",
    userMessage: "Tu RFC no fue localizado en las listas autorizadas del SAT.",
    probableCause: "El RFC usado no existe, no está activo o no coincide con los datos fiscales autorizados.",
    severity: "warning",
    recommendedAction: "Verificar RFC, razón social, código postal y régimen fiscal antes de reintentar.",
    technicalMessage: "El RFC receptor no fue localizado por el validador del SAT del portal.",
    retryable: false,
    requiresHumanReview: true,
    category: "verifier"
  },
  INVALID_FISCAL_PROFILE_DATA: {
    code: "INVALID_FISCAL_PROFILE_DATA",
    userMessage: "Tus datos fiscales ingresados están incompletos o tienen un formato inválido.",
    probableCause: "Falta algún dato requerido (RFC, CP, Régimen, Uso) o tienen un formato incorrecto.",
    severity: "warning",
    recommendedAction: "Completa y corrige tus datos fiscales en la pestaña de Mi Cuenta.",
    technicalMessage: "Datos fiscales receptor inválidos.",
    retryable: false,
    requiresHumanReview: true,
    category: "setup"
  },

  // XML / PDF Download & Validation
  XML_NOT_DOWNLOADED: {
    code: "XML_NOT_DOWNLOADED",
    userMessage: "No se pudo descargar el archivo XML de la factura.",
    probableCause: "El portal completó la facturación pero el enlace de descarga falló o no se generó.",
    severity: "critical",
    recommendedAction: "Reintenta el proceso o descarga la factura de forma manual desde el SAT.",
    technicalMessage: "La descarga del archivo XML de la factura no se localizó.",
    retryable: true,
    requiresHumanReview: true,
    category: "verifier"
  },
  CFDI_XML_NOT_DOWNLOADED: {
    code: "CFDI_XML_NOT_DOWNLOADED",
    userMessage: "No se localizó la descarga del archivo XML de la factura.",
    probableCause: "El portal no completó la descarga del archivo XML o falló antes del almacenamiento.",
    severity: "critical",
    recommendedAction: "Verificar el mapa del portal o reintentar la facturación.",
    technicalMessage: "El archivo XML no fue descargado del portal del comercio.",
    retryable: true,
    requiresHumanReview: true,
    category: "verifier"
  },
  PDF_NOT_DOWNLOADED: {
    code: "PDF_NOT_DOWNLOADED",
    userMessage: "No se pudo descargar la representación impresa (PDF) de la factura.",
    probableCause: "El portal generó la factura pero no ofreció la descarga del archivo PDF.",
    severity: "warning",
    recommendedAction: "La factura XML se descargó correctamente. Puedes generar la representación impresa tú mismo.",
    technicalMessage: "El archivo PDF no se pudo descargar del portal.",
    retryable: true,
    requiresHumanReview: false,
    category: "verifier"
  },
  XML_STRUCTURE_INVALID: {
    code: "XML_STRUCTURE_INVALID",
    userMessage: "El archivo XML descargado no pasó las pruebas estructurales locales.",
    probableCause: "El XML descargado está corrupto o no cumple con el esquema CFDI 4.0.",
    severity: "critical",
    recommendedAction: "Revisa el archivo XML generado o solicita una reimpresión en el portal.",
    technicalMessage: "La validación local de la estructura del XML de la factura falló.",
    retryable: false,
    requiresHumanReview: true,
    category: "verifier"
  },
  CFDI_INVALID_XML: {
    code: "CFDI_INVALID_XML",
    userMessage: "El archivo descargado no es un XML de factura válido.",
    probableCause: "El portal descargó un archivo corrupto, HTML de error o estructura no conforme.",
    severity: "critical",
    recommendedAction: "Descarga el XML directamente del SAT o reintenta la facturación.",
    technicalMessage: "El contenido no pudo ser parseado como XML de CFDI válido.",
    retryable: false,
    requiresHumanReview: true,
    category: "verifier"
  },
  CFDI_XML_PARSE_FAILED: {
    code: "CFDI_XML_PARSE_FAILED",
    userMessage: "El archivo XML descargado está dañado o no tiene un formato parseable.",
    probableCause: "El portal entregó un archivo corrupto, incompleto o en formato HTML en lugar de XML.",
    severity: "critical",
    recommendedAction: "Revisar el archivo XML del portal o descargarlo de forma manual.",
    technicalMessage: "El parser local no pudo procesar el contenido del XML.",
    retryable: true,
    requiresHumanReview: true,
    category: "verifier"
  },
  CFDI_EMPTY_OR_HTML_RESPONSE: {
    code: "CFDI_EMPTY_OR_HTML_RESPONSE",
    userMessage: "El portal devolvió una página HTML o un archivo vacío en lugar del XML de la factura.",
    probableCause: "El portal experimentó un error interno de servidor o de descarga al solicitar el XML.",
    severity: "critical",
    recommendedAction: "Reintentar la descarga del comprobante.",
    technicalMessage: "El contenido descargado contiene etiquetas HTML o está vacío.",
    retryable: true,
    requiresHumanReview: true,
    category: "verifier"
  },
  CFDI_MISSING_TIMBRE: {
    code: "CFDI_MISSING_TIMBRE",
    userMessage: "El XML de la factura no contiene el timbre fiscal digital requerido.",
    probableCause: "El portal descargó una pre-factura o un comprobante sin certificar y timbrar ante el SAT.",
    severity: "critical",
    recommendedAction: "Revisar la configuración de timbrado en el portal o solicitar re-timbrado.",
    technicalMessage: "El XML no contiene la sección de TimbreFiscalDigital.",
    retryable: false,
    requiresHumanReview: true,
    category: "verifier"
  },
  CFDI_MISSING_UUID: {
    code: "CFDI_MISSING_UUID",
    userMessage: "El XML de la factura no contiene un folio fiscal (UUID) válido.",
    probableCause: "El comprobante descargado no fue timbrado o carece del atributo de folio fiscal.",
    severity: "critical",
    recommendedAction: "Contactar al comercio para verificar que el comprobante haya sido timbrado.",
    technicalMessage: "Atributo UUID no encontrado en el nodo TimbreFiscalDigital del XML.",
    retryable: false,
    requiresHumanReview: true,
    category: "verifier"
  },
  CFDI_UUID_MISSING: {
    code: "CFDI_UUID_MISSING",
    userMessage: "La factura descargada no cuenta con Folio Fiscal (UUID).",
    probableCause: "El XML descargado no fue timbrado ante el SAT.",
    severity: "critical",
    recommendedAction: "Revisa con el comercio si la factura fue timbrada correctamente.",
    technicalMessage: "No se encontró el atributo UUID en el nodo de Timbre Fiscal Digital.",
    retryable: false,
    requiresHumanReview: true,
    category: "verifier"
  },
  CFDI_TOTAL_MISMATCH: {
    code: "CFDI_TOTAL_MISMATCH",
    userMessage: "El total facturado en el XML no coincide con el total del ticket.",
    probableCause: "El total en el XML timbrado difiere del total esperado registrado en el ticket.",
    severity: "critical",
    recommendedAction: "Revisar los conceptos e importes en el portal y comparar contra el ticket físico.",
    technicalMessage: "Diferencia de total entre XML y ticket excede el umbral permitido.",
    retryable: false,
    requiresHumanReview: true,
    category: "verifier"
  },
  CFDI_RFC_RECEPTOR_MISMATCH: {
    code: "CFDI_RFC_RECEPTOR_MISMATCH",
    userMessage: "El RFC del receptor en la factura no coincide con tu perfil fiscal.",
    probableCause: "El portal facturó a un RFC genérico o erróneo en lugar del tuyo.",
    severity: "critical",
    recommendedAction: "Verifica el RFC registrado en tu perfil fiscal de ZenTicket.",
    technicalMessage: "El atributo Rfc del nodo Receptor en el XML no coincide con el RFC solicitado.",
    retryable: false,
    requiresHumanReview: true,
    category: "verifier"
  },
  CFDI_RFC_EMISOR_MISMATCH: {
    code: "CFDI_RFC_EMISOR_MISMATCH",
    userMessage: "El RFC del emisor en la factura no coincide con el del comercio.",
    probableCause: "El portal generó un XML para otra razón social o sucursal no correspondiente.",
    severity: "critical",
    recommendedAction: "Reporta este error al soporte del comercio.",
    technicalMessage: "El atributo Rfc del nodo Emisor en el XML no coincide con el del conector.",
    retryable: false,
    requiresHumanReview: true,
    category: "verifier"
  },

  // SAT verification
  CFDI_NOT_FOUND_IN_SAT: {
    code: "CFDI_NOT_FOUND_IN_SAT",
    userMessage: "La factura fue generada por el portal, pero todavía no aparece como CFDI válido en el SAT.",
    probableCause: "El XML no fue timbrado correctamente, el portal entregó un archivo incorrecto o el SAT aún no sincroniza el comprobante.",
    severity: "critical",
    recommendedAction: "Reintentar validación SAT y, si persiste, mandar a revisión manual.",
    technicalMessage: "El SAT no localizó el CFDI usando UUID, RFC emisor y RFC receptor.",
    retryable: true,
    requiresHumanReview: true,
    category: "sat_verifier"
  },
  SAT_VALIDATION_TIMEOUT: {
    code: "SAT_VALIDATION_TIMEOUT",
    userMessage: "La validación con el servidor del SAT excedió el tiempo de espera.",
    probableCause: "El servicio web de consulta de CFDI del SAT está lento o no responde.",
    severity: "warning",
    recommendedAction: "Reintentar la consulta en unos minutos o verificar el estado de los servidores del SAT.",
    technicalMessage: "El llamado SOAP al webservice de consulta de CFDI del SAT experimentó un timeout.",
    retryable: true,
    requiresHumanReview: false,
    category: "sat_verifier"
  },
  SAT_VALIDATION_PENDING: {
    code: "SAT_VALIDATION_PENDING",
    userMessage: "La validación del SAT está pendiente de confirmación.",
    probableCause: "El CFDI fue timbrado pero el SAT puede tardar hasta 72 horas en sincronizarlo en sus sistemas.",
    severity: "info",
    recommendedAction: "Se ha programado una validación posterior. No es necesario realizar ninguna acción.",
    technicalMessage: "Estado intermedio: CFDI no localizado pero dentro de la ventana de sincronización del SAT.",
    retryable: true,
    requiresHumanReview: false,
    category: "sat_verifier"
  },
  CFDI_VALIDATION_FAILED: {
    code: "CFDI_VALIDATION_FAILED",
    userMessage: "La factura no cumple con los requisitos fiscales exigidos.",
    probableCause: "Fallo de validación de coincidencia de RFC emisor, RFC receptor o importes contra los datos esperados.",
    severity: "critical",
    recommendedAction: "Revisar los datos fiscales asociados al ticket y conector.",
    technicalMessage: "Validación general del CFDI fallida.",
    retryable: false,
    requiresHumanReview: true,
    category: "verifier"
  },
  CFDI_CANCELLED_IN_SAT: {
    code: "CFDI_CANCELLED_IN_SAT",
    userMessage: "La factura fue generada por el portal del comercio, pero aparece como Cancelada en los controles del SAT.",
    probableCause: "El comercio canceló el CFDI o se generó una sustitución posterior de la factura.",
    severity: "critical",
    recommendedAction: "Verificar el estado del comprobante con el emisor o solicitar refacturación manual.",
    technicalMessage: "El servicio de verificación de CFDI del SAT devolvió el estado 'Cancelado'.",
    retryable: false,
    requiresHumanReview: true,
    category: "sat_verifier"
  },

  // Duplicate / Already invoiced flow
  DUPLICATE_PROCESSING_BLOCKED: {
    code: "DUPLICATE_PROCESSING_BLOCKED",
    userMessage: "Este ticket ya tiene un proceso de facturación activo en curso.",
    probableCause: "Se encoló un job duplicado para un ticket que ya se encuentra descargado o en proceso de verificación SAT.",
    severity: "info",
    recommendedAction: "Espera a que el proceso actual finalice o revisa el estado del ticket.",
    technicalMessage: "El ticket ya cuenta con otro job en ejecución o validación.",
    retryable: false,
    requiresHumanReview: true,
    category: "setup"
  },
  TICKET_ALREADY_INVOICED: {
    code: "TICKET_ALREADY_INVOICED",
    userMessage: "Este ticket ya ha sido facturado con anterioridad en el portal del comercio.",
    probableCause: "El portal arrojó que el ticket ya cuenta con una factura previamente generada.",
    severity: "info",
    recommendedAction: "Verifica tu bandeja de entrada o tu buzón del SAT; la factura ya existe.",
    technicalMessage: "El portal reportó que el ticket ya se encuentra facturado.",
    retryable: false,
    requiresHumanReview: true,
    category: "navigator"
  },
  EXISTING_INVOICE_RECOVERY_FAILED: {
    code: "EXISTING_INVOICE_RECOVERY_FAILED",
    userMessage: "No se pudo recuperar la factura preexistente del portal.",
    probableCause: "El portal reportó que el ticket ya estaba facturado pero el enlace de descarga falló.",
    severity: "critical",
    recommendedAction: "Descarga el XML directamente del portal SAT con tu e.firma.",
    technicalMessage: "Fallo al intentar descargar o localizar el XML preexistente del ticket ya facturado.",
    retryable: false,
    requiresHumanReview: true,
    category: "navigator"
  },

  // Firestore & Storage Errors
  FIRESTORE_UPDATE_FAILED: {
    code: "FIRESTORE_UPDATE_FAILED",
    userMessage: "Error al guardar el estado en la base de datos.",
    probableCause: "Problemas de red temporales con Firestore o límite de cuota.",
    severity: "critical",
    recommendedAction: "Reintentar el proceso.",
    technicalMessage: "Error de red o permisos al actualizar documentos de Firestore.",
    retryable: true,
    requiresHumanReview: true,
    category: "database"
  },
  STORAGE_UPLOAD_FAILED: {
    code: "STORAGE_UPLOAD_FAILED",
    userMessage: "Error al subir los archivos de la factura al almacenamiento privado.",
    probableCause: "Problemas de red con Firebase Storage o formato de archivo inválido.",
    severity: "critical",
    recommendedAction: "Reintentar el proceso.",
    technicalMessage: "Error de red al intentar escribir en Firebase Storage.",
    retryable: true,
    requiresHumanReview: true,
    category: "database"
  },

  // General JIT
  JIT_FIELD_CONTRACT_MISMATCH: {
    code: "JIT_FIELD_CONTRACT_MISMATCH",
    userMessage: "El sistema detectó que el portal pide datos distintos a los preparados.",
    probableCause: "No existe un conector aprobado y el JIT usó una plantilla genérica o un mapeo incorrecto.",
    severity: "warning",
    recommendedAction: "Revisar el portal, confirmar los campos requeridos y guardar un nuevo contrato de campos antes de reintentar.",
    technicalMessage: "Los campos generados por el JIT no coinciden con los campos reales detectados en el portal.",
    retryable: false,
    requiresHumanReview: true,
    category: "jit"
  },
  JIT_PORTAL_FIELDS_NOT_DETECTED: {
    code: "JIT_PORTAL_FIELDS_NOT_DETECTED",
    userMessage: "No se pudieron detectar los campos del portal del comercio.",
    probableCause: "El portal cambió drásticamente o no es accesible para la inspección automatizada.",
    severity: "critical",
    recommendedAction: "Ingresar al conector y definir manualmente los campos requeridos en el contrato de extracción.",
    technicalMessage: "El motor JIT falló al inspeccionar la estructura de campos del portal.",
    retryable: false,
    requiresHumanReview: true,
    category: "jit"
  },
  JIT_LOW_CONFIDENCE_FIELD_MAPPING: {
    code: "JIT_LOW_CONFIDENCE_FIELD_MAPPING",
    userMessage: "El mapeo de campos realizado por el JIT tiene baja confianza.",
    probableCause: "Las etiquetas en el portal son ambiguas o el modelo de IA no pudo asociarlas con certeza.",
    severity: "warning",
    recommendedAction: "Validar manualmente el contrato de campos generado en el conector antes de aprobar.",
    technicalMessage: "Confianza de mapeo menor al umbral mínimo requerido para automatización segura.",
    retryable: false,
    requiresHumanReview: true,
    category: "jit"
  },
  JIT_GENERIC_TEMPLATE_USED: {
    code: "JIT_GENERIC_TEMPLATE_USED",
    userMessage: "Se bloqueó el uso de plantilla genérica para este portal.",
    probableCause: "Se intentó automatizar sin un conector aprobado usando una plantilla de fallback no autorizada.",
    severity: "critical",
    recommendedAction: "Crea o aprueba el contrato de campos específico para este comercio.",
    technicalMessage: "La inyección genérica está restringida para evitar envíos de datos incorrectos.",
    retryable: false,
    requiresHumanReview: true,
    category: "jit"
  },
  JIT_REQUIRED_FIELD_MISSING: {
    code: "JIT_REQUIRED_FIELD_MISSING",
    userMessage: "Faltan datos requeridos por el portal que no se encuentran en el ticket ni en tu perfil fiscal.",
    probableCause: "El portal solicita campos obligatorios no detectados por OCR ni configurados en el perfil fiscal.",
    severity: "warning",
    recommendedAction: "Ingresa los datos solicitados manualmente para que el robot pueda proceder.",
    technicalMessage: "Campos requeridos por el contrato JIT no tienen valor asignado.",
    retryable: false,
    requiresHumanReview: true,
    category: "jit"
  },
  JIT_UNVERIFIED_INJECTION_BLOCKED: {
    code: "JIT_UNVERIFIED_INJECTION_BLOCKED",
    userMessage: "Se bloqueó la inyección de datos no verificada.",
    probableCause: "Se intentó rellenar campos en el portal sin haber confirmado previamente la correspondencia de selectores.",
    severity: "critical",
    recommendedAction: "Verifica el conector o el mapa del portal para asegurar compatibilidad de inyección.",
    technicalMessage: "Inyección abortada preventivamente debido a un contrato de campos no verificado.",
    retryable: false,
    requiresHumanReview: true,
    category: "jit"
  },
  PORTAL_FIELD_VALIDATION_ERROR: {
    code: "PORTAL_FIELD_VALIDATION_ERROR",
    userMessage: "Alguno de los datos del ticket es inválido.",
    probableCause: "El folio, ID de venta, total o fecha no corresponden a una compra válida en este portal.",
    severity: "warning",
    recommendedAction: "Verificar referencia, ID de venta y total impreso en el ticket.",
    technicalMessage: "El portal arrojó un error de validación de campos del ticket.",
    retryable: false,
    requiresHumanReview: true,
    category: "navigator"
  },
  PORTAL_STRUCTURE_CHANGED: {
    code: "PORTAL_STRUCTURE_CHANGED",
    userMessage: "Ocurrió un error inesperado al procesar la solicitud en el portal del comercio.",
    probableCause: "El portal arrojó un error de sistema o su flujo interno cambió significativamente.",
    severity: "critical",
    recommendedAction: "El caso requiere revisión técnica manual para verificar cambios en el conector.",
    technicalMessage: "Fallo de coincidencia en el DOM o timeout no recuperable en pasos.",
    retryable: false,
    requiresHumanReview: true,
    category: "navigator"
  },

  // Unknown Runner Error
  UNKNOWN_RUNNER_ERROR: {
    code: "UNKNOWN_RUNNER_ERROR",
    userMessage: "Ocurrió un error interno desconocido en el motor de automatización.",
    probableCause: "Excepción imprevista no capturada por manejadores específicos durante la ejecución.",
    severity: "warning",
    recommendedAction: "Reintenta el proceso o contacta con el soporte técnico de la plataforma.",
    technicalMessage: "Excepción de JS/TS no controlada en el worker process.",
    retryable: true,
    requiresHumanReview: true,
    category: "runner"
  }
};
