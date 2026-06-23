# ZenTicket Data & API Services Map

Este documento detalla todas las llamadas de servicios externos, conexiones de red del frontend, colecciones nativas de Firestore y APIs del servidor Express.

---

## 1. Endpoints Express (Backend - `/api/*`)

El servidor Express (`server.ts` y `/server`) expone los siguientes endpoints que el frontend consume mediante `fetch`:

### `POST /api/tickets/analyze`
* **Propósito**: Sube la imagen del ticket, extrae mediante lógica Gemini OCR ó simulada los campos fiscales de ticket (Emisor, Folio, Monto, Fecha, RFC del Emisor).
* **Consumidores**: `ScannerAndSimulator.tsx` (Flujo de carga manual o captura simulada).
* **Parámetros**: `FormData` con archivo `image`.

### `POST /api/automation/run`
* **Propósito**: Ejecuta la secuencia robótica para conectarse al portal de facturación del emisor, llenar los campos requeridos, efectuar el timbrado digital del CFDI ante el SAT y devolver los contenidos oficiales de XML y PDF.
* **Consumidores**: `ScannerAndSimulator.tsx`.
* **Parámetros**: `{ configId, rfc, folio, total, fecha, emisorName, emisorRfc, userId, preselectedTicketId }`.

### `GET /api/config/status`
* **Propósito**: Retorna configuraciones, estados del motor y tokens operativos del servidor de automatizaciones.
* **Consumidores**: `TicketsListScreen.tsx`.

### `POST /api/email/send`
* **Propósito**: Envía la factura timbrada (XML y PDF) al correo seleccionado del usuario cliente.
* **Consumidores**: `TicketsListScreen.tsx`.
* **Parámetros**: `{ to, subject, body, pdfHtml, xmlContent }`.

### `POST /api/fiscal/parse-constancia`
* **Propósito**: Analiza mediante OCR el archivo PDF de la Constancia de Situación Fiscal (CSF) de Hacienda (SAT) y devuelve los datos del contribuyente estructurados (RFC, Régimen Fiscal, Código Postal, Uso de CFDI, Nombre / Razón Social).
* **Consumidores**: `ProfileForm.tsx` y `OnboardingFlow.tsx` (para llenado inteligente instantáneo sin errores tipográficos de SAT).
* **Parámetros**: `FormData` con archivo `file`.

---

## 2. Firebase & Firestore Services

El proyecto utiliza **Firebase Firestore** para la sincronización y persistencia de datos en tiempo real. 

### Colecciones en Uso (Base de datos Firestore. Nombres oficiales logueados):

1. **`fiscalProfiles`**:
   * **Identificador de documento**: `user.uid`
   * **Esquema de campos**:
     * `userId`: string
     * `rfc`: string
     * `razonSocial`: string
     * `regimenFiscal`: string
     * `codigoPostal`: string
     * `usoCFDI`: string
     * `plan`: string ("gratuito", "profesional", "empresarial")
     * `onboardingCompleted`: boolean
     * `paymentCards`: array de objetos de tarjetas bancarias.
     * `correoRecepcion`: string (buzón opcional de recibimiento)

2. **`tickets`**:
   * **Esquema de campos**:
     * `id`: string
     * `userId`: string
     * `createdAt`: string (ISO date)
     * `imageUrl`: string (o Base64 offline/local fallback)
     * `emisorRfc`: string
     * `emisorName`: string
     * `total`: number
     * `fecha`: string (YYYY-MM-DD o estándar de compra)
     * `status`: string ("pendiente", "procesado", "fallido")
     * `errorMessage`: string (opcional)

3. **`invoices`** (Bóveda Fiscal / Facturas Timbradas):
   * **Esquema de campos**:
     * `id`: string
     * `userId`: string
     * `ticketId`: string
     * `folioFiscal`: string (UUID SAT)
     * `rfcEmisor`: string
     * `nombreEmisor`: string
     * `rfcReceptor`: string
     * `nombreReceptor`: string
     * `total`: number
     * `xmlContent`: string
     * `pdfHtml`: string
     * `cost`: number (Costo del consumo por API SAT)
     * `rawCost`: number

4. **`connectors`**:
   * **Esquema de campos**:
     * `userId`: string (o "system" para portales nativos globales)
     * `nombre`: string
     * `rfc`: string
     * `portalUrl`: string
     * `fieldsJson`: string (Campos que requiere el portal de autofactura)
     * `flowJson`: string (Pasos que realiza la automatización robótica)

---

## 3. Automatizaciones Externas

* **Playwright / Puppeteer**: El backend contiene lógica modularizada o simulada de navegación SAT capaz de interceptar portales de autofacturas y timbrar CFDI digitales reales.
* **Integración de Red**: El servidor corre en modo híbrido con persistencia en Firestore y redundancia de caché local offline para contingencias de red o cuotas excedidas del contribuyente.
