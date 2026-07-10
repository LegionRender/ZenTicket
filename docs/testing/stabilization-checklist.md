# Checklist de Estabilización y Liberación de Fase

Este checklist técnico debe ser ejecutado de forma mandatoria antes de dar por cerrada cualquier fase de desarrollo y avanzar a la siguiente.

---

## 1. Controles Técnicos Previos a Avance de Fase

* [ ] **Compilación:** `npm run build` compila al 100% sin errores de bundler.
* [ ] **Typecheck:** `npm run lint` (`tsc --noEmit`) pasa con 0 errores de tipado.
* [ ] **Suite de Pruebas Automatizadas:** `npm run test` se ejecuta correctamente y todas las pruebas pasan.
* [ ] **Control de Secretos y Entorno:** El setup de pruebas (`tests/setup.ts`) no arroja alertas de claves live ni credenciales activas.

---

## 2. Validación de Seguridad y Aislamiento (Inquilino)
* [ ] El Usuario A no tiene permisos para descargar ningún archivo del Usuario B desde Firebase Storage.
* [ ] El Usuario A no puede realizar lecturas directas en Firestore de documentos privados ajenos (ej. `fiscalProfiles/USER_B_ID`).
* [ ] Al invocar `/api/billing/payment-methods/default` con un ID de tarjeta ajena, el backend responde `403 Forbidden` y bloquea la asignación.
