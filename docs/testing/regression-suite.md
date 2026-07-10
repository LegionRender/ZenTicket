# Suite de Regresión de ZenTicket

Este documento lista las pruebas y checklists que componen el suite de regresión de ZenTicket para resguardar la estabilidad del sistema.

---

## 1. Cobertura del Suite de Regresión

El suite cubre tres grandes niveles de verificación:

### A. Pruebas Automatizadas (Vitest)
* **Seguridad y Bypass:** Valida que el bypass local no esté expuesto en producción ni bajo credenciales de hosting Cloud o claves live de Stripe.
* **Middlewares Express:** Valida que `authenticateFirebaseToken` y `requireAdmin` decodifiquen y asignen roles y privilegios correctamente.
* **Firmas de Stripe:** Valida que la firma del webhook sea autenticada criptográficamente con ventana de tiempo de 5 minutos y control de timing attacks.
* **Contratos Compartidos:** Verifica la integridad semántica de `shared/` sin duplicados.
* **API Endpoints (Pruebas HTTP):** Valida con `supertest` que los endpoints protegidos retornen 401 sin token, 403 con usuario común para rutas admin, y que el webhook de Stripe requiera firma pero ignore Firebase Auth.
* **Firebase Security Rules (Emulador):** Valida que las reglas reales de Firestore y Storage aíslen a los usuarios de consultas o escrituras cruzadas en colecciones privadas o carpetas físicas de Storage.

### B. Checklists de Regresión Manual (bajo `tests/regression/`)
* **[auth.regression.md](file:///c:/Users/Ricardo/Documents/Work%202026/Web%20Zenticket/ZenTicket-main/tests/regression/auth.regression.md):** Seguridad de bypass y roles de administración.
* **[users-isolation.regression.md](file:///c:/Users/Ricardo/Documents/Work%202026/Web%20Zenticket/ZenTicket-main/tests/regression/users-isolation.regression.md):** Inmutabilidad y límites de consulta de inquilino.
* **[payments.regression.md](file:///c:/Users/Ricardo/Documents/Work%202026/Web%20Zenticket/ZenTicket-main/tests/regression/payments.regression.md):** Flujos Stripe-only + Link + Google Pay (Apple Pay desactivado).
* **[storage.regression.md](file:///c:/Users/Ricardo/Documents/Work%202026/Web%20Zenticket/ZenTicket-main/tests/regression/storage.regression.md):** Aislamiento de directorios en Storage `/users/{userId}/`.
* **[api.regression.md](file:///c:/Users/Ricardo/Documents/Work%202026/Web%20Zenticket/ZenTicket-main/tests/regression/api.regression.md):** Respuesta HTTP de endpoints protegidos.
