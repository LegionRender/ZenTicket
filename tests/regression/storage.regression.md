# Regresión de Aislamiento de Firebase Storage

Checklist de aislamiento de archivos físicos en Storage.

---

## 1. Almacenamiento Estructurado
* [ ] Todos los XML, PDF, screenshots de error e imágenes de tickets se guardan bajo el prefijo `/users/{userId}/`.
* [ ] Las URLs de descarga de Firebase Storage (`getDownloadURL`) no exponen el token de acceso de forma pública a otros usuarios.

---

## 2. Reglas de Acceso
* [ ] Si el **Usuario A** intenta descargar o modificar un archivo bajo el path `/users/USER_B_ID/`, las reglas de Firebase Storage bloquean la petición retornando un error de permisos.
* [ ] Los administradores tienen acceso global para depurar problemas de imágenes u OCR.
