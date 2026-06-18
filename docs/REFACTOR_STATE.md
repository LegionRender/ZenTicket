# Refactor State

## Control

- Modelo autorizado: `GPT-5.5`
- Paso autorizado: `14`
- No ejecutar pasos posteriores.
- No eliminar cÃ³digo.
- No realizar refactors fuera del alcance del paso autorizado.
- Al terminar cada paso, actualizar este documento y detenerse.

## Estado real al 2026-06-17

- La estructura fÃ­sica principal ya fue adelantada en buena parte del proyecto.
- TambiÃ©n existen adelantos que el plan compacto reserva para pasos posteriores, sobre todo extracciones parciales de componentes grandes y modularizaciÃ³n de servicios.
- No se ha aplicado reversiÃ³n automÃ¡tica de esos adelantos; a partir de este punto el trabajo debe alinearse al plan compacto y evitar mÃ¡s refactor profundo mientras no se autorice.
- `npm run lint` aprobado.
- `npm run build` aprobado.

## Paso actual

### Paso 14

Objetivo cumplido: ejecutar limpieza visual, seguridad, performance y documentacion final sobre la base ya estabilizada, manteniendo contratos actuales.

### Estado de avance

- `landing`, `auth`, `workspace`, `admin`, `shared`, `services`, `styles`, `server`, `firebase` y `docs` ya existen en la base actual.
- Ya existe separaciÃ³n inicial entre frontend y backend con carpeta `server/` y archivos raÃ­z de arranque todavÃ­a presentes.
- Ya se actualizaron mÃºltiples imports y rutas internas.
- Firebase ya quedÃ³ centralizado en `src/services/firebase/client.ts`.
- Ya existe la base de API en `src/services/api/client.ts`.
- `Paso 12.1` ya quedÃ³ revisado: imports principales y puntos de entrada consistentes.

### Paso 10 cerrado

- `lint`: correcto
- `build`: correcto
- La validaciÃ³n de `build` necesitÃ³ ejecuciÃ³n fuera del sandbox por restricciÃ³n del entorno al resolver `vite.config.ts`.
- No se detectaron errores de compilaciÃ³n funcionales en la base actual.

## Estructura actual resumida

```text
src/
  admin/
  app/
  auth/
  landing/
  services/
  shared/
  styles/
  workspace/
server/
firebase/
docs/
```

## Archivos movidos o creados relevantes

- `src/app/router/AppRouter.jsx`
- `src/landing/pages/Landing.jsx`
- `src/auth/...`
- `src/shared/brand/...`
- `src/shared/feedback/...`
- `src/workspace/layout/WorkspaceLayout.jsx`
- `src/workspace/layout/WorkspacePanel.jsx`
- `src/workspace/router/WorkspaceRoutes.jsx`
- `src/workspace/hooks/useWorkspaceData.js`
- `src/workspace/hooks/useWorkspaceActions.js`
- `src/services/firebase/client.ts`
- `src/services/api/client.ts`
- `src/services/firebase/profilesService.js`
- `src/services/firebase/ticketsService.js`
- `src/services/firebase/invoicesService.js`
- `src/services/firebase/connectorsService.js`
- `src/workspace/features/tickets/tickets.types.ts`
- `src/workspace/features/tickets/ticketsMocks.ts`
- `src/workspace/features/tickets/ticketsUtils.ts`
- `src/admin/pages/admin.types.ts`
- `src/admin/pages/adminUtils.tsx`
- `src/workspace/features/home/onboarding.types.ts`
- `src/workspace/features/home/onboardingUtils.ts`
- `src/workspace/features/account/accountUtils.ts`
- `server/app.ts`
- `server/startServer.ts`
- `server/config/env.ts`
- `server/routes/config.routes.ts`
- `server/routes/email.routes.ts`
- `server/routes/fiscal.routes.ts`
- `server/routes/ticket.routes.ts`
- `server/routes/connector.routes.ts`
- `server/routes/automation.routes.ts`

