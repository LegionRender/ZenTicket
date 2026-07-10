# Regresión del Flujo de Pagos y Tarjetas (Stripe)

Checklist de verificación de consistencia en el flujo de pagos.

---

## 1. Stripe-only y Métodos Permitidos
* [ ] En el portal de Stripe Checkout y Setup solo se permite la entrada de Tarjeta Bancaria y la opción de Stripe Link.
* [ ] Google Pay aparece en el Checkout como wallet express en dispositivos/navegadores soportados.
* [ ] Apple Pay está completamente desactivado en la configuración activa en el Dashboard de Stripe (`pmc_1TmHoiIMU9aoBatuzktOSIHu`).
* [ ] PayPal y Mercado Pago/Mercado Libre no se ofrecen ni se renderizan en el portal de Stripe Checkout ni en el Dashboard.

---

## 2. Consistencia y Persistencia
* [ ] Al vincular una tarjeta, se asocia al Stripe Customer correcto en Stripe y se guarda en `billingProfiles/{userId}`.
* [ ] Un usuario no puede desvincular o marcar como default una tarjeta que no le pertenezca. El backend valida la propiedad.
* [ ] Al iniciar sesión o refrescar la página, el estado de la suscripción y los métodos vinculados persisten y se recuperan de Stripe/Firestore sin crear clientes duplicados.
