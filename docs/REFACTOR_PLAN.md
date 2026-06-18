# Refactor Plan

## Completed

- Created the target folder structure for app, landing, auth, workspace, admin, shared, services, styles, server, firebase, and docs.
- Moved the public landing page from `src/pages/Landing.jsx` to `src/landing/pages/Landing.jsx`.
- Moved public landing sections from `src/components/sections` to `src/landing/sections`.
- Updated landing imports in `src/App.jsx` and `src/landing/pages/Landing.jsx`.
- Moved authentication UI/context into `src/auth`.
- Moved Firebase client setup into `src/services/firebase/client.ts`.
- Moved shared brand components into `src/shared/brand`.
- Moved toast provider into `src/shared/feedback`.
- Moved workspace feature screens into `src/workspace/features`.
- Moved the admin screen into `src/admin/pages`.
- Moved the authenticated dashboard page into `src/workspace/pages`.
- Extracted route composition into `src/app/router/AppRouter.jsx`.
- Extracted workspace shell, desktop sidebar, mobile header, bottom navigation, and profile banner into `src/workspace/layout/WorkspaceLayout.jsx`.
- Started backend split with `server/app.ts`, `server/startServer.ts`, `server/config/env.ts`, `server/services/gemini/client.ts`, and `server/routes/config.routes.ts`.
- Extracted `email`, `fiscal`, `ticket`, `connector`, and `automation` backend routes into `server/routes`.
- Moved connector fallback specs into `server/services/connectors/localConnectorSpecs.ts`.
- Moved local CFDI fallback generation into `server/services/invoicing/localCfdi.ts`.
- Moved Firebase rules/configuration into `firebase/` and added `firebase.json` pointing to the rules file.
- Added root scopes for public landing, workspace, and admin surfaces.
- Added placeholder style files under `src/styles` for the scoped style extraction phase.
- Centralized repeated workspace panel styling in `src/workspace/layout/WorkspacePanel.jsx`.
- Extracted workspace tab rendering into `src/workspace/router/WorkspaceRoutes.jsx`.
- Extracted workspace Firestore read subscriptions into `src/workspace/hooks/useWorkspaceData.js`.
- Extracted workspace write actions and operational loading state into `src/workspace/hooks/useWorkspaceActions.js`.
- Started splitting `ScannerAndSimulator.tsx` by moving its props contract, image compression utility, validation helper, connector matching helper, and notification time helper into focused scanner modules.
- Extracted the scanner renewal blocker dialog into `src/workspace/features/scanner/components/RenewalBlockerModal.tsx`.
- Extracted the scanner operational notifications hub and detailed notification modal into `src/workspace/features/scanner/components/OperationalNotificationsCenter.tsx`.
- Extracted the scanner AI contingency panel and detailed contingency modal into `src/workspace/features/scanner/components/ContingencyPanel.tsx`.
- Moved Firebase write logic out of `useWorkspaceActions.js` into focused frontend services for profiles, tickets, invoices, and connectors.
- Started splitting `ProfileForm.tsx` by moving its props contract and account utility helpers into focused account modules.

## Next Phases

1. Validate current behavior with `npm install` or `npm ci`, then `npm run lint` and `npm run build`.
2. Split the remaining large feature files, starting with `ProfileForm.tsx` and `AdminScreen.tsx`.
3. Move scanner and other feature HTTP calls into `src/services/api`.
4. Remove dead code and unused dependencies last.

## Validation Checklist

- Landing loads.
- Auth modal opens in sign-in and sign-up modes.
- Authenticated dashboard redirects correctly.
- Workspace sections still render.
- Admin section still renders for authorized users.
- `npm run lint` succeeds.
- `npm run build` succeeds.
