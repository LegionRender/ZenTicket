# Legacy Inventory

Este inventario separa codigo legacy inactivo de componentes compartidos que todavia tienen uso real. No implica borrado automatico.

## Inactivo O No Conectado

### `src/components/LeadModal.jsx`

- Estado: no importado por la app activa.
- Riesgo previo corregido: ya no usa `axios` ni `process.env.REACT_APP_BACKEND_URL`.
- Estado actual: usa `src/services/api/leadsService.ts`.
- Pendiente: `/api/leads` no existe en backend. Si este modal se reactiva, hay que crear el endpoint o retirar el flujo.

### `src/components/LandingPage.tsx`

- Estado: no importado por `src/app/router/AppRouter.jsx`.
- Landing activa: `src/landing/pages/Landing.jsx`.
- Pendiente: decidir si se elimina, se archiva o se conserva como referencia visual.

### `src/components/ui/toast.jsx`

- Estado: legacy.
- Uso detectado: importado por `src/components/ui/toaster.jsx`.
- Sistema activo alterno: `sonner` y `src/shared/feedback/Toast.tsx`.
- Pendiente: no eliminar hasta confirmar que `toaster.jsx` tampoco se usa.

### `src/components/ui/toaster.jsx`

- Estado: legacy.
- Uso detectado: no aparece importado por la app activa en el ultimo barrido.
- Pendiente: candidato a remocion controlada cuando se autorice limpieza de codigo muerto.

## Compartido Todavia Activo

### `src/components/ui/dialog`

- Uso activo:
  - `src/auth/components/AuthModal.jsx`
  - `src/components/LeadModal.jsx` si se reactivara.

### `src/components/ui/accordion`

- Uso activo:
  - `src/landing/sections/FAQSection.jsx`

### Otros `src/components/ui/*`

- Estado: libreria UI local parcialmente usada.
- Regla: no mover ni borrar por lote. Revisar import por import antes de cualquier limpieza.

## Pendientes De Decision

- Crear o no `POST /api/leads`.
- Retirar o archivar `src/components/LandingPage.tsx`.
- Retirar `toast.jsx`/`toaster.jsx` si se confirma que no hay imports activos.
- Mantener `src/components/ui` como libreria compartida hasta que auth/landing migren a `src/shared`.
