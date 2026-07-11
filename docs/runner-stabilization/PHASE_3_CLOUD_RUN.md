# Fase 3: runtime Cloud Run

## Imagen objetivo

`runner/Dockerfile` usa la imagen oficial Playwright `v1.61.1-jammy`, igual a
la version declarada por el runner. Cloud Run usa Chromium incluido por
Playwright; Sparticuz queda reservado para Cloud Functions legadas.

## Endpoints internos

- `GET /healthz`: disponibilidad del proceso.
- `GET /internal/browser-smoke`: lanza Chromium, crea contexto/pagina y devuelve
  Playwright, Chromium y executable path reales.
- `POST /tasks/process`: requiere `RUNNER_TASK_TOKEN`, ejecuta el smoke antes de
  llamar al job y responde 503 si Chromium no inicia. En ese caso no se ejecuta
  `processJob` ni puede ocurrir `page.goto`.

No se ha construido ni desplegado esta imagen. La validacion real se hara sobre
el contenedor construido y desplegado de forma autorizada.