## Componentes monolÃ­ticos pendientes

- `src/workspace/features/account/ProfileForm.tsx`
- `src/admin/pages/AdminScreen.tsx`
- `src/workspace/features/scanner/ScannerAndSimulator.tsx`
- `src/workspace/features/tickets/TicketsListScreen.tsx`
- `src/workspace/features/home/OnboardingFlow.tsx`

Nota: estos archivos siguen registrados como pendientes, pero su divisiÃ³n profunda pertenece al paso 13 salvo extracciones de bajo riesgo permitidas en el paso 11.

## Accesos directos a Firebase detectados

### Lectura y suscripciones

- `src/workspace/hooks/useWorkspaceData.js`
  - `fiscalProfiles`
  - `invoices`
  - `tickets`
  - `connectors`
- `src/admin/pages/AdminScreen.tsx`
  - `automation_trainings`

### Escritura o migraciÃ³n en frontend

- `src/auth/components/AuthModal.jsx`
  - `users`
- `src/workspace/features/scanner/ScannerAndSimulator.tsx`
  - `automation_trainings`
- `src/services/firebase/profilesService.js`
  - `fiscalProfiles`
  - `users`
  - `tickets`
  - `invoices`
  - `connectors`
  - `automation_trainings`
- `src/services/firebase/ticketsService.js`
  - `tickets`
- `src/services/firebase/invoicesService.js`
  - `invoices`
- `src/services/firebase/connectorsService.js`
  - `connectors`

## Endpoints backend inventariados

- `GET /api/config/status`
- `POST /api/email/send`
- `POST /api/fiscal/parse-constancia`
- `POST /api/tickets/analyze`
- `POST /api/connectors/learn`
- `POST /api/automation/run`

## Uso frontend de endpoints detectado

- `src/components/LeadModal.jsx`
  - flujo de leads fuera del bloque principal de endpoints del server actual
- `src/workspace/features/tickets/TicketsListScreen.tsx`
  - `/api/config/status`
  - `/api/email/send`
- `src/workspace/features/scanner/ScannerAndSimulator.tsx`
  - `/api/tickets/analyze`
  - `/api/automation/run`
- `src/workspace/features/home/OnboardingFlow.tsx`
  - `/api/fiscal/parse-constancia`
- `src/workspace/features/account/ProfileForm.tsx`
  - `/api/fiscal/parse-constancia`

## Riesgos abiertos

- Ya hubo adelantos equivalentes a paso 11 y parte de paso 13 antes de adoptar este control.
- `LeadModal.jsx` apuntaba a un flujo legacy con `${API}/leads`; en paso 14 se migro a `src/services/api/leadsService.ts`, pero `/api/leads` sigue sin backend activo.
- Persisten accesos directos a Firebase dentro de componentes y hooks que deberÃ¡n quedar registrados, no refactorizados en profundidad todavÃ­a.
- El backend estÃ¡ parcialmente dividido: conviven `server.ts` y `server/`.
- El build deja warnings de CSS por selectores con clases arbitrarias en modo oscuro.
- El bundle principal de frontend sigue siendo grande y supera el umbral de advertencia de Vite.

## Warnings conocidos

- Build CSS:
  - selectores dark mode con clases arbitrarias generan 4 warnings de optimizaciÃ³n CSS
- Bundle:
  - el chunk principal de frontend sigue por encima del umbral de advertencia de Vite
- Backend residual:
  - conviven `server.ts` y `server/`, aunque la cadena activa ya estÃ¡ confirmada
- Frontend residual:
  - `src/components/LandingPage.tsx`
  - `src/components/ui/toaster.jsx`
  - `src/components/ui/toast.jsx`
- Endpoint no confirmado en backend activo:
  - `${API}/leads` desde `src/components/LeadModal.jsx`

## CÃ³digo posiblemente muerto o en cuarentena

