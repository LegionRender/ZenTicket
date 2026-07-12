# Topología de producción

ZenTicket no requiere procesos, navegadores, archivos de credenciales ni workers en la computadora de un desarrollador.

```text
GitHub (fuente y validación)
        |
        +--> Vercel: SPA estática
        |       |
        |       +--> /api/* -> API backend de Google Cloud
        |
        +--> Cloud Build (manual y autenticado por WIF)
                |
                +--> Cloud Run runner (imagen Playwright fijada)

Firebase Auth + Firestore + Cloud Storage <--> API backend / Cloud Run runner
```

## Límites obligatorios

| Componente | Responsabilidad | No puede hacer |
| --- | --- | --- |
| Vercel | Servir el frontend y reenviar `/api/*` al backend configurado | Ejecutar Playwright o escribir trabajos directamente en Firestore |
| API backend | Autenticar, validar y encolar de forma idempotente | Lanzar un proceso local del runner |
| Cloud Tasks | Entregar un `jobId` autenticado al runner y reintentar según su política | Consultar o procesar tickets por polling |
| Cloud Run runner | Ejecutar exactamente un trabajo por solicitud, con Chromium de la imagen | Usar `serviceAccountKey.json`, `.env` local, Firebase Functions o un loop propio |
| Firebase | Auth, Firestore y Storage | Permitir al SDK cliente escribir jobs, diagnósticos, facturas o estados de runner |

La URL del backend se concentra en [`vercel.json`](../../vercel.json) y apunta a la
Function `api` de Firebase. El runner no se publica mediante Firebase Hosting ni
como codebase de Firebase Functions; [`firebase.json`](../../firebase.json) ya no
declara ese codebase ni Hosting. El Express heredado no puede iniciar en Vercel ni
Cloud Run: sÃ³lo existe para compatibilidad y pruebas locales.

## Identidad y secretos

El contenedor usa Application Default Credentials de su service account de Cloud Run. No se debe proporcionar `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_SERVICE_ACCOUNT` ni un archivo `serviceAccountKey.json` al runner.

Configurar en Google Cloud, fuera del repositorio:

1. Una service account de runtime con acceso mínimo a Firestore y a los prefijos de Cloud Storage que contienen XML, PDF, screenshots y traces.
2. Una service account del dispatcher con `roles/run.invoker` únicamente sobre el servicio runner.
3. Cloud Run con `--no-allow-unauthenticated` e ingress `internal-and-cloud-load-balancing`.
4. Cloud Tasks con token OIDC de la service account del dispatcher y audiencia igual a la URL del runner.
5. `RUNNER_TASK_TOKEN` desde Secret Manager como defensa adicional de aplicación; Cloud Tasks lo envía en `X-Runner-Task-Token`, mientras que el header `Authorization` queda reservado para su token OIDC. Nunca debe estar en Git, Vercel ni el cliente.
6. Workload Identity Federation de GitHub Actions para la cuenta de despliegue; no usar secretos JSON de service accounts en GitHub.

## Construcción y liberación

La imagen se construye remotamente con [`runner/cloudbuild.yaml`](../../runner/cloudbuild.yaml), usando [`runner/Dockerfile`](../../runner/Dockerfile) y la imagen Playwright fijada. El workflow [`runner-cloud-run-release.yml`](../../.github/workflows/runner-cloud-run-release.yml) solo se puede ejecutar manualmente y no se ha ejecutado como parte de esta fase.

Antes de una liberación autorizada se deben configurar las variables de GitHub `GCP_PROJECT_ID`, `GCP_REGION`, `RUNNER_SERVICE`, `RUNNER_RUNTIME_SERVICE_ACCOUNT`, `GCP_WORKLOAD_IDENTITY_PROVIDER` y `GCP_DEPLOY_SERVICE_ACCOUNT`. Los secretos operativos permanecen en Secret Manager.

## Estado de la migración

El endpoint Cloud Run ya hace un smoke de Chromium antes de llamar a `processJob`; si falla devuelve `PLAYWRIGHT_BROWSER_LAUNCH_FAILED` y no navega al portal. El scheduler `dispatchInvoiceJobs` entrega exclusivamente el outbox `pending` a Cloud Tasks. La siguiente fase eliminará el código heredado de polling/triggers que hoy no se despliega, añadirá `attemptId` y convertirá reintentos en nuevos mensajes de la misma cola. Hasta completar esa fase, no se debe liberar procesamiento real.
