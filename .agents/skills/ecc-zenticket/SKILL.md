---
name: ecc-zenticket
description: Specialized Everything Claude Code (ECC) skill for ZenTicket containing guidelines, instructions, and communication protocols for the 8 project specialists (Tech Lead de Flujo Fiscal, Especialista OCR, UX de Corrección, PortalMap, Playwright Runner, Firebase, CFDI/SAT, QA Tester).
---

# Manual y Memoria Operativa de ZenTicket

Este documento define la estructura técnica, responsabilidades, guías de coordinación y reglas de integridad que rigen el desarrollo, modificación y operación de ZenTicket. Sirve como memoria operativa para asegurar que futuros agentes e ingenieros respeten la lógica del proyecto.

---

## 1. Lógica y Ciclo de Automatización Fiscal

Para evitar errores y asegurar validez legal, el flujo de procesamiento debe seguir estrictamente la siguiente secuencia lineal de transición de estados y datos:

```
[Foto del Ticket]
       │
       ▼
     [OCR] ──► Extracción inicial (rawOcrText)
       │
       ▼
 [portalFields] ──► Mapeo y saneamiento de campos para el portal del comercio
       │
       ▼
 [fiscalProfile] ──► Combinación con el perfil fiscal del receptor (usuario)
       │
       ▼
 [invoice_job] ──► Encolamiento inmutable en Firestore con snapshots
       │
       ▼
[Runner Playwright] ──► Ejecución automatizada en el portal del comercio
       │
       ▼
 [XML/PDF Real] ──► Descarga y persistencia en Cloud Storage
       │
       ▼
[Revisión XML Local] ──► Verificación estructural del XML descargado
       │
       ▼
[invoice_obtained] ──► Estado final del ticket (Factura obtenida y validada localmente)
```

### Reglas de Oro de Integridad de Datos:
1. **Identificadores y Referencias:**
   * **NUNCA** utilices el `ticketId` de Firestore, un UUID autogenerado en frontend, o el `doc.id` interno como la referencia de facturación o el folio del ticket que se ingresa en el portal del comercio.
   * La referencia de facturación debe provenir exclusivamente de los datos extraídos del ticket físico (`portalFields.billingReference`) o de la captura manual explícita del usuario.
2. **Validación y Certificación:**
   * **NUNCA** marques un ticket con el estado `invoice_obtained` de forma ficticia o simulada.
   * El estado `invoice_obtained` es un estado final que **requiere obligatoriamente** la presencia del archivo XML real descargado del portal del comercio y una revisión estructural local del XML exitosa.
   * **REGLA PRINCIPAL:** ZenTicket no se conecta al SAT, no timbra CFDI, no valida vigencia ante el SAT. Automatiza la solicitud y descarga de facturas en portales oficiales de comercios a partir de tickets.

### Glosario del Modelo de Datos:
* **`ticketData`:** Los metadatos generales del ticket subido (fecha de compra, total, RFC del emisor, nombre del emisor).
* **`portalFields`:** Los campos específicos de entrada que requiere el conector del comercio (ej. folio, número de ticket, sucursal, ID de transacción, etc.).
* **`fiscalProfile`:** Los datos de identificación fiscal del usuario receptor (RFC, Razón Social, Régimen Fiscal, Código Postal, Uso de CFDI, Correo).
* **`connector`:** Configuración del comercio que vincula el nombre y RFC con un `portalMap` específico.
* **`portalMap`:** Definición de campos requeridos (`requiredFields`), pasos de navegación (`stepsJson`), selectores de captcha, y reglas de descarga del portal oficial.
* **`invoice_job`:** Documento de cola en Firestore (`/invoice_jobs`) que contiene snapshots inmutables del perfil fiscal y del ticket para que el runner los procese en segundo plano.
* **`runner_logs`:** Registro detallado de pasos técnicos de navegación de Playwright, errores del portal, y screenshots de evidencia en caso de fallos.

---

## 2. Biblioteca de Conectores y Consola de Administración

ZenTicket posee una consola de administración para monitorear la salud y precisión de los conectores de los comercios.

### Estados de los Conectores:
* **`production_ready`:** El conector funciona al 100% de manera automatizada, las descargas y la validación estructural local pasan limpiamente.
* **`real_validation`:** Conector activo en producción pero bajo supervisión estrecha y validación en tiempo real.
* **`trained_needs_validation`:** El conector fue entrenado mediante el sandbox/IA pero requiere verificar que sus selectores funcionen con tickets reales antes de habilitarlo al público.
* **`runner_not_available`:** El portal del comercio está caído o el runner tiene un problema técnico temporal con sus selectores CSS.
* **`disabled`:** El conector ha sido desactivado manualmente debido a cambios estructurales en el portal del comercio.

