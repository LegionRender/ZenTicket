# Motor de Automatización (Automation Engine)

Ubicado en `runner/src/engines/automation/`. Se encarga de simular las interacciones de un usuario real en los portales de facturación externos de los comercios.

---

## 1. Responsabilidades

* **Ejecutor de PortalMap (`executePortalMap.ts`):** Lee la lista estructurada de pasos (`portalMap`) y los ejecuta de forma secuencial en una ventana del navegador Playwright (headless o con interfaz).
* **Gestión de Sesión:** Apertura, cierre y limpieza de cookies/contexto de Playwright para evitar contaminación entre ejecuciones.
* **Auto-curación (Self-Healing):** Detección de cambios de diseño mínimos en el DOM del portal de facturación mediante heurística o IA (JIT).

---

## 2. Diagnóstico y Trazabilidad de Fallos en Navegación

El motor de automatización está instrumentado para atrapar excepciones en el navegador y delegarlas al motor de errores centralizado, clasificándolas en etapas específicas como:
* `browser_launch` si la inicialización de Playwright falla.
* `portal_navigation` si ocurre timeout al cargar la página de inicio o si no se localiza un selector CSS principal.
* `captcha_detection` si un control CAPTCHA o reCAPTCHA interrumpe la navegación.
* `already_invoiced_detection` si la interacción del selector detecta la leyenda de ticket previamente facturado.

---

## 3. Recuperación de Comprobantes Preexistentes (`tryRecoverExistingInvoice`)

En la Fase 12, se eliminó la simulación de éxitos basada en la generación de XMLs artificiales. La recuperación ahora funciona con un resultado estructurado `RecoveryResult`:

* **Intento de recuperación activa:** Si el diagnóstico detecta que el ticket ya fue facturado (`ALREADY_INVOICED`), se activa la bandera `wasAlreadyInvoiced = true`.
* **Ejecución de clics:** `tryRecoverExistingInvoice` localiza y cliquea enlaces o botones de consulta/historial/descarga en el portal.
* **Recolección estricta:** Espera la descarga física del XML/PDF (o intercepción en red).
* **Fallo explícito:** Si la descarga no se completa, retorna `success: false` y el runner aborta el procesamiento lanzando la excepción `TICKET_ALREADY_INVOICED`, enviando el ticket de forma permanente a revisión manual con `retryable: false`.
