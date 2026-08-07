# Sesión 2026-08-07 — Corrección del hallazgo crítico #1 (RTB-VEN-01)

## Punto de partida

`contexto/AUDITORIA_RTB-VEN-01.md` §1/§7.2 dejó un hallazgo crítico
confirmado dos veces (SQL con `ROLLBACK` y clic a clic con datos reales
persistidos — `COT-000039`/`PED-000019`/`NR-000014`): `ventas_nr_despachar()`
(`032`) resolvía el apartado a consumir sólo por
`(pedido_id, producto_id, nivel='compromiso') order by created_at limit 1`.
Cuando un pedido tiene dos o más líneas del mismo producto —caso legítimo,
nada lo impedía al cotizar— un despacho fuera del orden de creación podía
consumir el apartado de la línea equivocada y luego rechazar en falso un
despacho legítimo con "la reserva comprometida no alcanza", pese a que el
total reservado sí alcanzaba. El encargo: corregir el emparejamiento,
respetando las decisiones de seguridad/RLS ya existentes (sin
`service_role`, sin debilitar permisos), con su propia migración y
verificación real — no un parche de una línea.

Esta sesión trabajó en paralelo con otra que cerró los hallazgos §3 de la
misma auditoría (rendimiento/operación) sobre el mismo repositorio — ver
`sessions/2026-08-07-ventas-optimizaciones.md` y
[[rtb-sesiones-concurrentes]] para las dos consecuencias que eso tuvo aquí
(numeración de migración, cookie de sesión compartida en el navegador de
pruebas).

## Decisión de diseño

`inventario_apartados` gana `pedido_linea_id`, **no** `nr_linea_id`: la
reserva nace en `ventas_cotizacion_aprobar()`, antes de que exista
ninguna NR, y `apartados_before_update()` congela la fila una vez creada
— no hay forma de rellenar `nr_linea_id` después con un `UPDATE`.
`ventas_nr_lineas.pedido_linea_id` ya es `NOT NULL` desde `032`, así que
cualquier línea de NR resuelve su línea de pedido en un solo salto — no
hace falta una segunda columna redundante.

## Migración `035_apartados_pedido_linea.sql`

Aditiva, en este orden (el orden importa: no se puede validar la
restricción antes del backfill):

1. Columna `pedido_linea_id uuid` (nullable — el apartado libre de
   Almacén, `POST /api/inventario/apartados` sin pedido, nunca tiene
   línea de origen).
2. FK compuesta declarativa: `ventas_pedido_lineas` gana
   `unique (id, pedido_id)`, y `inventario_apartados.pedido_linea_id`
   referencia `(id, pedido_id)` — garantiza que la línea SÍ pertenece al
   pedido del propio apartado, algo que una FK simple a `.id` no
   comprobaría. `MATCH SIMPLE` (el default) no evalúa la FK si alguna
   columna es NULL, así que el apartado libre de Almacén sigue sin verse
   afectado.
3. Backfill de los 3 apartados históricos de `PED-000019` (la propia
   evidencia del hallazgo), con dos reglas deterministas y sin IDs
   hardcodeados:
   - Emparejamiento directo: un apartado cuyo `(pedido_id, producto_id,
     cantidad)` coincide con exactamente una línea del pedido con el
     mismo perfil — cubrió los dos apartados originales (5 y 3 piezas).
   - Remanentes de despacho parcial: heredan el `pedido_linea_id` del
     apartado padre vía el `inventario_movimientos.salida_venta` que los
     originó en la misma transacción (mismo `created_at` exacto) —
     cubrió el remanente de 2 piezas, heredado de la línea de 5.
   - Guarda dura (`raise exception`) si algo queda sin ligar — no hubo
     ningún caso así en los datos reales.
   - `before_update_apartados` se desactivó sólo durante el backfill: el
     trigger vigente rechaza cualquier `UPDATE` sobre un apartado ya
     no-activo, y el apartado de 5 piezas del caso real ya estaba
     `'consumido'` — exactamente el registro que había que backfillear.
     Se reactivó de inmediato después.
4. `CHECK apartados_pedido_linea_chk`: `pedido_id is null ⇔
   pedido_linea_id is null`.
5. `uq_apartados_pedido_linea_activo` (índice único parcial): como
   máximo una reserva `activo` por línea de pedido — el invariante que
   permite que el despacho resuelva con una sola fila sin ambigüedad.
6. `apartados_before_update()` reemplazada: congela también
   `pedido_linea_id`, mismo alcance inmutable que `pedido_id`/
   `producto_id`/`ubicacion_id`/`cantidad`/`solicitante_id`.
7. `ventas_cotizacion_aprobar()` reemplazada: el `INSERT` de cada
   reserva propaga `pedido_linea_id` (el cursor ya lo traía).
