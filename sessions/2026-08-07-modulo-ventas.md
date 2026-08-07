# Sesión 2026-08-07 — Módulo RTB-VEN-01 (Ventas), primera entrega

## Punto de partida

RTB no tenía módulo de Ventas: se cotiza y da seguimiento a Notas de
Remisión de forma manual/Notion, sin registro de reservas de inventario,
sin validación sistemática de la PO del cliente contra lo cotizado, y sin
visibilidad de qué NR quedó entregada sin PO. El dueño del proyecto trajo
`contexto/RTB-PRO-VEN-01_Modulo_Ventas.md` (proceso, sin modelo de datos)
más dos documentos de reglas de negocio pegados directo en el chat que
amplían la spec con la decisión técnica central — la PO del cliente no
liga con la NR por una FK simple, es una tabla de asignación **por
partida**, muchos a muchos — y series de reglas ya resueltas: bloqueo
total de PO si una sola partida no cuadra en costo (con excepción sólo por
subtotal coincidente y autorización de Dirección), estados independientes
por tipo de documento, reserva/compromiso de inventario sin doble conteo,
congelamiento de cartera a nivel Entidad (no a nivel vendedor), y
separación de canales (entrada/aprobación/entrega/seguimiento/evidencia).

## 1. Exploración y aclaración de dudas

El pedido explícito del dueño del proyecto fue "antes de pasar a la
implementación pregúntame cualquier duda que tengas" — se resolvieron
cuatro rondas de preguntas vía `AskUserQuestion` antes de escribir el plan
(alcance, precio, congelamiento, inventario; luego una ronda de
correcciones cuando la primera respuesta sobre precio quedó incompleta):

- **Alcance**: Ventas completo hasta "PO vinculada" — el reloj de
  cobranza/CFDI/pago quedan para un módulo futuro de Facturación
  (`RTB-PRO-FAC-01`).
- **Precio de venta**: fórmula viva — `costo_promedio_ponderado_global ×
  (1 + margen_porcentaje de la FAMILIA)` — con override manual que
  congela. El dueño del proyecto lo aclaró con un ejemplo concreto: el
  precio que se usa al cotizar es el vigente **ese día**; si la cotización
  se rechaza/expira y el mismo cliente vuelve el mes siguiente con el
  costo ya distinto, la nueva cotización usa el costo nuevo, pero la
  anterior (ya expirada) **no se toca** — el precio se fotografía en la
  línea en el momento de cotizar y ese registro es historial inmutable,
  sin importar qué le pase después a la fórmula. Corrección propia:
  el margen vive en **familia**, no en categoría (la primera respuesta lo
  había dicho al revés).
- **Compras-ligero**: se formaliza como precondición dura, no un paso
  informal — "antes de que el vendedor haga la cotización pasa el proceso
  de Compras-ligero... así no hay ningún producto que se pueda cotizar que
  no haya pasado por ese proceso antes". Un producto sin costo real de
  proveedor no se puede cotizar.
- **Congelamiento**: tabla aparte, no un campo más en `entidades.estado`.
- **Inventario**: un nivel nuevo (`reserva`/`compromiso`) sobre
  `inventario_apartados` ya existente, no tablas ni acumuladores nuevos.
- **PO/costo**: bloqueo total de la PO ante cualquier partida divergente,
  salvo subtotal coincidente con autorización de Dirección.
- **Consulta a Compras**: descripción libre, sin producto todavía; Compras
  da de alta todo (producto + costo) al responder.
- **Envío de cotización**: bloqueado mientras exista una línea "en
  consulta" dentro del borrador — sin envío parcial.
- **`producto_precios_referencia`**: se aprovechó para estrechar el
  permiso de `ventas` a sólo lectura (Costo Refacción/Costo Ariba), mismo
  criterio con el que `015` le quitó a `almacen` el alta de
  familias/unidades — sin margen no hay precio, y esos dos precios los
  sigue manteniendo sólo Compras/Dirección/super_admin.

Plan completo escrito y aprobado antes de tocar código (`/home/diego/.claude/plans/okey-claude-ahora-vamos-immutable-engelbart.md`).

## 2. Base de datos — 7 migraciones nuevas, `028` a `034`

Cada una aplicada vía MCP `apply_migration` y verificada con SQL simulando
rol real (`set local role authenticated` + `set_config('request.jwt.claim.sub',
'<uuid-literal>', true)` — el UUID debe resolverse **antes** de cambiar de
rol; una subconsulta contra `profiles` ya bajo el rol simulado falla en
silencio porque su propia RLS depende de un `auth.uid()` que todavía no
está puesto), nunca sólo contra la lectura del código.

