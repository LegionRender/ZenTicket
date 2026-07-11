# Fase 2: cliente y Firestore Rules

## Cambios aplicados

- El frontend encola por `POST /api/invoice-jobs`; ya no crea `invoice_jobs`.
- El envio de CAPTCHA usa `POST /api/invoice-jobs/{jobId}/captcha`; el cliente
  no modifica el estado ni la solucion directamente en Firestore.
- Las Rules niegan toda escritura cliente a `invoice_jobs`, invoices,
  `diagnostic_summaries` y `runner_diagnostics`.
- Las Rules bloquean en tickets los campos de factura, SAT, runner, lease,
  intento, conector y portal map, y tambien los estados finales de factura.
- El cliente ya no persiste invoices ni completa datos fiscales con valores de
  demostracion. La unica fuente de una invoice es el runner backend.

## Compatibilidad pendiente

Las lecturas de jobs se conservan para que el usuario vea progreso y CAPTCHA.
Las transiciones operativas restantes de `tickets` siguen en migracion: Fase 3+
las concentrara en comandos backend junto con los attempts y leases.

## Pruebas

Las pruebas de Rules cubren denegacion de create/update de job, escritura de
invoice y campos protegidos. Su ejecucion requiere el emulador Firestore local.
