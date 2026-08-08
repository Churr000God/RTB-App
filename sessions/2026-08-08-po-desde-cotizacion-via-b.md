# 2026-08-08 — RTB-VEN-01: la PO nace al aprobar la cotización (Vía B)

Tercera sesión del día sobre RTB-VEN-01 (las otras dos: listado de
cotizaciones + ciclo de vida/devoluciones, y PDF + correo con MailerSend —
ambas ya documentadas en `CLAUDE.md`). Pedido del dueño del proyecto: al
aprobar una cotización se pregunta si se aprueba como Nota de Remisión o
como Orden de Compra del cliente; si es PO, ésta nace ahí mismo con todos
los datos que necesita, copiados de lo ya trabajado en la cotización —
nunca más un alta manual en `/dashboard/ventas/ordenes-compra/nueva`. Y
además: filtros y barra de navegación para Órdenes de Compra (mismo patrón
que recibió Cotizaciones el mismo día, sesión de la mañana), eliminar los
estados `recibida`/`vinculada`, y permitir subir el archivo de PO que
manda el cliente.

## Decisiones cerradas con el dueño del proyecto (antes de escribir código)

Vía `AskUserQuestion`, en dos rondas:

1. **PO que llega DESPUÉS de una NR (Vía A)** — fuera de esta sesión, se
   trabaja aparte. Consecuencia aceptada explícitamente: retirar la
   maquinaria de validación PO↔NR de la Vía A (`ventas_po_validar()`,
   `ventas_vinculo_cancelar()`), porque ya no tiene un propósito claro con
   la PO naciendo de datos consistentes.
2. **Ciclo de vida de la PO** — "Ciclo de surtido":
   `abierta → parcialmente_surtida → surtida → facturada → pagada_cerrada`
   + `cancelada`. Se descartaron dos alternativas ofrecidas (conservar
   `rechazada`/`pendiente_de_confirmacion` para incidencias, o sólo quitar
   los dos estados pedidos explícitamente).
3. **Despacho de Vía B** — función nueva, espejo de `ventas_nr_despachar()`
   (se descartó reutilizar la NR internamente o dejarlo fuera de alcance).
4. **Archivo de PO** — opcional al aprobar y también subible después
   (se descartó hacerlo obligatorio al aprobar, o sólo permitirlo después).
5. **Bandeja de Autorizaciones** (queda sin productor al retirar la
   validación de PO) — se conserva visible con un aviso, no se oculta.
6. **Acceso de Almacén** — no entra a la pantalla de Órdenes de Compra; el
   botón de surtir vive en el detalle del pedido.
7. **Número de PO al aprobar** — obligatorio, sin excepción.

## Plan validado por un segundo pase de arquitectura

Antes de escribir SQL, el plan borrador se sometió a una revisión de
arquitectura contra el estado **vivo** de Supabase (no contra el texto de
las migraciones). Encontró 3 errores que habrían roto la migración o
dejado un bug de datos, y una consecuencia no obvia:

- **C-1** — orden invertido: `ventas_kpis()`/`tiene_operaciones_abiertas()`
  son `language sql`, que valida sus literales de enum en el `CREATE` —
  tenían que reescribirse **después** del swap del tipo `po_estado`, no
  antes (mismo gotcha ya documentado para `language sql` vs `plpgsql`,
  aplicado aquí a un cambio de enum en vez de a una tabla creada más
  abajo).
- **C-2** — faltaba `ALTER COLUMN estado DROP DEFAULT` antes del
  `ALTER COLUMN ... TYPE`; sin él Postgres aborta.
- **C-3** — el bug real más importante: `ventas_cotizacion_cancelar()`
  calculaba `valor_entregado` de una devolución sumando
  `ventas_nr_lineas.cantidad_entregada * precio_unitario` — para un
  pedido de Vía B esa tabla está vacía, así que la devolución habría
  nacido con `valor_entregado = $0.00`, mintiendo. Se corrigió
  bifurcando el cálculo por `pedido.via`.
- Consecuencia no obvia: `po-detalle.tsx` era el **único** productor de
  `ventas_autorizaciones` en toda la app — al retirar su bloque de
  validación, la bandeja de Autorizaciones se queda sin nada nuevo (de
  ahí la decisión 5 de arriba).

## Migraciones

`db/migrations/043_ventas_po_ciclo_surtido.sql` (esquema) y
`044_ventas_po_funciones.sql` (funciones, aplicada después a propósito —
ver C-1). Cada función reescrita partió de su cuerpo **vivo** obtenido con
`pg_get_functiondef()` contra Supabase, nunca del texto de una migración
vieja — `037` ya había reemplazado casi todas y usar el texto original
habría revertido en silencio fixes de sesiones anteriores.

