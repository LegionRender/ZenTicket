# Guía de Estilo Visual — ZenTicket

Esta guía documenta el sistema de diseño oficial de ZenTicket, detallando los principios visuales, tokens de diseño adaptativos, clases de componentes reutilizables y reglas de estados. Todos los desarrollos de interfaz en ZenTicket deben apegarse estrictamente a estas especificaciones.

---

## 1. Principios Visuales

- **Continuidad de Tema**: Toda vista debe lucir perfectamente integrada tanto en modo claro como en modo oscuro.
- **Jerarquía Tipográfica Clara**: Uso exclusivo de tipografías y escalas de tamaño autorizadas. Los títulos principales se acentúan con peso extra y color semántico.
- **Micro-interacciones**: Transiciones suaves (`transition-all duration-200`) y hover interactivos en todos los botones y cartas.
- **Sin placeholders ni Emojis principales**: Reemplazar emojis en tarjetas y métricas por iconos unificados de `lucide-react`.

---

## 2. Tokens de Diseño Adaptativos (`zen-design-tokens.css`)

Todos los colores y estilos deben hacer referencia a las variables globales:

### Colores de Fondos
- `--zt-bg-app`: Fondo principal de la aplicación (`#f8fafc` / `#090e1a`).
- `--zt-bg-surface`: Fondo para paneles y tarjetas (`#ffffff` / `#0d1527`).
- `--zt-bg-surface-soft`: Fondo secundario para listados y filtros (`#f1f5f9` / `#131b2e`).

### Colores de Bordes y Textos
- `--zt-border-default`: Borde sutil neutro (`#e2e8f0` / `#1e293b`).
- `--zt-text-primary`: Texto principal legible (`#0f172a` / `#f8fafc`).
- `--zt-text-secondary`: Texto secundario de apoyo (`#475569` / `#cbd5e1`).
- `--zt-text-muted`: Leyendas y subtítulos (`#94a3b8` / `#64748b`).

### Colores de Acentos de Marca
- `--zt-accent-primary`: Azul vibrante de marca (`#0b53f4` / `#3b82f6`).
- `--zt-accent-secondary`: Azul contrastado (`#1d4ed8` / `#60a5fa`).

---

## 3. Clases de Componentes Globales (`zen-components.css`)

Evita definir combinaciones de clases Tailwind ad-hoc. Usa las siguientes clases semánticas:

### Páginas y Paneles
- `.zt-page`: Contenedor principal de pantalla con espaciado de seguridad.
- `.zt-panel`: Contenedor base elevado con bordes redondeados adaptativos.
- `.zt-card`: Elemento individual interactivo dentro de listados o rejillas.

### Tipografía Unificada
- `.zt-title-page`: Título principal de pantalla (`font-extrabold tracking-tight`).
- `.zt-page-subtitle`: Subtítulo del encabezado de página.
- `.zt-title-card`: Título interno para tarjetas o secciones de drawers.
- `.zt-body`: Texto estándar para párrafos.
- `.zt-caption`: Texto pequeño para metadatos o etiquetas secundarias.
- `.zt-mono`: Estilos para folios, UUIDs, IDs o código técnico.

### Formularios y Botones
- `.zt-input`: Inputs y dropdowns con estilos adaptativos de borde y foco.
- `.zt-btn`: Clase base para botones.
  - `.zt-btn-primary`: Botón principal de llamada a la acción.
  - `.zt-btn-secondary`: Botón de soporte o secundario.
  - `.zt-btn-outline`: Botón de contorno sutil.
  - `.zt-btn-ghost`: Botón plano para acciones de retroceso o cancelación.

---

## 4. Colores Canónicos de Estado

Los estados en ZenTicket están unificados y delegados dinámicamente:

