# RTB-VEN-01 | Ventas

**Proyecto:** Refacciones Tomás Badillo, S.A. de C.V.
**Submódulo:** RTB-VEN-01 Ventas (cotización → PO vinculada)
**Versión:** 1.1 (actualizado 2026-08-08 — ver nota abajo)
**Fecha:** 2026-08-07
**Estado:** Implementado — Vía A y Vía B completas (Vía B cerrada
2026-08-08, migraciones 043/044); Vía A **de PO tardía** (la que llega
DESPUÉS de una NR) pendiente — ver §6/§10

> **Actualización 2026-08-08:** el resto de este documento describe el
> diseño original del 2026-08-07 ("Vía B pendiente", validación de PO por
> partida contra NR). Ese diseño de Vía B se **reemplazó** — la PO ya no
> se captura a mano y valida contra la NR; nace directamente al aprobar la
> cotización, con sus partidas copiadas del pedido. El texto original se
> conserva abajo sin editar como registro histórico; §6 y §10 tienen notas
> explícitas de qué cambió y por qué. Ver `CLAUDE.md` → Historial
> (2026-08-08, cierre de jornada) para el detalle completo.

> Este documento **manda** sobre `contexto/RTB-PRO-VEN-01_Modulo_Ventas.md`
> para todo lo que ya está implementado. Ese documento describe el proceso
> de negocio en clave Notion (6 estados de NR, "N NR → 1 PO" como relación
> simple, sin modelo de datos ni reglas de precio) y sigue siendo la
> referencia del **proceso puro** para quien no toca código. A diferencia
> de RTB-ENT-01/RTB-INV-01, aquí no hubo un paquete externo con
> contradicciones que auditar — el diseño técnico se cerró en vivo con el
> dueño del proyecto, vía preguntas dirigidas, antes de escribir una sola
> migración. El detalle completo de esas decisiones (incluidas las
> correcciones sobre respuestas iniciales) vive en
> `sessions/2026-08-07-modulo-ventas.md`; este documento describe lo que
> realmente quedó implementado.

## 1. Objetivo y alcance

Cubre desde que el vendedor cotiza hasta que la PO del cliente queda
**vinculada por partida** contra la(s) Nota(s) de Remisión que cubre. Es el
punto de entrada de la operación comercial y el handoff hacia Almacén (ya
existente, RTB-INV-01) y hacia Facturación (módulo futuro).

**Dentro de alcance:** precio de venta con tres orígenes y snapshot
inmutable, Compras-ligero formalizado como precondición dura, cotización
con estados propios, congelamiento de cartera a nivel Entidad, pedido +
reserva/compromiso de inventario, Nota de Remisión con despacho real al
kardex (Vía A), PO del cliente con validación de costo por partida y
vínculo N:M contra NR.

**Fuera de alcance de esta entrega** (ver §7 Pendiente):

- **Vía B** (PO directa del cliente, sin NR previa) — el documento original
  (`RTB-PRO-VEN-01`, Paso 5) la describe como camino alterno; el esquema la
  admite (no hay ninguna restricción que la excluya) pero no existe una
  función de despacho que mueva kardex sin pasar por una NR.
- El **reloj de cobranza de 90 días, CFDI y pago** — `RTB-PRO-FAC-01`,
  módulo futuro. `nr_estado` ya incluye `facturada`/`pagada_cerrada` pero
  ninguna función de esta entrega los escribe.
- Cálculo automático de antigüedad de saldo vencido para congelar cartera —
  se sigue registrando a mano por Dirección, sin facturas de las que
  derivarlo todavía.

## 2. Modelo de datos

Implementado en `db/migrations/028_ventas_precios.sql` …
`034_ventas_tablero.sql` (7 migraciones, ~20 tablas, ~30 funciones
`SECURITY DEFINER`). Ese es el DDL autoritativo — detalle completo tabla
por tabla, función por función, en `db/ESQUEMA.md` §RTB-VEN-01. Resumen:

