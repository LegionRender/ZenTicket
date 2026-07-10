# Reglas de Firebase (Firestore & Storage)

Aislamiento de bases de datos y almacenamiento de ZenTicket.

---

## 1. Reglas de Firestore (`firestore.rules`)

Las reglas garantizan aislamiento por usuario a nivel del servidor de base de datos:
* Colecciones privadas (`users/{userId}`, `fiscalProfiles/{userId}`) solo legibles/escribibles por su propietario (`request.auth.uid == userId`) o administradores.
* Colecciones globales (`tickets`, `invoice_jobs`) validadas por campo `resource.data.userId == request.auth.uid`.
* Regla de inmutabilidad: Bloqueada la alteración de `userId` en actualizaciones.

---

## 2. Reglas de Firebase Storage (`storage.rules`)

* Todos los binarios (PDF, XML, screenshots) se guardan bajo el path `/users/{userId}/`.
* Se concede acceso de lectura y escritura únicamente al propietario de la ruta o administradores.

---

## 3. Pruebas de Reglas con Firebase Emulator Suite

Las reglas se prueban de manera local e interactiva para prevenir fugas de datos sin necesidad de conectarse a producción:
* **Ubicación de Pruebas:**
  * `tests/integration/firestore/firestore-rules.test.ts`
  * `tests/integration/storage/storage-rules.test.ts`
* **Librería de Pruebas:** Utiliza `@firebase/rules-unit-testing` para inicializar el entorno.
* **Aislamiento del Entorno:** Durante la ejecución, se especifica el projectId local `zenticket-test` y puertos del emulador locales (8080 y 9199). Si los emuladores locales no están corriendo, las pruebas se omiten con gracia para no interrumpir el flujo CI básico.
* **Cómo ejecutar:**
  ```bash
  npm run test:firebase
  ```
