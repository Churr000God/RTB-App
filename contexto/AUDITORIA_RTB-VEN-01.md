# Auditoría — Módulo RTB-VEN-01 (Ventas), primera entrega

Fecha: 2026-08-07 (mismo día del cierre de `sessions/2026-08-07-modulo-ventas.md`).
Auditoría de punta a punta pedida por el dueño del proyecto tras terminar el
módulo con los 8 roles involucrados. La sesión de construcción documentó
explícitamente que **no hizo clic a clic con sesiones reales de rol** — toda
su verificación fue SQL simulando rol + `docker build --target builder`
(§5 de esa sesión). Esta auditoría revisó las 7 migraciones (`028`–`034`,
~3,150 líneas SQL), toda la capa `app/lib/ventas/*`, las ~36 rutas de API y
las pantallas de mayor complejidad de negocio (cotización, PO/vínculos), y
**reprodujo en vivo contra la base de datos real de Supabase** (dentro de
una transacción con `ROLLBACK` — cero datos persistidos) el ciclo completo
cotización → aprobación → NR → despacho, para verificar una sospecha de bug
que la sola lectura del SQL ya hacía evidente.

**Actualización 2026-08-07 (misma fecha, sesión posterior)** — el dueño del
proyecto pidió cerrar el hueco declarado en §5: verificación clic a clic
con la extensión Claude in Chrome, con los 8 usuarios QA reales, creando
datos de prueba **desde la interfaz** (el catálogo seguía vacío). El
recorrido completo (config de margen → alta de producto → carga inicial de
existencia vía Ajuste autorizado → cotización con 2 líneas del mismo
producto → envío → aprobación → NR → liberación → despacho) **confirmó el
hallazgo #1 con datos 100% reales y persistidos** (no sólo con el
`ROLLBACK` de la sesión anterior) y encontró **un defecto nuevo más grave
en términos de UX: un crash de React que bloqueaba por completo el alta de
cualquier línea de cotización desde el navegador** — corregido en el
momento por ser de una sola línea y bloquear el resto de la verificación.
Detalle completo en §7.

## 0. Resumen ejecutivo

| Bloque | Estado |
|---|---|
| Precio (3 opciones, snapshot congelado) | 🟢 Trigger y `GRANT` restringido correctos; confirmado también clic a clic (§7) |
| Compras-ligero (consulta sin producto) | 🟢 Flujo de estados y propagación de `producto_id` correctos |
| Cotización → envío → aprobación (evidencia + pedido + reservas) | 🟢 Transacción atómica correcta, sin reservas huérfanas ante fallo |
| **Alta de línea de cotización desde el navegador** | 🔴 **Crash bloqueante confirmado y corregido en vivo — ver hallazgo #2 (§7.1)** |
| Congelamiento de cartera / excepciones | 🟢 `cliente_puede_operar()` consistente en los 4 puntos donde se invoca |
| NR — emisión y liberación a Almacén (reserva→compromiso) | 🟢 Un solo `UPDATE`, no toca el acumulador — correcto |
| **NR — despacho al kardex (`ventas_nr_despachar()`)** | ✅ **Corregido 2026-08-07 (`035`) — ver hallazgo #1** |
| PO del cliente — validación y vínculo por partida | 🟢 Orden de reglas (moneda→RFC→costo→excepción→código→duplicidad) correcto en SQL |
| Rendimiento / paginación del módulo nuevo | 🟡 2 hallazgos menores — ver §3 |
| Refresco de UI tras una mutación exitosa | ✅ **Corregido 2026-08-07 — ver §7.3** |
| UUID crudo de producto en líneas | ✅ **Corregido 2026-08-07 — ver §7.4** |
| Tarjeta "Ventas" del dashboard ("Próximamente") | ✅ **Corregido 2026-08-07 — ver §7.5** |
| "Costo vigente" no se refresca tras registrar costo | ✅ **Corregido 2026-08-07 — ver §7.6** |
| `get_advisors` (seguridad) | 🟢 Sin `ERROR` nuevo — sólo `WARN` de `SECURITY DEFINER`, patrón ya aceptado |

**Los dos hallazgos que hay que resolver antes de operar el módulo con usuarios reales:**

**#1 — `ventas_nr_despachar()` puede consumir la reserva equivocada (y rechazar un
despacho válido) cuando un pedido tiene dos o más líneas del mismo producto.**
Confirmado con reproducción en vivo por SQL (§1) y otra vez con datos reales
por navegador (§7.2).

**#2 — Antes de la corrección aplicada en esta sesión, la pantalla de
cotización truena al elegir cualquier producto para agregar una línea**,
por un `Tooltip` de Radix sin `TooltipProvider` — bloqueaba por completo el
alta de líneas desde el navegador. Ya corregido; detalle en §7.1.

