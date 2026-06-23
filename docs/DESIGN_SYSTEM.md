# ZenTicket Design System File

This repository details our aesthetic variables, layout patterns, and visual pairings used across public marketing and administrative layers.

## 🎨 Color Tokens & Palette

Our identity balances modern administrative tranquility (Zen elements) with secure fintech reliability (Dark electric slate blue presets).

*   **Electric Primary**: `#2563ff` (used in main CTAs and active focus elements)
*   **Aura Glow Highlight**: `#4f7cff` to `#6ea0ff` (used in gradient overlays and badges)
*   **Canvas Base Background**: `#ffffff` (Public default y base opcional del modo claro del workspace, el cual está preparado para modo claro/oscuro sin afectar la landing)
*   **Atmospheric Deep Space Base**: `#05070e` (Workspace dark mode default, preparado de diseño para alternancia de modo claro/oscuro independiente de la landing)
*   **Border Accents**: `rgba(255, 255, 255, 0.08)` (high-contrast dark limits)

## ✍️ Typographic Hierarchy

*   **Display / Marketing Headings**: `font-display` ("Manrope", "Inter", sans-serif) with spacious tracking constraints (`tracking-tight`).
*   **Operational Text**: `font-body` ("Inter", sans-serif) for high reading comfort.
*   **Technical / Data Panels**: `font-mono` ("JetBrains Mono", standard monospace specs) for values, numbers, processing schedules, and raw logs.

## ✨ Animation Standard Variables

*   **`zt-float`**: Smooth vertical animation for Mascot displays (`ztFloat 6s ease-in-out infinite`).
*   **`zt-marquee`**: Seamless double-scroll marquees for brand banners (`ztMarquee 40s linear infinite`).
*   **`zt-btn-primary`**: Micro-hover lift transitions (`transform 200ms ease, box-shadow 200ms ease, filter 200ms ease`).
*   **`zt-hover-glow`**: Active visual ring shadow glow for lists and cards on cursor hover.