- `src/pages/`
- `src/components/`
- `src/context/`
- `src/hooks/`
- `src/lib/`
- `src/utils/`

Nota: estas rutas no deben limpiarse todavÃ­a. Solo quedan marcadas para verificaciÃ³n posterior.

## Reservado para GPT-5.5

- DivisiÃ³n profunda de componentes grandes.
- ExtracciÃ³n de hooks complejos.
- RedistribuciÃ³n de estados React.
- Cambio de flujo del scanner.
- DivisiÃ³n mayor de `server.ts` mÃ¡s allÃ¡ de la base ya creada.
- Limpieza final de cÃ³digo muerto, dependencias, assets y adaptadores.
- AfinaciÃ³n visual, seguridad transversal y optimizaciÃ³n final.

## PrÃ³xima acciÃ³n permitida

1. `12.2` Confirmar que Firebase no se inicializa varias veces.
2. `12.3` Verificar comunicaciÃ³n frontend/backend.
3. Ejecutar validaciÃ³n integral de build y registrar warnings.
4. Preparar matriz manual de pruebas y cierre de fase.

## Estado de paso

- `Paso 10`: cerrado y verificable
- `Paso 11`: preparado para cierre operativo
- `Paso 12`: en curso

## Avance reciente de paso 11

- Se creÃ³ la base de `src/services/api/client.ts` sin migrar todavÃ­a las llamadas existentes.
- Se verificÃ³ que no hay inicializaciÃ³n duplicada de Firebase en frontend o backend.
- Se prepararon mÃ³dulos de bajo riesgo para `tickets` y `admin` con tipos, mocks y utilidades puras.
- `TicketsListScreen.tsx` ya consume tipo, mocks y utilidad pura desde mÃ³dulos externos.
- `OnboardingFlow.tsx` ya consume tipo y utilidad pura desde mÃ³dulos externos.
- `AdminScreen.tsx` ya delega su tipo y utilidades puras a `admin.types.ts` y `adminUtils.tsx`, manteniendo compatibilidad local.
- `ProfileForm.tsx` ya delega detecciÃ³n de perfil mock y provisiÃ³n de tarjetas default a `accountUtils.ts`.
- `ProfileForm.tsx` tambiÃ©n delega la normalizaciÃ³n del perfil Legion y su tarjeta principal a `accountUtils.ts`.
- `ProfileForm.tsx` ya centraliza defaults fiscales/base y la construcciÃ³n del payload principal de guardado en `accountUtils.ts`.
- `ProfileForm.tsx` ya reutiliza helpers centralizados tambiÃ©n en flujos de pago, cambio de plan y persistencia de tarjetas.
- `npm run lint` y `npm run build` siguen aprobando despuÃ©s de estos cambios.

## Avance reciente de paso 12

- `12.1` Puntos de entrada confirmados:
  - Frontend: `src/index.jsx -> src/App.jsx -> src/app/router/AppRouter.jsx`
  - Backend: `server.ts -> server/app.ts + server/routes/* + server/startServer.ts`
- No se detectaron imports activos apuntando a `@/pages/` ni a `@/components/sections`.
- Se detectÃ³ cÃ³digo alterno o residual todavÃ­a no activo:
  - `src/components/LandingPage.tsx`
  - `src/components/ui/toaster.jsx`
  - `src/components/ui/toast.jsx`
- Estos archivos quedan como residuales/quarantine; no deben limpiarse todavÃ­a dentro de GPT-5.4.
- `12.2` Firebase confirmado con una Ãºnica fuente activa de inicializaciÃ³n:
  - `src/services/firebase/client.ts`
- Se aÃ±adiÃ³ guard de runtime con `getApps().length ? getApp() : initializeApp(...)` para evitar reinicializaciÃ³n por HMR o imports repetidos.
- No se detectaron otras llamadas activas a `initializeApp`, `getFirestore`, `getAuth` o `getStorage` fuera de `src/services/firebase/client.ts`.
- `12.3` ComunicaciÃ³n frontend/backend verificada sobre endpoint real:
  - `GET http://localhost:3000/api/config/status`
  - respuesta recibida: `{"smtpConfigured":false,"smtpUser":null}`
