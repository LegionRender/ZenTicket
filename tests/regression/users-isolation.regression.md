# Regresión de Aislamiento de Usuarios en Firestore

Checklist de aislamiento por inquilino en la base de datos Firestore.

---

## 1. Consultas y Lectura de Datos
* [ ] El **Usuario A** no puede ver la lista de tickets, perfiles fiscales o facturas del **Usuario B**.
* [ ] Si el **Usuario A** intenta consultar un documento privado ajeno conociendo su ID exacto (ej. `fiscalProfiles/USER_B_ID`), las reglas de Firestore bloquean la lectura.
* [ ] Las consultas del frontend a colecciones globales (`tickets`, `invoice_jobs`) siempre filtran explícitamente por `userId == currentUserId`.

---

## 2. Inmutabilidad de Propietario
* [ ] Un usuario no puede alterar el campo `userId` al actualizar o crear tickets. Las reglas de Firestore exigen `request.resource.data.userId == request.auth.uid`.
* [ ] Un usuario anónimo no tiene permisos de lectura ni escritura en ninguna colección de negocio.