| Migración | Qué agrega |
|---|---|
| `028` | `producto_familias.margen_porcentaje`, `producto_precio_venta` (override), `costo_promedio_global()` (nueva, pondera todas las ubicaciones), `costo_venta_vigente()`/`_detalle()`; estrecha `producto_precios_referencia` para excluir a `ventas` de insert/update |
| `029` | `clientes.requiere_po`/`tipo_cliente`; `cliente_congelamientos`, `cliente_excepciones`; `cliente_puede_operar()` — el veredicto único de cartera; bucket `evidencias-ventas` |
| `030` | `ventas_cotizaciones`, `ventas_cotizacion_lineas` (snapshot de precio inmutable), `ventas_consultas_compras` (Compras-ligero formalizado), `ventas_aprobaciones` |
| `031` | `ventas_pedidos`, `ventas_pedido_lineas`; extiende `inventario_apartados` con `nivel` (`reserva`\|`compromiso`) + `pedido_id`; `ventas_cotizacion_aprobar()`, `ventas_pedido_liberar_almacen()` |
| `032` | `ventas_notas_remision`, `ventas_nr_lineas`, `ventas_nr_seguimientos`; `ventas_nr_emitir()`, `ventas_nr_despachar()` (el despacho real al kardex) |
| `033` | `ventas_autorizaciones`, `ventas_ordenes_compra_cliente`, `ventas_po_partidas`, `ventas_po_nr_vinculos` (N:M por partida); `ventas_po_validar()` |
| `034` | `tiene_operaciones_abiertas()` (cierra un TODO de `002`, desde siempre `false`), `ventas_tablero_nr()`, `ventas_kpis()`, `ventas_cotizaciones_expirar()` |

## 3. Precio de venta — tres orígenes, uno se fotografía

El vendedor elige, por línea, entre:

1. **Costo Refacción** / **Costo Ariba** — `producto_precios_referencia`
   (010, canal vigente). `ventas` sólo lee estos dos precios desde `028`;
   los mantiene Compras/Dirección/super_admin.
2. **Costo de Venta** — fórmula viva: `costo_promedio_global(producto) ×
   (1 + margen_porcentaje de la FAMILIA)`. Si alguien la ajusta a mano,
   queda un **override** (`producto_precio_venta`) que congela la fórmula
   hasta que se revierta explícitamente ("volver a la fórmula").

Cualquiera que sea el origen elegido, el trigger
`ventas_cotizacion_linea_before_write()` resuelve `precio_unitario` **en
ese momento** y lo congela en la línea: cambios posteriores al margen, al
costo o al override nunca mueven una línea ya fotografiada — ni siquiera
si la cotización sigue en borrador con otra línea del mismo producto (cada
línea se resuelve de forma independiente, al momento de su propio alta o
cambio de origen). Este es el comportamiento que el dueño del proyecto
confirmó explícitamente con un ejemplo concreto (cliente A cotizado a $7,
cotización expira, mismo cliente vuelve con el costo en $8 → la nueva
cotización usa $8, la expirada sigue en $7 como historial intacto; al día
siguiente otro cliente cotiza el mismo producto a $7.50 sin que la
cotización de $8 ya aprobada se altere).

Una línea sin precio resoluble (familia sin margen configurado, canal sin
precio de referencia) no se puede fotografiar — `22023`, "elige un precio
para esta línea" en la UI. Una familia sin margen no es un bug: es la
señal para que Dirección lo configure (`/dashboard/catalogos`).

## 4. Compras-ligero — precondición dura

A diferencia del Paso 3 del documento original (una consulta informal que
Ventas podía saltarse si el producto ya existía), aquí es una precondición
estructural: **un producto sin costo real de proveedor no se puede
cotizar**, punto. Cuando el producto no existe todavía, el vendedor levanta
`ventas_consultas_compras` con descripción libre (marca/modelo/número de
parte/cantidad/urgencia) y agrega una línea con `consulta_id` — sin
`producto_id`, sin `precio_origen` — que queda `en_consulta=true`. Compras
da de alta el producto por sus rutas normales (con costo real del
proveedor) y responde la consulta, propagando `producto_id` a la línea —
que sigue `en_consulta=true` hasta que el vendedor elige `precio_origen`.
Una cotización no se puede enviar al cliente mientras exista una sola
línea en consulta (sin envío parcial).

## 5. Estados por documento — independientes, no uno compartido

A diferencia del ciclo de vida único de 6 estados del documento original
(pensado sólo para la NR), la implementación separa un estado por tipo de
documento porque cada uno tiene su propia máquina de transiciones:

| Documento | Estados | Quién transiciona |
|---|---|---|
| `ventas_cotizaciones` | borrador·enviada·aprobada·rechazada·expirada·cancelada·en_devolucion (§5b, 2026-08-08) | Ventas (enviar/rechazar/cancelar/eliminar), el sistema (expirar por vigencia), Ventas+evidencia (aprobar) |
| `ventas_pedidos` | (ver `db/ESQUEMA.md`) | Creado sólo por `ventas_cotizacion_aprobar()`; liberado a Almacén sólo por `ventas_pedido_liberar_almacen()` |
| `ventas_notas_remision` | 10 estados, incluye `facturada`/`pagada_cerrada` sin escribir todavía | Ventas/Almacén (emitir, despachar), Facturación (módulo futuro) |
| `ventas_ordenes_compra_cliente` | 8 estados | Ventas (registrar, validar), resultado de `ventas_po_validar()` |
| `ventas_po_nr_vinculos` | 8 estados | Resultado de `ventas_po_validar()`, nunca escrito a mano |

