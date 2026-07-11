# ZenTicket: reglas de colaboración

## Git

El usuario autoriza a Codex a crear commits y hacer `push` al remoto de este proyecto cuando sea necesario para completar la solicitud activa. Cada commit debe limitarse a cambios revisados y relacionados; no incluir artefactos generados, secretos, capturas, diagnósticos locales ni cambios ajenos ya presentes en el árbol de trabajo.

No crear ramas, reescribir historial, forzar pushes, borrar datos, ni desplegar a producción salvo que el usuario lo solicite explícitamente en la conversación activa.

## Producción

Vercel sirve únicamente el frontend. Firebase aporta Auth, Firestore y Storage. El runner Playwright se ejecuta exclusivamente en Cloud Run mediante Cloud Tasks e identidad administrada; ningún flujo productivo debe depender de archivos, credenciales, procesos o navegadores de una estación local.
