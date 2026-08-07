# Proceso — Ciclo de venta (cotización → PO vinculada)

RTB-VEN-01. Cubre desde que el vendedor cotiza hasta que la PO del
cliente queda vinculada por partida contra la NR — el reloj de cobranza
(RTB-PRO-FAC-01) queda fuera de esta entrega. Detalle de las decisiones
confirmadas con el dueño del proyecto en
`sessions/2026-08-07-modulo-ventas.md`.

> **⚠️ Defecto conocido, confirmado y sin corregir (2026-08-07):** el paso 5
> (despacho) puede consumir la reserva equivocada y rechazar un despacho
> válido cuando un pedido tiene dos o más líneas del mismo producto —
> confirmado dos veces (SQL con `ROLLBACK` y clic a clic con datos reales).
> Ver el último renglón de "Qué puede fallar" y
> `contexto/AUDITORIA_RTB-VEN-01.md` hallazgo #1 para el detalle completo y
> la corrección propuesta.

## Quién puede

Cotizar/enviar/aprobar/emitir NR: `ventas` (sólo sus propias
cotizaciones/pedidos), `direccion`, `super_admin` sin restricción.
Despachar una NR y liberar un pedido a Almacén: los anteriores + `almacen`.
Responder una consulta de Compras-ligero: `compras`, `direccion`,
`super_admin` — **nunca `ventas`**, que sólo la levanta. Registrar/validar
una PO: **por rol, no por dueño** — a diferencia de cotizaciones/pedidos,
`ventas_ordenes_compra_cliente` no tiene `vendedor_id` y
`ventas_po_validar()` sólo comprueba `current_user_role()`; cualquier
usuario `ventas`/`direccion`/`super_admin` puede validar/vincular la PO de
cualquier cliente. "Igual que cotizar" arriba se refiere sólo al conjunto
de roles, no a la restricción de fila — ver
`contexto/AUDITORIA_RTB-VEN-01.md` §3.6 y el TODO de `CLAUDE.md`
(pendiente de confirmar con el dueño del proyecto si una PO consolidada
puede cubrir NR de varios vendedores). Cancelar un vínculo PO↔NR: los
mismos que validan (`ventas`/`direccion`/`super_admin`), nunca si el
vínculo ya está `aprobado_para_facturacion`/`facturado`. Resolver una
autorización de Ventas o una excepción de cartera: sólo
`direccion`/`super_admin`, y nunca el propio solicitante (estructural, no
de la API).

## Dónde

UI: `app/app/dashboard/ventas/`. API: `app/app/api/ventas/`. Capa
compartida: `app/lib/ventas/{config,permisos,schemas,validaciones,errores}.ts`.

## 1. Precio — tres opciones, una se fotografía