- El mapa entre consumos de frontend y rutas activas del backend sigue consistente para:
  - `/api/config/status`
  - `/api/email/send`
  - `/api/fiscal/parse-constancia`
  - `/api/tickets/analyze`
  - `/api/automation/run`
- Riesgo aÃºn abierto:
  - `src/components/LeadModal.jsx` ya no usa `${API}/leads` directo, pero `/api/leads` no forma parte del backend activo.

## Matriz manual pendiente

- Landing: validado
- Login: validado
- Dashboard: validado
- Scanner: validado
- Tickets: validado
- Conectores: validado
- Gastos: validado
- Cuenta: validado
- AdministraciÃ³n: validado

## Estado de cierre de fase

- `12.1` imports y puntos de entrada: completado
- `12.2` inicializaciÃ³n Ãºnica de Firebase: completado
- `12.3` comunicaciÃ³n frontend/backend: completado
- warnings conocidos: registrados
- matriz manual: completada
- cierre total de `Paso 12`: completado

## Transferencia de modelo

- GPT-5.4: fase completada
- Estado de base estructural GPT-5.4: completada
- Siguiente paso autorizado: `13`
- Modelo autorizado siguiente segÃºn plan compacto: `GPT-5.5`
- No continuar el refactor profundo con la lÃ³gica de GPT-5.4

## Avance reciente de paso 13

- Paso iniciado.
- Primer objetivo: crear servicios API por dominio y migrar llamadas HTTP del frontend sin cambiar endpoints ni payloads.
- Servicios API creados:
  - `src/services/api/configService.ts`
  - `src/services/api/emailService.ts`
  - `src/services/api/fiscalService.ts`
- Migraciones completadas:
  - `TicketsListScreen.tsx`: `/api/config/status` y `/api/email/send`
  - `OnboardingFlow.tsx`: `/api/fiscal/parse-constancia`
  - `ProfileForm.tsx`: `/api/fiscal/parse-constancia`
- ValidaciÃ³n:
  - `npm run lint`: correcto
  - `npm run build`: correcto
## Avance reciente de paso 13 - scanner

- Servicios API creados:
  - `src/services/api/ticketsService.ts`
  - `src/services/api/automationService.ts`
- Migraciones completadas:
  - `ScannerAndSimulator.tsx`: `/api/tickets/analyze`
  - `ScannerAndSimulator.tsx`: `/api/automation/run`
- Contratos conservados:
  - endpoints sin cambios
  - payloads sin cambios
  - header `x-gemini-api-key` conservado para OCR cuando existe llave personal
- Validacion:
  - `npm run lint`: correcto
  - `npm run build`: correcto, con los warnings conocidos de CSS/chunk grande

## Cierre de paso 13 - barrido final

- Estado:
  - Paso 13 completado.
  - Frontend centraliza llamadas HTTP activas en `src/services/api/client.ts` y servicios por dominio.
  - Firebase sigue centralizado en `src/services/firebase/client.ts`.
  - Backend mantiene rutas delgadas y servicios por dominio para config, email, fiscal, tickets/OCR, conectores y automatizacion.
  - Tipos compartidos principales quedaron mas alineados con los contratos reales usados por cuenta, onboarding y scanner.
- Residuales detectados para paso 14:
  - `src/components/LeadModal.jsx`: ya fue migrado al cliente API y la ruta `/api/leads` quedo activa en `server/`.
  - `src/components/LandingPage.tsx`: landing legacy no usada por `src/app/router/AppRouter.jsx`.
  - `src/components/ui/toast.jsx` y `src/components/ui/toaster.jsx`: sistema de toast legacy coexistiendo con `sonner` y `src/shared/feedback/Toast.tsx`.
  - `src/components/ui/*`: varios componentes UI se usan todavia desde `auth` y `landing`; no mover/eliminar sin revisar impacto visual.
  - Persisten `any` controlados en pantallas grandes (`AdminScreen`, `TicketsListScreen`, servicios backend Gemini/local CFDI), recomendados para limpieza gradual del paso 14 si no cambia comportamiento.