## 1. Hallazgo crítico

**✅ Corregido 2026-08-07** — migración `db/migrations/035_apartados_pedido_linea.sql`,
aplicada sobre `RTB-App` (`dgafffpbhktxadiqmmwl`). Se añadió
`inventario_apartados.pedido_linea_id` (FK compuesta a
`ventas_pedido_lineas (id, pedido_id)`, `MATCH SIMPLE`), poblado desde
`ventas_cotizacion_aprobar()` al nacer cada reserva y respaldado por un
índice único parcial (`uq_apartados_pedido_linea_activo`: como máximo una
reserva activa por línea de pedido). `ventas_nr_despachar()` empareja
ahora por esa columna en vez de `producto_id` + `order by created_at
limit 1`. Los 3 apartados históricos de `PED-000019` (la evidencia de
este mismo hallazgo) se backfillearon en la misma migración — la
incoherencia que el bug dejó (línea A sub-reservada, línea B con un
apartado huérfano) se documentó tal cual, sin sanearla. Verificado con
matriz SQL (rol real simulado, `BEGIN/ROLLBACK`) y clic a clic con
usuarios QA reproduciendo el escenario exacto de abajo (§7.2) con datos
nuevos y persistidos. El hallazgo original se conserva íntegro a
continuación como registro de lo que falló y por qué.

### #1 (S1) — Emparejamiento apartado↔línea por sólo `producto_id`, sin identificar la línea de origen

**Dónde:** `db/migrations/032_ventas_nr_despacho.sql`, función
`ventas_nr_despachar()`:

```sql
select * into v_apartado from public.inventario_apartados
 where pedido_id = v_pedido.id and producto_id = v_nr_linea.producto_id
   and nivel = 'compromiso' and estado = 'activo'
 order by created_at
 limit 1
 for update;
```

**Causa raíz:** `inventario_apartados` (extendida en `031` con `nivel`/
`pedido_id`) no tiene ninguna columna que ligue una fila a la línea de
pedido/NR específica que la originó. `ventas_cotizacion_aprobar()` (031)
inserta un apartado por línea de pedido, pero sin guardar
`pedido_linea_id`. Si una cotización tiene **dos líneas del mismo
producto** — nada lo impide: `cotizacion-detalle.tsx` no valida
duplicados, y es un caso legítimo (dos partidas con distinto descuento, o
un vendedor que agrega una línea nueva en vez de editar la existente) — se
crean dos apartados con el mismo `producto_id` bajo el mismo pedido, y
`ventas_nr_despachar()` no tiene forma de saber cuál corresponde a la línea
de NR que se está despachando. `order by created_at limit 1` es, en la
práctica, una elección arbitraria entre las reservas del producto.

**Reproducción en vivo** (Supabase, proyecto `RTB-App`, `dgafffpbhktxadiqmmwl`;
todo dentro de `BEGIN; ... ROLLBACK;` — no quedó ningún dato persistido):

1. Familia temporal con margen 20%, producto temporal con existencia y
   costo, cliente QA ya existente (`f4b5ab7c…`, `requiere_po=false`).
2. Cotización con **línea A = 5 pzas** y **línea B = 3 pzas**, mismo
   producto, `precio_origen='costo_venta'`.
3. `ventas_cotizacion_enviar()` → `ventas_cotizacion_aprobar()`: crea el
   pedido y **2 apartados** `nivel='reserva'` (5 y 3).
4. `ventas_nr_emitir()` + `ventas_pedido_liberar_almacen()`: los 2
   apartados pasan a `nivel='compromiso'`.
5. Se despacha **primero la línea B (3 pzas)** — un orden perfectamente
   normal si Almacén surte por disponibilidad física, no por el orden en
   que Ventas capturó las líneas:
   - La API responde `{"success": true, "movimientos_generados": 1}`.
   - Pero **consumió el apartado de 5** (el de la línea A), no el de 3:
     quedó `estado='consumido'`, `motivo_liberacion='Despachado en
     NR-000013'`, y se creó un apartado remanente nuevo de **2**
     (`5 − 3`), también `compromiso`.
   - El apartado de 3 (el que en realidad pertenece a la línea B) quedó
     **intacto, sin tocar**.
6. Se despacha después **la línea A (5 pzas)**. El pedido sigue teniendo
   `3 + 2 = 5` unidades reservadas — exactamente lo necesario:
   - La función **rechaza el despacho**: `22023` — *"La reserva
     comprometida no alcanza para despachar esa cantidad del producto
     AUD-TEST-001."*
   - Porque su `LIMIT 1` sólo ve una fila a la vez (la de 3, la primera
     que encuentra), nunca la suma de ambas.

