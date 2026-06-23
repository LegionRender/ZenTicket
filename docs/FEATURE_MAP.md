# ZenTicket Feature Map (Indice de Componentes y Funcionalidades)

Este documento sirve como un índice rápido para ubicar los archivos y funcionalidades del sistema según el dominio correspondiente.

---

## 🔍 Índice de operaciones rápidas: ¿Qué archivo modificar?

| Objetivo del Cambio | Carpeta / Archivo Objetivo | Responsabilidad y Notas |
| :--- | :--- | :--- |
| **Página Pública / Landing** | `src/landing/` | Contiene la página principal, secciones de marketing y banners de conversión corporativa. |
| **Login / Registro (Flujo Inicial)** | `src/auth/` | Ventana unificada de acceso (`AuthModal.jsx`) y el asistente paso a paso (`OnboardingFlow.tsx`). |
| **Estado y Eventos de Sesión** | `src/auth/context/AuthContext.jsx` | Control centralizado del estado de sesión y sincronización del usuario en Firebase Auth. |
| **Pantalla de Inicio Interno** | `src/workspace/features/home/` | Lugar asignado para el resumen general del contribuyente y sus métricas principales (HomeScreen). |
| **Motor de Scanner y OCR** | `src/workspace/features/scanner/` | Control del simulador y digitalizador de tickets físico (`ScannerAndSimulator.tsx`). |
| **Historial de Tickets** | `src/workspace/features/tickets/` | Listado, filtros por estado, y descargas directas de tickets subidos (`TicketsListScreen.tsx`). |
| **Bóveda de Gastos / Analíticas** | `src/workspace/features/expenses/` | Visualización en tiempo real de facturas CFDI (PDF/XML) timbradas (`VaultScreen.tsx`). |
| **Conectores SAT Externos** | `src/workspace/features/connectors/` | Listado de portales emisores estándar e integraciones entrenadas (`ConnectorsList.tsx`). |
| **Información Fical, Planes, Pagos** | `src/workspace/features/account/` | Administración del perfil del contribuyente, tarjetas bancarias y planes de suscripción (`ProfileForm.tsx`). |
| **Panel de Administración (Backoffice)** | `src/admin/` | Panel consolidado de auditoría de costos de IA, re-semillado de conectores y soporte técnico (`AdminScreen.tsx`). |
| **Llamadas a Firebase Frontend** | `src/services/firebase/` | Centraliza inicializadores y configuraciones de Firestore y Auth (`firebase.ts`). |
| **Llamadas a API/Endpoints Express** | `src/services/api/` | Carpeta contenedora de servicios para invocar endpoints en el backend. |
| **Servidor de Backend Express** | `server.ts` (Raíz) y `/server` | El runtime del servidor Express. |
| **Estilos CSS Modulares** | `src/styles/` | Reset (`styles/shared/reset.css`), tokens, tipografías y estilos por dominio. |
| **Reglas de Seguridad Firestore** | `firebase/firestore.rules` | Reglas de acceso declarativas para colecciones. |

---

## 📌 Guía visual del árbol de componentes de UI (`/src/workspace/features/`)

1. **Scanner y Procesamiento OCR (`src/workspace/features/scanner/`)**
   - `ScannerAndSimulator.tsx`: Controlador maestro que maneja cámaras simuladas, carga de imágenes de tickets, llamadas a API de análisis e interacción con el motor del SAT.

2. **Tickets list (`src/workspace/features/tickets/`)**
   - `TicketsListScreen.tsx`: Tabla filtrable que lista tickets activos, estados de timbrado SAT ("pendiente", "procesado", "fallido") y permite el reintento de automatización.

3. **Gastos y CFDI (`src/workspace/features/expenses/`)**
   - `VaultScreen.tsx`: Organiza facturas oficiales CFDI recuperadas por emisor, acumulable mensual, descarga de representaciones impresas en PDF y descarga de XML estructurado para contabilidad.

4. **Conectores (`src/workspace/features/connectors/`)**
   - `ConnectorsList.tsx`: Muestra la lista de emisores integrados y permite la activación/creación de simulaciones de conexión.

5. **Cuenta (`src/workspace/features/account/`)**
   - `ProfileForm.tsx`: Vista para actualizar el RFC, Razón Social, Constancia Fiscal, métodos de pago predeterminados (Stripe Visa/Mastercard 3DS) y selección de esquemas de suscripción.
