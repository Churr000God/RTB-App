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

> **`gerente_comercial` (037, 2026-08-07)** es equivalente a `direccion`
> en TODO lo de esta página — se añadió a los 8 verbos de abajo con el
> mismo criterio ("los anteriores"), nunca solo. La única excepción es
> "Responder una consulta de Compras-ligero": ahí `gerente_comercial`
> queda fuera a propósito, igual que `ventas` — respondería su propia
> consulta de costo, la separación que ese verbo existe para proteger.
> `cobranza` (037) no aparece en ningún verbo de esta lista: es sólo
> lectura del módulo completo, sin autoridad de escritura en ninguno.
> Detalle en `sessions/2026-08-07-agente-d-qa-navegacion-ventas.md`.

Cotizar/enviar/aprobar/emitir NR: `ventas` (sólo sus propias
cotizaciones/pedidos), `direccion`, `gerente_comercial`, `super_admin` sin
restricción de dueño (`gerente_comercial`/`direccion`/`super_admin` operan
sobre la cotización de cualquier vendedor).
Liberar un pedido a Almacén: los anteriores + `almacen`. **Despachar una
NR o surtir una PO (`045`): `direccion`/`gerente_comercial`/`super_admin`
+ `almacen` — `ventas` YA NO puede, a propósito** (corrección de negocio
del dueño del proyecto, misma jornada que `043`/`044`: surtir es trabajo
físico de Almacén, no de Ventas). `ventas_po_despachar()` comparte el
mismo conjunto de roles que `ventas_nr_despachar()` (`ROLES_DESPACHAN`,
un solo lugar que actualizar) — en la UI, Almacén entra desde el detalle
del **pedido**, no tiene acceso a `/dashboard/ventas/ordenes-compra`.
Adjuntar/reemplazar el documento de PO: `ventas`/`direccion`/
`gerente_comercial`/`super_admin` (`ventas_po_adjuntar_evidencia()`, sin
cambios — adjuntar el documento no es "surtir").
Responder una consulta de Compras-ligero: `compras`, `direccion`,
`super_admin` — **nunca `ventas` ni `gerente_comercial`**, que sólo la
levantan.

> **Vigente sólo para la Vía A (033/036), inerte desde 043 — párrafo
> conservado para cuando se reconstruya.** Registrar/validar una PO: por
> rol, no por dueño — a diferencia de cotizaciones/pedidos,
> `ventas_ordenes_compra_cliente` no tiene `vendedor_id` y
> `ventas_po_validar()` (retirada en `043`) sólo comprobaba
> `current_user_role()`; cualquier usuario
> `ventas`/`direccion`/`gerente_comercial`/`super_admin` podía
> validar/vincular la PO de cualquier cliente. Ver
> `contexto/AUDITORIA_RTB-VEN-01.md` §3.6 y el TODO de `CLAUDE.md`
> (pregunta que resurge si la Vía A reintroduce algo similar). Cancelar un
> vínculo PO↔NR: los mismos que validaban, nunca si el vínculo ya estaba
> `aprobado_para_facturacion`/`facturado`.

Resolver una autorización de Ventas o una excepción de cartera:
`direccion`/`gerente_comercial`/`super_admin`, y nunca el propio
solicitante (estructural — `CHECK` + comprobación de identidad en la
función, no de la API ni del rol). Congelar y **liberar** cartera:
`direccion`/`gerente_comercial`/`super_admin` — antes de 037 no había
ninguna pantalla para liberar, sólo para congelar (ver
`sessions/2026-08-07-agente-d-qa-navegacion-ventas.md`).

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
formales faltantes, y desde `043` también `via`) hace, en una sola
transacción (`ventas_cotizacion_aprobar()`, `031`, extendida en `043`/`044`):
registra la evidencia, crea el pedido + sus líneas (copia inmutable del
snapshot), y **una reserva por línea** (`inventario_apartados`,
`nivel='reserva'`) en unidad base del producto. Si cualquier línea tiene
una unidad de captura incompatible con el producto, la función entera se
revierte — cero reservas huérfanas.

