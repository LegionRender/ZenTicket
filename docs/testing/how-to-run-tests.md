# Guía para Ejecutar Pruebas Automatizadas en ZenTicket

Este documento detalla el procedimiento para ejecutar el suite de pruebas unitarias e integración en el entorno seguro de desarrollo de ZenTicket.

---

## 1. Comandos de Consola Disponibles

Las pruebas corren sobre **Vitest**. Los comandos configurados son:

* **Ejecutar todas las pruebas (sin requerir emuladores activos):**
  ```bash
  npm run test
  ```
* **Ejecutar pruebas unitarias únicamente:**
  ```bash
  npm run test:unit
  ```
* **Ejecutar pruebas de integración de API (con supertest):**
  ```bash
  npm run test:integration
  ```
* **Ejecutar pruebas de Firebase Emulator (Firestore + Storage Rules):**
  ```bash
  npm run test:firebase
  ```
* **Ejecutar pruebas individuales de Firestore Rules:**
  ```bash
  npm run test:firestore
  ```
* **Ejecutar pruebas individuales de Storage Rules:**
  ```bash
  npm run test:storage
  ```

---

## 2. Diferencia entre `app.ts` e `index.ts` en el Backend

El backend se encuentra desacoplado para soportar pruebas automatizadas sin efectos secundarios indeseados:
* **`server/app.ts`:** Instancia, configura y exporta la aplicación Express (rutas, middlewares, parseo de raw body y parseo JSON). **No ejecuta `app.listen()`**. Al no levantar el socket de red, puede ser importado de forma segura por frameworks de prueba como `supertest` para simular llamadas HTTP en milisegundos.
* **`server/index.ts`:** Importa la app Express desde `./app.ts` y arranca el servidor llamando a `app.listen()`. También arranca los procesos secundarios en background como el runner worker Playwright.

---

## 3. Pruebas de Reglas con Firebase Emulator Suite

Para validar que las reglas de Firestore (`firestore.rules`) y Storage (`storage.rules`) aíslan correctamente la información por usuario:
1. **Requisitos:** El sistema operativo local debe tener instalado el **Java Development Kit (JDK)** versión 11 o superior.
2. **Uso de Emuladores:** El comando `npm run test:firebase` arranca de forma automática el Firestore Emulator (puerto 8080) y el Storage Emulator (puerto 9199) usando un proyecto simulado llamado `zenticket-test` (nunca tocando producción).
3. **Casos que Valida:**
   * **Lectura/Escritura Aislada:** Comprueba que un usuario autenticado A no pueda leer ni escribir en documentos de un usuario B (perfiles, tickets, facturas).
   * **Storage Privado:** Valida que el acceso a `/users/{userId}/...` esté restringido al dueño de los archivos (`isOwner(userId)`).
   * **Anónimos Bloqueados:** Certifica que usuarios no logueados reciban rechazo de lectura y escritura en recursos privados.
