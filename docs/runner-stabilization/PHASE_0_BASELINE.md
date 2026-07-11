# Fase 0: linea base de estabilizacion

Fecha de inicio: 2026-07-10.

## Alcance

No hay deploy, commit, ejecucion de portal real, limpieza ni cambios sobre jobs
existentes. Esta fase define contratos, decisiones y guardas para detener
mutaciones automaticas mientras se construye el runner seguro.

## Inventario confirmado

| Area | Implementacion actual | Riesgo a retirar |
| --- | --- | --- |
| API de produccion | `firebase/functions/index.js` | OCR, JIT y facturacion en un unico archivo. |
| API de desarrollo | `server/app.ts` | Duplica rutas y logica de Firebase. |
| Ejecucion | `runner/src/index.ts` | Mezcla triggers, worker local y Playwright. |
| Cola | `invoice_jobs` | El cliente crea y modifica jobs directamente. |
| JIT | `/api/tickets/train-jit` | Escribe conectores y portal maps automaticos. |
| Contenedor | `Dockerfile` web | No es un runtime Playwright reproducible. |

## Fuente canonica objetivo

1. Firebase Functions sera la API publica autenticada.
2. Cloud Run sera el unico ejecutor Playwright.
3. Cloud Tasks entregara trabajos al runner.
4. Firestore conservara estado y evidencia; el frontend solo solicitara acciones
   al backend.

`server/app.ts` se mantiene temporalmente para paridad de desarrollo. No debe
recibir logica nueva de negocio; la Fase 1 retirara la duplicacion.

## Guardas P0

| Variable | Valor seguro | Efecto |
| --- | --- | --- |
| `JIT_AUTOMATIC_CONNECTOR_MUTATION_ENABLED` | `false` | Bloquea que `train-jit` escriba conectores o portal maps. |
| `JIT_SELECTOR_EXECUTION_ENABLED` | `false` | Impide ejecutar selectores sugeridos por Gemini. |
| `RUNNER_AUTOMATIC_CONNECTOR_MUTATION_ENABLED` | `false` | Reserva el bloqueo de actualizaciones operativas automaticas para Fase 5. |

Solo una configuracion de servidor y una decision de despliegue independiente
pueden habilitar estas guardas. El cliente no las controla.

## Invariantes

- El `ticketId` nunca es una referencia de facturacion para el portal.
- Un resultado Gemini es una sugerencia, no una instruccion ejecutable.
- Un portal map JIT no puede nacer aprobado.
- No se modifica automaticamente un conector productivo, su URL ni su recovery flow.
- Los mocks sirven para pruebas unitarias, nunca como evidencia de produccion.

## Gates de cierre

- [x] Inventario de APIs, trigger runner y escritores cliente.
- [x] Guardas de mutacion JIT y selector IA documentadas y aplicadas.
- [x] Decision SAT registrada como pendiente de aprobacion.
- [ ] Contratos de estados y colecciones revisados.
- [ ] Aprobacion explicita de SAT como requisito de `Listo`.
