# Proceso — Kardex (movimientos de inventario)

Registro append-only de toda entrada/salida de inventario. Corrige al
paquete original en el vocabulario (real/teórico invertidos) y en el
alcance de tipos — ver `contexto/AUDITORIA_RTB-INV-01.md`, hallazgos 4 y 9.

## Quién puede

Consultar: los 8 roles. Registrar movimientos: `super_admin`, `direccion`,
`almacen`, `compras`, `logistica`. Nadie edita ni borra un movimiento ya
creado — ni siquiera `service_role`.

## Dónde

UI: pestaña "Kardex" en `app/app/dashboard/productos/[id]/producto-detalle.tsx`.
API: `app/app/api/inventario/movimientos/route.ts` (GET/POST).

## Vocabulario correcto (el paquete lo tenía invertido)

- **Teórica** = acumulador documental: la suma de todo el kardex.
- **Física** = medición del último conteo validado (`NULL` = nunca
  contada, distinto de "contada en cero").
- **Apartada** = compromisos abiertos (reservas) — tercer concepto, no
  mueve el kardex.
- `física − teórica` es una **señal de error de conciliación**, nunca una
  proyección de compromisos.

## El trigger que hace todo

`inventario_movimientos_before_insert()` (`db/migrations/011_inventario_kardex.sql`),
en este orden, dentro de la misma transacción:

1. Resuelve la unidad base del producto y el factor de conversión contra
   la unidad que capturó el operador. Si la unidad capturada no es ni la
   base ni la de contenido, **rechaza el movimiento** (no asume factor 1).
2. Si el tipo es una corrección (`entrada_ajuste`/`salida_ajuste`/
   `entrada_conteo`/`salida_conteo`), exige `ajuste_autorizado(ajuste_id) = true`.
3. Si el producto/ubicación está congelado por un conteo en curso, rechaza
   el movimiento — salvo que sea la propia reconciliación de ese conteo.
4. Bloquea (`SELECT ... FOR UPDATE`) la fila de `inventario_existencias`
   correspondiente, creándola en cero si no existe.
5. Calcula el costo promedio ponderado móvil (sólo en entradas; las
   salidas lo conservan).
6. Si el saldo resultante es negativo y `permite_negativo = false`
   (el valor por defecto, y lo único que un `authenticated` puede
   escribir), rechaza el movimiento con un mensaje de negocio.
7. Aplica el nuevo saldo a `inventario_existencias` y asigna el folio
   (`MOV-00000123`).

## Cross-dock y transferencia: dos filas, un `operacion_id`

`POST /api/inventario/movimientos` acepta un array de exactamente dos
movimientos (`movimientoParSchema`) para estos casos. Ambas filas se
insertan en una sola sentencia SQL, y un *constraint trigger* diferido
(`movimiento_valida_par()`) exige que las dos existan al momento del
`COMMIT` — si sólo llega una pierna, la transacción entera falla. Esto
invierte el comportamiento actual del proceso real de RTB, donde omitir la
entrada del cross-dock es gratis (ALM-01 §V: *"el registro de entrada en
cross-dock nunca se omite"*, repetido tres veces en el documento porque
hoy sí se omite en la práctica).

## Saldo negativo: bloqueado por trigger, no por `CHECK`

Un `CHECK (cantidad_teorica >= 0)` habría sido imposible de aplicar sobre
datos reales: el reporte de existencias real tiene 18 teóricos negativos ya
en producción. El bloqueo vive en el trigger, con una escotilla
`permite_negativo` (+ `motivo_negativo` obligatorio) que está **fuera del
`GRANT INSERT`** — un `authenticated` no puede activarla ni con `curl`
directo a PostgREST. Sólo la API con `service_role` la usa, para carga
inicial (`motivo_negativo = 'carga inicial · saldo heredado de Notion'`) o
dentro de un ajuste autorizado.

## Append-only, a prueba de la propia API

Sin `GRANT UPDATE`/`DELETE` de ninguna columna para `authenticated`, y
además un trigger (`inventario_movimientos_inmutable()`) que rechaza
`UPDATE`/`DELETE` **incluso para `service_role`**. Una corrección de un
movimiento equivocado siempre es un movimiento nuevo con su propio ajuste
autorizado — nunca una edición del original.

## Qué puede fallar

| Síntoma | Causa |
|---|---|
| "Unidad de captura incompatible con el producto" | La unidad capturada no es ni la base del producto ni su unidad de contenido |
| "La cantidad no respeta los N decimales permitidos" | `unidades_medida.decimales` de la unidad capturada |
| "No se puede mover inventario con un ajuste no autorizado" | El `ajuste_id` referenciado no está en estado `autorizado`/`aplicado` |
| "Producto/ubicación congelado por el conteo..." | Hay un conteo en curso con ese producto/ubicación en su alcance |
| "Saldo negativo no permitido" | La salida dejaría el teórico por debajo de cero; se necesita una discrepancia/ajuste, no una salida directa |
| "Cross-dock exige las dos piernas en la misma operación" | Se insertó una sola fila en vez del par |
| "El kardex es append-only" | Se intentó `UPDATE`/`DELETE` sobre un movimiento existente |
