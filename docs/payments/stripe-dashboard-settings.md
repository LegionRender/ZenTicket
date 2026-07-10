# Configuración de Pasarela de Pagos Stripe (Dashboard & API)

Para garantizar un flujo **Stripe-only** que permita **tarjetas, Stripe Link y Google Pay**, y que elimine por completo **Apple Pay**, PayPal, Mercado Pago y otras wallets del portal de Stripe Checkout, se requiere alinear tanto el código del backend como la configuración de la cuenta en el Stripe Dashboard.

---

## 1. Detalles de la Cuenta de Stripe Detectada

* **ID de la Cuenta:** `acct_1TmHoCIMU9aoBatu`
* **Nombre de la Cuenta:** `LegionRender`
* **País:** México (`MX`)
* **Modo de Operación:** `Live Mode` (Claves de producción activas: `sk_live_...` y `pk_live_...`)
* **Configuraciones de Métodos de Pago:** Solo existe la configuración predeterminada ("Default", ID: `pmc_1TmHoiIMU9aoBatuzktOSIHu`).

---

## 2. Causa Técnica de la Aparición de Apple Pay

Cuando se define `payment_method_types: ["card", "link"]` en la creación de una sesión de Checkout o Setup via API, Stripe interpreta `card` de forma amplia. Si el dispositivo y el navegador del cliente lo soportan (por ejemplo, Safari en macOS/iOS para Apple Pay, o Chrome en Android/Windows para Google Pay), Stripe inyecta de forma dinamica los botones de Express Checkout (Apple Pay y Google Pay) en la parte superior del formulario de pago.

Dado que la cuenta de Stripe tiene **Apple Pay activado por defecto** en la configuración de la cuenta, este botón de Apple Pay aparece en la página de Checkout hospedada por Stripe.

---

## 3. Solución Definitiva en el Stripe Dashboard

Para habilitar únicamente Tarjeta, Link y Google Pay, eliminando definitivamente Apple Pay, PayPal, Mercado Pago y otras wallets, el administrador de la cuenta de Stripe debe realizar las siguientes acciones manuales en el Dashboard:

1. **Acceder a la Configuración de Métodos de Pago:**
   * Navegar a: [Stripe Dashboard > Settings > Payment Methods](https://dashboard.stripe.com/settings/payment_methods).
2. **Seleccionar la Configuración Habilitada:**
   * Seleccionar la configuración **Default** (`pmc_1TmHoiIMU9aoBatuzktOSIHu`).
3. **Configurar los Métodos Permetidos para Checkout y Payment Element:**
   * **Card (Tarjeta):** Debe estar en estado **Activo (Active)**.
   * **Link (Stripe Link):** Debe estar en estado **Activo (Active)**.
   * **Google Pay:** Debe estar en estado **Activo (Active)**.
   * **Apple Pay:** Debe estar en estado **Desactivado (Turn off)**.
   * **PayPal, Mercado Pago, Amazon Pay, Klarna y otras wallets:** Deben estar en estado **Desactivado (Turn off)**.

Una vez aplicados estos cambios en el Dashboard de Stripe, cualquier sesión de Checkout creada mediante `payment_method_types: ["card", "link"]` mostrará únicamente el formulario de tarjeta, el botón de Stripe Link y el botón de Google Pay, eliminando por completo los botones de Apple Pay de forma definitiva.
