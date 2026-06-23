# API Services Client

Este directorio está configurado para centralizar gradualmente todas las llamadas HTTP `fetch` realizadas desde la interfaz pública y el panel del workspace hacia el backend Express.

## Mapa de llamadas identificadas para unificación futura:

1. **OCR de Tickets e IA**:
   - `POST /api/tickets/analyze`
     * Ubicación actual: `ScannerAndSimulator.tsx` (líneas 458 y 569)
     * Acción: Centralizar en un cliente `src/services/api/ticketsApi.ts`

2. **Automatización Cobro / Navegación SAT**:
   - `POST /api/automation/run`
     * Ubicación actual: `ScannerAndSimulator.tsx` (línea 763)
     * Acción: Centralizar en `src/services/api/automationApi.ts`

3. **Status y Configuración SAT**:
   - `GET /api/config/status`
     * Ubicación actual: `TicketsListScreen.tsx` (línea 206)
     * Acción: Centralizar en `src/services/api/configApi.ts`

4. **Notificaciones de Correo**:
   - `POST /api/email/send`
     * Ubicación actual: `TicketsListScreen.tsx` (línea 239)
     * Acción: Centralizar en `src/services/api/emailApi.ts`

5. **Lectura de Constancia de Situación Fiscal (CSF) con OCR**:
   - `POST /api/fiscal/parse-constancia`
     * Ubicación actual: `ProfileForm.tsx` (línea 237) y `OnboardingFlow.tsx` (línea 202)
     * Acción: Centralizar en `src/services/api/fiscalApi.ts`