`043`: retira `ventas_po_validar()`/`ventas_vinculo_cancelar()`
(conservando intactas `ventas_po_nr_vinculos`, el enum `vinculo_estado` y
sus 2 *constraint triggers* diferidos, inertes); swap del enum `po_estado`
(orden verificado contra `pg_depend` antes de escribir nada: soltar
`ventas_po_partidas_insert`, `po_rechazo_chk`, `uq_po_numero` y el
`DEFAULT` antes del `ALTER COLUMN TYPE`; las 2 PO de QA existentes se
remapean a `cancelada` explícita con motivo, no se dejan como "abierta"
fantasma); columnas nuevas en `ventas_ordenes_compra_cliente`
(`cotizacion_id`, `surtida_at`, `cancelada_at`/`cancelada_por`/
`motivo_cancelacion`) y `ventas_po_partidas` (`pedido_id`,
`pedido_linea_id`, `unidad_medida_id`, `cantidad_entregada`, más una FK
compuesta `(po_id, pedido_id) → (id, pedido_id)` — ver el bug del embed
más abajo); cierre del alta manual (`revoke insert`, **sin** GRANT UPDATE
para adjuntar evidencia — eso se hace por función); vista
`ventas_ordenes_compra_listado` con el mismo patrón "explorer" de `038`
(`security_invoker=true`, `LEFT JOIN` a propósito, agregados por
partidas); de paso se corrigió el `GRANT` por default de Supabase que
había dejado `ALL` para `anon` en la vista de cotizaciones de `038`.

`044`: `ventas_kpis()`/`tiene_operaciones_abiertas()` con el ciclo nuevo
(`po_pendiente_confirmacion` → `po_por_surtir`);
`ventas_cotizacion_aprobar()` con la bifurcación `via` (pre-check de
duplicado con la misma normalización que la columna generada, para dar
`22023` legible en vez de `23505` crudo; `row_number() over (order by
created_at, id)` para `linea_numero` de las partidas — mismo gotcha ya
documentado de `created_at` no desempatando filas del mismo `INSERT ...
SELECT`); `ventas_nr_emitir()` rechazando un pedido de Vía B;
`ventas_po_adjuntar_evidencia()`/`ventas_po_despachar()`/
`ventas_po_cancelar()` nuevas (`_despachar()` es un espejo estricto de
`ventas_nr_despachar()`: mismo emparejamiento por `pedido_linea_id`,
mismo patrón consumir-luego-reinsertar el remanente, mismos casts
explícitos de enum en el `CASE`); `ventas_cotizacion_cancelar()`
corregida (C-3) y además cancela la PO en su rama sin entrega (`UPDATE`
directo, no llamando a `ventas_po_cancelar()` — esa función exige un
conjunto de roles más estrecho que quien puede cancelar una cotización).

## Verificación

**SQL con rol real** dentro de `BEGIN`/`ROLLBACK` (creando cotizaciones y
líneas de prueba a mano cuando hacía falta un escenario que los datos
reales no cubrían — en particular, dos líneas del mismo producto en una
PO, para repetir el escenario exacto del hallazgo crítico #1 de `035`
pero contra `ventas_po_despachar()`): aprobar como PO con partidas 1:1 sin
huecos; número de PO duplicado con `22023` en vez de `23505`; despacho
fuera de orden con desambiguación correcta por `pedido_linea_id` (la
partida de 2 quedó intacta mientras se despachaba la de 4); despacho
parcial con remanente correcto; permisos negativos; `evidencia_path` sólo
por función; ambas ramas de `ventas_cotizacion_cancelar()`. `get_advisors`
sin `ERROR` nuevo, `npx tsc --noEmit` y `docker build --target builder`
limpios.

**Clic a clic real** con `qa.ventas`/`qa.almacen` (nunca la cuenta del
dueño del proyecto — una sesión anterior había dejado abierta la de
`super_admin` en el mismo perfil de Chrome, se cerró antes de empezar):
`COT-000068` aprobada como PO con número real (`PO-QA-BROWSER-001`) →
`POC-000027` creada con su partida → pedido liberado a Almacén → surtido
parcial (2 de 3) y luego completo, ambos desde el detalle del **pedido**
(Almacén nunca entra a Órdenes de Compra) → kardex real confirmado por
SQL directo (`MOV-00000046`, `salida_venta`,
`referencia_tipo='orden_compra_cliente'`) → PO `surtida`, pedido
`entregado` → documento de PO subido (archivo de prueba real vía
`file_upload`) y visto con URL firmada real → `qa.almacen` redirigido por
el servidor fuera de `/dashboard/ventas/ordenes-compra` (confirma guard
real, no sólo sidebar oculto) → KPI "PO por surtir" del tablero correcto.

**Bug encontrado y corregido durante ese mismo recorrido**, no anticipado
por la verificación SQL: la FK compuesta nueva de `043`
(`ventas_po_partidas_po_pedido_fkey`) dejó **dos** relaciones entre
`ventas_po_partidas` y `ventas_ordenes_compra_cliente`. El embed implícito
`partidas:ventas_po_partidas(...)` (usado en `pedidos/[id]/page.tsx` y
`api/ventas/pedidos/[id]/route.ts` para traer la PO junto al pedido) quedó
ambiguo para PostgREST (PGRST201) — y como el código desestructuraba sólo
`{ data }` sin mirar `error`, el síntoma no fue un error visible sino el
botón "Surtir PO" que simplemente nunca aparecía. Corregido con el hint de
relación explícito `!ventas_po_partidas_po_id_fkey` en los dos sitios.
Ver el gotcha nuevo en `CLAUDE.md`.