8. `ventas_nr_despachar()` reemplazada: el fix real — emparejamiento
   exacto `where pedido_id = ... and pedido_linea_id = v_nr_linea.pedido_linea_id
   and nivel = 'compromiso' and estado = 'activo'` en vez de
   `producto_id` + `order by created_at limit 1`. El remanente de un
   despacho parcial propaga el mismo `pedido_linea_id` del apartado
   consumido.

Sin cambios de privilegio: el `GRANT INSERT` por columna de `031` ya
excluía `pedido_linea_id` de lo escribible por `authenticated` — sigue
siéndolo, sólo las funciones `SECURITY DEFINER` la escriben.

## Verificación

**Matriz SQL** (rol real simulado — `set_config('request.jwt.claim.sub',
...)` + `set local role authenticated`, dentro de `BEGIN … ROLLBACK`,
cero datos persistidos):

1. Pedido con línea A=5 y línea B=3 del mismo producto, despachar B
   primero: consume su propio apartado (3), la de A queda intacta.
   Despachar A después: aceptado sin rechazo falso — el escenario exacto
   del hallazgo.
2. Despacho parcial (2 de 5, luego el remanente de 3): el remanente
   conserva el `pedido_linea_id` de la línea original.
3. Pedido de una sola línea — regresión sin cambios de comportamiento.
4. Rechazo legítimo (pedir más de lo reservado para esa línea) — sigue
   fallando con `22023`.
5. Atomicidad ante error: dos veces — un despacho de 2 líneas donde la
   segunda no existe, y un despacho que agota el saldo real y dispara
   `P0001` (saldo negativo) a mitad del loop. En ambos casos, cero
   movimientos nuevos y apartados sin cambio tras el error — la función
   completa se revierte, sin estado a medias.
6. `inventario_verificar_consistencia()` sin hallazgos nuevos
   relacionados con apartados (los 4 que sí aparecieron son de un
   producto de prueba fabricado a mano para el escenario 5, y
   `sin_ubicacion` preexistente en dos productos QA — nada del cambio).
7. Permiso bloqueado (`insufficient_privilege`) al intentar escribir
   `pedido_linea_id` directo desde `authenticated`.
8. Reserva libre de Almacén (sin pedido) sigue insertando con
   `pedido_linea_id` NULL.

**Clic a clic** (extensión Claude in Chrome, usuario `qa.ventas@` /
`qa.almacen@qa.refacrtb.mx` — nunca la cuenta real del dueño del
proyecto, que estaba activa en el navegador al empezar y se cerró
sesión antes de tocar nada): cotización real `COT-000057` con dos
líneas del mismo producto (`RTB-FER-000006`, 5 y 3 piezas, "Costo de
Venta") → enviar → aprobar → pedido `PED-000040` → NR `NR-000035` →
liberar a Almacén → despachar la línea de 3 primero, luego la de 5.
Confirmado por SQL directo: cada `inventario_movimientos` (`salida_venta`)
quedó ligado al apartado de su propia línea (`pedido_linea_id` distinto
para cada uno), sin rechazo falso al despachar la segunda. Datos
persistidos como evidencia — mismo criterio que otras campañas QA del
proyecto.

**TypeScript**: `npx tsc --noEmit` dentro del contenedor — un error, en
`app/dashboard/ventas/autorizaciones/page.tsx`, perteneciente a la
sesión concurrente de optimizaciones (en vuelo en ese momento, ver
`sessions/2026-08-07-ventas-optimizaciones.md`); ningún archivo de esta
sesión lo produce.

**Seguridad**: `get_advisors` sin `ERROR` nuevo — sólo los `WARN` de
`SECURITY DEFINER` ya aceptados en todo el módulo.

## Documentación actualizada

`contexto/AUDITORIA_RTB-VEN-01.md` (hallazgo #1 marcado ✅ corregido, con
la descripción y evidencia original conservadas íntegras a continuación),
`db/ESQUEMA.md` (sección `inventario_apartados`), `db/procesos/ciclo-de-venta.md`
(§5 y "Qué puede fallar"), `CLAUDE.md` (TODO retirado, entrada de
Historial, gotcha nuevo sobre `order by created_at` no desempatando filas
nacidas del mismo `INSERT ... SELECT`), `app/types/inventario.ts`
(`InventarioApartado` gana `nivel`/`pedido_id`/`pedido_linea_id`).

## Datos QA persistidos

`COT-000057`/`PED-000040`/`NR-000035` (esta sesión) — no se purgan, mismo
criterio que el resto de campañas QA del proyecto. `PED-000019` (la
evidencia original del hallazgo, de la auditoría) queda como caso
histórico documentadamente incoherente: la línea de 5 quedó
sub-reservada y la de 3 con un apartado huérfano — no se saneó.

## Pendientes (fuera de esta sesión)

- Vía B (PO directa sin NR) sigue sin función de despacho dedicada.
- El resto del TODO de `CLAUDE.md` sin relación con este hallazgo.
