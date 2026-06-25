# Configuración de Pasarelas de Pago y Liquidación Bancaria - ZenTicket

Este documento detalla los pasos requeridos para configurar las conexiones reales de Mercado Pago y PayPal con ZenTicket, así como las directrices para la liquidación de fondos a la cuenta bancaria del administrador.

---

## 🔒 Directrices de Seguridad
Por razones de cumplimiento PCI-DSS y seguridad de la información:
1. **No se almacena información sensible de tarjetas (números completos o CVV)** en las bases de datos de ZenTicket ni en Firestore.
2. **Los datos bancarios de liquidación no se guardan ni se manejan en el código fuente** (tanto frontend como backend).
3. Todo el procesamiento de cobros se realiza mediante redirección segura (`init_point` en Mercado Pago y `approval_url` en PayPal).

---

## 🏦 Cuentas de Liquidación y Recaudación Bancaria

Para el flujo de ZenTicket, se configuran dos cuentas distintas:

### A. Cuenta de Destino Final (Scotiabank)
Es la cuenta de banco física donde se liquida y retira finalmente el dinero cobrado:
* **Titular**: Ricardo Castro Becerril
* **Banco**: Scotiabank
* **Número de Cuenta**: 00102022097
* **CLABE Interbancaria**: 044180001020220978
* **Número de Tarjeta**: 4043 1300 2571 2460

### B. Cuenta Digital Recaudatoria (Mercado Pago)
Es la CLABE asignada a tu balance de Mercado Pago que sirve para recaudar transacciones y transferencias:
* **Titular**: Ricardo Castro Becerril
* **Institución**: Mercado Pago (Mercado Libre)
* **CLABE de Mercado Pago**: 722969010486235989

---

## ⚙️ Configuración de Retiros Automáticos

### 1. Configuración en Mercado Pago (Saldos a Scotiabank)
Para transferir tus ventas y saldo acumulado de Mercado Pago hacia tu cuenta de Scotiabank de forma automática o manual:
1. Inicia sesión en el **Panel de Mercado Pago** (Mercado Pago Business).
2. Ve a **Tu Perfil** o **Configuración** > **Cuentas bancarias**.
3. Haz clic en **Agregar Cuenta** e ingresa la CLABE de Scotiabank `044180001020220978` a nombre de **Ricardo Castro Becerril**.
4. En la sección de **Retiros**, programa retiros automáticos al final del día para que todo el saldo acumulado de ZenTicket se transfiera automáticamente a Scotiabank sin comisión.

### 2. Configuración en PayPal (Saldos a Scotiabank)
Para retirar el dinero acumulado de PayPal a la cuenta de Scotiabank:
1. Inicia sesión en tu cuenta de **PayPal Business**.
2. Ve a **Asociar cuenta bancaria o tarjeta** en el panel de control.
3. Elige **Asociar cuenta bancaria**.
4. Proporciona el nombre del banco (Scotiabank), el nombre del titular (**Ricardo Castro Becerril**) y la CLABE interbancaria de Scotiabank (`044180001020220978`).
5. Configura la **Transferencia Automática** diaria para que los saldos cobrados se liquiden a Scotiabank de forma regular.

---

## ⚙️ Variables de Entorno (Backend / Functions)

Asegúrate de configurar las credenciales correctas en tu archivo de configuración del servidor (.env) o en las variables de Cloud Functions de Firebase:

* `MERCADOPAGO_ACCESS_TOKEN`: Token de acceso de producción provisto en la sección de Credenciales de Mercado Pago Developers.
* `PAYPAL_CLIENT_ID`: Identificador de cliente de producción provisto por PayPal Developer Portal.
* `PAYPAL_CLIENT_SECRET`: Clave secreta de producción provista por PayPal Developer Portal.
* `APP_PUBLIC_URL`: URL base pública de ZenTicket (ej. `https://zenticket.mx` o `http://localhost:5173` en entorno local) utilizada para construir los webhooks y las URLs de retorno.
