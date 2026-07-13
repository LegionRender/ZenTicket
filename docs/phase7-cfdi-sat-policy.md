# Fase 7 — Comprobación de vigencia CFDI

## Regla de ejecución

La consulta de vigencia se ejecuta exclusivamente por el runner autenticado en
Cloud Run. No hay consulta al SAT desde el navegador, desde Firebase Functions
ni desde las rutas de compatibilidad del servidor.

El runner sólo llega a esa consulta después de descargar el XML desde el portal
del comercio, persistirlo y aprobar su validación estructural. La expresión de
consulta se arma con los datos del XML validado: RFC emisor, RFC receptor, total
y UUID; nunca con datos sugeridos, sintéticos o proporcionados por el cliente.

## Transición de estados

| Resultado remoto | Estado de ticket e invoice |
| --- | --- |
| Vigente | cfdi_validated, con satValidated: true |
| Cancelado | revisión manual, sin marcar CFDI válido |
| No Encontrado, error o tiempo de espera | pendiente de reintento o revisión manual, sin marcar CFDI válido |

Por tanto, XML descargado no equivale a CFDI confirmado: solamente el resultado
Vigente permite la transición final.

## Controles

- Las rutas públicas históricas /api/cfdi/verify-sat responden 410
  SAT_VALIDATION_RUNNER_ONLY; no reciben ni procesan XML.
- Se eliminó el cliente SOAP del backend público y el código inalcanzable del
  frontend.
- Los logs del runner no imprimen la expresión completa de consulta, para no
  exponer RFC ni UUID.
- La política se verifica con una prueba de regresión de límites de ejecución.

El SAT publica servicios especializados de validación de CFDI y también señala
que la consulta y recuperación de facturas se realiza mediante sus controles
oficiales. Fuentes: [servicios especializados de validación del SAT](https://wwwmat.sat.gob.mx/consultas/20585/conoce-los-servicios-especializados-de-validacion) y [consulta y recuperación de facturas](https://wwwmat.sat.gob.mx/aplicacion/82471/consulta%2C-cancela-y-recupera-tus-facturas-electronicas).
