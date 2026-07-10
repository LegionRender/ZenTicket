# Regresión de Procesamiento de Tickets

Checklist de procesamiento de tickets y estados críticos.

---

## 1. Ciclo de Vida de los Tickets
* [ ] Al cargar un ticket, su estado inicial es `pending_ocr`.
* [ ] Tras ejecutarse el OCR, el estado pasa a `ocr_completed` u `ocr_failed`.
* [ ] Los tickets listos para facturación entran a la cola en estado `pending_billing` (o `queued_for_runner`).
* [ ] Durante el procesamiento del runner, el estado es `runner_processing`.
* [ ] Al concluir exitosamente, el ticket se marca como `billed` (o `cfdi_validated`).

---

## 2. Consistencia SAT
* [ ] El ticket facturado asocia los archivos XML y PDF correspondientes.
* [ ] No se pueden duplicar facturas asociadas a un mismo ticket físico.
