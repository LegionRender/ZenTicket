# ZenTicket Architecture Guide

Welcome to the **ZenTicket** architecture dashboard! This document details how our codebase is partitioned to maintain high readability, decoupling, and isolated scopes.

## 🏗️ Core Architectural Zones

ZenTicket is split into four distinct, isolated zones:

1. **Public Landing (`/src/landing`)**: Focuses on commercial presentation, marketing, lead forms (`LeadModal.jsx`), page designs, and CTA animations. It is completely isolated from the main workspace.
2. **Authentication Interface (`/src/auth`)**: Controls logging in, registering, context sharing (`AuthContext.jsx`), custom session verification hooks, and authentication APIs.
3. **Internal Workspace (`/src/workspace`)**: The core of our SaaS application. Features standard tools for receipt scanning, connecting fiscal entities, processing expense metrics, and dashboard reports.
4. **Administration Interface (`/src/admin`)**: Exclusively reserved for administrative oversight, platform parameterization, active user checks, and AI pattern fine-tuning.

---

## 📂 Source Code Tree (`/src`)

```
src/
├── app/                           # Core bootstrapping & state layout
│   ├── App.jsx                    # Primary app router entrypoint
│   ├── router/                    # Route setups & transition maps
│   └── providers/                 # Providers (Auth, Theme, Queries)
│
├── landing/                       # Public Marketing & Conversion
│   ├── pages/                     # Single/multi-page marketing view controllers
│   ├── sections/                  # Header, Hero, Features, Pricing sections
│   └── components/                # Independent assets (including LeadModal.jsx)
│
├── auth/                          # Identity & Sessions
│   ├── components/                # Auth dialogs & login views
│   ├── context/                   # AuthContext state provider (centralizado)
│   ├── hooks/                     # Custom auth system hooks (useAuth)
│   └── services/                  # Firebase validation proxies / auth services
│
├── workspace/                     # Core SaaS Product Client (Aislada de landing)
│   ├── pages/                     # Dashboard view controllers
│   ├── layout/                    # Workspace shell (sidebar, topbar)
│   ├── router/                    # Internal app-only transitions
│   ├── components/                # Componentes reutilizables solo dentro del workspace
│   ├── hooks/                     # Custom hook modules
│   ├── data/                      # Global mock data o constantes estáticas (nunca llamadas reales)
│   └── features/                  # Product modules (Contextos y componentes específicos)
│       ├── home/                  # Vista inicial, resumen general y métricas principales
│       ├── scanner/               # Escaneo, OCR y procesamiento de tickets/facturas
│       ├── tickets/               # Saved ticket list
│       ├── expenses/              # Monthly analytics
│       ├── connectors/            # External billing portal links
│       └── account/               # Perfil, datos fiscales, plan, pagos y preferencias
│
├── admin/                         # Control Panel Client (Preparado para crecer)
│   ├── pages/                     # Main Admin screen controllers
│   ├── layout/                    # Admin viewport wraps
│   ├── components/                # Audit logs and custom widgets
│   └── features/                  # Modular admin capabilities (users, billing, ai-monitoring, connector-training)
│
├── shared/                        # App-wide Reusable Building Blocks (Transversales)
│   ├── ui/                        # Low-level UI primitives (design primitive buttons/inputs)
│   ├── brand/                     # SVG markers, ZenLogo, ZenMascot, ZenAura animations
│   ├── feedback/                  # Dialog triggers and standard toast notifications
│   ├── hooks/                     # Shared event & layout hooks (useToast)
│   ├── types/                     # Tipos realmente transversales
│   ├── assets/                    # Shared image registers
│   └── utils/                     # Utilidades puras: fechas, moneda, texto, validadores y helpers
│
├── services/                      # System clients (Inyección controlada de datos)
│   ├── api/                       # REST client definitions matching backend Express routes
│   └── firebase/                  # Servicios de acceso controlado a Firestore y Auth (Sin acceso directo a Firestore en componentes)
│
├── styles/                        # Sistema modular de estilos CSS y Tailwind
│   ├── shared/                    # Tokens comunes, tipografías y reset base
│   │   ├── reset.css              # Reset base de HTML, body y elementos nativos
│   │   ├── typography.css         # Jerarquías y emparejamientos tipográficos
│   │   ├── tokens.css             # Variables visuales y esquemas CSS
│   │   └── accessibility.css      # Reglas de accesibilidad, foco visible, reducción de movimiento y contraste
│   ├── landing/                   # Commercial visual effects & sections
│   ├── workspace/                 # Sistema visual de la app interna (preparado de diseño para modo claro/oscuro sin afectar landing): layout, navegación, cards y temas
│   │   ├── workspace.css          # Fondo degradado y grids del workspace
│   │   ├── dark-theme.css         # Tokens y variantes controladas del modo oscuro (preparado para ambos modos)
│   │   └── components.css         # Componentes visuales del workspace sin reglas de pantalla
│   └── admin/                     # Admin grid styles
│
└── index.css                      # Orquestador global (Sólo importa archivos CSS, limpio de reglas activas)
```

---

## ⚙️ Backend Architecture (Express modular desacoplado) (`/server`)

The server leverages a separate, logically structured backend layout:

```
server/
├── index.ts                       # Entry point - Objetivo futuro al de modularizar server.ts (bootstrapping & Vite middleware overlay)
├── config/                        # Parámetros globales y lectura segura de variables de entorno (sin almacenar secretos físicos)
├── middleware/                    # CORS validation, security tokens, and rule interceptors
├── routes/                        # Modular route controllers & API mapping
├── services/                      # Servicios backend separados por dominio real o simulado (e.g. ai, email, invoicing-simulator, automation)
├── controllers/                   # Request processing layers (separated from routes)
├── repositories/                  # DB query interfaces (Firestore/SQL drivers)
├── mocks/                         # Simulated portals & test responders
└── fixtures/                      # Mock receipt files & sample outputs
```
