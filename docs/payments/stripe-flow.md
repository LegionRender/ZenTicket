# Flujo de Pagos con Stripe

ZenTicket es Stripe-only, admitiendo tarjeta y Stripe Link.

---

## 1. Flujo Seguro de Tarjeta

1. Tokenización segura desde el cliente con la clave pública de Stripe (`pk_...`).
2. Attach y registro del `paymentMethodId` mediante la API del backend.
3. Validación de propiedad en Stripe comparando el Customer ID.

---

## 2. Pautas de Pago

* No almacenar información sensible de tarjetas (PAN, CVV) en Firestore.
* El campo `plan` en el perfil fiscal solo es modificable por confirmaciones de Stripe o administradores autorizados.