`via` bifurca lo que pasa después, no lo de arriba: `'nota_remision'`
(default) es el comportamiento de siempre — ver §4. `'orden_compra'`
(Vía B, `043`) además, en la misma transacción, inserta la PO
(`ventas_ordenes_compra_cliente`, con `numero_po` obligatorio — si el
cliente aceptó pero aún no lo tiene, se aprueba como NR) y sus partidas
copiadas 1:1 de las líneas del pedido (`ventas_po_partidas`, con
`pedido_linea_id` poblado desde el nacimiento — no hay que esperar a un
despacho para tenerlo, a diferencia de la NR). El pedido queda marcado
`ventas_pedidos.via='orden_compra'`, lo que bloquea `ventas_nr_emitir()`
sobre él (§4) y habilita `ventas_po_despachar()` en su lugar (§5).

## 3a. Documento (PDF) y envío por correo — independiente del flujo de estados

`GET /api/ventas/cotizaciones/[id]/pdf` genera el documento comercial (PDF,
vía Chromium headless/Puppeteer, `lib/ventas/generar-pdf.ts`) a partir de
`lib/ventas/documento-cotizacion.ts` (cabecera + entidad + crédito +
contacto + dirección + líneas activas + fotos de producto, todo inlineado
como data URI para un render 100% offline) y
`lib/ventas/plantilla-cotizacion.ts`. Disponible en **cualquier estado**
(la plantilla dibuja un sello si no es `enviada`/`aprobada`) — es de sólo
lectura, misma barrera que el resto del módulo
(`ACCESO_PANTALLA.cotizaciones`). `?html=1` sirve el mismo render como
HTML puro, útil para depurar sin Chromium de por medio.

`POST /api/ventas/cotizaciones/[id]/correo` es un botón **independiente**
de "Enviar al cliente" — NO transiciona el estado, sólo manda el PDF
adjunto por correo vía MailerSend y registra el intento (éxito o fallo) en
`ventas_cotizacion_envios` (`042`, ver `db/ESQUEMA.md`). Puede repetirse en
cualquier estado (reenvíos). Roles: los mismos que pueden editar la
cotización (`rolesQuePueden('cotizaciones','update')`), deliberadamente
distinto del set más angosto de `/enviar` — la barrera real de fila sigue
siendo la política RLS de `ventas_cotizacion_envios`, que sí filtra
`ventas` por `vendedor_id`.

## 3b. Rechazar, cancelar, eliminar — y cuándo se abre una devolución

Vocabulario cerrado con el dueño del proyecto (`039`/`040`/`041`):

- **Rechazar** (`POST .../rechazar`): sólo desde `enviada` — el cliente dijo
  que no. Motivo obligatorio.
- **Cancelar** (`POST .../cancelar`): sólo desde `aprobada` — el cliente se
  retractó **después** de aprobar. Si el pedido asociado no muestra
  ninguna entrega (`aprobado`/`liberado`), cancela en cascada: pedido →
  `cancelado`, NR → `cancelada` si ya existía (puede haberse emitido antes
  de liberar a Almacén, con el pedido todavía `aprobado`), reservas
  activas → liberadas. Si el pedido ya muestra `entregado_parcial` o
  `entregado`, **no cancela nada** — abre una devolución (ver abajo) y lo
  informa en la respuesta (`resultado: 'en_devolucion'`).
- **Eliminar** (`POST .../eliminar`): sólo desde `borrador` — DELETE real,
  no un cambio de estado. Borra las líneas y luego la cabecera en una sola
  transacción; si hay una consulta a Compras ligada, la cancela (si seguía
  `abierta`/`en_proceso`) o la desliga (si ya estaba `respondida` —
  forzarla a `cancelada` violaría `consulta_respuesta_chk`, una
  equivalencia).
- Mientras la cotización está en `borrador` **o** `enviada`, sus líneas se
  editan igual (agregar, cambiar producto/precio, cantidad, descuento,
  quitar). Fuera de esos dos estados, ningún campo de ninguna línea se
  toca — ni para `aprobada`, ni para las que ya cerraron el ciclo.
  "Quitar línea" es `activo:false` en `enviada`; en `borrador` es DELETE
  real (nunca se mostró al cliente, no hace falta dejar rastro de fila).

