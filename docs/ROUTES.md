# ZenTicket Navigation & Routes Map

Este documento explica de manera precisa el funcionamiento del enrutamiento de ZenTicket, detallando las rutas públicas, privadas y el flujo de navegación interno por pestañas de estado (State-based Tabs).

---

## 🧭 1. Enrutamiento Principal (React Router)

El ruteador principal de la aplicación reside en `src/app/router/AppRouter.jsx` y controla qué pantallas principales de alto nivel se montan según el estado de la sesión activa del usuario:

* **Sessión Inactiva (Invitado)**:
  - `/` (Raíz): Despliega la landing page comercial pública (`Landing.jsx`), incluyendo el flujo de captación de leads mediante el `LeadModal.jsx` y accesos rápidos de inicio de sesión (`AuthModal.jsx`).
  - Cualquier otra subruta no reconocida redirige automáticamente de vuelta al inicio público `/`.

* **Sesión Activa (Autenticado)**:
  - `/` o `/dashboard`: Renderiza el layout centralizado del contribuyente en `src/workspace/pages/Dashboard.jsx`.
  - Si el usuario no ha completado el formulario inicial de configuración, el sistema redirige forzadamente al formulario paso a paso de iniciación fiscal en `src/auth/components/OnboardingFlow.tsx` antes de habilitar el panel del workspace.

---

## ⚙️ 2. Navegación Interna del Workspace (State-Based Tabs)

**Nota Tecnológica**: El workspace de ZenTicket **NO utiliza subrutas físicas de React Router (React-Router-DOM)** para cambiar de vistas internas. Esto previene re-renderizados innecesarios y optimiza la velocidad. 

En su lugar, el componente `Dashboard.jsx` administra la navegación de forma reactiva a través del hook de estado `activeTab` (`const [activeTab, setActiveTab] = useState("capturar")`):

### Mapa de pestañas internas y componentes renderizados:

| Clave de Tab (`activeTab`) | Etiqueta de Interfaz | Componente Renderizado | Propósito del Módulo |
| :--- | :--- | :--- | :--- |
| **`capturar`** | *"Inicio" / "Scanner"* | `<ScannerAndSimulator />` | Carga de tickets, visor de OCR, simulación de cámaras físicas y timbrado satelital. |
| **`tickets`** | *"Mis Tickets"* | `<TicketsListScreen />` | Listado histórico de tickets subidos, buscador, filtrado por fecha o estados ("procesado", "pendiente"). |
| **`conectores`** | *"Conectores"* | `<ConnectorsList />` | Selección de portales CFDI integrados y entrenamiento de bots SAT en vivo. |
| **`historial`** | *"Gastos"* | `<VaultScreen />` | Bóveda digital segura de facturas XML timbradas y vistas de comprobante PDF oficial. |
| **`cuenta`** | *"Mi Cuenta"* | `<ProfileForm />` | Formulario tributario (Régimen Fiscal, RFC, Código Postal), tarjetas de pago y planes contratados. |
| **`admin`** | *"Admin"* (Sólo Admin) | `<AdminScreen />` | Consola maestra de soporte técnico, reseteo de base de datos, y simulación de flujos robóticos. |

### Controladores y Restricciones de Navegación:
1. **Acceso Restringido a Cuenta Nueva**: Si el perfil fiscal del contribuyente está vacío o incompleto, el sistema restringe todas las pestañas de navegación externa y redirige forzadamente al usuario a la pestaña `'cuenta'` (`ProfileForm.tsx`) hasta que registre sus datos de manera exitosa.
2. **Control Administrativo**: La pestaña `'admin'` sólo es montada y visible si el correo de sesión activa coincide exactamente con el gestor del sistema: `legionrender@gmail.com`.