**Impacto de negocio:**
- Un despacho legítimo se puede **rechazar por una razón falsa** — bloquea
  a Almacén sin que haya ningún problema real de inventario.
- Incluso cuando la llamada "tiene éxito", el movimiento de kardex queda
  ligado al apartado de la línea equivocada — rompe la trazabilidad
  línea-de-NR ↔ movimiento-de-kardex que el resto del módulo da por
  sentada (`ventas_nr_cobertura()`, la vinculación PO↔NR por partida en
  `033` cruza contra `ventas_nr_lineas.cantidad_entregada`, que sí se
  actualiza correctamente — el error queda contenido en qué apartado
  específico se tocó, no en los totales — pero rompe la capacidad de
  auditar "qué salió del almacén para cuál línea").

**No es un problema de saldo total ni de doble descuento** — el
neto de `cantidad_apartada`/`cantidad_teorica` cuadra siempre (verificado
en el mismo repro): es exclusivamente un problema de **qué fila de
reserva** se asocia a **qué despacho**, y eso produce rechazos falsos y
trazabilidad incorrecta cuando hay líneas repetidas.

**Corrección sugerida (no aplicada — pendiente de confirmación para
programarla como tarea aparte, con su propia migración y verificación):**
añadir `pedido_linea_id` (o `nr_linea_id`) a `inventario_apartados`,
poblarlo desde `ventas_cotizacion_aprobar()` (031) al crear cada reserva, y
que `ventas_nr_despachar()` (032) filtre por esa columna en vez de sólo
`producto_id`. Es un cambio de esquema, no una corrección mecánica de una
línea — por eso no se aplicó en esta misma sesión de auditoría.

**Confirmación adicional con datos reales (§7.2):** el mismo escenario se
repitió clic a clic con la extensión Claude in Chrome — cotización real
(`COT-000039`), pedido real (`PED-000019`), NR real (`NR-000014`), usuario
`QA Almacén` — y el resultado fue idéntico al de la simulación por SQL: el
despacho de la línea de 3 piezas consumió el apartado de 5 (confirmado por
`SELECT` directo sobre `inventario_apartados`, sin `ROLLBACK` esta vez), y
el despacho posterior de la línea de 5 piezas fue rechazado en pantalla con
*"La reserva comprometida no alcanza para despachar esa cantidad del
producto RTB-FER-000006"* pese a que el pedido tenía exactamente 5 unidades
(3 + 2) todavía reservadas. Ya no es una simulación: es el comportamiento
real que vería Almacén el primer día que despache una NR con un producto
repetido.

## 2. Verificado y correcto

- **Los tres bugs que la propia sesión de construcción encontró y
  corrigió** (trigger `ventas_cotizacion_before_update()` que revertía sus
  propias escrituras; `CASE` sin cast en `nr_estado`; `GRANT INSERT` sin
  restricción de columna en `producto_familias`/`inventario_apartados`) —
  confirmado que las tres correcciones siguen aplicadas en el SQL vigente.
