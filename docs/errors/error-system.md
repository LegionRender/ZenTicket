# Sistema de Control y Clasificación de Errores

ZenTicket cuenta con una bóveda de clasificación de errores ubicada en `runner/src/engines/errors/` para asegurar que las fallas del robot Playwright sean predecibles, clasificables e interpretadas de forma segura y amigable por el cliente.

---

## 1. Mapa de Etapas del Runner (`RunnerStage`)

El ciclo de vida del runner se divide en las siguientes etapas consecutivas para saber exactamente en qué fase ocurrió un fallo:
* **`job_polling`**: Búsqueda e identificación de jobs en estado pendiente.
* **`job_lock`**: Adquisición del candado del job en Firestore para evitar concurrencia duplicada.
* **`connector_load`**: Carga de la configuración del conector correspondiente al comercio del ticket.
* **`portal_map_load`**: Carga y validación del mapa de pasos (`portalMap`) del conector.
* **`browser_launch`**: Inicialización del navegador headless (Playwright Chromium).
* **`portal_navigation`**: Carga inicial del sitio web del portal del comercio.
* **`field_resolution` / `field_injection`**: Evaluación e inyección de datos de facturación (RFC, folio, totales) en el DOM.
* **`captcha_detection` / `captcha_waiting_user`**: Detección de CAPTCHA interactivo y resolución/espera del solver.
* **`form_submission`**: Confirmación e invocación del envío para generar la factura.
* **`already_invoiced_detection`**: Detección en el portal de que el ticket ya fue facturado previamente.
* **`existing_invoice_recovery`**: Descarga/Localización de la factura preexistente del portal.
* **`xml_download` / `pdf_download`**: Descarga de los archivos físicos resultantes del portal.
* **`cfdi_parse` / `cfdi_validation`**: Validación local estructural y de coincidencia fiscal (RFC, totales) del XML descargado.
* **`sat_verification`**: Validación SOAP contra los servidores oficiales del SAT para certificar la vigencia del comprobante.
* **`storage_upload`**: Subida segura de los archivos a Firebase Storage bajo la ruta aislada del usuario.
* **`firestore_update`**: Actualización del ticket e invoice en la base de datos de producción.
* **`job_retry_decision`**: Determinación de si el job califica para reintento automático.
* **`manual_review_assignment`**: Registro del error estructurado en el ticket y cambio de estado a revisión manual.

---

## 2. Códigos de Error Principales

El catálogo centralizado de errores (`errorCatalog.ts`) organiza los códigos según su categoría:
* **Configuración/Setup:** `CONNECTOR_NOT_FOUND`, `PORTAL_MAP_NOT_FOUND`, `PORTAL_MAP_INVALID`, `REQUIRED_FIELD_MISSING`.
* **Navegación/Nivel de Red:** `PLAYWRIGHT_BROWSER_LAUNCH_FAILED`, `PORTAL_NAVIGATION_FAILED`, `PORTAL_TIMEOUT`, `PORTAL_SELECTOR_NOT_FOUND`.
* **Seguridad:** `CAPTCHA_DETECTED`, `CAPTCHA_REQUIRED`.
* **Estructura CFDI / SAT:** `XML_NOT_DOWNLOADED`, `CFDI_INVALID_XML`, `CFDI_XML_PARSE_FAILED`, `CFDI_TOTAL_MISMATCH`, `CFDI_RFC_RECEPTOR_MISMATCH`, `CFDI_RFC_EMISOR_MISMATCH`, `CFDI_UUID_MISSING`, `CFDI_NOT_FOUND_IN_SAT`, `SAT_VALIDATION_TIMEOUT`, `CFDI_CANCELLED_IN_SAT`.
* **Lógica del Negocio:** `TICKET_ALREADY_INVOICED`, `EXISTING_INVOICE_RECOVERY_FAILED`.
* **Bases de Datos / Storage:** `FIRESTORE_UPDATE_FAILED`, `STORAGE_UPLOAD_FAILED`, `DUPLICATE_PROCESSING_BLOCKED`.

---

## 3. Políticas de Reintento (`retryable`) y Revisión Manual (Fase 12)

El motor clasifica cada código de error dinámicamente mediante `classifyAutomationError` y unifica la política de reintento con `shouldAutoRetry` en `index.ts`:
* **Errores Reintentables (`retryable: true`):** Errores temporales de red o timeouts (`PORTAL_TIMEOUT`, `SAT_VALIDATION_TIMEOUT` hasta 5 intentos, `CAPTCHA_DETECTED`, `UNKNOWN_RUNNER_ERROR`). El planificador los encolará en estado `pending` tras incrementar el contador de intentos.
* **Errores No Reintentables y Bloqueantes (`retryable: false`, `blocking: true`):** Fallos fiscales de datos, contratos inválidos, incongruencia de importes, o duplicados.
  - **Específicos de la Fase 12:** `TICKET_ALREADY_INVOICED` (cuando el XML no se puede descargar), `CFDI_TOTAL_MISMATCH`, `CFDI_RFC_RECEPTOR_MISMATCH`, `CFDI_RFC_EMISOR_MISMATCH`, `CFDI_INVALID_XML`, `CFDI_UUID_MISSING` y `DUPLICATE_PROCESSING_BLOCKED`.
  - Estos detienen la ejecución inmediatamente y envían el ticket a `requires_manual_review` con `requiresHumanReview: true`.

---

## 4. Trazabilidad y Exposición de Datos

Para proteger la privacidad de los usuarios y mantener un diagnóstico completo, implementamos dos niveles de visibilidad:

### A. Vista del Admin (`runner_logs`)
Almacena un documento detallado (`DiagnosticSnapshot`) en la colección `runner_logs`.
* **Campos incluidos:** `userId`, `ticketId`, `jobId`, `connectorId`, `portalMapId`, `stage`, `errorCode`, `friendlyMessage`, `technicalMessage`, `rawMessage`, `retryable`, `blocking`, `attemptNumber`, `wasAlreadyInvoiced`, y los booleanos de avance de validación (`xmlDownloaded`, `pdfDownloaded`, etc.).
* **Sanitización de Seguridad Obligatoria:** `createRunnerLog` enmascara de forma proactiva API Keys de Stripe, tokens de Firebase, contraseñas, contenido íntegro de archivos XML, y reduce los RFCs a sus primeros 4 caracteres (ej: `XAXX***`).

### B. Vista del Usuario Final (`ticket.reviewError`)
Cuando un ticket entra en estado de revisión manual, el documento del ticket recibe únicamente un **resumen seguro** para evitar exponer la infraestructura técnica:
* `errorCode` (Código técnico normalizado)
* `friendlyMessage` (Mensaje redactado en lenguaje natural)
* `stage` (Etapa del runner en la que ocurrió el fallo)
* `retryable` (Si es reintentable)
* `requiresManualReview` (Si requiere revisión manual)
* `updatedAt` (Timestamp del fallo)