**Devoluciones** (`ventas_devoluciones`, seguimiento básico, sin reembolso
real): se abre automáticamente al intentar cancelar una `aprobada` con
entrega. Registra folio, motivo, `valor_entregado` (informativo) y queda
`pendiente` hasta que `super_admin`/`direccion`/`gerente_comercial` la
resuelve (`POST /api/ventas/devoluciones/[id]/resolver`, con notas
obligatorias) — resolver **no** regresa la cotización/pedido a
`cancelada`/`cancelado`: `en_devolucion` es su estado final mientras no
exista Facturación (RTB-PRO-FAC-01). La NR y las reservas consumidas no se
tocan: siguen documentando lo que de verdad se entregó.

## 4. NR (Vía A) y liberación a Almacén

Antes de liberar el pedido, `POST /api/ventas/pedidos/[id]/nota-remision`
emite la NR (una por pedido; rechaza con `42501` un pedido
`via='orden_compra'` desde `044` — ese pedido ya tiene su PO, se surte por
§5 sin NR). Luego `POST .../liberar` promueve **todas** las reservas del
pedido a `nivel='compromiso'` con un solo `UPDATE` — no toca
`cantidad_apartada`, así "disponible" nunca descuenta la misma pieza dos
veces. La liberación es el mismo paso para ambas vías — Vía B también la
necesita antes de poder surtir (§5).

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

**Despacho de Vía B (`ventas_po_despachar()`, `044`)** — mismo mecanismo,
espejo estricto: `POST /api/ventas/ordenes-compra/[id]/despachar` con
`{ lineas: [{ po_partida_id, cantidad }] }`. Requiere que el pedido esté
`liberado`/`entregado_parcial` igual que la NR (§4), inserta el mismo
`inventario_movimientos` (`salida_venta`, `referencia_tipo=
'orden_compra_cliente'`, `referencia_folio` = folio de la PO), consume/
reinserta el remanente del apartado por el mismo `pedido_linea_id`, y
recalcula `po_estado` (`abierta → parcialmente_surtida → surtida`) y
`pedido_estado` en el mismo `UPDATE`. La UI vive en el detalle del
**pedido**, no en el de la PO — Almacén entra por ahí (no tiene acceso a
`/dashboard/ventas/ordenes-compra`).

## 6. PO del cliente — nace al aprobar, ya no se captura a mano

**Rediseñado 2026-08-08 (043/044).** Antes de este cambio, la PO se
registraba con `POST /api/ventas/ordenes-compra` y se validaba por
partida contra la NR con `ventas_po_validar()` — ver la versión anterior
de esta sección más abajo, sin editar, como registro de esa maquinaria
(sigue viva en el esquema pero inerte, para la Vía A). Ahora, si la
cotización se aprueba con `via='orden_compra'` (§3), la PO nace en la
misma transacción de `ventas_cotizacion_aprobar()`: folio `POC-000000`,
`numero_po` obligatorio (`numero_po_normalizado` respalda el mismo índice
único parcial de siempre — dos PO con el mismo número para la misma
entidad es un error de negocio, `22023`, no un `23505` crudo), y sus
partidas copiadas 1:1 de `ventas_pedido_lineas` con `pedido_linea_id`
poblado desde el nacimiento. El archivo que manda el cliente es opcional
al aprobar y también se puede subir/reemplazar después
(`PATCH .../evidencia`, `ventas_po_adjuntar_evidencia()`) — ambos caminos
terminan en el mismo bucket privado `evidencias-ventas`; `GET
.../evidencia` da la URL firmada de 60s para verlo (no existía ninguna
ruta de lectura para ese bucket antes de esto).

`po_estado` sigue el ciclo de surtido `abierta → parcialmente_surtida →
surtida → facturada → pagada_cerrada` (+ `cancelada`) — ver §5 para el
despacho. Ya no hay alta manual: `revoke insert` sobre
`ventas_ordenes_compra_cliente`/`ventas_po_partidas` para `authenticated`,
misma convención que `ventas_pedidos` (sólo `select` + funciones
`SECURITY DEFINER`).

