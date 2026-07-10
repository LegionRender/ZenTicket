# Motores CFDI & SAT

Motores encargados de la verificación legal, integridad y validez de las facturas devueltas por los comercios.

---

## 1. Motor CFDI (`runner/src/engines/cfdi/`)

* **Archivo Principal:** `validateCfdiXml.ts`
* **Función:** Analiza la estructura del archivo XML descargado para asegurar que cumple con el anexo 20 del SAT.
* **Validaciones Estructurales Locales y Reglas de la Fase 12:**
  * **Coincidencia del RFC Emisor (`CFDI_RFC_EMISOR_MISMATCH`):** El RFC emisor del XML debe coincidir con el RFC esperado del conector.
  * **Coincidencia del RFC Receptor (`CFDI_RFC_RECEPTOR_MISMATCH`):** El RFC del receptor del XML debe coincidir estrictamente con el RFC del perfil fiscal del usuario.
  * **Coincidencia del Total (`CFDI_TOTAL_MISMATCH`):** El total del XML debe coincidir con el total esperado del ticket (tolerancia de 50 centavos por redondeos).
  * **Protección contra total $0.00:** Si el total en el XML es `0.00` pero el ticket esperaba un importe positivo, se rechaza de inmediato con `CFDI_TOTAL_MISMATCH`.
  * **Integridad del UUID (`CFDI_MISSING_UUID` / `CFDI_UUID_MISSING`):** Se verifica la presencia del nodo `TimbreFiscalDigital` y su atributo `UUID`.
  * **Integridad Estructural (`CFDI_INVALID_XML`):** Se asegura de que el archivo descargado sea un XML parseable de CFDI válido y no una página HTML de error.

---

## 2. Motor SAT (`runner/src/engines/sat/`)

* **Archivo Principal:** `verifySatCfdi.ts`
* **Función:** Realiza una petición HTTPS SOAP directa contra el webservice oficial del SAT (`https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc`).
* **Resultados e Integración de Diagnóstico:**
  * **Vigente:** Factura legalmente válida.
  * **Cancelado:** (`CFDI_CANCELLED_IN_SAT`). El ticket entra a revisión manual de forma inmediata.
  * **No Encontrado (Unknown):** (`CFDI_NOT_FOUND_IN_SAT` o `SAT_VALIDATION_TIMEOUT`). Se agenda un reintento diferido de validación (Flow A / validating_sat). Si excede el límite de reintentos, se clasifica como error permanente de validación SAT y se asigna al administrador.
