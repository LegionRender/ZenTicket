# Fase 6 — Gobernanza de JIT y discovery

## Estado actual

JIT, discovery de portales y aprendizaje heurístico están **congelados en producción**. No forman parte del flujo de facturación ni del procesamiento de tickets.

Las pruebas históricas están marcadas con `archival.category = "phase1_test_evidence"` y `archival.excludedFromJit = true`. Son evidencia de sólo lectura; no son conectores, trabajos activos ni fuentes de aprendizaje.

## Controles obligatorios

- `POST /api/tickets/train-jit` responde `410 JIT_GOVERNANCE_FROZEN`.
- Las rutas heredadas `/api/connectors/learn` y `/api/admin/discover-portal` responden `410 JIT_GOVERNANCE_FROZEN`.
- El dispatcher de `connector_discovery_outbox` no crea tareas mientras la gobernanza esté congelada.
- Cloud Run reconoce una tarea heredada de discovery sin abrir navegador ni procesar el registro.
- `processConnectorDiscovery` ignora permanentemente cualquier documento con `archival.excludedFromJit = true`.
- La consola administrativa muestra la evidencia archivada separada de la operación y no permite iniciar discovery ni guardar mapas generados por JIT.

## Regla de datos reales

Un ticket real sólo puede aportar datos que se extraen de su imagen o que el usuario captura explícitamente. Ningún ticket puede entrenar, corregir, promover o mutar un conector.

## Condiciones para cualquier cambio futuro

No se puede descongelar ningún componente mediante un cambio de bandera o una edición de interfaz. Requiere una decisión explícita del responsable del producto y, como mínimo:

1. Un alcance aprobado que indique el comercio y el ambiente de prueba.
2. Un proceso aislado que no use tickets de usuarios ni modifique conectores productivos.
3. Evidencia técnica remota, revisión humana y una propuesta inmutable.
4. Una promoción manual independiente, con pruebas de runner y validación de reglas antes de producción.

Hasta entonces, las propuestas y evidencias se conservan sólo para consulta.
