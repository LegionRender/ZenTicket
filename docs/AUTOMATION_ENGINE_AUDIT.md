# Auditoría del motor de automatización

## Decisión arquitectónica

La metodología correcta es **connector-first**:

1. Identificar el comercio sin extraer referencias de facturación.
2. Resolver un conector único y activo.
3. Si no existe, crear una `training_request` y detener la automatización.
4. Exigir `extractionContract` y `portalMap` aprobado.
5. Extraer únicamente los campos declarados por el contrato.
6. Mostrar y corregir esos mismos campos en UI.
7. Persistirlos en `portalFields`.
8. Crear `invoice_job` solo si contrato, perfil fiscal y mapa son válidos.
9. Ejecutar Playwright solo con el snapshot inmutable de `portalFields`.
10. Descargar XML/PDF reales y validar el XML.

No existe un formulario universal. `ticketData` contiene metadatos del comprobante;
`portalFields` contiene exclusivamente entradas requeridas por el portal.

## Violaciones encontradas

- El cliente exigía siempre `billingReference`, aunque el contrato no la declarara.
- El cliente reconstruía `portalFields` desde `folio`, `total` y `fecha`.
- La ruta batch creaba jobs usando los mismos fallbacks genéricos.
- El snapshot copiaba `folio` en `billingReference` y `ticketNumber`.
- El runner aceptaba plantillas `ticket.*` y recurría a valores fuera de `portalFields`.
- El runner tomaba el primer `portalMap` del conector, no el mapa inmutable del job.
- Usuarios autenticados podían crear o modificar conectores con `userId: "system"`.
- Una solicitud sin conector no garantizaba la creación de `training_request`.

## Invariantes aplicadas

- Un conector sin `extractionContract.requiredPortalFields` no puede encolar.
- Los campos requeridos proceden exclusivamente del contrato.
- UUID, IDs internos y valores con prefijos de prueba se rechazan.
- El job conserva solo los campos enumerados por el contrato.
- El runner solo resuelve `portalFields.*`; `ticket.*` es un error de esquema.
- El runner usa `portalMapId`, verifica pertenencia al conector y aprobación.
- Sin conector se registra una solicitud de entrenamiento con esquema permitido por
  Firestore y se detiene el flujo.

## Trabajo pendiente antes de producción

- Mover la creación de `invoice_jobs` del cliente a una Cloud Function transaccional.
- Versionar y firmar snapshots de `extractionContract` y `portalMap` dentro del job.
- Migrar conectores existentes y retirar los que dependan de `ticket.*`.
- Separar el OCR de identidad del OCR dirigido en endpoints distintos.
- Sustituir la UI monolítica del scanner por componentes generados desde el contrato.
- Añadir pruebas de emulador para reglas y pruebas contractuales por conector.
- Definir explícitamente la política SAT. El manual operativo actual dice que ZenTicket
  no consulta SAT; por tanto `cfdi_validated` no debe habilitarse hasta aprobar y probar
  ese cambio de alcance.

Los directorios `scratch/`, `runner/tmp/` y artefactos de demostración no deben formar
parte de una imagen de producción. No se eliminaron automáticamente porque contienen
trabajo local no versionado; deben revisarse y excluirse mediante `.gitignore` o una
limpieza explícita antes del despliegue.
