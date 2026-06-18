# Security Notes

## Dependency Audit

Ultima revision ejecutada:

```bash
npm audit --omit=dev
```

Estado actual:

- Vulnerabilidades iniciales despues de remover `axios`: 12.
- Despues de `npm update` dentro de rangos semver actuales: 4.
- Vulnerabilidades restantes: altas, asociadas a `esbuild` via `vite`, `@tailwindcss/vite` y `@vitejs/plugin-react`.
- `npm audit` reporta que no hay fix automatico sin revisar cambios mayores.

## Decision Pendiente

Para resolver el audit restante hay que validar una de estas rutas:

- Upgrade mayor de toolchain (`vite`, `@vitejs/plugin-react`, posiblemente `tailwindcss`).
- Override controlado de `esbuild` con validacion completa de `npm install`, `npm run lint`, `npm run build` y prueba manual.

No se dejo override activo porque `npm install` fue rechazado por limite de uso antes de actualizar `package-lock.json`.

## Alcance De Riesgo

El hallazgo restante esta en tooling de build/dev. No se detecto uso directo de `esbuild` en codigo de aplicacion runtime, pero el proyecto lo usa en:

- `npm run build` para empaquetar `server.ts`.
- Vite y plugins relacionados.

No ejecutar `npm audit fix --force` sin revisar impacto, porque puede saltar a majors y romper toolchain.