- **`028_ventas_precios.sql`** — los tres precios. `producto_familias.
  margen_porcentaje` (sólo Dirección la escribe); tabla
  `producto_precio_venta` (override, único activo por producto, sin
  `GRANT INSERT`/`UPDATE` directo — sólo vía función); `costo_promedio_
  global()` **nueva** (pondera todas las ubicaciones, a diferencia de
  `costo_unitario_vigente()` que sólo usa la de mayor existencia — esa
  función del kardex no se tocó); `costo_venta_vigente()`/
  `costo_venta_detalle()`; `producto_precio_venta_fijar()`/`_revertir()`
  (`SECURITY DEFINER`, sólo super_admin/direccion); RLS de
  `producto_precios_referencia` estrechada para excluir a `ventas` de
  insert/update.
- **`029_ventas_congelamientos.sql`** — `clientes.requiere_po`/
  `tipo_cliente`; `cliente_congelamientos` (único activo por entidad) y
  `cliente_excepciones` (anti-autoaprobación por `CHECK`, sin `GRANT
  UPDATE` — se resuelve por API+`service_role`); función
  `cliente_puede_operar(entidad_id)` — el veredicto único que combina
  `entidades.estado` (sin tocar) + congelamiento + excepción en uno de
  seis estados (`normal`/`descongelada`/`excepcion_autorizada`/
  `en_revision`/`congelada`/`bloqueada`); bucket privado
  `evidencias-ventas`.
- **`030_ventas_cotizaciones.sql`** — `ventas_cotizaciones` (folio
  `COT-000000`, sin `GRANT UPDATE(estado)` en absoluto); `ventas_
  cotizacion_lineas` — la tabla del snapshot: `precio_unitario`/
  `costo_base_snapshot`/`margen_snapshot`/`en_consulta` nunca en un
  `GRANT`, resueltos exclusivamente por el trigger `ventas_cotizacion_
  linea_before_write()` (sin producto → en consulta; con producto sin
  `precio_origen` → sigue en consulta, esperando que Ventas elija; con
  ambos → resuelve y congela); `ventas_consultas_compras` (Compras-ligero
  formalizado); `ventas_aprobaciones` (evidencia, append-only); funciones
  `enviar`/`rechazar`/`cancelar`/`consulta_responder`.
- **`031_ventas_pedidos_apartados.sql`** — `ventas_pedidos`/`ventas_
  pedido_lineas` (copia inmutable, sin `GRANT` de escritura para
  `authenticated`); extensión de `inventario_apartados` con `nivel`
  (`reserva`/`compromiso`) + `pedido_id`; `ventas_cotizacion_aprobar()` —
  la función más delicada: evidencia + pedido + N líneas + N apartados de
  reserva, todo en una transacción, revirtiendo completo si cualquier
  línea tiene una unidad incompatible; `ventas_pedido_liberar_almacen()` —
  un solo `UPDATE nivel='compromiso'`, sin tocar el acumulador.
- **`032_ventas_nr_despacho.sql`** — `ventas_notas_remision` (folio
  `NR-000000`, una por pedido — **sólo Vía A**, Vía B queda fuera, ver
  Pendiente), `ventas_nr_lineas`, `ventas_nr_seguimientos`; `ventas_nr_
  emitir()` y `ventas_nr_despachar()` — inserta el movimiento de kardex
  (`salida_venta`, ligado al apartado), consume la reserva comprometida y,
  si el despacho es parcial, crea el remanente como **fila nueva** (el
  alcance de un apartado es inmutable por diseño de `011`).
- **`033_ventas_po_vinculos.sql`** — `ventas_autorizaciones` (tabla
  propia, no se amplió `cambio_controlado` porque `ALTER TYPE ... ADD
  VALUE` no es transaccionalmente seguro dentro de `apply_migration`);
  `ventas_ordenes_compra_cliente` (con `duplicada_de` para incidencias),
  `ventas_po_partidas`, `ventas_po_nr_vinculos` (la tabla de asignación
  N:M por partida, cobertura siempre por agregación con filtro de estado,
  nunca un contador, con dos *constraint triggers* diferidos como último
  respaldo); `ventas_po_validar()` — la función central de cruce,
  implementando el orden exacto: moneda → RFC → costo unitario (una sola
  partida divergente bloquea toda la PO) → excepción por subtotal
  coincidente autorizada → código divergente → duplicidad.
