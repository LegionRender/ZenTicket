# Estructura del Directorio del Proyecto

Estructura de organización de archivos del proyecto ZenTicket.

---

## 1. Estructura del Directorio Principal

* **`src/`:** Interfaz de usuario (React, hooks, componentes).
* **`server/`:** Código backend modular del servidor Express.
  * **`server/app.ts`:** Aplicación Express sin `.listen()`, ideal para importar y probar con supertest.
  * **`server/index.ts`:** Arranque de servidor con `app.listen()` y procesos secundarios.
* **`runner/`:** Automatizaciones robóticas de Playwright.
* **`docs/`:** Documentación técnica del proyecto.
* **`shared/`:** Tipos, contratos y constantes compartidas.

---

## 2. Pautas de Organización

* Cada ruta del backend debe tener su correspondiente controlador en `server/controllers/`.
* No colocar lógica compleja en los controladores; delegar a servicios (`server/services/`).
* Las consultas y escrituras a Firestore deben realizarse mediante la capa de persistencia (`server/repositories/`).