Al agregar una línea el vendedor elige entre **Costo Refacción**/**Costo
Ariba** (`producto_precios_referencia`, canal vigente — sólo lectura para
`ventas` desde `028`) o **Costo de Venta** (fórmula viva:
`costo_promedio_global()` × (1+margen de la FAMILIA), con override manual
que congela — ver `db/ESQUEMA.md` §RTB-VEN-01). El trigger
`ventas_cotizacion_linea_before_write()` resuelve `precio_unitario` en ese
momento y lo **congela**: cambiar el margen de la familia o el costo
después nunca mueve una línea ya fotografiada. Si el precio elegido no
tiene costo (familia sin margen, o canal sin precio de referencia), la
línea no se puede resolver — `22023`.

## 2. Compras-ligero — precondición dura

Un producto sin costo no se cotiza. El vendedor levanta
`POST /api/ventas/consultas` con descripción libre (marca/modelo/número de
parte/cantidad/urgencia), **sin que el producto exista todavía**, y agrega
una línea con `consulta_id` (sin `producto_id`, sin `precio_origen`) —
queda `en_consulta=true`. Compras da de alta el producto con sus rutas
normales (`POST /api/productos`, costo vía `producto_costos`/
`proveedor_productos`) y responde con
`POST /api/ventas/consultas/[id]/responder`: propaga el `producto_id` a
la línea, que sigue `en_consulta=true` (falta que Ventas elija precio).
El vendedor entonces hace `PATCH .../lineas/[id]` con `precio_origen` —
recién ahí se resuelve y `en_consulta` pasa a `false`.

## 3. Enviar y aprobar

`POST /api/ventas/cotizaciones/[id]/enviar` exige: al menos una línea
activa, **ninguna línea en consulta**, vigencia definida, y que
`cliente_puede_operar()` diga que sí (ver `bloqueo-y-aprobaciones.md` para
el bloqueo administrativo — aquí además se checa congelamiento de
cartera). `POST .../aprobar` (con evidencia: canal, adjunto, datos
formales faltantes) hace, en una sola transacción
(`ventas_cotizacion_aprobar()`, `031`): registra la evidencia, crea el
pedido + sus líneas (copia inmutable del snapshot), y **una reserva por
línea** (`inventario_apartados`, `nivel='reserva'`) en unidad base del
producto. Si cualquier línea tiene una unidad de captura incompatible con
el producto, la función entera se revierte — cero reservas huérfanas.

## 4. NR (Vía A) y liberación a Almacén

Antes de liberar el pedido, `POST /api/ventas/pedidos/[id]/nota-remision`
emite la NR (una por pedido — Vía B, PO directa sin NR, queda fuera de
esta entrega). Luego `POST .../liberar` promueve **todas** las reservas
del pedido a `nivel='compromiso'` con un solo `UPDATE` — no toca
`cantidad_apartada`, así "disponible" nunca descuenta la misma pieza dos
veces.

## 5. Despacho — el kardex real

`POST /api/ventas/notas-remision/[id]/despachar` con
`{ lineas: [{ nr_linea_id, cantidad }] }`. Por cada línea,
`ventas_nr_despachar()` (`032`, reemplazada en `035`) inserta un
`inventario_movimientos` (`salida_venta`, ligado al `apartado_id`) y
consume el apartado comprometido de **esa línea de pedido exacta**
(`pedido_linea_id`, `035`) — no por producto; si el despacho es parcial,
el remanente nace como **fila nueva** con el mismo `pedido_linea_id` (el
alcance de un apartado es inmutable — no se edita en sitio). `ventas` no
está en la RLS de `INSERT` del kardex: la función corre como su dueño y
sólo emite este tipo exacto, ligado a un apartado del propio pedido.
Errores del kardex (saldo negativo, congelamiento de conteo activo) se
propagan tal cual — un faltante se registra como discrepancia, no como
salida forzada.

**Corregido (`035`, antes hallazgo crítico #1):** el apartado a consumir
se buscaba sólo por `(pedido_id, producto_id, nivel='compromiso')`,
`order by created_at limit 1` — sin ninguna columna que lo ligara a la
línea de pedido/NR específica que lo originó. Si un pedido tenía dos o
más líneas del mismo producto, despachar fuera del orden de creación
podía consumir el apartado de la línea equivocada y rechazar un despacho
legítimo con "la reserva comprometida no alcanza" pese a que el total
reservado sí alcanzaba — confirmado por SQL y clic a clic con datos
reales (`contexto/AUDITORIA_RTB-VEN-01.md` hallazgo #1). Ahora
`inventario_apartados.pedido_linea_id` (FK compuesta a
`ventas_pedido_lineas (id, pedido_id)`, `035`) liga cada reserva a su
línea desde que nace en `ventas_cotizacion_aprobar()`, y
`ventas_nr_despachar()` empareja por esa columna — respaldado por
`uq_apartados_pedido_linea_activo` (como máximo una reserva activa por
línea).

## 6. PO del cliente y vínculos por partida

`POST /api/ventas/ordenes-compra` registra la PO (folio interno
`POC-000000`, `numero_po_normalizado` respalda el índice único parcial —
una PO ya viva con ese número para la misma entidad es una posible
duplicada, incidencia, no asunción automática). `POST .../[id]/partidas`
captura cada renglón declarado por el cliente. `POST .../[id]/validar`
(`ventas_po_validar()`, `033`) cruza, **siempre en SQL sobre `numeric`**
(nunca comparando floats de JS):

1. Moneda de la PO vs. la de cada NR involucrada → bloqueo si difieren.
2. RFC declarado vs. `entidades.rfc` → rechazo de la PO completa.
3. Costo unitario partida↔línea de NR → **una sola** partida divergente
   bloquea **toda** la PO, sin excepción.
4. Subtotal coincidente con unitarios distintos → requiere
   `autorizacion_id` de una `ventas_autorizaciones` tipo
   `excepcion_subtotal`, autorizada por Dirección.
5. Código de producto divergente → permitido con
   `aceptar_codigo_divergente` si costo/subtotal ya cuadraron.
6. Duplicidad (la cobertura propuesta excedería lo entregado) → el
   vínculo nace `rechazado_por_duplicidad` y la PO queda
   `pendiente_de_confirmacion`, salvo autorización `duplicidad_confirmada`.

"Cantidad/monto respaldado por PO" se calcula siempre por agregación
sobre `ventas_po_nr_vinculos` filtrando por estado — nunca un contador. Dos
*constraint triggers* diferidos (`vinculo_valida_cobertura_nr`/`_partida`)
son la última barrera contra el doble conteo.

**Cancelar un vínculo capturado por error** (`ventas_vinculo_cancelar()`,
`036`): nunca borra la fila — la marca `estado='cancelado'` con
`cancelado_at`/`cancelado_por`/`motivo_cancelacion` (obligatorio), y
recalcula el estado de la PO y de la NR **hacia atrás** (el `CASE` de
`ventas_po_validar()` de arriba sólo avanza). Con cero vínculos activos en
toda la PO, el estado vuelve a `en_validacion` (no `parcialmente_vinculada`,
que con cero cobertura sería engañoso); la NR vuelve a `entregada_sin_po`
si su cobertura llega a cero. Bloqueada si el vínculo ya está
`aprobado_para_facturacion`/`facturado` — la corrección de un vínculo con
consecuencia de facturación va por RTB-PRO-FAC-01 (nota de crédito), no por
aquí. El índice `uq_vinculo_par` excluye `estado='cancelado'`, así que el
mismo par partida↔línea de NR se puede volver a vincular después sin
chocar.

## Qué puede fallar

| Síntoma | Causa |
|---|---|
| "Elige un precio... / producto sin costo no se cotiza" | `cot_linea_precio_chk` / el trigger no encontró precio para el `precio_origen` elegido |
| "Hay N línea(s) en consulta con Compras" | `ventas_cotizacion_enviar()` — falta que Ventas elija precio en alguna línea ya respondida por Compras |
| "No se puede crear/aprobar/enviar: [motivo de cartera]" | `cliente_puede_operar()` — congelada, en revisión o bloqueada administrativamente |
| "La cotización ya expiró: no se puede aprobar" | `vigencia_hasta` pasada — se valida por fecha, no por estado |
| "Unidad de captura incompatible con el producto" | La unidad de la línea no es la base ni la de contenido del producto |
| "No hay una reserva comprometida para la línea de esta NR..." | Se intentó despachar sin haber liberado el pedido primero |
| "La reserva comprometida no alcanza para despachar esa cantidad de la línea..." | Se intentó despachar más de lo reservado para esa línea de pedido |
| "Se bloquea la PO completa hasta corregir el documento del cliente" | Costo unitario distinto en al menos una partida, sin subtotal coincidente |
| "Requiere autorización de Dirección (excepcion_subtotal)" | Subtotal coincide pero los unitarios varían, sin `autorizacion_id` vigente |
| "El RFC declarado no coincide con el de la entidad" | Rechazo automático de la PO completa |
| "No puedes resolver tu propia solicitud" | Anti-autoaprobación (`ventas_autorizaciones`/`cliente_excepciones`) |
| "Este vínculo ya tiene consecuencias de facturación... no se puede cancelar aquí" | El vínculo está `aprobado_para_facturacion`/`facturado` — `ventas_vinculo_cancelar()` lo bloquea |
| "Este vínculo ya está cancelado" | Doble cancelación — idempotencia de `ventas_vinculo_cancelar()` |

## Pendiente (fuera de esta entrega)

- **Permisos de PO entre vendedores, sin resolver a propósito.** No hay
  regla inequívoca en código ni en proceso: `030:165-168` sugiere que la
  visibilidad amplia es intencional ("una PO consolidada puede involucrar
  NR de otro vendedor del mismo cliente"), pero el texto de "Quién puede"
  de arriba decía "igual que cotizar" sin aclarar que es sólo por rol.
  Pendiente de confirmar con el dueño del proyecto: ¿una PO consolidada de
  un cliente puede cubrir NR de varios vendedores? Si la respuesta es no,
  la opción implementable sin columna nueva es restringir
  `ventas_po_validar()` por `vendedor_id` de las NR vinculadas (ver
  `contexto/AUDITORIA_RTB-VEN-01.md` §3.6 y TODO de `CLAUDE.md`).
- El resto de los pendientes de RTB-VEN-01 (Vía B sin NR, reloj de
  cobranza/CFDI) siguen en el TODO de `CLAUDE.md` — el emparejamiento
  apartado↔línea (antes hallazgo crítico #1) ya se corrigió en `035`, ver
  §5 arriba.
- **Vía B (PO directa, sin NR)**: el pedido se aprueba/libera igual, pero
  no tiene una función de despacho dedicada en esta entrega — ver TODO en
  `CLAUDE.md`.
- El reloj de cobranza, CFDI y pagos son RTB-PRO-FAC-01 (Facturación),
  módulo futuro. `nr_estado` ya incluye `facturada`/`pagada_cerrada`, pero
  ninguna función de este módulo los escribe.