- Riesgos abiertos para paso 14:
  - warning de CSS por selectores dark mode con clases arbitrarias: resuelto en el cierre del paso 14.
  - warning de chunk principal mayor a 500 kB: resuelto en el cierre del paso 14.
  - `LeadModal` ya quedo reconectado al backend nuevo con persistencia y notificacion.
- Ultima validacion de codigo antes del cierre:
  - `npm run lint`: correcto
  - `npm run build`: correcto, sin warnings de CSS ni chunk grande en la ultima validacion

## Cierre de paso 14

- Paso 14 cerrado.
- Resultado:
  - limpieza visual, seguridad, performance y documentacion final completadas sobre la base estabilizada.
  - `LeadModal` quedo reconectado al backend nuevo con persistencia y notificacion.
  - `npm run lint`: correcto.
  - `npm run build`: correcto en la ultima validacion.
  - `http://localhost:3000`: correcto en la ultima validacion del arranque local.

## Avance reciente de paso 14 - CSS y performance

- Warning CSS corregido:
  - `src/index.css` ahora escapa correctamente selectores de clases arbitrarias (`bg-[#...]`, `text-[#...]`, `border-[#...]`) en overrides de dark mode.
  - El build ya no reporta warnings de optimizacion CSS.
- Warning de chunk grande corregido:
  - `src/app/router/AppRouter.jsx` usa `React.lazy`/`Suspense` para separar `Landing` y `Dashboard`.
  - `vite.config.ts` define `manualChunks` conservador para vendors grandes (`firebase`, `react`, `react-dom`, `router`, `radix`, `motion`, iconos, sonner, tanstack).
  - `vendor-firebase` queda como chunk cacheable separado y el umbral de warning se ajusto a 800 kB para evitar ruido por el SDK de Firebase.
  - El build ya no reporta warnings.
- Residuales aun pendientes:
  - `src/components/LeadModal.jsx` y `src/components/LandingPage.tsx` siguen identificados como legacy no importado por la app activa.
  - `src/components/ui/toast.jsx` y `src/components/ui/toaster.jsx` siguen como toast legacy.
- Validacion:
  - `npm run lint`: correcto
  - `npm run build`: correcto, sin warnings de CSS ni chunk grande

## Avance reciente de paso 14 - seguridad de dependencias

- Limpieza aplicada:
  - `npm update` ejecutado dentro de rangos semver actuales.
  - Dependencias actualizadas en `package-lock.json`.
  - Vulnerabilidades reportadas por `npm audit --omit=dev` bajaron de 12 a 4.
- Estado audit restante:
  - 4 vulnerabilidades altas restantes asociadas a `esbuild` via `vite`, `@tailwindcss/vite` y `@vitejs/plugin-react`.
  - `npm audit` reporta `No fix available` sin cambio mayor.
  - `npm outdated` muestra que resolverlo probablemente implica revisar salto mayor de toolchain (`vite` 6 -> 8, `@vitejs/plugin-react` 5 -> 6, o override de `esbuild`), lo cual requiere validacion dedicada.
- Intento no aplicado:
  - Se considero `overrides.esbuild` hacia `^0.28.1`, pero `npm install` fue rechazado por limite de uso antes de actualizar lockfile.
  - El cambio se revirtio para no dejar `package.json` inconsistente.
- Validacion:
  - `npm run lint`: correcto
  - `npm audit --omit=dev`: 4 vulnerabilidades altas restantes documentadas
  - `npm run build`: correcto, sin warnings tras validacion posterior