- **`034_ventas_tablero.sql`** — cierre de un TODO histórico:
  `public.tiene_operaciones_abiertas(entidad_id)` (desde `002`, siempre
  `false` con un comentario literal `TODO(RTB-VEN-01/RTB-COM-01)`) ahora
  cuenta cotizaciones/pedidos/NR/PO abiertos reales, preservando el
  contrato `NULL` para input `NULL` (no `false`) del que ya depende
  `/api/entidades/[id]/bloquear`; `ventas_tablero_nr()`, `ventas_kpis()`,
  `ventas_cotizaciones_expirar()` (barrido oportunista al cargar el
  tablero — no hay cron en el proyecto).

### Tres bugs reales encontrados y corregidos durante la verificación

1. **Trigger que revertía en silencio las escrituras de sus propias
   funciones `SECURITY DEFINER`.** `ventas_cotizacion_before_update()`
   tenía líneas incondicionales tipo `new.estado := old.estado;` como
   "defensa extra", aun cuando esas columnas ya no tenían `GRANT UPDATE`
   para `authenticated` (la barrera real). Resultado: `ventas_cotizacion_
   enviar()` ejecutaba `UPDATE ... SET estado='enviada'`, el mismo trigger
   disparaba y revertía `estado` a `'borrador'` antes de guardar — la
   función devolvía éxito sin persistir nada. Se encontró verificando el
   estado por SQL directo después de una llamada "exitosa". Corregido
   (migración de ajuste `ventas_cotizacion_before_update_fix`): sólo se
   conserva el `RAISE` que congela los campos de cabecera fuera de
   borrador, no un reset incondicional. Documentado como gotcha nuevo en
   `CLAUDE.md`.
2. **`CASE` sin cast explícito en un `UPDATE` sobre columna enum
   (`42804`).** `ventas_nr_despachar()` asignaba
   `case when ... then 'entregada_sin_po' else 'parcialmente_entregada'
   end` a una columna `nr_estado` y fallaba con "column is of type
   nr_estado but expression is of type text" — una asignación literal
   simple sí resuelve el tipo por contexto, un `CASE` con literales no.
   Corregido con cast explícito en cada rama (`... end::public.nr_estado`,
   migración `ventas_nr_despachar_enum_cast_fix`) y aplicado
   preventivamente en el `CASE` equivalente de `ventas_po_validar()`
   (`033`). Documentado como gotcha nuevo.
3. **`GRANT INSERT` sin restricción de columna, mismo patrón que ya había
   pasado con `inventario_conteos`.** `producto_familias` (`009`) y
   `inventario_apartados` (`011`) tenían `GRANT INSERT` sin lista de
   columnas — `compras`/`almacen` podían forjar `margen_porcentaje` o
   `nivel='compromiso'`/`pedido_id` al insertar. Corregido dentro de las
   propias migraciones `028`/`031` con `revoke insert ...; grant insert
   (columnas de alta) ...`.

Verificación adicional: fallo forzado a media transacción (2ª de 2 líneas
con unidad incompatible) en `ventas_cotizacion_aprobar()` → cero
apartados/pedido persistidos; despacho parcial (4 de 10) → remanente
exacto (6) en fila nueva, kardex `salida_venta` firmado, `cantidad_
teorica` decrementada correctamente; PO con 2 partidas (1 exacta, 1
divergente en precio y subtotal) → cero vínculos creados, bloqueo total
confirmado; PO con subtotal coincidente → exigió autorización, aprobada
por un usuario distinto al solicitante (anti-autoaprobación confirmada),
reintento con `autorizacion_id` → 2 vínculos creados, PO → `vinculada`;
`tiene_operaciones_abiertas(null)` sigue devolviendo `null`, con una
cotización abierta real devuelve `true`. `get_advisors` sin `ERROR` nuevo
en todas las migraciones.

## 3. Capa compartida `app/lib/ventas/`

`config.ts` (labels/tonos por enum), `permisos.ts` (espejo de las RLS
nuevas), `schemas.ts` (zod — el schema de línea de cotización no acepta
`precio_unitario`, espejo del `GRANT` restringido), `validaciones.ts`
(normalización de PO, coincidencia de RFC, antigüedad — sin ninguna
comparación de precio, esa lógica vive sólo en SQL sobre `numeric`),
`errores.ts` (mapa errcode→HTTP: `42501`→403, `28000`→401, `P0002`→404,
`22023`/`23514`→400, `P0001`/`55006`→409). También se estrechó `app/lib/
inventario/permisos.ts` (quitó `ventas` de `precios_referencia`) y sus dos
rutas de API correspondientes.

## 4. API y pantallas

