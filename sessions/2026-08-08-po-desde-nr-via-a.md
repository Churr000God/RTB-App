# 2026-08-08 — RTB-VEN-01: la PO que llega DESPUÉS de una NR (Vía A)

Cuarta sesión del día sobre RTB-VEN-01, **concurrente** con la que cerró la
Vía B (`sessions/2026-08-08-po-desde-cotizacion-via-b.md`) en el mismo
repositorio. El dueño del proyecto pidió el camino complementario: la
cotización sigue convirtiéndose en Nota de Remisión exactamente igual que
siempre — sin cambios ahí —, pero cuando la PO física del cliente llega
DESPUÉS de una o varias NR ya emitidas, se registra desde el tablero de
Notas de Remisión, nunca como una cotización nueva. El formulario pide los
datos de la PO y del cliente, y deja seleccionar NR/partidas ya entregadas
(respaldo) y partidas por entregar — de una cotización `enviada` existente
o nuevas del catálogo. Un precio de partida que difiere del de la NR
congela toda la PO hasta que Dirección autoriza. Una línea de NR ya
asociada por su cantidad completa deja de estar disponible.

## Punto de partida: el terreno cambió a mitad del diseño

La otra sesión ya había aplicado `043`/`044`/`045` cuando ésta empezó a
explorar — desmontaron por completo la Vía A original (`ventas_po_validar()`,
`ventas_vinculo_cancelar()`, los 7 estados de validación de `po_estado`),
dejando `ventas_po_nr_vinculos`, el enum `vinculo_estado` y sus 2
*constraint triggers* diferidos **inertes a propósito**, documentados en su
propio `comment on table` como "es exactamente lo que la Vía A necesita
cuando se construya". Esta sesión fue esa reconstrucción — verificada dos
veces contra el estado **vivo** de Supabase después de esos cambios, nunca
contra el texto de las migraciones originales.

## Decisiones cerradas con el dueño del proyecto (`AskUserQuestion`)

1. **Congelamiento por precio** — la PO completa se congela (no sólo la
   partida divergente), sin respaldar nada hasta que Dirección resuelva.
2. **Alcance de la PO** — sí puede incluir partidas aún no entregadas, por
   dos caminos: de una cotización ya hecha (líneas no elegidas se
   desactivan con nota, nunca se borran) o partidas nuevas sin cotización.
3. **Mutabilidad** — sí se puede ampliar una PO ya creada, pero requiere
   autorización de Dirección (tipo propio, "Ampliación de PO").
4. **Precio en la NR/cotización** — nunca se toca; el precio autorizado
   vive sólo en la PO.
5. **Surtido de lo pendiente** — contra la PO, con kardex real (unifica el
   modelo con la Vía B en vez de un segundo sistema de despacho).
6. **Partidas nuevas** — sólo producto del catálogo, nunca descripción
   libre.
7. **Coordinación con la sesión concurrente** — el caso de partidas de
   cotización necesita exactamente lo que ya hace
   `ventas_cotizacion_aprobar()` (crea pedido + líneas + apartados); se
   decidió editarla con un `if` aditivo (~15 líneas) en vez de duplicar su
   lógica de kardex, aceptando el riesgo de colisión con la otra sesión.

## El diseño: dos problemas reales resueltos antes de escribir SQL

**La colisión.** `ventas_po_partidas_po_pedido_fkey` (nueva en `043`)
obliga a que toda partida comparta el `pedido_id` de su PO — imposible
para una PO que respalda NR de **pedidos distintos**. Se dropeó y se
sustituyó por un trigger (`po_partida_coherencia_pedido()`) que preserva
la garantía real para la Vía B sin bloquear el caso multi-pedido.

**La tensión.** `ventas_pedidos.cotizacion_id` es `NOT NULL`, así que una
partida nueva sin cotización (caso N) no podía tener pedido ni apartado
por la vía existente. Se evaluaron y descartaron: inyectarla en la
cotización del caso C (reescribiría un documento ya enviado por correo,
`042`), relajar `cotizacion_id` (`ventas_tablero_nr()` y otras funciones lo
asumen con `INNER JOIN`), y una cotización de respaldo autogenerada
(ensucia el explorer de Cotizaciones). Se adoptó
`inventario_apartados.po_partida_id` como origen de apartado de primera
clase, igual que ya lo es `pedido_linea_id` — barato porque ambas columnas
ya eran nullable y `ventas_po_despachar()` nunca usó el pedido para el
kardex. Consecuencia aceptada: `ventas_devoluciones.cotizacion_id` se
relajó a nullable (`dev_origen_chk` exige al menos `cotizacion_id` o
`po_id`).

**Modelo de estados.** Dos estados nuevos de `po_estado`
(`pendiente_de_autorizacion`, `vinculada`) — deliberadamente no un tercer
`parcialmente_vinculada`: habría sido redundante con
`abierta`/`parcialmente_surtida` y reproducido el defecto histórico de
`ventas_po_validar()` (033) de escalar comparando agregados en vez de
contar partidas. Dos tipos nuevos de `ventas_autorizacion_tipo`
(`precio_po_divergente`, `ampliacion_po`).

## Migraciones (`046`-`051`)

- `046_ventas_po_via_a_enums.sql` — sólo `ALTER TYPE ... ADD VALUE`
  (archivo propio, no puede compartir transacción con su uso).
- `047_ventas_po_via_a_esquema.sql` — `po_origen`, `po_partida_tipo`; drop
  de la FK compuesta + trigger de coherencia; `inventario_apartados.
  po_partida_id` + índice único parcial + `apartados_before_update()`
  reconstruida; `ventas_devoluciones.cotizacion_id` nullable;
  `create or replace view ventas_ordenes_compra_listado` (columnas al
  final, sin romper las 4 pantallas de la Vía B); saneamiento de un
  vínculo relic de la campaña de QA de `043`.