<details>
<summary>Versión anterior de esta sección (Vía A, validación por
partida) — conservada como registro, la maquinaria sigue en el esquema
pero inerte</summary>

`POST /api/ventas/ordenes-compra` registraba la PO (folio interno
`POC-000000`, `numero_po_normalizado` respalda el índice único parcial —
una PO ya viva con ese número para la misma entidad es una posible
duplicada, incidencia, no asunción automática). `POST .../[id]/partidas`
capturaba cada renglón declarado por el cliente. `POST .../[id]/validar`
(`ventas_po_validar()`, `033`) cruzaba, **siempre en SQL sobre `numeric`**
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
   vínculo nacía `rechazado_por_duplicidad` y la PO quedaba
   `pendiente_de_confirmacion`, salvo autorización `duplicidad_confirmada`.

"Cantidad/monto respaldado por PO" se calculaba siempre por agregación
sobre `ventas_po_nr_vinculos` filtrando por estado — nunca un contador.
Dos *constraint triggers* diferidos (`vinculo_valida_cobertura_nr`/
`_partida`) eran la última barrera contra el doble conteo.

**Cancelar un vínculo capturado por error** (`ventas_vinculo_cancelar()`,
`036`): nunca borraba la fila — la marcaba `estado='cancelado'` con
`cancelado_at`/`cancelado_por`/`motivo_cancelacion` (obligatorio), y
recalculaba el estado de la PO y de la NR **hacia atrás** (el `CASE` de
`ventas_po_validar()` de arriba sólo avanzaba). Con cero vínculos activos
en toda la PO, el estado volvía a `en_validacion` (no
`parcialmente_vinculada`, que con cero cobertura sería engañoso); la NR
volvía a `entregada_sin_po` si su cobertura llegaba a cero. Bloqueada si
el vínculo ya estaba `aprobado_para_facturacion`/`facturado`. El índice
`uq_vinculo_par` excluye `estado='cancelado'`, así que el mismo par
partida↔línea de NR se puede volver a vincular después sin chocar —
sigue siendo cierto, es lo que espera la Vía A cuando se reconstruya.

</details>

## Qué puede fallar

| Síntoma | Causa |
|---|---|
| "Elige un precio... / producto sin costo no se cotiza" | `cot_linea_precio_chk` / el trigger no encontró precio para el `precio_origen` elegido |
| "Hay N línea(s) en consulta con Compras" | `ventas_cotizacion_enviar()` — falta que Ventas elija precio en alguna línea ya respondida por Compras |
| "No se puede crear/aprobar/enviar: [motivo de cartera]" | `cliente_puede_operar()` — congelada, en revisión o bloqueada administrativamente |
| "La cotización ya expiró: no se puede aprobar" | `vigencia_hasta` pasada — se valida por fecha, no por estado |
| "Unidad de captura incompatible con el producto" | La unidad de la línea no es la base ni la de contenido del producto |
| "No hay una reserva comprometida para la línea de esta NR..." / "...para esta partida..." | Se intentó despachar (NR o PO) sin haber liberado el pedido primero |
| "La reserva comprometida no alcanza para despachar/surtir esa cantidad..." | Se intentó despachar más de lo reservado para esa línea de pedido/partida |
| "Falta el número de PO del cliente para aprobar por esta vía" | `via='orden_compra'` sin `numero_po` en el body de `.../aprobar` (`043`) |
| "Ya existe una PO con ese número para este cliente — revisa si es duplicada" | `uq_po_numero` — mismo `numero_po_normalizado` (mayúsculas/espacios ignorados) para la misma entidad, ya no cancelada |
| "Este pedido se aprobó como orden de compra del cliente: se surte desde la PO, sin nota de remisión" | Se intentó `ventas_nr_emitir()` sobre un pedido `via='orden_compra'` (`044`) |
| "Esta orden de compra ya no admite surtido (estado %)" / "...ya está cancelada" / "...ya tiene mercancía surtida: la salida es una devolución, no una cancelación" | Transición de PO fuera de su estado permitido — `ventas_po_despachar()`/`ventas_po_cancelar()` |
| "No puedes resolver tu propia solicitud" | Anti-autoaprobación (`ventas_autorizaciones`/`cliente_excepciones`) — mecanismo intacto para la Vía A, aunque hoy nadie genera solicitudes nuevas de PO |
| "Sólo se cancela una cotización aprobada" | Se intentó cancelar un `borrador` (elimínalo) o una `enviada` (recházala) |
| "Sólo se elimina una cotización en borrador" | `ventas_cotizacion_eliminar()` — la cotización ya no está en `borrador` |
| "Esta cotización ya no admite editar sus líneas (estado %)" | El candado total de `ventas_cotizacion_linea_before_write()` — fuera de `borrador`/`enviada` |
| "Sólo se borran líneas mientras la cotización está en borrador" | DELETE de línea denegado por RLS (0 filas, sin excepción) — la cotización ya no es `borrador` |
| "Esta devolución ya está resuelta" | Doble resolución — idempotencia de `ventas_devolucion_resolver()` |

