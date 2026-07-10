# Regresión de Autenticación y Permisos

Checklist de verificación de seguridad para el control de acceso en ZenTicket.

---

## 1. Bypass de Desarrollo Local
* [ ] En producción (`NODE_ENV=production`), el bypass de desarrollo (`DEV_BILLING_AUTH_BYPASS=true`) queda estrictamente bloqueado.
* [ ] Si existe una clave `sk_live` o `pk_live` de Stripe en el entorno, el bypass queda desactivado por seguridad.
* [ ] En desarrollo local sin claves de producción ni entorno en la nube, el bypass permite simular un `mockUid` y `mockEmail` inyectando privilegios correspondientes.

---

## 2. Privilegios Administrativos
* [ ] Un usuario regular no puede ingresar a rutas administrativas del backend (`requireAdmin` retorna `403 Forbidden`).
* [ ] Los correos autorizados (`ricardo@zenticket.mx` y `legionrender@gmail.com`) obtienen rol de administrador automáticamente.
* [ ] Un usuario con la claim `admin: true` o con el campo de rol `admin` es reconocido como administrador en el backend.
