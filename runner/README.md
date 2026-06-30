# ZenTicket Robotization Runner

Este directorio contiene la infraestructura productiva del worker robotizado (runner) responsable de navegar los portales oficiales de los comercios (usando Playwright), descargar los XML/PDF de las facturas, validar la integridad del CFDI y comprobar su vigencia ante el SAT.

---

## Requisitos y Configuración Local

### 1. Inicialización de Credenciales (Firebase Admin SDK)
Para poder leer de Firestore y subir archivos a Firebase Storage localmente, necesitas colocar el archivo de credenciales de la cuenta de servicio de Firebase:
* Descarga la llave JSON de tu cuenta de servicio desde la consola de Firebase.
* Renómbrala como `serviceAccountKey.json`.
* Colócala en el directorio **raíz del proyecto principal** (`ZenTicket-main/serviceAccountKey.json`).
* *Nota*: Este archivo ya se encuentra en `.gitignore` para evitar subir credenciales privadas al repositorio Git.

### 2. Instalación de Dependencias y Navegadores
Instala las dependencias y los binarios de Playwright requeridos para ejecutar el navegador headless:
```bash
# Instalar paquetes
npm install

# Instalar binario de Chromium para Playwright
npx playwright install chromium
```

---

## Comandos de Ejecución

* **Compilar el código**:
  ```bash
  npm run build
  ```
* **Compilar y arrancar el worker**:
  ```bash
  npm run dev
  ```
* **Arrancar sin recompilar**:
  ```bash
  npm start
  ```

---

## Pruebas de Facturación y Validación E2E

### 1. Crear un Job de Prueba Local
Para simular un ticket real y encolar un proceso de facturación automática en el motor local:
```bash
# Ejecutar script de encolamiento de prueba
node scratch/create_test_job.cjs
```
Este script creará:
* Un documento en la colección `tickets` con estatus `queued_for_runner`.
* Un documento en la colección `invoice_jobs` con estatus `pending` conteniendo los snapshots inmutables del ticket y perfil fiscal.

### 2. Monitoreo de Logs y Almacenamiento
* **Logs del Worker**: Los logs técnicos se imprimen en consola y se guardan de forma estructurada en la colección `runner_logs`.
* **Evidencias y Capturas**: Si la navegación falla, el motor tomará un screenshot completo del error y lo subirá de forma privada a Firebase Storage bajo la ruta:
  `users/{userId}/tickets/{ticketId}/runner-errors/{timestamp}.png`
* **Archivos Fiscales**: Las facturas XML y PDF exitosas se cargan directamente a:
  `users/{userId}/tickets/{ticketId}/cfdi.xml`
  `users/{userId}/tickets/{ticketId}/cfdi.pdf`

---

## Flujo de Estados

El ciclo de vida del job de facturación sigue la siguiente progresión en el motor:
```
[User triggers Scan] 
  --> TicketStatus: queued_for_runner 
  --> JobStatus: pending
  
[Worker locks & runs job] 
  --> TicketStatus: runner_processing 
  --> JobStatus: running
  
[Worker navigates Playwright]
  --> Downloads XML/PDF
  --> Uploads files to Firebase Storage path: users/{userId}/tickets/{ticketId}/cfdi.xml
  
[Worker validates CFDI & SAT]
  --> If SAT is Vigente: TicketStatus: cfdi_validated, JobStatus: succeeded
  --> If SAT is Cancelled/Not Found: TicketStatus: requires_manual_review, JobStatus: manual_review
  --> If SAT is Unavailable: TicketStatus: sat_validation_pending, JobStatus: validating_sat (retries up to 3 times)
```

---

## Limitaciones Conocidas del Portal Piloto (Farmacias Similares)

1. **Estructura de Alertas (SweetAlert)**: Si los datos del ticket son incorrectos (ej. referencia inválida), el portal no redirige a una página de error estándar ni escribe en el DOM tradicional; en su lugar, lanza un cuadro de SweetAlert modal. El motor detecta esto usando el selector `.swal-text` y aborta inmediatamente con `PORTAL_RETURNED_ERROR`.
2. **CAPTCHA**: El portal oficial puede desplegar un control de CAPTCHA si detecta tráfico excesivo o solicitudes sospechosas. El motor abortará de forma segura bajo el código `CAPTCHA_DETECTED` y registrará la captura en el bucket de Storage.
