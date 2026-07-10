# Resumen del Robot Runner (Playwright Worker)

El robot runner es el encargado de procesar la facturación de tickets ingresando a los portales externos de los comercios.

---

## 1. Funcionamiento del Runner

1. El runner se ejecuta como un proceso secundario en background y escucha la colección `invoice_jobs` de Firestore.
2. Al detectar un trabajo en estado `pending`, bloquea el documento y arranca una instancia headless de Playwright.
3. Ejecuta el `portalMap` de comandos simulando clics y rellenados utilizando el **Motor de Automatización** (`engines/automation/`).
4. Resuelve CAPTCHAs si es necesario a través de solvers de IA o intervenciones manuales en tiempo real.
5. Descarga el XML y PDF de la factura, validándolos con el **Motor CFDI** (`engines/cfdi/`) y verificándolos con el **Motor SAT** (`engines/sat/`) antes de subirlos a Firebase Storage.

---

## 2. Pautas de Código e Infraestructura

* **Puente de Compatibilidad:** Para evitar romper dependencias cruzadas en la Fase 10, los archivos originales en `runner/src/validators/` y `runner/src/errors/` se mantuvieron como re-exports de los nuevos archivos ubicados bajo `runner/src/engines/`.
* **Aislamiento Absoluto:** El runner opera en base al `userId` del job para guardar todos los binarios descargados (XML, PDF, screenshots de error) de forma exclusiva bajo el path `/users/{userId}/` en Firebase Storage, respetando las reglas de aislamiento.