~35 rutas nuevas bajo `app/app/api/ventas/*` (cotizaciones + líneas +
enviar/aprobar/rechazar/cancelar, consultas, pedidos, notas de remisión +
despachar + seguimiento, órdenes de compra + partidas + validar,
autorizaciones, congelamientos/excepciones, evidencias, márgenes,
precio-venta, tablero) siguiendo el patrón ya establecido
(`requireApiRole` → zod `safeParse` → `.select('id')` con comprobación de
filas → mapa de errcode). Más `PATCH /api/entidades/[id]/politica-comercial`.

~20 pantallas en `app/app/dashboard/ventas/*`: tablero, cotizaciones
(listado + alta + detalle con selector de precio de 3 opciones, diálogo de
consulta a Compras, diálogo de aprobación con evidencia/datos faltantes),
consultas (bandeja con tabs abiertas/resueltas), pedidos, remisiones
(tablero con filtro por estado + detalle con despacho/seguimiento), y
órdenes de compra (captura de partidas + constructor de vínculos +
resultado de validación, incluida la ruta a "solicitar autorización").
Más una pestaña nueva "Cartera y política comercial" en la ficha de
entidad y "Precio de venta" en la ficha de producto. Reutiliza el
catálogo de componentes ya reducido del proyecto (`button`, `dialog`,
`card`, `tabs`, `command`+`popover` para combobox, `toggle-group`) y
`<table>`/`<select>` nativos + badges propios — no se reintrodujo
`Table`/`Select`/`Badge` de shadcn. `app/lib/rbac/config.ts` — se quitó el
badge "Próximamente" de Ventas y se amplió a los roles reales.

## 5. Verificación

- SQL simulando rol real, detalle por migración en §2.
- `npx tsc --noEmit` incremental tras cada tanda de archivos nuevos —
  atrapó, entre otros: `.catch()` sobre el query builder de supabase-js
  (no es `Promise`, es `PromiseLike` — mismo gotcha ya documentado por
  `.finally()`, corregido con `Promise.resolve(query).catch(...)`);
  `role: UserRole | null` de `useAuth()` vs. prop tipado sin `null` en
  `CarteraComercialTab`/`PrecioVentaTab`; import equivocado de
  `DATOS_FALTANTES_LABELS`.
- `docker build --target builder` (TypeScript real,
  `ignoreBuildErrors: false`) exitoso con las ~65 rutas/páginas totales
  del proyecto compilando, incluidas todas las nuevas de Ventas.
- `get_advisors` sin `ERROR` nuevo (sólo `WARN` de `SECURITY DEFINER`, ya
  aceptado como patrón del proyecto, e `INFO` de FK sin índice).
- **No se hizo clic a clic con sesiones reales de rol** en esta sesión —
  toda la verificación de negocio fue SQL simulando rol + build de
  producción real, no una pasada manual en la app con los usuarios QA.
  Declarado como pendiente explícito, igual que pasó con el mapa
  (`2026-08-06-ubicacion-geografica-y-mapas.md` §6).

## 6. Documentación

- `db/ESQUEMA.md` — sección nueva `## RTB-VEN-01 — Ventas` (tablas,
  funciones, decisiones), fila de bucket `evidencias-ventas`, relaciones
  nuevas en el diagrama ER, entrada nueva en advisors aceptados.
- `db/procesos/ciclo-de-venta.md` (nuevo) + fila y párrafo en
  `db/procesos/README.md`.
- `CLAUDE.md` — estado del módulo en la tabla (de "🔜 Planificado" a
  "✅ Base funcional"), dos gotchas nuevos (trigger que revierte escrituras
  de función `SECURITY DEFINER`; `CASE` sin cast en `UPDATE` de columna
  enum), entrada de historial de decisiones, tres puntos nuevos en TODO
  (Vía B sin implementar, reloj de cobranza/CFDI como módulo futuro —
  ambos ya estaban resumidos en el historial, TODO los detalla).

## Pendiente

- **Clic a clic con sesiones reales de rol** — no se hizo en esta sesión
  (toda la verificación de negocio fue SQL + build; ver §5).
- **Vía B (PO directa del cliente, sin NR)** — el pedido se aprueba y
  libera igual, pero no hay función de despacho dedicada; pendiente
  decidir con el dueño del proyecto si se construye o se descarta (ver
  TODO en `CLAUDE.md`).
- **Reloj de cobranza, CFDI y pagos** — `RTB-PRO-FAC-01`, módulo futuro. El
  congelamiento de cartera se sigue registrando a mano por Dirección.
- **`producto_familias.margen_porcentaje`** — la semilla de `015` sembró
  6 unidades y 10 familias sin margen; hay que confirmar con el dueño del
  proyecto los porcentajes reales por familia antes de que el precio de
  venta sea calculable para el catálogo completo.