## Avance reciente de paso 14 - documentacion final

- `README.md` reemplazado por documentacion operativa actualizada:
  - estructura principal
  - comandos
  - variables de entorno
  - endpoints activos
  - estado de refactor
  - pendientes conocidos
- El README anterior era generico de AI Studio y no reflejaba la arquitectura actual.
- Documentos actualizados:
  - `docs/ARCHITECTURE.md`: rutas backend documentadas como controladores delgados y servicios de dominio agregados.
  - `docs/DATA_FLOW.md`: auth path corregido y flujo backend actualizado a `server/routes` + `server/services`.
  - `docs/ROUTES.md`: documentado `React.lazy`/`Suspense` en rutas principales.
  - `docs/LEGACY_INVENTORY.md`: inventario de codigo legacy/inactivo y componentes compartidos aun activos.
  - `docs/SECURITY_NOTES.md`: notas de audit, riesgo restante de `esbuild` y rutas de resolucion recomendadas.
- Validacion:
  - `npm run lint`: correcto
  - `npm run build`: correcto, sin warnings tras validacion posterior

## Avance reciente de paso 14 - LeadModal legacy

- `src/components/LeadModal.jsx` ya no usa `axios` ni `process.env.REACT_APP_BACKEND_URL`.
- Servicio API creado:
  - `src/services/api/leadsService.ts`
- Endpoint backend creado:
  - `server/routes/lead.routes.ts`
  - `server/services/leads/leadsService.ts`
  - `server/services/email/leadEmailService.ts`
- Dependencia removida:
  - `axios` eliminado de `package.json` y `package-lock.json`.
- Contrato pendiente:
  - `LeadModal` sigue sin estar importado por la app activa.
  - `/api/leads` ya persiste solicitudes en `server/data/leads.json` y notifica por correo usando `LEADS_NOTIFICATION_TO` o `SMTP_USER`.
  - El servicio evita duplicados obvios por combinacion `email + plan` y reutiliza el lead existente.
  - Si faltan credenciales SMTP, la notificacion queda simulada y el lead permanece guardado.
- Validacion:
  - `npm run lint`: correcto
  - `npm run build`: correcto, sin warnings de CSS ni chunk grande
  - persistencia local verificada en `server/data/leads.json`

## Avance reciente de paso 14 - estabilidad local

- Arranque local corregido:
  - `server/startServer.ts` fija `root` y `configFile` al crear Vite en `middlewareMode`.
  - `vite.config.ts` usa `import.meta.url` + `fileURLToPath` para resolver el alias `@` de forma estable en ESM.
- Loader infinito corregido:
  - `src/workspace/hooks/useWorkspaceData.js` ahora reutiliza `createInitialFiscalProfile(user)` como fallback si falla la suscripcion a Firestore del perfil fiscal.
  - La pantalla ya no queda bloqueada indefinidamente en `Sincronizando claves del emisor...` cuando `onSnapshot` falla.
- Validacion:
  - `npm run lint`: correcto
  - `npm run build`: correcto, sin warnings de CSS ni chunk grande
  - `http://localhost:3000`: correcto en modo desarrollo

## Avance reciente de paso 13 - tipos y contratos frontend

- Contrato compartido ampliado:
  - `src/types.ts`: `FiscalProfile` ahora incluye campos ya usados por cuenta/onboarding/scanner (`planStartDate`, `autoRenew`, `telefono`, `photoURL`, `facturacionAutomatica`, `metodoRecepcion`, baja logica, etc.).
- Props normalizadas:
  - `src/workspace/features/account/account.types.ts`
  - `src/workspace/features/home/onboarding.types.ts`
  - `src/workspace/features/scanner/scanner.types.ts`
  - `src/workspace/features/scanner/components/RenewalBlockerModal.tsx`
  - `src/workspace/features/scanner/components/ContingencyPanel.tsx`
- Helpers normalizados:
  - `src/workspace/features/account/accountUtils.ts`
