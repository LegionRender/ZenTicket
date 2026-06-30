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

## Limitaciones Conocidas

1. **Detección de CAPTCHA**: Si el portal oficial presenta un CAPTCHA complejo que requiere resolución humana, el motor detendrá la ejecución con `CAPTCHA_DETECTED` de forma segura, tomará una captura de pantalla y derivará el ticket a revisión manual.
2. **Cambios en Portales**: Si el comercio cambia el diseño o los selectores del portal oficial, la navegación fallará y el motor registrará `PORTAL_CHANGED` en la bitácora de logs.
