# ZenTicket: reglas de colaboración

## Regla de cero dependencia local

La computadora de desarrollo solo puede editar codigo y hacer inspecciones
estaticas. No es parte de la plataforma ni de su cadena de certificacion.

- Ningun runner, navegador, emulador, worker, archivo de credenciales, secreto,
  servicio persistente o prueba de aceptacion puede requerirse en una estacion
  local para que ZenTicket funcione o para cerrar una fase.
- Las pruebas de integracion, Rules, despacho, browser smoke y evidencia de
  release se ejecutan remotamente desde GitHub Actions, Firebase, Cloud Build,
  Cloud Tasks y Cloud Run, usando Workload Identity Federation y Secret Manager.
- Una ejecucion local puede ayudar al desarrollo, pero nunca cuenta como evidencia
  productiva ni puede bloquear una liberacion por software o runtimes instalados
  en la computadora del desarrollador.
- No se permiten service-account JSON, archivos .env productivos, tokens de Cloud
  Tasks ni navegadores locales como respaldo de produccion.

## Git

El usuario autoriza a Codex a crear commits y hacer `push` al remoto de este proyecto cuando sea necesario para completar la solicitud activa. Cada commit debe limitarse a cambios revisados y relacionados; no incluir artefactos generados, secretos, capturas, diagnósticos locales ni cambios ajenos ya presentes en el árbol de trabajo.

No crear ramas, reescribir historial, forzar pushes, borrar datos, ni desplegar a producción salvo que el usuario lo solicite explícitamente en la conversación activa.

## Producción

Vercel sirve únicamente el frontend. Firebase aporta Auth, Firestore y Storage. El runner Playwright se ejecuta exclusivamente en Cloud Run mediante Cloud Tasks e identidad administrada; ningún flujo productivo debe depender de archivos, credenciales, procesos o navegadores de una estación local.
