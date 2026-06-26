# Checklist de Tareas Completadas

- [x] Mostrar la parte de métodos de pago en formato checkout inmediatamente desde el inicio (inicializando `checkoutPlanType` a `"personal"`).
- [x] No separar tarjetas de crédito de las billeteras digitales: se unificó la visualización de tarjetas de crédito y billeteras en una cuadrícula única en el acordeón de métodos de pago, utilizando el formato visual homogéneo (logo/tarjeta a la izquierda y detalles a la derecha).
- [x] Eliminar la cabecera/sección "Tus tarjetas vinculadas" / "Selecciona una tarjeta para la compra".
- [x] Eliminar por completo la pantalla de checkout duplicada de la ventana modal "Gestionar Plan", haciendo que muestre únicamente la lista directa de planes.
- [x] Unificar el diseño y comportamiento de todos los botones de menú de navegación (Landing page: móvil y escritorio; Dashboard: menú de navegación de escritorio), aplicando el estilo exacto del botón "Gestionar Plan" (`zt-btn-primary`, sin traslación hover lift `hover:transform-none`, sombra azul `shadow-md shadow-[#0B53F4]/15`, y reducción de escala al presionar `active:scale-[0.98]`).
- [x] Guardar en localStorage el plan seleccionado al registrarse desde el Landing ("Crear cuenta gratis" y tabla de precios) para reflejarlo en "Mi Cuenta".
- [x] Quitar métodos de pago no deseados: Spin by OXXO, Apple Pay y PayPal de la pasarela y del menú de agregar tarjetas/billeteras.
- [x] Eliminar métodos duplicados labeled "Cuenta Vinculada", impidiendo su creación y filtrándolos de los datos de cuenta.
- [x] Alinear la cuadrícula de los métodos de pago en una sola columna/apilado vertical (en acordeón de métodos de pago y agregar tarjeta).
- [x] Rediseñar botones de métodos de pago para agrandar los logotipos en cajas cuadradas (`w-14 h-14`) y estilizar los títulos y subtítulos con tipografía clara.
- [x] Corregir la estructura sintáctica y de tags del acordeón de métodos de pago en `ProfileForm.tsx`.
- [x] Aplicar esquinas redondeadas estándar (`rounded-2xl`) a todas las opciones de pago (resolviendo el fallo de `rounded-2.5xl`).
- [x] Cambiar el color de fondo de las opciones de pago y del Pago Predeterminado para que usen `bg-slate-50` (y `hover:bg-slate-100/70` en hover), igual que el botón que despliega el acordeón.
- [x] Validar que el proyecto compile sin errores de TypeScript (`npx tsc --noEmit` y `npm run build`).