| Estado | Token Fondo | Token Borde | Token Texto |
| :--- | :--- | :--- | :--- |
| **Listo / OK** | `--zt-ok-bg` | `--zt-ok-border` | `--zt-ok-text` |
| **Error / Fallos** | `--zt-error-bg` | `--zt-error-border` | `--zt-error-text` |
| **En proceso / Cola** | `--zt-queue-bg` | `--zt-queue-border` | `--zt-queue-text` |
| **Atención / Alertas** | `--zt-alert-bg` | `--zt-alert-border` | `--zt-alert-text` |
| **Archivado / Gris** | `--zt-archived-bg` | `--zt-archived-border` | `--zt-archived-text` |

### Clases CSS Asociadas
Para aplicar colores de estado dinámicamente, se deben usar:
- `.zt-status-*`: Para alert boxes o contenedores principales.
- `.zt-badge-*`: Para etiquetas cortas o píldoras de estado.
- `.zt-card-*`: Para tarjetas de métricas coloreadas.
- `.zt-dot-*`: Para pequeños puntos de estado de 8px.

---

## Reglas para nuevas secciones

Toda nueva sección debe cumplir:

1. Usar tokens globales.
2. No hardcodear colores de estado.
3. No definir nuevos estilos de botones si ya existe `.zt-btn`.
4. No definir nuevos estilos de cards si ya existe `.zt-card` o `.zt-panel`.
5. No definir badges locales si ya existe `.zt-badge`.
6. No usar emojis como iconos funcionales.
7. Usar `lucide-react` para iconos.
8. Usar `getBillingStatusVisual()` para estados de facturación.
9. Usar clases base:
   - `.zt-page`
   - `.zt-card`
   - `.zt-panel`
   - `.zt-btn`
   - `.zt-input`
   - `.zt-tabs`
   - `.zt-table`
   - `.zt-badge`
   - `.zt-alert`
10. Validar light y dark mode antes de cerrar.
11. Correr auditoría visual antes de cerrar.

### Checklist obligatorio para nuevas secciones:
- [ ] ¿Usa tokens de color?
- [ ] ¿Soporta light mode?
- [ ] ¿Soporta dark mode?
- [ ] ¿Usa los mismos radios?
- [ ] ¿Usa la misma tipografía?
- [ ] ¿Usa los mismos botones?
- [ ] ¿Usa los mismos badges?
- [ ] ¿Usa los mismos iconos?
- [ ] ¿No tiene colores hardcodeados?
- [ ] ¿No repite estilos ya existentes?
- [ ] ¿Pasó `audit_ui_styles`?
- [ ] ¿Pasó `audit_status_colors`?

---

## Tablas administrativas

Reglas:
- **Header**: 11px, uppercase, font-weight: 700, letter-spacing: 0.04em, color: `var(--zt-text-secondary)`.
- **Body/Celdas**: 13px, font-weight: 500, color: `var(--zt-text-secondary)`.
- **IDs/Tickets**: monospace 12px, font-weight: 600, color de link/acento (`text-[var(--zt-accent-secondary)]`).
- **Botones de fila**: Uso exclusivo de `.zt-btn-sm` (compactos, altura 32px).
- **Filas**: min-height 64px (o height 64px) con paddings de 12px vertical y 14px horizontal.
- **Fechas**: Mostrar en dos líneas (Fecha compacta en línea 1, hora en línea 2) con font-size 12px.
- **Portal/Comercio**: Máximo 2 líneas y truncamiento con ellipsis (`line-clamp-2`).
- **Acciones**: Las acciones detalladas y explicaciones de error van en drawer/modal secundario, no en la tabla.

---

## Panel maestro-detalle

Reglas:
- **Columna izquierda**: Navegación o listado compacto de selección.
- **Columna derecha**: Detalle técnico u historial del elemento seleccionado.
- **Header del panel**: Compacto y ordenado, con avatar de 36px, título del usuario/elemento en 16px (font-weight: 700), email/metadatos en 12px (color muted) y contadores de estados en 12px alineados.
- **Tabla principal**: Utilizar tablas legibles con anchos de columna fijos y comportamiento responsivo de tarjetas en mobile.
- **Espaciados**: Padding del panel de 24px (`p-6`), y separación del header a la tabla con divider y márgenes de 20px superior y 16px de padding.
- **No saturación**: Evitar amontonar información y truncar los identificadores muy largos.