- **Saldo negativo del kardex ante una reserva sin existencia física**
  (`ubicacion_id NULL`, cero disponible): al despachar, el trigger del
  kardex bloquea correctamente con `P0001` en vez de fabricar una salida —
  es el comportamiento documentado ("un faltante se registra como
  discrepancia, no como salida directa"), no un bug.
- **`apartados_before_update()`/`apartados_before_insert()` — el neto de
  `cantidad_apartada` en un despacho parcial** (marcar el apartado
  original `consumido` + reinsertar el remanente como fila nueva) cuadra
  exactamente al monto realmente despachado, confirmado en el mismo repro
  del hallazgo #1 — el bug de ese hallazgo es de **emparejamiento**, no de
  aritmética del acumulador.
- **`cliente_puede_operar()`** se invoca de forma consistente en los 4
  puntos que deben bloquear operación sobre un cliente congelado/bloqueado:
  crear cotización, enviar, aprobar y liberar a Almacén.
- **Snapshot de precio** (`ventas_cotizacion_linea_before_write()`):
  `precio_unitario`/`costo_base_snapshot`/`margen_snapshot` sólo se
  recalculan en `INSERT` o cuando cambian `producto_id`/`precio_origen` —
  cambiar cantidad/descuento no reabre el precio ya fotografiado; una vez
  la cotización sale de `borrador`, el mismo trigger rechaza cualquier
  intento de tocar esas columnas.
- **Bloqueo total de PO por costo divergente** (`ventas_po_validar()`,
  033): confirmado en el código que una sola partida con costo distinto y
  subtotal distinto bloquea la PO completa sin excepción; la excepción por
  subtotal coincidente exige `autorizacion_id` de tipo `excepcion_subtotal`
  vigente y `estado='autorizada'`, verificado contra el mismo `documento_id`.
- **Anti-autoaprobación** (`ventas_autorizacion_resolver()`,
  `cliente_excepciones` vía `/api/ventas/excepciones/[id]/resolver`): el
  aprobador nunca puede ser el solicitante, reforzado tanto por `CHECK` en
  SQL como por comprobación explícita en la ruta/función.
- **`get_advisors` (seguridad)**: sin ningún `ERROR` nuevo. Los `WARN` que
  aparecen son exclusivamente `SECURITY DEFINER` callable por
  `authenticated`/`anon` — patrón ya documentado y aceptado en el proyecto
  desde `is_super_admin()` (001).

## 3. Rendimiento y optimizaciones

**Actualización 2026-08-07 (sesión aparte) — §3.1 a §3.6 atendidos.**
Detalle completo (decisiones, migración `036`, verificación por SQL y clic
a clic) en `sessions/2026-08-07-ventas-optimizaciones.md`. Resumen:
§3.1 corregida (consulta en dos oleadas, sin `select('*')` global); §3.2
corregida (6 endpoints + `cotizaciones`/`notas-remision` paginados,
contrato `{data,count,page,pageSize}`, 4 pantallas migradas a explorer);
§3.3 corregida — el conteo real era **7** evaluaciones de
`costo_promedio_global()` en el caso común (sin override), no 4 como
reportaba este hallazgo; bajó a 1 con `cross join lateral`, verificado
igual resultado en 7 escenarios comparativos; §3.4 corregida (selector de
autorización vigente en vez de copiar/pegar UUID, confirmado clic a clic:
solicitar como `ventas` → aprobar como `direccion` → aparece preseleccionada);
§3.5 corregida (`ventas_vinculo_cancelar()`, 036 — nunca borra, recalcula
PO/NR hacia atrás, bloqueada si ya hay consecuencia de facturación,
confirmado clic a clic con recálculo real de `parcialmente_vinculada`/
`parcialmente_respaldada`); §3.6 **sin cambio, documentado como pendiente**
(ver `db/procesos/ciclo-de-venta.md` y el TODO de `CLAUDE.md` — no hay
regla inequívoca en código/proceso para restringir por dueño).

### 3.1 (🟡) `/dashboard/ventas/ordenes-compra/[id]` trae `ventas_po_nr_vinculos` completa

`app/app/dashboard/ventas/ordenes-compra/[id]/page.tsx:21`:

```ts
supabase.from('ventas_po_nr_vinculos').select('*'),
```

Sin filtro alguno — trae **todos** los vínculos PO↔NR de **toda la
empresa** en cada vista de detalle de una PO, y filtra a los de esa PO
recién en el cliente (línea 46). Hoy no se nota (la tabla está vacía —
ver §5), pero es la misma clase de problema que ya se corrigió el
2026-08-07 en hallazgos/solicitudes/existencias (paginación real,
búsqueda server-side). Sugerido: partir la consulta en dos pasos
secuenciales (partidas primero, luego `.in('po_partida_id', partidaIds)`
sobre vínculos) en vez de un `Promise.all` que obliga a traer todo.

### 3.2 (🟡) Varios listados nuevos sin paginación

`GET /api/ventas/ordenes-compra`, `/consultas`, `/congelamientos`,
`/excepciones`, `/autorizaciones` y `/pedidos` hacen `select('*')` sin
`.range()`/parámetro `page`, a diferencia de `/api/ventas/cotizaciones`
(`PAGE_SIZE=20`, ya pagina) y `ventas_tablero_nr()` (`PAGE_SIZE=30`).
Mismo patrón que el proyecto identificó y corrigió como lección aprendida
el 2026-08-07 anterior (ver Historial de decisiones, `CLAUDE.md`) — vale
aplicarlo ahora que el módulo es nuevo, en vez de esperar a que crezca y
haga falta otra ronda de correcciones idéntica.

### 3.3 (🟢 menor) `costo_venta_detalle()` recalcula `costo_promedio_global()` hasta 4 veces

`028_ventas_precios.sql`: dentro de un mismo `SELECT`, `costo_venta_detalle()`
llama a `costo_promedio_global(p_producto_id)` directamente dos veces
(`'calculado'`, `'calculable'` vía `costo_venta_vigente()`) más las que
arrastra `costo_venta_vigente()` internamente. Una función `stable` no se
memoiza automáticamente entre llamadas repetidas dentro del mismo
`SELECT` en Postgres. Impacto bajo (se invoca una vez por línea cotizada o
por consulta de precio, nunca en un bucle masivo), pero es barato de
resolver con un `WITH costo AS (...)` que la calcule una sola vez.

### 3.4 (🟢 menor) Fricción de UX al pedir autorización de subtotal

`po-detalle.tsx`: cuando `ventas_po_validar()` devuelve
`requiere_autorizacion_subtotal` y el usuario pide la autorización, el
`id` retornado se muestra como texto para copiar/pegar a mano en el campo
de "ID de autorización" — funciona, pero podría autorellenarse una vez
que Dirección la resuelve (el flujo actual exige salir a `/dashboard/ventas/autorizaciones`,
copiar el id, y volver).

### 3.5 (🟢 menor) Sin forma de cancelar un vínculo PO↔NR ya creado

`vinculo_estado` incluye `'cancelado'` en el enum, pero ninguna función de
`028`–`034` lo escribe — si se captura un vínculo por error no hay forma
de deshacerlo salvo edición directa en SQL. No bloqueante hoy (el catálogo
está vacío), pero conviene resolverlo antes de que haya vínculos reales
capturados por error.

### 3.6 (🟢 menor) Posible discrepancia entre proceso documentado e implementación — validar PO sin restricción de dueño

`ciclo-de-venta.md` dice *"Registrar/validar una PO: igual que cotizar"* —
lo que en el resto del documento significa "`ventas` sólo sobre lo suyo".
Pero `ventas_ordenes_compra_cliente` no tiene columna `vendedor_id`, y
`ventas_po_validar()` no restringe por dueño: cualquier usuario `ventas`
puede validar/vincular la PO de cualquier cliente, sin importar quién
cotizó o vendió. Puede ser intencional (una PO consolidada de un cliente
grande no es necesariamente de un solo vendedor), pero vale confirmarlo
con el dueño del proyecto porque el texto del proceso sugiere lo
contrario.

## 4. Método

- Lectura completa de las 7 migraciones (`028`–`034`), `app/lib/ventas/*`
  (config, permisos, schemas, validaciones, errores), las ~36 rutas de
  `app/api/ventas/*` + `PATCH /api/entidades/[id]/politica-comercial`, y
  las pantallas de cotización y de PO/vínculos (las de mayor complejidad
  de negocio del módulo).
- Contraste contra `db/procesos/ciclo-de-venta.md` y
  `sessions/2026-08-07-modulo-ventas.md`.
- **Reproducción en vivo contra Supabase real** (`dgafffpbhktxadiqmmwl`),
  simulando el actor `ventas` vía `set_config('request.jwt.claim.sub', …)`,
  con datos 100% sintéticos (familia/producto/existencia temporales,
  cliente QA ya existente) insertados y consultados dentro de una única
  transacción cerrada con `ROLLBACK` — no quedó ningún registro
  persistido en la base de datos real.
- `mcp__Supabase__get_advisors` (seguridad) tras la revisión de código,
  sin aplicar ningún cambio.

## 5. Alcance no cubierto (transparencia)

- El catálogo de productos seguía **vacío** en Supabase al iniciar esta
  auditoría (0 filas — la carga de los 1,388 SKU reales de Notion sigue
  pendiente, TODO ya conocido en `CLAUDE.md`). La verificación por
  navegador (§7) creó sus propios datos de prueba desde la UI para no
  depender de esa carga — quedaron persistidos, ver §7.0.
- No se revisaron línea por línea las pantallas de autorizaciones,
  consultas, congelamientos, tablero, ni `types/ventas.ts` en el código
  fuente; sí se pasó por consultas, congelamiento y tablero clic a clic en
  §7, pero sin la misma profundidad de lectura de código que cotización/PO.
- ~~No se probó con sesiones de navegador reales~~ — cerrado en la sesión
  posterior: ver §7, verificación completa con Claude in Chrome y los 8
  usuarios QA.

## 6. Siguiente paso sugerido

**Hallazgo #1 ya corregido** (§1, `035_apartados_pedido_linea.sql`,
2026-08-07) — se dejó el texto original de esta sección tal cual (abajo)
para que quede constancia de la prioridad con la que se planteó en su
momento.

