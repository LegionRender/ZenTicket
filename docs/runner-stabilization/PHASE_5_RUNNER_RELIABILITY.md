# Fase 5 - runner Playwright confiable

Estado: en curso. Esta fase no habilita nuevos conectores, OCR alternativo, JIT
ejecutable ni estados CFDI finales.

La validaciÃ³n se ejecuta de forma remota con
[`phase5-runner-contracts.yml`](../../.github/workflows/phase5-runner-contracts.yml).

## Contratos obligatorios

- Un clic de descarga debe terminar en una seÃ±al de archivo o respuesta documental;
  de lo contrario falla con `DOCUMENT_NOT_OBSERVED`.
- No se permiten clics con `force: true` en el nÃºcleo de ejecuciÃ³n. Un elemento
  debe ser visible y accionable, o el intento deja evidencia y falla.
- Los sleeps heredados se sustituyen por postcondiciones: selector visible,
  formulario habilitado, modal cerrado, navegaciÃ³n terminada o documento observado.
- Un error que no sea puramente de limpieza debe registrarse como diagnÃ³stico,
  error del portal o transiciÃ³n durable; nunca se descarta silenciosamente.
- La ejecuciÃ³n sÃ³lo se prueba remotamente en Cloud Build/Cloud Run. NingÃºn
  navegador local es una dependencia vÃ¡lida.

## Inventario inicial

El primer corte corrige el nÃºcleo de descarga de
`engines/automation/executePortalMap.ts`: elimina los clics forzados y sus pausas
fijas, y exige una seÃ±al de documento. Los siguientes cortes migran las esperas
heredadas de selectores PrimeFaces, CAPTCHA, recuperaciÃ³n y la estrategia OXXO a
contratos por estado observable.

El segundo corte bloquea las esperas arbitrarias al normalizar portal maps y
reemplaza la recuperaciÃ³n semÃ¡ntica/JIT por una estrategia o `recoveryFlow`
declarativo verificable: URL HTTPS explÃ­cita, selectores estables y una
postcondiciÃ³n obligatoria por clic. El runner no se desplegarÃ¡ con este bloqueo
hasta auditar y migrar los portal maps remotos que aÃºn usen `wait_for_timeout`.

La auditorÃ­a de sÃ³lo lectura se ejecuta remotamente con
[`audit-portal-map-waits.yml`](../../.github/workflows/audit-portal-map-waits.yml)
y publica un artefacto de inventario; no modifica Firestore ni despliega servicios.

## Criterio de salida

Cada familia de portal debe tener una prueba remota con una pÃ¡gina controlada o
un sandbox autorizado que cubra navegaciÃ³n, formulario, modal y descarga. Las
pruebas reales posteriores no pueden crear una factura ficticia ni declarar XML/
CFDI obtenido sin archivos reales y validaciÃ³n estructural.