- `048_ventas_po_via_a_funciones.sql` — el grueso: helpers internos
  (`ventas_nr_recalcular_estado`, `ventas_po_recalcular_estado`,
  `ventas_po_nrs_afectadas`, `ventas_po_agregar_partidas`) + funciones
  públicas (`ventas_nr_lineas_disponibles`, `ventas_po_crear_desde_nr`,
  `ventas_po_ampliar`, `ventas_po_corregir_precio`,
  `ventas_po_liberar_almacen`, `ventas_vinculo_cancelar` restaurada,
  `ventas_po_resolver_autorizacion`) + `ventas_po_despachar()`
  generalizada (ya no exige un único `pedido_id`) + `ventas_po_cancelar()`/
  `ventas_autorizacion_resolver()`/`ventas_nr_cobertura()`/
  `tiene_operaciones_abiertas()` ampliadas + el `if` aditivo en
  `ventas_cotizacion_aprobar()`. Toda función preexistente reescrita desde
  su cuerpo **vivo** (`pg_get_functiondef()`), nunca del texto de
  036/037/044/045.
- `049_ventas_nr_listado.sql` — vista `ventas_notas_remision_listado`
  (security_invoker, joins LEFT) + 4 índices de fecha.
- `050_ventas_po_vinculada_fix.sql` — corrige el bug real encontrado en
  verificación (ver abajo).
- `051_ventas_tablero_nr_drop.sql` — retira `ventas_tablero_nr()` una vez
  confirmado por `grep` que sus 3 consumidores ya migraron.

## Bug real encontrado y corregido antes de que hubiera datos en riesgo

`ventas_po_recalcular_estado()` promovía a `'vinculada'` en cuanto
`compromiso_pendientes = 0 and respaldo_pendiente = 0` — pero "cero
partidas de respaldo" también cumple `respaldo_pendiente = 0` por conteo
vacío, así que **toda** PO de Vía B (que nunca tiene partidas de respaldo)
llegaba a `'vinculada'` en vez de quedarse en `'surtida'` al terminar de
surtirse. Encontrado en el clic a clic (escenario mixto caso C + caso N,
sin respaldo), no por la matriz de SQL previa (que sólo había probado POs
con respaldo). Corregido con `exists(select 1 from ... where
tipo='respaldo')` como condición explícita — ver Gotchas de `CLAUDE.md`.

## Verificación

- SQL con rol real simulado (`set_config('request.jwt.claim.sub', ...)`,
  `BEGIN`/`ROLLBACK`): 12 escenarios — bloqueo de alta manual,
  disponibilidad correcta (`ventas_nr_lineas_disponibles()`), camino feliz
  respaldo+compromiso nuevo, sobrecobertura rechazada por el *constraint
  trigger* diferido, congelamiento por precio divergente + NR sin avanzar,
  ciclo completo de autorización (rechazar→corregir→descongelar),
  escenario mixto multi-pedido (caso C + caso N) con liberar+despachar
  parcial/completo (encontró el bug de arriba), cancelación de vínculo con
  retroceso de PO/NR, cancelación de PO, ampliación con materialización al
  aprobar, permisos negativos por rol.
- `get_advisors` sin `ERROR` nuevo en cada punto de control.
- `npx tsc --noEmit` incremental tras cada archivo; `docker build --target
  builder -f Dockerfile .` (TypeScript real) limpio al cierre.
- Clic a clic real con `qa.ventas` (nunca la cuenta del dueño del
  proyecto): explorer de NR con cobertura real en las tarjetas (antes
  fijas en $0), asistente de 4 pasos completo con datos reales (línea de
  NR con disponible correcto, cotización `enviada` del cliente cargada),
  registro exitoso de `POC-000041` (`origen=posterior_a_entrega`,
  `estado=vinculada`), NR permaneciendo correctamente en
  `parcialmente_entregada` (tiene una segunda línea sin entregar — no es
  un bug, mismo criterio que ya usaba el sistema original: los estados de
  respaldo sólo aplican cuando la entrega está completa), detalle de la PO
  con partidas de respaldo + comparación de precio + botón de cancelar
  vínculo, y el tablero de PO mostrando la fila nueva en "Vinculada" junto
  a las PO de Vía B de la otra sesión sin interferencia.
- Encontrado y corregido en el mismo recorrido: `EntidadCombobox` no tiene
  forma de mostrar un cliente preseleccionado por URL — se resolvió
  pasando el nombre ya resuelto por query string (`entidad_label`) desde
  el botón "Registrar PO" del detalle de NR.
- `git diff` de los 12 archivos compartidos con la otra sesión (`types/
  ventas.ts`, `lib/ventas/{config,permisos,schemas}.ts`,
  `api/ventas/ordenes-compra/route.ts`, `api/ventas/notas-remision/
  route.ts`, `dashboard/ventas/{page.tsx,ordenes-compra/[id]/{page.tsx,
  po-detalle.tsx},remisiones/{page.tsx,[id]/{page.tsx,nr-detalle.tsx}}}`)
  confirmado sin pérdida de cambios de la otra sesión al cerrar.

## Alcance dejado fuera (ver TODO de `CLAUDE.md`)

`ventas_po_devolver()` (una PO puramente de partidas nuevas puede abrir
devolución por esquema, sin función que la abra), ampliar una PO con
líneas de otra cotización, y los tipos de autorización de la Vía A
**original** (`excepcion_subtotal`/`codigo_divergente`/
`duplicidad_confirmada`, 033) siguen sin productor.
