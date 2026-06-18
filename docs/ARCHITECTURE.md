# ZenTicket Architecture

## Current Entry Points

- `src/index.jsx` mounts the React app and wraps it with authentication context.
- `src/App.jsx` owns global app providers and theme settings.
- `src/app/router/AppRouter.jsx` owns the public/authenticated route decision.
- `src/landing/pages/Landing.jsx` renders the public marketing page.
- `src/workspace/pages/Dashboard.jsx` renders the authenticated workspace and section navigation.
- `src/workspace/hooks/useWorkspaceData.js` owns Firestore subscriptions for workspace data.
- `src/workspace/hooks/useWorkspaceActions.js` owns workspace write actions, profile persistence, ticket/CFDI operations, connector learning, and related loading state.
- `src/workspace/router/WorkspaceRoutes.jsx` owns workspace tab-to-feature rendering.
- `src/services/firebase/profilesService.js` owns fiscal profile persistence, onboarding profile writes, and historical account recovery.
- `src/services/firebase/ticketsService.js` owns ticket create, update, and delete writes.
- `src/services/firebase/invoicesService.js` owns invoice persistence.
- `src/services/firebase/connectorsService.js` owns connector creation and default connector seeding.
- `src/workspace/features/scanner/scannerImage.ts` owns client-side image compression for ticket OCR uploads.
- `src/workspace/features/scanner/scannerHelpers.ts` owns scanner validation, connector matching, and notification time helpers.
- `src/workspace/features/scanner/scanner.types.ts` owns the scanner component contract.
- `src/workspace/features/scanner/components/RenewalBlockerModal.tsx` owns the scanner plan renewal blocker dialog.
- `src/workspace/features/scanner/components/OperationalNotificationsCenter.tsx` owns the scanner notification hub and its detailed modal.
- `src/workspace/features/scanner/components/ContingencyPanel.tsx` owns the scanner AI contingency panel and detailed contingency modal.
- `src/workspace/features/account/account.types.ts` owns account feature component contracts.
- `src/workspace/features/account/accountUtils.ts` owns account utility logic for device detection, card bank display metadata, and card validation.
- `server.ts` composes the backend app by registering route modules and starting the server.
- `server/app.ts` creates the Express app and global middleware.
- `server/startServer.ts` owns Vite middleware, production static serving, and listen startup.
- `server/config/env.ts` loads environment variables and exposes runtime config.
- `server/services/gemini/client.ts` owns Gemini client creation.
- `server/routes/config.routes.ts` exposes config/status endpoints and delegates to config services.
- `server/routes/email.routes.ts` exposes invoice email endpoints and delegates to email services.
- `server/routes/fiscal.routes.ts` exposes SAT constancia parsing and delegates to fiscal services.
- `server/routes/ticket.routes.ts` exposes OCR ticket analysis and delegates to ticket services.
- `server/routes/connector.routes.ts` exposes connector learning and delegates to connector services.
- `server/routes/automation.routes.ts` exposes CFDI automation simulation and delegates to automation services.
- `server/services/config/configStatus.ts` owns config status resolution.
- `server/services/email/invoiceEmailService.ts` owns invoice email dispatch and SMTP fallback behavior.
- `server/services/fiscal/fiscalConstanciaService.ts` owns SAT constancia parsing.
- `server/services/tickets/ticketOcrService.ts` owns OCR ticket analysis.
- `server/services/connectors/connectorLearningService.ts` owns connector learning orchestration.
- `server/services/automation/automationService.ts` owns CFDI automation simulation.
- `server/services/connectors/localConnectorSpecs.ts` owns local connector dictionary and fallback specs.
- `server/services/invoicing/localCfdi.ts` owns local CFDI XML/PDF fallback generation.
- `firebase/firestore.rules` owns Firestore security rules.
- `firebase/configuration/applet-config.json` owns the frontend Firebase app configuration.
- `firebase/schemas/blueprint.json` owns the app data blueprint.
- `firebase.json` points Firebase CLI to `firebase/firestore.rules`.

## Target Structure

The codebase is being reorganized by product area, not by file type alone:

- `src/app`: app shell, routing, providers, and layouts.
- `src/landing`: public website pages, sections, assets, and local styles.
- `src/auth`: authentication UI, context, hooks, and services.
- `src/workspace`: authenticated user workspace layout, navigation, and feature modules.
- `src/admin`: administrative pages, layouts, feature modules, and styles.
- `src/shared`: reusable UI, brand, feedback, hooks, utilities, and types.
- `src/services`: frontend service clients for Firebase and HTTP APIs.
- `src/styles`: shared, landing, workspace, and admin styles.
- `server`: backend split by config, route modules, startup, and domain services.
- `firebase`: Firebase rules, schemas, configuration, and documentation.

## Migration Rule

Each phase should preserve behavior first. Move files, update imports, run validation, and only then split internals or remove unused code.