Priorizar la corrección del hallazgo #1 (§1, confirmado dos veces — por
SQL y por navegador con datos reales, §7.2) antes de que existan despachos
reales con cotizaciones que repitan producto. El hallazgo #2 (crash de
`Tooltip`, §7.1) ya se corrigió en esta misma sesión por ser una línea y
bloquear el resto de la verificación — `npx tsc --noEmit` ya confirmó sin
errores nuevos; falta sólo incluirlo en el próximo `docker build
--target builder` de cierre de jornada. El resto de los hallazgos de §3
y §7.3–§7.7 son mejoras o defectos menores, no bloqueantes.

**Actualización 2026-08-07 (sesión de corrección de UX)** — §7.3, §7.4,
§7.5 y §7.6 quedaron corregidos y verificados clic a clic (ver cada
subsección). Único pendiente de §7: §3 (rendimiento/paginación, fuera del
alcance de esa sesión). §7.7 no era un hallazgo, sólo una nota.

## 7. Verificación en vivo con navegador (Claude in Chrome)

Sesión posterior, mismo día. Se usaron los 8 usuarios
`qa.<rol>@qa.refacrtb.mx` (contraseña `RtbQA-2026!`, ya activos de
campañas QA anteriores) — nunca la cuenta real del dueño del proyecto. El
catálogo seguía vacío, así que los datos de prueba se crearon **desde la
interfaz**, como pidió el dueño del proyecto:

