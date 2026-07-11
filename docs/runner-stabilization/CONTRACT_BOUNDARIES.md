# Contratos de frontera - borrador P0

No migra datos ni autoriza nuevas escrituras cliente.

## Solicitud de encolado

```json
{
  "ticketId": "firestore-ticket-id",
  "idempotencyKey": "uuid-generado-por-el-cliente"
}
```

El backend resuelve perfil fiscal, conector, aliases y portal map. El frontend
no puede enviar snapshots, estado, selectores ni referencia de facturacion.

## Job e intento

```text
invoice_jobs/{jobId}
  attempts/{attemptId}
```

El job conserva snapshots inmutables y estado agregado. El intento conserva
lease, heartbeat, etapa, URL final, timeline, trace, screenshot, documentos y
validaciones. Todo artefacto tecnico lleva el mismo `attemptId`.

## Estados de portal map

```text
draft -> sandbox -> approved_for_observation -> observation -> production_ready
```

No existe transicion automatica a `approved` o `production_ready`.

## Estados fiscales propuestos

```text
queued -> running -> xml_downloaded -> cfdi_validated
       -> sat_validation_pending -> sat_validated
```

`sat_validated` solo se habilitara si se aprueba ADR-003. CAPTCHA, fallos y
circuit breaker terminan en estados de revision durable, nunca en `Listo`.
