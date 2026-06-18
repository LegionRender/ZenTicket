# ZenTicket

Aplicacion React/Vite con backend Express para digitalizacion de tickets, aprendizaje de conectores de facturacion y generacion simulada de CFDI.

## Estructura Principal

- `src/app/router`: rutas principales de frontend.
- `src/landing`: landing activa.
- `src/workspace`: experiencia autenticada.
- `src/admin`: pantalla administrativa.
- `src/shared`: componentes compartidos.
- `src/services/api`: cliente API frontend y servicios por dominio.
- `src/services/firebase`: inicializacion unica y servicios Firebase.
- `server/routes`: endpoints Express delgados.
- `server/services`: logica backend por dominio.
- `docs`: estado, arquitectura, rutas y flujo de datos del refactor.

## Comandos

```bash
npm install
npm run dev
npm run lint
npm run build
npm run start
```

## Variables De Entorno

- `GEMINI_API_KEY`: llave Gemini usada por backend cuando el usuario no define una llave personal.
- `VITE_API_BASE_URL`: base opcional para llamadas API desde frontend. Si no existe, usa rutas relativas.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`: envio real de correos. El buzón central de la app es `contacto@zenticket.mx`; usa `SMTP_PORT=587` para TLS o `SMTP_PORT=465` para SMTPS. Si faltan, `/api/email/send` responde en modo simulado.
- `PORT`: puerto backend. Default: `3000`.

## Endpoints Activos

- `GET /api/config/status`
- `POST /api/email/send`
- `POST /api/fiscal/parse-constancia`
- `POST /api/leads`
- `POST /api/tickets/analyze`
- `POST /api/automation/run`
- `POST /api/connectors/learn`

## Estado De Refactor

El estado operativo del proceso esta en `docs/REFACTOR_STATE.md`.
El inventario de codigo legacy y residuales esta en `docs/LEGACY_INVENTORY.md`.
Las notas de seguridad y audit estan en `docs/SECURITY_NOTES.md`.

Resumen actual:
- Paso 13 completado.
- Paso 14 completado, con build y arranque local validados.
- Llamadas HTTP frontend centralizadas en `src/services/api`.
- Firebase centralizado en `src/services/firebase/client.ts`.
- Rutas backend delegan logica a servicios de dominio.
- Build actual validado sin warnings de CSS ni chunk grande en el ultimo build completado.
- `npm run dev` responde en `http://localhost:3000` y evita bloqueo infinito si falla la carga inicial del perfil fiscal.

## Pendientes Conocidos

- `src/components/LeadModal.jsx` no esta importado por la app activa. Ya usa `src/services/api/leadsService.ts` y `/api/leads`, que ya persisten y notifican.
- `src/components/LandingPage.tsx` parece landing legacy; la landing activa es `src/landing/pages/Landing.jsx`.
- `src/components/ui/toast.jsx` y `src/components/ui/toaster.jsx` son toast legacy; conviven con `sonner` y `src/shared/feedback/Toast.tsx`.
- `npm audit --omit=dev` mantiene vulnerabilidades altas asociadas a `esbuild` via Vite/tooling. Resolverlo requiere revisar upgrade mayor de toolchain u override validado.
- `POST /api/leads` ahora persiste en `server/data/leads.json`, evita duplicados por `email + plan` y envia notificacion por correo usando `LEADS_NOTIFICATION_TO` o `SMTP_USER`. Si faltan credenciales SMTP, el envio queda simulado.