## Pendiente (fuera de esta entrega)

- **Vía B cerrada 2026-08-08 (043/044)** — ya no está pendiente: la PO
  nace al aprobar y se despacha con `ventas_po_despachar()`, ver §3/§5/§6.
- **Vía A cerrada 2026-08-08 (046-051, sesión concurrente con la de
  arriba)** — ya no está pendiente: desde el tablero de NR se registra la
  PO que llega DESPUÉS de una o varias NR ya emitidas, con partidas de
  respaldo (ya entregadas, usando `ventas_po_nr_vinculos` y sus 2
  *constraint triggers* diferidos, que sí se reutilizaron) y por entregar
  (de una cotización existente o nuevas del catálogo, surtidas contra la
  PO igual que la Vía B). No se restauró `ventas_po_validar()` — el
  bloqueo por precio distinto congela la PO completa vía
  `ventas_autorizaciones.precio_po_divergente`, no el cruce de
  moneda/RFC/costo/código/duplicidad que describe el `<details>` de §6.
  Detalle completo en `CLAUDE.md` → Historial (2026-08-08, Vía A).
- **Permisos de PO entre vendedores — sigue sin resolverse, ahora aplica a
  ambas vías.** `030:165-168` discutía si una PO consolidada podía
  involucrar NR de otro vendedor del mismo cliente. La Vía A nueva no
  filtra por `vendedor_id` al elegir qué NR respaldar (asume que sí puede,
  consistente con esa nota) — sigue siendo una decisión pendiente de
  confirmar con el dueño del proyecto, no tomada por suposición (ver
  `contexto/AUDITORIA_RTB-VEN-01.md` §3.6 y TODO de `CLAUDE.md`).
- **Vía A — alcance dejado fuera de la entrega de 046-051**:
  `ventas_po_devolver()` (una PO puramente de partidas nuevas puede abrir
  devolución por esquema pero no hay función que la abra), ampliar una PO
  con líneas de otra cotización (`ventas_po_ampliar()` sólo admite
  respaldo/partidas nuevas), y los tipos de autorización de la Vía A
  original (`excepcion_subtotal`/`codigo_divergente`/
  `duplicidad_confirmada`) siguen sin productor.
- **`ventas_po_cancelar()` sin botón en la UI** — existe (`044`) pero la
  cancelación de negocio real sigue siendo "Cancelar cotización" (§3b),
  que también cancela la PO en su rama sin entrega.
- **Cierre de una PO tras resolver su devolución** — no construido; una PO
  con entrega parcial/total que terminó en devolución (§3b) se queda
  `parcialmente_surtida`/`surtida` para siempre.
- El resto de los pendientes de RTB-VEN-01 (reloj de cobranza/CFDI) sigue
  en el TODO de `CLAUDE.md` — el emparejamiento apartado↔línea (antes
  hallazgo crítico #1) ya se corrigió en `035`, ver §5 arriba.
- El reloj de cobranza, CFDI y pagos son RTB-PRO-FAC-01 (Facturación),
  módulo futuro. `nr_estado` ya incluye `facturada`/`pagada_cerrada`, pero
  ninguna función de este módulo los escribe.