### Herramientas de Auditoría:
* **Panel "Tickets Reales Recientes":** Bitácora donde el administrador ve fotos reales de tickets subidos junto con sus clasificaciones.
* **Logs del Runner y Capturas:** Historial detallado de Playwright con screenshots automáticos cuando ocurre un error en el portal (ej. CAPTCHA, datos inválidos).
* **Reglas para promover un conector a producción (`production_ready`):**
  1. Debe haber procesado al menos 5 tickets reales de forma exitosa de manera consecutiva.
  2. Los archivos XML y PDF correspondientes deben estar descargados y con revisión estructural local exitosa.
  3. No debe reportar errores de selectores CSS (timeouts o fallas de navegación) en los últimos 7 días.

---

## 3. Sistema de Diseño y Reglas Visuales

Para mantener la estética premium, consistente y alineada a las capturas oficiales, respeta la siguiente guía visual:

### 3.1. Paleta de Colores
* **Colores de Marca:**
  * Azul Premium: `#0B53F4` (Botones primarios, enlaces activos, headers)
  * Azul Degradado: de `#0546F0` a `#1268FF` (Card de estado del Inicio)
  * Fondo Oscuro: `#070a16` (Fondo general en tema oscuro)
  * Fondo Workspace Oscuro: `#0b0d19` (Cards y contenedores en tema oscuro)
* **Colores de Estado (Semáforos):**
  * Éxito (Completo / Procesado): Verde esmeralda (`#10B981` / Tailwind `green-500`)
  * Error (Fallo / Crítico): Rojo rubí (`#EF4444` / Tailwind `rose-500` / `red-500`)
  * Alerta (Revisión / Pendiente): Ámbar (`#F59E0B` / Tailwind `amber-500`)
  * Información / Espera: Azul medio (`#3B82F6` / Tailwind `blue-500`)

### 3.2. Tipografía y Jerarquías
* **Familia Tipográfica:** Inter (principal), Outfit o Roboto para números/headers si corresponde.
* **Títulos Principales:** `text-[28px]`, font-extrabold o font-black, color azul de la marca (`#1360f8`) o blanco, con `tracking-tight`.
* **Subtítulos de Sección:** `text-base` o `text-sm`, font-extrabold, uppercase, tracking-wider.
* **Botones:** `text-xs` o `text-[10px]`, font-black, uppercase, rounded-xl/rounded-2xl, transiciones suaves y cursor-pointer.
* **Cards:** Bordes suavizados (`rounded-3xl` o `rounded-2xl`), sombras finas (`shadow-2xs` o `shadow-xs`), bordes ligeros (`border border-slate-200/50` o `border-slate-800/80`).

### 3.3. Consistencia Móvil / Escritorio
* La app debe ser 100% responsiva. Utiliza flex y grids flexibles (`grid-cols-1 lg:grid-cols-12`).
* En pantallas pequeñas, oculta columnas secundarias o utiliza segmented controls para alternar vistas (ej. las pestañas móviles de tickets "En proceso" y "Listos").
* Mantén hit areas y botones de al menos `44px` de altura en móvil para facilitar el tacto.

### 3.4. Mensajes al Usuario
* **Directriz:** Los mensajes deben ser claros, amables, no técnicos y orientados a la acción. Evita mostrar crasheos de código directos, errores de base de datos o stacktraces de Playwright.
* **Ejemplo Correcto:** *"Este comercio requiere revisión manual o no entregó el XML/PDF. ZenTicket está validando el estado de tu comprobante."*
* **Ejemplo Incorrecto:** *"Error: Puppeteer selector '#btn-descarga' timeout 30000ms at page.click()."*

---

## 4. Reglas de Modificación Segura (Desarrollo)

1. **Separación de Lógica y Vista:**
   * No agregues lógica pesada de negocio o llamadas directas de base de datos dentro del renderizado de componentes visuales JSX/TSX. Encapsula las transacciones en servicios y API wrappers (`src/services/api/` y `src/services/firebase/`).
2. **Políticas de Conectores:**
   * No modifiques ni reescribas selectores CSS de conectores productivos (`portal_maps`) sin ejecutar antes las pruebas de validación correspondientes en el entorno de desarrollo/runner.
3. **Seguridad y Firestore:**
   * Nunca expongas tokens, claves privadas de API (ej. Gemini o Firebase credentials) ni passwords del SAT directamente en el código de cliente.
   * Todo cambio en la estructura de almacenamiento debe ser validado contra las reglas en `firestore.rules`.
4. **Validación de Compilación:**
   * Siempre, antes de dar por terminado un ajuste, ejecuta `npm run build` en el root y `npm run build` en el runner para asegurar que el compilador de TypeScript y Vite no arrojen errores de tipado o importación.
