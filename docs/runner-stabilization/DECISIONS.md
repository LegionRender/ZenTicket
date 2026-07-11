# Registro de decisiones: estabilizacion JIT/runner

## ADR-001 - API y runner separados

**Estado:** aceptada para implementacion.

Firebase Functions atiende la API publica y Cloud Run ejecutara Playwright. No
se ejecutara Chromium dentro de la Function API ni en el contenedor web actual.

## ADR-002 - JIT no muta produccion

**Estado:** aceptada para implementacion.

Las salidas JIT o de self-healing se almacenaran como
`connector_patch_proposals` en `pending_review`. Ningun proceso podra cambiar
por si solo `connector.portalUrl`, portal map activo, `recoveryFlow` o un estado
productivo. P0 bloquea las mutaciones; Fase 6 implementa las propuestas
versionadas.

## ADR-003 - SAT para estado `Listo`

**Estado:** pendiente de aprobacion de producto.

La auditoria solicita XML real, validacion CFDI y SAT vigente. El manual actual
solo exige XML real y validacion local. No se cambia el estado visible final
hasta aprobar el alcance y actualizar manual, pruebas y mensajes de usuario.

## ADR-004 - CAPTCHA durable

**Estado:** aceptada para implementacion.

El runner no mantendra Function, listener ni navegador esperando a una persona.
Detectar CAPTCHA deja evidencia y una pausa durable; reanudar crea un intento
nuevo autorizado.