## Alcance dejado fuera, documentado en TODO

Vía A completa (PO que llega después de una NR — la maquinaria de
vínculos y la bandeja de Autorizaciones quedan intactas pero inertes),
cierre de una PO tras resolver su devolución, y `ventas_po_cancelar()`
sin consumidor de UI (la cancelación real pasa por "Cancelar cotización").

## Corrección posterior, mismo día: surtir es sólo de Almacén (045)

Ya con la entrega de arriba verificada, el dueño del proyecto corrigió
dos cosas más:

1. **Facturar y entregar son procesos independientes** — una PO/NR se
   puede facturar antes de entregarla o después, no necesariamente en ese
   orden. `po_estado`/`nr_estado` hoy modelan `facturada`/`pagada_cerrada`
   como el tramo final de una cadena lineal después de
   `surtida`/`entregada`; esa forma probablemente no alcanza cuando se
   diseñe RTB-PRO-FAC-01. No se tocó el modelo hoy (ese módulo no existe,
   hacerlo sin sus requisitos reales sería adivinar) — quedó anotado como
   aviso explícito en el TODO de `CLAUDE.md` para cuando se diseñe.
2. **Sólo Almacén puede surtir** — se quitó `'ventas'` del guard de rol de
   `ventas_nr_despachar()` y `ventas_po_despachar()`
   (`045_ventas_surtir_solo_almacen.sql`, mismo `ROLES_DESPACHAN`
   compartido por ambas funciones desde su diseño). El dueño del proyecto
   también planteó, como nota de diseño para cuando exista el módulo de
   Almacén (hoy "Próximamente"), que esa pantalla futura sea simplemente
   una vista de la misma tabla de pedidos/PO con la función de surtir
   habilitada — no se construyó, el módulo no existe.

   **Autocorrección encontrada por revisión de código, antes de tocar
   producción:** `POST /api/ventas/pedidos/[id]/liberar` reutilizaba
   `ROLES_DESPACHAN` — coincidía con quién podía liberar sólo por
   accidente, no por diseño. Al quitarle `'ventas'` a esa constante para
   surtir, la ruta de liberar también le habría bloqueado a Ventas
   **liberar** el pedido a Almacén, algo que nadie pidió tocar y que
   `ventas_pedido_liberar_almacen()` sigue permitiendo en su propio guard
   — mismo patrón ya documentado de "route vs SQL desalineados". Corregido
   con una constante separada, `ROLES_LIBERAN_ALMACEN`
   (`lib/ventas/permisos.ts`), que sí conserva `'ventas'`.

   Verificado por SQL con rol real (`ventas` bloqueado con `42501` en
   ambas funciones de despacho, `almacen` pasa el guard) y clic a clic
   real: `qa.ventas` ya no ve "Surtir PO" en el detalle del pedido pero
   sigue viendo "Liberar a Almacén"; `qa.almacen` ve ambos.

## Ajuste de UX, mismo día: selector de archivo de la PO

El dueño del proyecto pidió mejorar visualmente el selector de archivo de
"Documento de PO del cliente" — antes era el `<input type="file">` nativo
del navegador ("Seleccionar archivo / Sin archivos seleccionados").
Rediseñado con un `<input>` oculto disparado por una zona de
arrastrar-y-soltar (clic o `drop`), y tres estados con su propia tarjeta:
vacío (zona punteada con ícono), archivo elegido sin subir (chip con
nombre/tamaño + quitar + Subir/Reemplazar), y ya adjunto (tarjeta con
check + Ver documento/Reemplazar). Mismo flujo de 3 pasos de siempre por
debajo (URL firmada → subida directa al bucket → registrar la ruta), sólo
cambió la presentación. Verificado visualmente en el navegador con
`qa.ventas` en los tres estados, con una subida real.

## Nota operativa

La contraseña común de los usuarios `qa.*` (`RtbQA-2026!`) se guardó en
memoria persistente (`rtb-qa-credenciales.md`) para no depender de
generar magic links con la `service_role key` en cada sesión de
verificación por navegador.

Al cerrar la sesión y preparar el commit se encontró que **otra sesión
trabajó en paralelo sobre el mismo repositorio**, construyendo la Vía A
(la PO que llega después de una NR — precisamente lo que esta sesión dejó
fuera de alcance, ver arriba): ya había aplicado a Supabase
`046_ventas_po_via_a_enums.sql` (dos valores nuevos a `po_estado` —
`pendiente_de_autorizacion`, `vinculada` — y a
`ventas_autorizacion_tipo`) y `047_ventas_po_via_a_esquema.sql` (columna
`ventas_ordenes_compra_cliente.origen`, entre otros cambios), sin haber
hecho `commit` todavía. Ningún cambio de esta sesión se vio afectado
(son aditivos: nuevos valores de enum y una columna con default seguro),
pero esos dos archivos se dejaron fuera del commit de esta sesión — le
corresponde a esa otra sesión confirmarlos cuando termine, mismo criterio
ya documentado en `rtb-sesiones-concurrentes.md`.