## 5b. Rechazar, cancelar, eliminar y devoluciones (actualizado 2026-08-08)

Rediseño pedido por el dueño del proyecto tras la primera entrega —
sustituye por completo la redacción original de `cancelar()` de §5/§9 de
`sessions/2026-08-07-modulo-ventas.md`. Detalle técnico completo,
verificación y bugs cerrados en el proceso: `db/procesos/ciclo-de-venta.md`
§3b y `sessions/2026-08-08-ciclo-cotizacion-devoluciones.md`.

- **`rechazada`** — el cliente dijo que no a una cotización **enviada**.
  Sin cambio de comportamiento respecto a la primera entrega.
- **`cancelada`** — el cliente se retractó de una cotización **aprobada**,
  y sólo si su pedido no muestra ninguna entrega (`ventas_pedidos.estado`
  distinto de `entregado`/`entregado_parcial`). Cascada completa: libera
  las reservas de `inventario_apartados`, cancela la NR si existe (aún sin
  despacho) y marca el pedido `cancelado` — los tres con motivo y autoría
  obligatorios. Antes de este cambio no existía ninguna vía para deshacer
  una aprobación; `pedido_estado.'cancelado'` era un valor de enum muerto
  desde `031`.
- **`en_devolucion`** — si al intentar cancelar una aprobada el pedido ya
  tiene entrega (total o parcial), no se cancela nada del pedido/NR/
  apartados (siguen reflejando lo que de verdad salió) — se abre una fila
  de seguimiento en `ventas_devoluciones` (folio, motivo, `valor_entregado`
  informativo, `pendiente`/`resuelta`) y la cotización/pedido pasan a
  `en_devolucion`. Alcance explícitamente limitado a seguimiento: **sin
  reembolso ni CFDI real** todavía — eso es RTB-PRO-FAC-01, módulo futuro
  (ver §10). `super_admin`/`direccion`/`gerente_comercial` la marcan
  `resuelta` a mano desde `/dashboard/ventas/devoluciones` una vez que el
  proceso físico/administrativo fuera del sistema termina.
- **Eliminar una cotización** — sólo en `borrador`, sólo por completo
  (`ventas_cotizacion_eliminar()` borra sus líneas y la cabecera en una
  sola transacción; no hay eliminación parcial). Una línea individual
  también se puede borrar sola mientras la cotización siga en `borrador`
  (`DELETE` real, no una bandera).
- **Editar líneas en `enviada`** — antes sólo `borrador` podía editar
  producto/precio/cantidad/descuento de una línea; ahora `enviada` tiene
  exactamente el mismo poder (el cliente sigue negociando después del
  envío). De paso se cerró un hueco real: fuera de `borrador`/`enviada`
  (es decir, con la cotización ya `aprobada` o posterior) **ningún** campo
  de línea es editable — antes `cantidad`/`descuento_porcentaje`/`activo`
  sí lo eran, sin que nada lo impidiera.

## 6. La PO nace al aprobar (Vía B) — la validación por partida era para la Vía A

**Corregido/rediseñado 2026-08-08 (043/044).** El documento original
describía "N NR → 1 PO" con una tabla de asignación N:M por partida
(`ventas_po_nr_vinculos`) y una función `ventas_po_validar()` que cruzaba,
siempre en SQL sobre `numeric`, moneda → RFC → costo unitario por partida
→ código de producto divergente → duplicidad. Esa maquinaria existía para
un escenario concreto: una PO capturada a mano que hay que **auditar**
contra lo que ya se entregó por NR, porque la recaptura puede divergir.

El dueño del proyecto pidió invertir el flujo — al aprobar una cotización
se elige la vía (NR o PO del cliente), y si es PO, ésta **nace ahí
mismo**, con sus partidas copiadas 1:1 de las líneas del pedido recién
creado. Al nacer de datos consistentes por construcción, ya no hay nada
que auditar: la validación por partida deja de tener sentido, y con ella
los estados `recibida`/`vinculada` de `po_estado`, que ahora sigue el
ciclo de surtido `abierta → parcialmente_surtida → surtida → facturada →
pagada_cerrada` (+ `cancelada`) — la PO pasa a gobernar la entrega del
pedido, igual que hace la NR en la Vía A. `ventas_po_despachar()` (espejo
de `ventas_nr_despachar()`) surte directo al kardex sin pasar por
ninguna NR.

