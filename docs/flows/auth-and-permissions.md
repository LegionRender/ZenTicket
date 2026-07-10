# Autenticación y Permisos

Seguridad y autenticación en la plataforma ZenTicket.

---

## 1. Middleware de Autenticación

El backend valida que las peticiones a endpoints protegidos incluyan un Firebase ID Token válido (`Authorization: Bearer <token>`).
* El middleware `authenticateFirebaseToken` decodifica el token, inyecta el `req.user` y valida el `uid`.
* El middleware `requireAdmin` valida que el usuario sea administrador comparando emails autorizados o el custom claim `role == "admin"`.

---

## 2. Pautas de Seguridad

* Todos los nuevos endpoints deben usar `authenticateFirebaseToken`.
* No almacenar credenciales o API keys de desarrollo en el frontend.
* Los endpoints sensibles para el robot runner (`/api/automation/run`) deben validar el rol de robot/admin o estar restringidos por IP/Token.
