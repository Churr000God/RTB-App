# RTB-VEN-01 | Ventas

**Proyecto:** Refacciones Tomás Badillo, S.A. de C.V.
**Submódulo:** RTB-VEN-01 Ventas (cotización → PO vinculada)
**Versión:** 1.0
**Fecha:** 2026-08-07
**Estado:** Implementado — primera entrega (Vía A completa, Vía B pendiente)

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
| `ventas_cotizaciones` | borrador·enviada·aprobada·rechazada·expirada·cancelada | Ventas (enviar/rechazar/cancelar), el sistema (expirar por vigencia), Ventas+evidencia (aprobar) |
| `ventas_pedidos` | (ver `db/ESQUEMA.md`) | Creado sólo por `ventas_cotizacion_aprobar()`; liberado a Almacén sólo por `ventas_pedido_liberar_almacen()` |
| `ventas_notas_remision` | 10 estados, incluye `facturada`/`pagada_cerrada` sin escribir todavía | Ventas/Almacén (emitir, despachar), Facturación (módulo futuro) |
| `ventas_ordenes_compra_cliente` | 8 estados | Ventas (registrar, validar), resultado de `ventas_po_validar()` |
| `ventas_po_nr_vinculos` | 8 estados | Resultado de `ventas_po_validar()`, nunca escrito a mano |

## 6. PO↔NR — tabla de asignación por partida, no relación simple

El documento original describe "N NR → 1 PO" como si fuera una relación de
agrupación simple (varias NR bajo una sola PO). La implementación es más
fina: **`ventas_po_nr_vinculos` es una tabla N:M por partida** — cada
renglón de la PO (`ventas_po_partidas`) se puede cubrir con partes de
varias NR, y cada NR se puede repartir entre varias partidas de PO. La
cobertura se calcula siempre por agregación con filtro de estado, nunca
por un contador, respaldada por dos *constraint triggers* diferidos que
impiden que la suma cubierta exceda ni lo entregado por la NR ni lo
declarado por la partida.

`ventas_po_validar()` cruza, siempre en SQL sobre `numeric` (nunca
comparando floats en TypeScript): moneda → RFC → costo unitario por
partida (**una sola partida divergente bloquea la PO completa**, sin
excepción salvo subtotal coincidente con autorización de Dirección) →
código de producto divergente (criterio del vendedor si costo/subtotal ya
cuadraron) → duplicidad (cobertura que excedería lo ya entregado —
incidencia, nunca asumida automáticamente).

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

- **Vía B (PO directa, sin NR)** — sin función de despacho dedicada;
  pendiente decidir con el dueño del proyecto si se construye o se
  descarta si en la práctica toda venta real pasa por NR.
- **Reloj de cobranza/CFDI/pago** — RTB-PRO-FAC-01, módulo futuro.
- **Clasificación de discrepancias del puente conteo→ajuste** (hallazgo de
  RTB-INV-01, no de este módulo, documentado aparte en CLAUDE.md TODO).
- **Clic a clic con sesiones reales de rol** — esta entrega se verificó por
  SQL simulando rol + `docker build --target builder`, no con un recorrido
  manual en la app con los 8 usuarios QA ya existentes.

---

*Módulo RTB-VEN-01 · Refacciones Tomás Badillo, S.A. de C.V. · V1.0 ·
2026-08-07*