`ventas_po_validar()`/`ventas_vinculo_cancelar()` se retiraron. La tabla
`ventas_po_nr_vinculos`, el enum `vinculo_estado`, sus 2 *constraint
triggers* diferidos, y la bandeja de Autorizaciones/
`ventas_autorizacion_resolver()` se **conservaron intactos, inertes** —
son exactamente lo que hace falta para la **Vía A** (una PO que llega
DESPUÉS de una NR, sin que la cotización se haya aprobado como PO),
deliberadamente fuera de esta entrega. Ver §10 y `CLAUDE.md` TODO.

## 7. Congelamiento de cartera — a nivel Entidad, tablas nuevas

Separado de `entidades.estado` (que sigue siendo sólo el bloqueo
administrativo que ya usaba Dirección antes de este módulo).
`cliente_congelamientos`/`cliente_excepciones` son tablas nuevas;
`cliente_puede_operar(entidad_id)` es el veredicto único
(`normal`/`descongelada`/`excepcion_autorizada`/`en_revision`/
`congelada`/`bloqueada`) que bloquea crear/enviar/aprobar cotización,
emitir NR y liberar a Almacén. Anti-autoaprobación estructural (`CHECK
autorizador_id <> solicitante_id`) en excepciones y en autorizaciones de
PO — nunca resuelve el propio solicitante.

## 8. Roles

Cotizar/enviar/aprobar/emitir NR/registrar y validar PO: `ventas` (sólo lo
propio), `direccion`, `super_admin`. Despachar NR y liberar a Almacén: los
anteriores + `almacen`. Responder una consulta de Compras-ligero:
`compras`/`direccion`/`super_admin` — nunca `ventas`, que sólo la levanta.
Resolver una autorización o excepción: sólo `direccion`/`super_admin`, y
nunca el propio solicitante.

## 9. Conexión con otros módulos

| Módulo | Punto de conexión |
|---|---|
| RTB-INV-01 (Inventario) | Reserva/compromiso sobre `inventario_apartados` ya existente; el despacho de NR inserta directamente en `inventario_movimientos` (kardex real, no una tabla paralela) |
| Compras (futuro, RTB-PRO-COM-01) | Compras-ligero es la única superficie de contacto en esta entrega — Ventas nunca da de alta producto/costo por sí misma |
| Facturación (futuro, RTB-PRO-FAC-01) | `nr_estado`/`po_estado` ya modelan `facturada`/`pagada_cerrada`; ese módulo es quien los escribirá |
| Entidades (RTB-ENT-01) | `cliente_puede_operar()` combina el bloqueo administrativo de `entidades.estado` (sin tocarlo) con el congelamiento de cartera nuevo |

## 10. Pendiente

Ver también CLAUDE.md → TODO.

- **Vía B (PO directa, sin NR) — cerrada 2026-08-08 (043/044).** La PO
  nace dentro de `ventas_cotizacion_aprobar()` y se despacha con
  `ventas_po_despachar()`, sin NR. Verificado por SQL con rol real y clic
  a clic (`qa.ventas`/`qa.almacen`), incluido el kardex real confirmado
  por SQL directo. Ver §6.
- **Vía A (PO que llega DESPUÉS de una NR)** — deliberadamente fuera de la
  entrega de 043/044, para otra sesión. La maquinaria de vínculos PO↔NR
  por partida y la bandeja de Autorizaciones se conservaron inertes, no se
  reconstruyeron desde cero.
- **Reloj de cobranza/CFDI/pago** — RTB-PRO-FAC-01, módulo futuro.
- **Clasificación de discrepancias del puente conteo→ajuste** (hallazgo de
  RTB-INV-01, no de este módulo, documentado aparte en CLAUDE.md TODO).
- **Clic a clic con sesiones reales de rol** — cerrado para el ciclo de
  cotización→pedido→NR→despacho (2026-08-07) y para la Vía B PO
  (2026-08-08, `qa.ventas`/`qa.almacen`). Pendiente sólo para lo que
  vuelva a construirse en la Vía A.

---

*Módulo RTB-VEN-01 · Refacciones Tomás Badillo, S.A. de C.V. · V1.0 ·
2026-08-07*
