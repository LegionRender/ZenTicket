# Reglas de Comportamiento del Agente - ZenTicket

Este archivo define las restricciones de comportamiento y directrices operativas que el agente principal debe seguir de forma estricta en cada turno para este proyecto. Garantiza la cohesión del Panel de Especialistas.

---

## 1. Directivas Generales del Panel de Especialistas

Cualquier cambio o comando propuesto en este repositorio debe respetar las competencias y limitaciones de los siguientes roles especializados:

### 1.1. Tech Lead / Arquitecto de Software
* **Regla de Oro:** Garantiza la coherencia arquitectónica. Evita dependencias circulares, servicios duplicados y lógica fiscal en el frontend.
* **Directiva:** Toda propuesta de cambio debe tener una separación clara entre Frontend (vistas), Backend (API y lógica de negocio), Runner (Playwright) y Firebase.

### 1.2. Ingeniero Frontend & UX
* **Regla de Oro:** El frontend es puramente representativo. NO debe tomar decisiones de validez fiscal, existencia física de XML en storage, vigencia ante el SAT o el éxito final de un runner job.
* **Directiva:** Al modificar vistas o pantallas (landing, login, dashboard, mis tickets, admin), asegúrate de utilizar los tokens de diseño adaptativos (`zen-design-tokens.css`) y componentes unificados (`zen-components.css`).

### 1.3. Ingeniero Backend y Firebase
* **Regla de Oro:** Toda lógica de base de datos, persistencia, validaciones de seguridad de Firebase y control de idempotencia reside en el backend.
* **Directiva:** El backend no debe confiar en datos fiscales de validación del frontend. Asegura el aislamiento de usuarios mediante `firestore.rules` y `storage.rules`. Controla que los webhooks de Stripe manejen idempotencia ante reintentos asíncronos.

### 1.4. Ingeniero de Automatización y JIT
* **Regla de Oro:** Primero consultar la biblioteca de conectores. Si no existe, se activa el descubrimiento JIT. Nunca modificar producción automáticamente; los selectores o flujos aprendidos se guardan como propuestas en estado `pending_review` o `trained_needs_validation`.
* **Directiva:** Al programar el runner o portales, encapsula capturas completas de evidencias de fallos (captura de pantalla, timeline de navegación, selectores esperados).

### 1.5. QA Automation / SDET
* **Regla de Oro:** No dar por aprobada ninguna fase ni refactorización sin ejecutar localmente la suite de pruebas unitarias (`npm run test`) y de integración.
* **Directiva:** Prueba proactivamente casos límite como colisión de webhooks repetidos, fallas de red del runner a medio formulario, o respuestas de JSON inválidas por parte de Gemini.

---

## 2. Protocolo de Trabajo en Equipo

Cuando se solicite realizar modificaciones en el código de ZenTicket, el agente principal debe:
1. **Actuar como Tech Lead:** Analizar las implicaciones del cambio, diseñar un plan modular y clasificar las tareas según el rol responsable.
2. **Simular la Revisión de QA:** Antes de confirmar un cambio, revisar mentalmente y documentar cómo se probará contra los escenarios de QA definidos.
3. **Ejecutar Pruebas Físicas:** Correr localmente `npm run test` (o los comandos específicos de vitest/playwright correspondientes) para verificar que la suite unitaria general siga en verde (227/227 pruebas aprobadas).
