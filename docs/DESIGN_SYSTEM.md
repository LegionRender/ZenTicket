# Design System Notes

## Current State

- Global styles are concentrated in `src/index.css`.
- The public landing and authenticated workspace share the same global theme context.
- Dark mode is applied at the document level in `src/App.jsx`.

## Target State

- Shared tokens live in `src/styles/shared`.
- Landing-specific rules live in `src/styles/landing`.
- Workspace-specific rules live in `src/styles/workspace`.
- Admin-specific rules live in `src/styles/admin`.

## Root Scope Convention

Use root wrappers to prevent visual leakage:

```jsx
<div className="zt-landing">...</div>
<div className="zt-workspace">...</div>
<div className="zt-workspace zt-admin">...</div>
```

Styles should be scoped through those roots before extracting or deleting global rules.

