# Fase 4: orquestaciÃ³n canÃ³nica

La ruta pÃºblica de ZenTicket es Ãºnica:

```text
SPA en Vercel -> /api/* -> Firebase Function api -> transacciÃ³n de enqueue
  -> invoice_job_outbox -> Cloud Tasks (OIDC) -> Cloud Run runner
```

`firebase/functions/index.js` es la API pÃºblica canÃ³nica. `server/app.ts` se
conserva exclusivamente para pruebas y compatibilidad local; se niega a iniciar
en Vercel o Cloud Run. NingÃºn cliente debe crear o actualizar un job, una factura,
un diagnÃ³stico, una propuesta o una salida de cola directamente en Firestore.

## Matriz de estados

| Recurso | Estados de Fase 4 | Ãšnico escritor de transiciÃ³n | Lectura de cliente |
| --- | --- | --- | --- |
| `tickets/{ticketId}` | `queued_for_runner`, `runner_processing`, `waiting_user_captcha`, `requires_manual_review` | API canÃ³nica o runner | DueÃ±o / administrador |
| `invoice_jobs/{jobId}` | `pending`, `locked`, `running`, `waiting_user_action`, `captcha_submitted`, `succeeded`, `failed`, `manual_review` | API canÃ³nica o runner | DueÃ±o / administrador |
| `invoice_job_outbox/{jobId}` | `pending`, `dispatched` | API canÃ³nica y dispatcher programado | No cliente |
| Cloud Task | creada, entregada, reintentada por Cloud Tasks | dispatcher y Cloud Tasks | No cliente |

La transacciÃ³n de enqueue fija snapshots de ticket, perfil fiscal, conector y
portal map; crea el lock por ticket y el outbox a la vez. Una segunda solicitud,
incluso con otra llave de idempotencia, devuelve el mismo job activo. El cliente
observa el progreso mediante las lecturas permitidas por Rules, pero no lo altera.

## Contratos obligatorios

- Vercel reenvÃ­a `/api/*` a `us-central1-factubolt.cloudfunctions.net/api`.
- La Function valida Firebase Auth en los endpoints que procesan OCR, constancia,
  SAT, enqueue y CAPTCHA. El OCR toma el `uid` del token, nunca `userId` del body.
- El dispatcher sÃ³lo crea tareas HTTPS con OIDC para la service account invocadora;
  `X-Runner-Task-Token` es la segunda barrera desde Secret Manager.
- Cloud Run debe conservar `--no-allow-unauthenticated` e ingress
  `internal-and-cloud-load-balancing`. El token de aplicaciÃ³n no sustituye IAM.
- El handler del runner ejecuta el browser smoke antes de llamar a `processJob`.

## Evidencia de cierre

El workflow manual [phase4-platform-certification.yml](../../.github/workflows/phase4-platform-certification.yml)
archiva sus salidas con fecha y SHA. Se ejecuta exclusivamente en GitHub Actions:
corre Rules con JDK 21, compila los artefactos, construye y prueba la imagen con
Cloud Build, y comprueba por lectura la configuracion ya desplegada de Cloud Run,
Cloud Tasks, Firebase Functions y Firestore Rules. No despliega ni procesa tickets.

La evidencia productiva se obtiene en una liberaciÃ³n autorizada: guardar el SHA,
la salida saludable del smoke de Cloud Build, la revisiÃ³n Cloud Run desplegada,
la configuraciÃ³n de Cloud Tasks (cola, audiencia y service account), y el resultado
del test de Rules. No guardar tokens, archivos `.env` ni respuestas que los incluyan.
Hasta archivar esa evidencia de la revisiÃ³n desplegada, Fase 4 permanece lista para
certificaciÃ³n pero no certificada.