---

## Bordes y contornos en dark mode

- No usar bordes blancos.
- No usar `border-white` ni grises claros.
- Los contornos deben ser sutiles.
- Usar `--zt-border-subtle` para cards y paneles.
- Usar `--zt-border-default` para inputs.
- Usar `--zt-border-strong` solo para hover/focus.
- La selección activa usa acento azul, no borde blanco.
- Los estados usan únicamente tokens OK/Error/Process/Attention/Archived.

---

## Cards de estado

Usar siempre:
- fondo token de estado
- borde token de estado
- texto/icono/número token de estado
- iconos lucide
- nunca emojis
- nunca colores locales

---

## 5. Referencia Visual Base

Las interfaces de ZenTicket siguen un estándar de sobriedad y legibilidad premium. Para cualquier extensión o nuevo desarrollo, las referencias visuales obligatorias son:

1. **OCR Production Control ("Gemini, fallback, cola y alertas")**:
   - Ubicación: [AdminScreen.tsx](file:///c:/Users/Ricardo/Documents/Work%202026/Web%20Zenticket/ZenTicket-main/src/workspace/admin/AdminScreen.tsx#L749) y [ScannerAndSimulator.tsx](file:///c:/Users/Ricardo/Documents/Work%202026/Web%20Zenticket/ZenTicket-main/src/workspace/features/scanner/ScannerAndSimulator.tsx).
   - Características: Contenedores `.zt-panel` de fondo `#0b0d19` con bordes sutiles y tarjetas de métricas compactas que usan colores de estados suaves.
2. **Sección Gastos**:
   - Ubicación: [VaultScreen.tsx](file:///c:/Users/Ricardo/Documents/Work%202026/Web%20Zenticket/ZenTicket-main/src/workspace/features/expenses/VaultScreen.tsx).
   - Características: Rejillas de tarjetas interactivas, cabeceras integradas con barras de filtros limpias y drawers laterales de detalles sin contornos blancos fuertes.

---

## 6. Checklist para nuevas secciones

Antes de dar por completado el desarrollo de una sección o pantalla en ZenTicket, valide la siguiente lista:

- [ ] **Modo Claro & Oscuro**: La sección fue probada visualmente en ambos temas y no presenta textos invisibles ni contrastes insuficientes.
- [ ] **Bordes y Contornos**: No se utilizan bordes blancos puros (`border-white`) ni outlines duros. Todos los contornos son sutiles y heredan de `--zt-border-default`.
- [ ] **Fondos y Paneles**: Se utilizan contenedores `.zt-panel` o `.zt-card` con fondos coherentes (`var(--zt-bg-surface)` / `var(--zt-bg-surface-soft)`).
- [ ] **Colores de Estado**: Todos los badges y etiquetas dinámicas usan el sistema centralizado de tokens de estado (`zt-badge-ok`, `zt-badge-error`, etc.) a través de `getBillingStatusVisual()`.
- [ ] **Buscador e Inputs**: Las barras de filtros tienen altura uniforme y usan `.zt-input` con foco adaptativo.
- [ ] **Botones**: Las acciones usan clases `.zt-btn` oficiales (primary, secondary, outline, ghost). En tablas, se usan exclusivamente botones `.zt-btn-sm`.
- [ ] **Iconos & Emojis**: No se usan emojis como elementos funcionales. En su lugar se usan iconos SVG legibles y consistentes importados de `lucide-react`.
- [ ] **Auditorías de Código**:
  - `node scripts/ui/audit_ui_styles.cjs` pasa con 0 violaciones.
  - `node scripts/diagnostics/audit_status_colors.cjs` pasa con 0 violaciones.

