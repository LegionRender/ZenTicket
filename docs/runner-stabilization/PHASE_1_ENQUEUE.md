# Fase 1: enqueue transaccional

## Implementado

La lógica canonica del enqueue vive en `shared/backend/invoiceQueue.cjs` y es
consumida por:

- `POST /api/invoice-jobs` de Firebase Functions.
- `POST /api/invoice-jobs` del servidor local temporal.

El endpoint recibe exclusivamente:

```json
{
  "ticketId": "id-del-ticket",
  "idempotencyKey": "llave-unica-del-cliente"
}
```

La API resuelve y valida en una unica transaccion:

1. Propiedad del ticket.
2. Perfil fiscal completo.
3. Conector y portal map del ticket, incluida su pertenencia mutua.
4. Contrato de campos `portalFields` sin usar IDs ni fallbacks como referencia.
5. Job activo existente, lock por ticket e idempotencia.

Al aprobar, escribe el job determinista, lock, solicitud de idempotencia y evento
outbox. Tambien actualiza el ticket con `activeInvoiceJobId`. Cloud Tasks todavia
no consume el outbox; eso se implementa junto con Cloud Run en la Fase 3.

## Estados de transicion soportados

Durante la migracion se aceptan conectores `real_validation` y portal maps
legados con estado `approved`, siempre que no sean plantilla generica, no esten
deshabilitados y pertenezcan al conector. La Fase 6 reemplazara esa compatibilidad
por la maquina de estados gobernada.

## Limites deliberados

- La UI sigue escribiendo jobs directamente hasta Fase 2; por eso las Rules aun
  no se han endurecido.
- No se envia una tarea Cloud Tasks ni se ejecuta Cloud Run en esta fase.
- No se realiza deploy ni migracion de jobs antiguos.