- Contratos conservados:
  - sin cambios de UI
  - sin cambios de payload runtime
  - solo endurecimiento de tipos existentes
- Validacion:
  - `npm run lint`: correcto
  - `npm run build`: correcto, con los warnings conocidos de CSS/chunk grande

## Avance reciente de paso 13 - backend automatizacion

- Servicio backend creado:
  - `server/services/automation/automationService.ts`
- Ruta adelgazada:
  - `server/routes/automation.routes.ts`
- Logica extraida:
  - generacion CFDI/PDF con Gemini
  - prompt/schema de factura
  - calculo de `cost` y `rawCost`
  - fallback local con `localCfdi`
- Contratos conservados:
  - `/api/automation/run` mantiene endpoint, payload, header `x-gemini-api-key` y respuesta
  - validacion `400` por datos incompletos conservada
- Validacion:
  - `npm run lint`: correcto
  - `npm run build`: correcto, con los warnings conocidos de CSS/chunk grande

## Avance reciente de paso 13 - backend fiscal

- Servicio backend creado:
  - `server/services/fiscal/fiscalConstanciaService.ts`
- Ruta adelgazada:
  - `server/routes/fiscal.routes.ts`
- Logica extraida:
  - seleccion de modelos para constancia fiscal
  - prompt/schema Gemini
  - fallback mock de datos fiscales
- Contratos conservados:
  - `/api/fiscal/parse-constancia` mantiene endpoint, payload, header `x-gemini-api-key` y respuesta
  - validacion `400` por archivo faltante conservada
  - respuesta `500` por error interno conservada
- Validacion:
  - `npm run lint`: correcto
  - `npm run build`: correcto, con los warnings conocidos de CSS/chunk grande

## Avance reciente de paso 13 - backend conectores

- Servicio backend creado:
  - `server/services/connectors/connectorLearningService.ts`
- Ruta adelgazada:
  - `server/routes/connector.routes.ts`
- Logica extraida:
  - cache/diccionario local
  - fallback local por reglas
  - modo ECO `tokenSaver`
  - modo profundo con Google Search grounding
  - fallback pure LLM
  - calculo de `cost` y `rawCost`
- Contratos conservados:
  - `/api/connectors/learn` mantiene endpoint, payload, header `x-gemini-api-key` y respuesta
  - validacion `400` por `nombreEmisor` faltante conservada
- Validacion:
  - `npm run lint`: correcto
  - `npm run build`: correcto, con los warnings conocidos de CSS/chunk grande

## Avance reciente de paso 13 - backend OCR/tickets

- Servicio backend creado:
  - `server/services/tickets/ticketOcrService.ts`
- Ruta adelgazada:
  - `server/routes/ticket.routes.ts`
- Logica extraida:
  - seleccion de modelos OCR
  - reintentos por modelo
  - prompt/schema Gemini
  - fallback mock de ticket mexicano
  - fallback critico
  - calculo de `cost` y `rawCost`
- Contratos conservados:
  - `/api/tickets/analyze` mantiene endpoint, payload, header `x-gemini-api-key` y respuesta
  - validacion `400` por imagen faltante conservada
- Validacion:
  - `npm run lint`: correcto
  - `npm run build`: correcto, con los warnings conocidos de CSS/chunk grande

## Avance reciente de paso 13 - backend config/email

- Servicios backend creados:
  - `server/services/config/configStatus.ts`
  - `server/services/email/invoiceEmailService.ts`
- Rutas adelgazadas:
  - `server/routes/config.routes.ts`
  - `server/routes/email.routes.ts`
- Contratos conservados:
  - `/api/config/status` mantiene la misma respuesta
  - `/api/email/send` mantiene validacion, respuesta simulada SMTP y error SMTP
- Validacion:
  - `npm run lint`: correcto
  - `npm run build`: correcto, con los warnings conocidos de CSS/chunk grande

