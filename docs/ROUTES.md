# Routes

## Current Frontend Routes

- `/`: shows `Dashboard` when a user is authenticated, otherwise shows `Landing`.
- `/dashboard`: shows `Dashboard` when a user is authenticated, otherwise redirects to `/`.
- `*`: redirects to `/`.

Route composition currently lives in `src/app/router/AppRouter.jsx`.
`Landing` and `Dashboard` are loaded with `React.lazy`/`Suspense` to keep the initial bundle small.

## Route Ownership

- Public routes should live under `src/landing`.
- Authenticated workspace routes should live under `src/workspace`.
- Admin routes should live under `src/admin`.
- Authentication modals and session state should live under `src/auth`.

## Next Routing Step

The next routing step is to introduce dedicated layouts for public, workspace, and admin routes when those views are split further.
