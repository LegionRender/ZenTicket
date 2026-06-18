# Data Flow

## Current Flow

- `src/auth/context/AuthContext.jsx` owns Firebase authentication state.
- `src/services/firebase/client.ts` exposes Firebase client services.
- Workspace reads are centralized in `src/workspace/hooks/useWorkspaceData.js`.
- Workspace writes and operational actions are centralized in `src/workspace/hooks/useWorkspaceActions.js`.
- `server.ts` composes the backend app, route modules expose endpoints, and `server/services/*` owns server-side integration logic.

## Target Flow

- UI components should call feature hooks or service functions instead of embedding Firebase/API details.
- Workspace read subscriptions are centralized in `src/workspace/hooks/useWorkspaceData.js`.
- Workspace write actions are centralized in `src/workspace/hooks/useWorkspaceActions.js`.
- Firebase write services now live under `src/services/firebase`, split by domain (`profilesService`, `ticketsService`, `invoicesService`, `connectorsService`).
- Firebase client setup lives in `src/services/firebase`.
- Firebase app configuration lives in `firebase/configuration/applet-config.json`.
- Firestore rules live in `firebase/firestore.rules`.
- HTTP API wrappers live in `src/services/api`.
- Backend endpoints are split into `server/routes`, with implementation details in `server/services`.

## Security Workstream

Security changes should be handled separately from structure moves:

- Add backend middleware for protected API routes.
- Restrict Firestore reads and writes by document owner.
- Add explicit rules for collections used by automation and training flows.