- Familia **Ferretería** con margen de venta 30% (`/dashboard/catalogos`,
  `QA Super Admin`).
- Producto **`RTB-FER-000006` — "QA-VEN Válvula de prueba auditoría"**
  (`/dashboard/productos/nuevo`), con un costo de catálogo de $100
  (pestaña Costos del producto).
- Existencia real de 20 piezas dada de alta por el circuito real de
  Ajustes (`AJU-000018`, tipo "Carga inicial", capturado por `QA Super
  Admin`, autorizado por `QA Dirección`, aplicado al kardex) — se
  necesitó porque dar de alta sólo el costo de catálogo no crea stock, y
  sin stock el despacho se bloquea por saldo negativo antes de poder
  probar nada más (ver §7.6).
- Cotización real **`COT-000039`** (`QA Ventas`, cliente `QA Cliente Uno`)
  con **dos líneas del mismo producto** (5 y 3 piezas, ambas a "Costo de
  Venta") — precisamente para poner a prueba el hallazgo #1 con el
  navegador, no sólo con SQL.
- Ciclo completo hasta despacho: pedido **`PED-000019`**, NR
  **`NR-000014`**, despachada en dos partes por `QA Almacén`.

Todos estos registros quedaron **persistidos** en Supabase (no se usó
`ROLLBACK` esta vez — es tráfico real de la app, mismo criterio que datos
`QA-*` de campañas anteriores ya presentes en el proyecto) y se dejan
como evidencia, siguiendo la convención ya establecida en el repo de no
purgar datos de prueba con prefijo `QA`.

### 7.1 (🔴→✅ corregido en esta sesión) — La pantalla de cotización truena al elegir cualquier producto

**Dónde:** `app/app/dashboard/ventas/cotizaciones/[id]/cotizacion-detalle.tsx`.

Al seleccionar un producto en el combobox de "Agregar línea", la pantalla
completa se caía con:

```
Unhandled Runtime Error
Error: `Tooltip` must be used within `TooltipProvider`
```

**Causa raíz:** el archivo usa `<Tooltip>`/`<TooltipTrigger>`/
`<TooltipContent>` de Radix (vía `components/ui/tooltip.tsx`) para
explicar por qué la opción "Costo de Venta" puede aparecer deshabilitada
— pero nunca los envuelve en un `<TooltipProvider>`, ni local ni global.
`grep -rl TooltipProvider app/ components/` sólo encontró un uso en todo
el repo (`app/dashboard/admin/users/page.tsx`) — no hay ningún provider
en `app/layout.tsx` ni en `app/dashboard/layout.tsx` que lo cubra. Radix
exige un `Provider` ancestro incluso si el `TooltipContent` condicional
nunca llega a renderizarse — el simple montaje de `<Tooltip>` sin
ancestro ya lanza.

**Impacto:** bloqueaba **por completo** el flujo principal del módulo —
ninguna línea de cotización se podía agregar desde el navegador, en
ningún rol. Es el hallazgo de mayor severidad práctica de toda la
auditoría, por encima incluso del #1: sin esto corregido, la verificación
del resto del ciclo (aprobar, NR, despachar, PO) habría sido imposible
por navegador.

**Corrección aplicada en el momento** (un cambio de una línea + un envoltorio local, sin tocar SQL ni API):

```diff
- import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
+ import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
```

y se envolvió el `<Tooltip>` de la línea ~381 en un `<TooltipProvider>`
local. Reproducido el error primero (screenshot del crash), aplicado el
fix, recargado, y confirmado que agregar la línea ya funciona sin error
— incluida la comparación visual del precio "Costo de Venta $130.00"
($100 × 1.30, el margen configurado). `npx tsc --noEmit` dentro del
contenedor (`docker compose exec web`) confirmó sin errores nuevos tras
el cambio.

### 7.2 (🔴 confirmado, sin corregir) — Hallazgo #1 reproducido con datos reales

Ver el bloque "Confirmación adicional con datos reales" al final de §1 —
mismo resultado que la simulación por SQL, esta vez con `COT-000039` /
`PED-000019` / `NR-000014` reales y sin `ROLLBACK`.

### 7.3 (🟡→✅ corregido 2026-08-07) Patrón repetido: la UI no refresca tras una mutación exitosa

**Corregido** en la sesión de UX del 2026-08-07 (`cotizacion-detalle.tsx`,
`pedido-detalle.tsx`, `nr-detalle.tsx`, `po-detalle.tsx`,
`cartera-comercial-tab.tsx`, `consultas-bandeja.tsx`,
`autorizaciones-bandeja.tsx`, `inventario/ajustes/[id]/page.tsx`,
`productos/[id]/producto-detalle.tsx`). Causa raíz doble: (1) las
pantallas de detalle espejaban las props del Server Component en
`useState(prop)` — `router.refresh()` re-renderiza con props frescas,
pero un `useState` sólo lee su argumento en el primer render, así que el
espejo nunca veía el dato nuevo; (2) el refetch de cliente que sí existía
no se esperaba antes de reactivar el botón y tragaba sus propios errores
en silencio. Se retiró el espejo (el Server Component pasa a ser la
única fuente de verdad; el estado de cliente sólo guarda lo que el
servidor no sabe — formularios, diálogos, resultados efímeros) y se
centralizó el patrón en un hook nuevo, `app/lib/ui/use-accion-servidor.ts`
(`ejecutar()` hace el `fetch` con `cache:'no-store'`, captura error de
red/servidor, y dispara `startTransition(() => router.refresh())` en
éxito). Verificado clic a clic con usuarios QA reales: agregar línea de
cotización, enviar/aprobar cotización (`COT-000061`), liberar
pedido/emitir NR (`PED-000041`), registrar seguimiento de NR
(`NR-000014`), y el ciclo completo de un Ajuste nuevo
(`AJU-000019`: agregar línea → enviar a autorización → autorizar →
aplicar al kardex) — los cuatro cambios de estado se vieron en pantalla
sin recargar, incluida la bandeja `/dashboard/inventario/ajustes` al
volver a ella (confirma que también se invalidó el Router Cache de Next,
no sólo la ruta activa).

---

*Texto original del hallazgo, conservado como registro de lo que se
encontró:*

En al menos **tres** puntos distintos del ciclo de Ventas, una acción que
la API confirma con éxito (`2xx`, verificado por `read_network_requests`)
**no actualiza lo que se ve en pantalla** hasta que el usuario recarga la
página a mano:

- **"Agregar línea"** en cotización: el `POST .../lineas` respondió `201`
  dos veces seguidas, pero la tabla de líneas se quedó mostrando sólo la
  primera hasta recargar.
- **"Aprobar (cliente aceptó)"** en cotización: el `POST .../aprobar`
  respondió `201` (pedido creado), pero el badge de estado se quedó en
  "Enviada" y los botones de acción no cambiaron hasta recargar.
- Mismo patrón, ya fuera de Ventas pero en el mismo circuito de
  verificación (Ajustes, RTB-INV-01): "Enviar a autorización",
  "Autorizar" y "Aplicar al kardex" — los tres `POST` devolvieron `2xx`
  pero la pantalla no reflejó el nuevo estado sin recargar.

**Impacto:** un usuario real, sin acceso a las herramientas de red que
usó esta auditoría, no tiene forma de saber si su clic funcionó — el
riesgo concreto es un **doble envío** (¿"no pasó nada", reintento?) sobre
una operación que en realidad sí se ejecutó, algo que el propio proyecto
ya identificó como patrón de riesgo real en otro contexto (B-01,
`contexto/QA_INTEGRAL_2026-08-06.md` — ahí era el servidor revirtiendo en
silencio; aquí el servidor sí persiste, es sólo el cliente el que no
vuelve a pedir los datos). Vale una revisión enfocada de qué acciones
mutantes del módulo llaman a `router.refresh()`/refetch después de un
`res.ok` y cuáles no.

### 7.4 (🟡→✅ corregido 2026-08-07) Varias pantallas muestran el UUID crudo del producto en vez de su nombre

**Corregido.** Se añadió el embed de PostgREST
`productos(codigo_interno, nombre)` en las consultas de servidor de
`ventas/cotizaciones/[id]/page.tsx`, `ventas/pedidos/[id]/page.tsx` y
`ventas/remisiones/[id]/page.tsx` (y en los `GET` equivalentes de la
API), copiando el patrón ya funcional de
`app/app/api/inventario/ajustes/[id]/route.ts`. Se creó un componente
compartido, `app/components/inventario/producto-etiqueta.tsx`
(`<ProductoEtiqueta>`), que pinta nombre sobre código interno y nunca el
UUID como texto visible (fallback a "Producto no disponible" con el
UUID sólo en `title=` para soporte); se usa en cotización (tabla y fila
"en consulta"), pedido, NR (tabla y diálogo de despacho) y también se
aplicó en Ajustes de inventario, que antes mostraba el nombre pero
perdía el código interno. Verificado clic a clic: `COT-000061`,
`PED-000041`, `NR-000014` (incluida la reproducción exacta del hallazgo
#1 con las líneas de 5 y 3 piezas — ambas muestran "QA-VEN Válvula de
prueba auditoría / RTB-FER-000006", ningún UUID) y `AJU-000019` muestran
código + nombre en cada tabla.

### 7.5 (🟡→✅ corregido 2026-08-07) Tarjeta "Ventas" del dashboard principal sigue etiquetada "Próximamente"

**Corregido.** `app/app/dashboard/page.tsx` mantenía su propio arreglo
`MODULE_CARDS` con el badge "Próximamente" hardcodeado para las 6
tarjetas, sin filtro por rol — una segunda lista, desincronizada de la
real (`NAV_SECTIONS` en `app/lib/rbac/config.ts`, que el sidebar ya usa y
donde Ventas dejó de tener `badge` desde que se activó el módulo). Se
sustituyó por `getNavForRole(role)` filtrando la sección "Módulos"
(constante `SECCION_MODULOS` exportada), con un mapa local sólo de
presentación (color, descripción) indexado por `href`; sin `badge` la
tarjeta ahora es un `<Link>` navegable, con `badge` sigue siendo un
recuadro atenuado no interactivo — mismo criterio que ya aplica el
sidebar. Verificado con `qa.almacen` y `qa.direccion`: Ventas aparece sin
"Próximamente" y es clicable; los otros 5 módulos siguen marcados
"Próximamente"; "Módulos disponibles" (antes un conteo fijo de 6) ahora
muestra 1, coherente con lo que cada rol ve.

### 7.6 (🟡→✅ corregido 2026-08-07) La tarjeta "Costo vigente" del producto no se refresca tras registrar un costo nuevo

**Corregido**, en dos piezas — arreglar sólo el refresco habría dejado al
usuario viendo el mismo número sin explicación. (1) `CostosTab.
registrarCosto` ahora espera el refetch del histórico, muestra
`toast.success('Costo de catálogo registrado.')` y dispara
`startTransition(() => router.refresh())`, que reevalúa la RPC
`costo_unitario_vigente` (prop del Server Component) y con ella el KPI de
cabecera. (2) Como `costo_unitario_vigente()`
(`011_inventario_kardex.sql:690-708`) es una cascada que prioriza
`inventario_existencias.costo_promedio` sobre `producto_costos`, un
producto con existencias valuadas (como `RTB-FER-000006`, con stock real
de `AJU-000018`) **legítimamente no cambia** su "Costo vigente" al
registrar un costo de catálogo nuevo — se añadió una nota de fuente bajo
el KPI ("Promedio de inventario" / "Catálogo o proveedor") y un aviso
explicativo en la pestaña Costos cuando aplica, para que el usuario sepa
que el registro sí se guardó y por qué el número no se movió. Verificado
clic a clic con `qa.compras` en `RTB-FER-000006`: la nota "Promedio de
inventario" aparece bajo "$100.00", y el aviso explicativo se muestra en
la pestaña Costos antes de registrar el nuevo costo.

### 7.7 (🟢 nota, no es un bug) — El checkbox "sin soporte" de un Ajuste

Durante la preparación de datos se intentó marcar "No hay soporte
documental (AJU s/s)" al crear un Ajuste dos veces sin éxito antes de
lograrlo — al investigar, **no es un defecto de la aplicación**: fue un
artefacto de cómo esta auditoría llenó el formulario (fijar el `checked`
del checkbox sin disparar el evento `onChange` de React que actualiza su
estado interno). Con un clic real la casilla sí funciona y revela el
campo "Motivo sin soporte" esperado, como confirmó el tercer intento. Se
documenta aquí sólo para que quede constancia de que se investigó y se
descartó como hallazgo — no requiere ninguna acción.
