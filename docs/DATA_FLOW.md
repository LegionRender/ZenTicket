# Flujo de Datos y Sincronización de ZenTicket

Este documento detalla los flujos de información del sistema, desde la digitalización física de tickets y constancias con OCR hasta la consulta del SAT y la persistencia resiliente de datos.

---

## 📸 1. Ciclo de Vida del Procesamiento de Tickets (OCR)

El usuario inicia cargando una imagen o PDF de un ticket desde el módulo del escáner en el workspace:

```text
[Cliente Web: Scanner] --(POST Base64/Archivo)--> [Express API: /api/tickets/analyze]
                                                       |
                                                       | (Inyección de Prompt Estructurado)
                                                       v
                                            [Gemini 1.5 Flash SDK Client]
                                                       |
                                                       | (Extracción de Campos en JSON)
                                                       v
[Cliente Web: Guardado Local/Firestore] <--(Retorna JSON fiscalizado)-- [Respuestas del Servidor]
```

### Detalle de Campos Extraídos (`Ticket`):
- `emisorName` [Razón Social del Comercio]
- `emisorRfc` [RFC del Comercio Emisor]
- `total` [Monto Total Neto de Compra]
- `fecha` [Fecha de emisión - Normalizada YYYY-MM-DD]
- `folio` [Código o Folio de Facturación del ticket]

---

## 🤖 2. Flujo de Timbrado y Automatización SAT (Playwright Simulator)

Una vez que el ticket posee datos fiscales y el contribuyente emisor está validado, se ejecuta la secuencia de timbrado robótico:

```text
[Cliente Web (ScannerAndSimulator)] --(POST Campos de Facturación)--> [Express API: /api/automation/run]
                                                                            |
                                                                            | (Inicia Robot Playwright)
                                                                            v
                                                                 [Portal SAT o Emisor Comercial]
                                                                            |
                                                                            | (Llenado automático y Firma)
                                                                            v
[Cliente Web (Bóveda Gastos)] <--(Retorna XML + PDF CFDI oficial)-- [Sello Digital Timbrado PAC]
```

---

## 💾 3. Persistencia de Datos y Sincronización Resiliente (Contingencia Cached)

ZenTicket opera con un sistema híbrido de persistencia de datos (Firestore + LocalStorage) para asegurar que el contribuyente nunca pierda datos por fallos de red o si la cuota del servidor ha sido excedida (Quota Exceeded):

1. **Intento de Escritura en Base de Datos**:
   El frontend intenta registrar cualquier ticket, perfil fiscal o gasto en **Firestore Cloud Database** en tiempo real.
2. **Intercepción de Fallos**:
   Si Firestore responde con un error de exceso de cuota (`Quota Exceeded` o similar), el sistema de contingencia se activa de forma automática e imperceptible.
3. **Resguardo Local Caché (`LocalStorage`)**:
   Los datos se escriben inmediatamente en el `LocalStorage` del navegador del usuario usando llaves asociadas al ID de sesión (p. ej., `local_tickets_{user.uid}`).
4. **Sincronización en Entrada**:
   Al iniciar sesión, el sistema valida y recupera perfiles y tickets guardados en caché local para mantener la coherencia operativa de la interfaz.

---

## 📑 4. Parsing de Constancia de Situación Fiscal (CSF)

Al ingresar al Onboarding o en Mi Cuenta:
- El usuario arrastra su archivo PDF de la constancia SAT.
- Se hace una llamada a `POST /api/fiscal/parse-constancia`.
- El backend lee e interpreta los metadatos de Hacienda de forma automática.
- Los campos RFC, Razón Social, Régimen Fiscal y Código Postal se auto-completan en la interfaz del cliente.
