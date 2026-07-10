# Regresión y Validación de Endpoints Críticos (API)

Este documento contiene el checklist de validación para los endpoints públicos y privados de la API de ZenTicket. Estos tests se automatizarán con supertest una vez que se complete la separación de la lógica del servidor de `server.ts` a `server/app.ts`.

---

## 1. Endpoints de Facturación y Carga de Tickets
* **`POST /api/tickets/analyze` (OCR Gemini)**
  * [ ] Sin Token: Debe responder `401 Unauthorized`.
  * [ ] Con Token de Usuario: Debe procesar el archivo y retornar datos del ticket.
* **`POST /api/fiscal/parse-constancia` (Constancia de Situación Fiscal)**
  * [ ] Sin Token: Debe responder `401 Unauthorized`.
  * [ ] Con Token de Usuario: Retorna datos estructurados del perfil SAT.
* **`POST /api/tickets/train-jit` (Entrenamiento JIT)**
  * [ ] Sin Token: Debe responder `401 Unauthorized`.
  * [ ] Con Token de Usuario: Guarda el mapeo de entrenamiento.

---

## 2. Endpoints de Métodos de Pago y Suscripciones (Stripe)
* **`GET /api/billing/payment-methods`**
  * [ ] Sin Token: Debe responder `401 Unauthorized`.
  * [ ] Con Token de Usuario: Retorna tarjetas registradas asociadas al `stripeCustomerId` del usuario.
* **`POST /api/billing/payment-methods/default`**
  * [ ] Sin Token: Debe responder `401 Unauthorized`.
  * [ ] Con Tarjeta Ajena: Debe responder `403 Forbidden` (bloqueando tarjetas de otros usuarios).
* **`POST /api/billing/webhooks/stripe` (Webhook de Stripe)**
  * [ ] Sin Autenticación de Firebase: Debe permitir el request.
  * [ ] Sin Firma Válida (`stripe-signature`): Debe responder `400 Bad Request` o similar.
  * [ ] Con Firma Válida: Sincroniza suscripciones.

---

## 3. Endpoints de Administración
* **`POST /api/admin/discover-portal`**
  * [ ] Con Usuario Normal: Debe responder `403 Forbidden`.
  * [ ] Con Administrador: Permite la ejecución.
