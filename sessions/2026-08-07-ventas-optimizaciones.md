# Sesión 2026-08-07 — RTB-VEN-01: rendimiento y operación (§3 de la auditoría)

## Punto de partida

`contexto/AUDITORIA_RTB-VEN-01.md` §3 dejó seis hallazgos de rendimiento y
operación tras la auditoría de punta a punta del módulo de Ventas, todos
🟡/🟢 (no bloqueantes, a diferencia del hallazgo crítico #1 de despacho, que
otra sesión corrigió en paralelo sobre este mismo repositorio con la
migración `035`). El encargo: cerrar §3.1–§3.6 mientras el módulo es
nuevo, en la misma clase de trabajo que el proyecto ya hizo el 2026-08-07
anterior sobre hallazgos/solicitudes/existencias.

Tres decisiones se confirmaron con el dueño del proyecto antes de
implementar (`AskUserQuestion`): §3.6 no se toca por suposición — se
documenta como pendiente; §3.5 cancela quien valida
(`ventas`/`direccion`/`super_admin`), simétrico con `ventas_po_validar()`;
§3.2 llega a la API y a las 4 pantallas que hoy truncan en silencio, no
sólo a los endpoints.

**Nota de numeración de migración:** la sesión concurrente ya había
tomado `035_apartados_pedido_linea.sql` para el fix del hallazgo #1 en el
momento de escribir la de este trabajo — se saltó a `036` para no chocar.

## §3.1 — Detalle de PO sin consulta global de vínculos

`app/app/dashboard/ventas/ordenes-compra/[id]/page.tsx` hacía
`supabase.from('ventas_po_nr_vinculos').select('*')` sin filtro alguno —
todos los vínculos de toda la empresa — y recortaba a los de esa PO en el
cliente. Se cambió a dos oleadas de `Promise.all`: la primera trae
partidas de esta PO + NR de la entidad; la segunda, ya con esos ids,
filtra vínculos por `.in('po_partida_id', partidaIds)` (mismo patrón que
ya usaba correctamente `app/app/api/ventas/ordenes-compra/[id]/route.ts`)
y líneas de NR por `.in('nr_id', nrIds)`. Ambos casos vacíos (`length===0`)
se cubren para no emitir un `.in()` vacío.

## §3.2 — Paginación real de 6 endpoints + 4 pantallas

Contrato adoptado: `{data, count, page, pageSize}`, el mismo de
`/api/entidades`/`/api/inventario/hallazgos` (8 rutas ya lo usaban) —
superset del de `/api/ventas/cotizaciones` (`{data, count}`, único caso
divergente), que ganó `page`/`pageSize` de forma aditiva.

- `ordenes-compra`, `pedidos`, `congelamientos`, `excepciones`,
  `autorizaciones` pasaron al patrón `PAGE_SIZE` local +
  `.select('*', {count:'exact'})` + `.order()` + `.range()`.
  `ordenes-compra`/`pedidos` ganaron además el embed
  `entidades(nombre_comercial, nombre_legal)` — aditivo, ningún
  consumidor previo llamaba su `GET` (las pantallas leían Supabase
  directo).
- `consultas` fue el caso difícil: sus pestañas Abiertas/Resueltas
  filtraban el arreglo completo en memoria (`.filter()` en el cliente,
  cargado con `.limit(100)`). Se resolvió con `estado` aceptando una
  lista separada por comas (`.in('estado', [...])` cuando trae más de un
  valor — mismo patrón que `/api/inventario/hallazgos` con su default),
  más un `abiertas` aparte en el payload (`count:'exact', head:true`)
  para que el badge de la pestaña sea correcto también mientras la
  pestaña activa es Resueltas.
- Bug latente corregido de paso: `cotizaciones` y `notas-remision`
  parseaban `page` con `Math.max(1, Number(...))`, sin el `|| 1` que sí
  llevaban las otras 8 rutas — `?page=abc` producía `NaN` propagado a
  `.range(NaN, NaN)`/`p_offset: NaN`.
- Componente nuevo `app/components/ui/paginacion.tsx` — el bloque
  "Mostrando X–Y de N / Anterior / Siguiente" estaba copiado literal en 5
  pantallas ya existentes (`entidades-explorer.tsx`,
  `productos-explorer.tsx`, `existencias-explorer.tsx`,
  `inventario/hallazgos/page.tsx`, `solicitudes/page.tsx`), sin ninguno
  compartido, y no eran idénticas entre sí. Se usa sólo en las 4
  pantallas nuevas de este trabajo — las 5 existentes, verificadas y
  fuera de alcance, no se tocaron.
- `ordenes-compra`/`pedidos` migraron al patrón ya establecido en el repo
  (`entidades` + `entidades-explorer.tsx`): Server Component prefetchea
  con `.range(0, PAGE_SIZE-1)` y baja `initialData`/`initialCount`/
  `pageSize`; componentes cliente nuevos
  (`ordenes-compra-explorer.tsx`/`pedidos-explorer.tsx`) refetchean por
  la API.
- `autorizaciones-bandeja.tsx`/`consultas-bandeja.tsx` (que ya existían y
  ya usaban `router.refresh()` tras una mutación, patrón de otra sesión
  concurrente sobre §7.3) ganaron paginación por fetch propio +
  `useEffect` que resincroniza el estado local con los props del Server
  Component cada vez que éste cambia — así una aprobación/respuesta
  vuelve a página 1 con datos frescos sin pelear con el
  `router.refresh()` que ya disparaban esas acciones.
- `autorizaciones` ganó de paso un filtro por `estado` (Pendiente/
  Autorizada/Rechazada) — sin él, la paginación no era muy útil ahí.

## §3.3 — `costo_venta_detalle()`: una sola evaluación del costo base

Se confirmó primero el conteo real leyendo `028_ventas_precios.sql`: en
el caso común (sin override manual, familia con margen) una sola llamada
a `costo_venta_detalle()` evalúa `costo_promedio_global()` **7** veces
(3 directas + 2×2 vía las dos invocaciones internas de
`costo_venta_vigente()`) — la auditoría reportaba "hasta 4", el número
real era mayor. Postgres no memoiza una función `stable` entre llamadas
repetidas dentro del mismo `SELECT`.

Migración `036`: `create or replace` de `costo_venta_vigente()` y
`costo_venta_detalle()` con `cross join lateral` para resolver el costo
base una sola vez. Mismos `GRANT`/`REVOKE` de `028` (no los toca un
`create or replace`). Verificado dentro de `BEGIN … ROLLBACK`: se recreó
la versión anterior bajo el nombre `costo_venta_detalle_old`/
`costo_venta_vigente_old` y se comparó el `jsonb` completo (no sólo
`costo_venta`) contra la versión nueva en 7 escenarios — familia con
margen + existencia, familia sin margen sin override, override activo,
override activo + familia sin margen, sin existencia con
`producto_costos` vigente, sin existencia ni costo, producto inexistente.
Los 5 escenarios con datos dieron resultados idénticos byte a byte; los 2
de "nada" dieron `null` en ambos casos.

## §3.4 — Autorización de subtotal sin copiar/pegar UUID

Flujo real anterior (`po-detalle.tsx`): validar devuelve
`requiere_autorizacion_subtotal` → botón "Solicitar autorización" → el id
se imprime como texto plano → el usuario sale a
`/dashboard/ventas/autorizaciones`, copia el id a mano, vuelve, lo pega en
un `<input>` libre, valida otra vez.

Cambios: `GET /api/ventas/autorizaciones` ganó filtros aditivos
(`documento_tipo`, `documento_id`, `tipo`, además del `estado` ya
existente y ahora paginado — ver §3.2). `po-detalle.tsx` reemplazó el
`<input>` por un `<select>` poblado con las autorizaciones que cumplen
**exactamente** las cuatro condiciones que `ventas_po_validar()` exige
(`033:501-505`): `tipo='excepcion_subtotal'`, `estado='autorizada'`,
`documento_tipo='purchase_order'`, `documento_id=po.id`. Con exactamente
una vigente se preselecciona sola; si hay solicitudes pendientes se
muestra un aviso informativo. `ventas_po_validar()` sigue siendo la única
barrera real — el cliente sólo deja de ofrecer una opción que el SQL
fuera a rechazar.

**No se tocó** (documentado, no "arreglado"): en este esquema "vigente"
significa únicamente `estado='autorizada'` — no hay columna de caducidad
ni de consumo de un solo uso, así que una autorización aprobada sirve
indefinidamente y para revalidaciones sucesivas de la misma PO. Cambiar
eso sería una regla de negocio nueva, no una mejora de UX.

## §3.5 — Cancelar un vínculo PO↔NR

`vinculo_estado` incluye `'cancelado'` desde `033` pero ninguna función
lo escribía. Migración `036`:

- `ventas_po_nr_vinculos` ganó `cancelado_at`/`cancelado_por`/
  `motivo_cancelacion` + `vpnv_cancelacion_chk` (equivalencia
  `estado='cancelado'` ⟺ las tres no nulas, mismo idioma que
  `vaut_resolucion_chk`) y el trigger `audit_row()` que le faltaba desde
  `033` (junto con `ventas_po_partidas`, era de las pocas tablas del
  módulo sin auditoría).
- `ventas_vinculo_cancelar(p_vinculo_id, p_motivo)`: mismas guardas que
  `ventas_po_validar()` (rol → `42501`, `auth.uid()` NULL → `28000`,
  motivo vacío → `23514`). Bloquea diferido a `aprobado_para_facturacion`/
  `facturado` (`42501` — la corrección de un vínculo con consecuencia de
  facturación va por RTB-PRO-FAC-01, no por aquí) y a un `'cancelado'` ya
  existente (idempotencia, `42501`). Resuelve `po_id`/`nr_id` del vínculo
  con un `select` sin lock, y **bloquea la PO antes que el vínculo** (no
  al revés) para mantener el mismo orden de bloqueo que
  `ventas_po_validar()` y no abrir un ciclo de deadlock con una
  validación concurrente.
- Recalcula PO y NR **hacia atrás** — el `CASE` de `ventas_po_validar()`
  (`033:575-614`) sólo avanza. Con cero vínculos activos en toda la PO,
  el estado vuelve a `en_validacion` (no `parcialmente_vinculada`, que
  con cero cobertura sería engañoso); con cobertura parcial,
  `parcialmente_vinculada`. La NR sólo se toca si sigue en
  `parcialmente_respaldada`/`po_vinculada` — nunca si ya es
  `facturada`/`pagada_cerrada`/`cancelada`/`con_incidencia` — y vuelve a
  `entregada_sin_po` con cobertura cero.
- `uq_vinculo_par` (índice único parcial que excluye `estado='cancelado'`,
  ya definido en `033`) permite re-vincular el mismo par tras cancelar
  sin chocar; los dos *constraint triggers* diferidos de cobertura sólo
  pueden ver **bajar** la suma filtrada al cancelar, así que no pueden
  fallar en falso — verificado explícitamente, no asumido.
- API: `POST /api/ventas/ordenes-compra/[id]/vinculos/[vinculoId]/cancelar`.
  UI: columna "Vínculos" de `po-detalle.tsx` ganó cantidad + un botón
  Cancelar (ícono `Ban`, `MotivoDialog` con motivo obligatorio) para los
  estados cancelables — oculto para `aprobado_para_facturacion`/
  `facturado`/`cancelado`.

Verificado por SQL dentro de `BEGIN … ROLLBACK`, simulando el actor con
`set_config('request.jwt.claim.sub', ...)` (sin `set local role`: se
confirmó leyendo `current_user_role()` que sólo depende de `auth.uid()`,
no del rol de sesión de Postgres — las funciones `SECURITY DEFINER` ya
corren como su dueño): camino feliz con 2 partidas de una PO validadas
contra la misma NR, cancelar la primera (→ `parcialmente_vinculada`/
`parcialmente_respaldada`), cancelar la segunda (→ `en_validacion`/
`entregada_sin_po` con cero activos), re-vincular el mismo par
(`vinculos_creados:1`, sin choque de índice); cancelar un `facturado`/
`aprobado_para_facturacion` forzados a mano (ambos `42501` con el
mensaje esperado); doble cancelación (`42501` "ya está cancelado", sin
pisar el `cancelado_at` original); NR forzada a `facturada` que
**no** se toca al cancelar un vínculo suyo (confirma la lista de estados
intocables); rol `almacen` sin permiso (`42501`, vínculo sigue
`validado` — el intento no mutó nada); motivo vacío (`23514`); `CHECK`
directo (`insert` con `estado='cancelado'` sin las tres columnas →
`23514`); índice único (segundo vínculo activo del mismo par mientras el
primero seguía activo → `23505`); `audit_log` con filas para el `insert`
y el `update` de cancelación. `get_advisors` sin `ERROR` nuevo tras
aplicar `036` — sólo el `WARN` esperado de `SECURITY DEFINER` para
`ventas_vinculo_cancelar`, mismo patrón ya aceptado en todo el módulo.

## §3.6 — Permisos de PO entre vendedores: sin cambio

`ventas_ordenes_compra_cliente` no tiene `vendedor_id` (a diferencia de
`ventas_cotizaciones`/`ventas_pedidos`/`ventas_notas_remision`, que sí lo
tienen y lo usan en RLS) y `ventas_po_validar()` sólo comprueba
`current_user_role()` — cualquier `ventas`/`direccion`/`super_admin`
puede validar/vincular la PO de cualquier cliente. El comentario de
`030:165-168` sugiere que es intencional ("una PO consolidada puede
involucrar NR de otro vendedor del mismo cliente"), pero el texto de
`db/procesos/ciclo-de-venta.md` ("igual que cotizar") sugería lo
contrario antes de esta sesión. No se cambió autorización por suposición
— se aclaró el texto de proceso y se dejó la pregunta concreta pendiente
en el TODO de `CLAUDE.md`: ¿una PO consolidada puede cubrir NR de varios
vendedores? Si la respuesta es no, la corrección (restringir
`ventas_po_validar()` por `vendedor_id` de las NR vinculadas) no necesita
columna nueva.

## Verificación clic a clic

Con usuarios QA (`qa.<rol>@qa.refacrtb.mx`), nunca la cuenta del dueño
del proyecto. PO real `POC-000016` (`PO-VERIF-036`, cliente `QA Cliente
Uno`) con 2 partidas (3@$140, 5@$124 — subtotal $1,040 en ambos casos,
para forzar `requiere_autorizacion_subtotal`) vinculadas contra las 2
líneas ya entregadas de `NR-000035` (3 y 5 piezas, mismo producto
`RTB-FER-000006`, evidencia de la campaña anterior):

1. `QA Ventas` valida → `{success:false, motivo:'requiere_autorizacion_subtotal'}`
   → "Solicitar autorización a Dirección" → solicitud creada.
2. `QA Dirección` la aprueba desde `/dashboard/ventas/autorizaciones`
   (paginación real confirmada ahí: "Mostrando 1–1 de 1", filtro por
   estado visible).
3. `QA Ventas` vuelve a la PO — el selector de autorización ya la
   muestra preseleccionada ("Autorizada 7/8/2026 — Los unitarios varían
   pero el subtotal de la PO coincide."), sin teclear ningún id. Valida
   de nuevo → éxito, PO `vinculada`, 2 vínculos creados.
4. Cancela el vínculo de la partida de 3 piezas con motivo → PO baja a
   `parcialmente_vinculada`, badge de esa partida cambia a "Cancelado"
   (sin botón de cancelar, correcto). Confirmado por SQL directo:
   `estado='cancelado'`, `cancelado_por`=uuid de `QA Ventas`,
   `motivo_cancelacion` con el texto exacto capturado; PO
   `parcialmente_vinculada`; NR `parcialmente_respaldada` (bajó de
   `po_vinculada`); `audit_log` con las dos filas (`insert`/`update`).
5. `/dashboard/ventas/ordenes-compra`, `/pedidos`, `/autorizaciones`,
   `/consultas`: las 4 pantallas cargan con controles de paginación
   visibles y estado consistente ("Mostrando 1–N de N", Anterior/
   Siguiente deshabilitados con pocos datos; `pedidos` mostró 3 filas —
   incluidas 2 creadas por la sesión concurrente del hallazgo #1 — con
   la columna Cliente poblada vía el embed nuevo).

**Sesión concurrente:** el navegador (misma extensión Claude in Chrome,
mismo perfil de Chrome) se compartió con la sesión que corrigió el
hallazgo #1 en paralelo sobre este repositorio. La cookie de sesión de
Supabase Auth es por origen, no por pestaña — varias veces un login de
esta sesión se vio pisado por el login de la otra a media acción
(`POST` respondido con "No autenticado" que en realidad sí se había
ejecutado bajo el usuario anterior, o viceversa). Se resolvió reintentando
y, ante cualquier duda, confirmando el resultado real por SQL directo en
vez de sólo por la pantalla — mismo criterio ya documentado para
sesiones concurrentes en el proyecto. Ningún dato de prueba de esta
sesión (prefijo ninguno especial, PO real `POC-000016`) se purgó —
mismo criterio que otras campañas QA del repo.

`npx tsc --noEmit` (incremental tras cada bloque) y
`docker build --target builder -f Dockerfile .` (TypeScript real,
`ignoreBuildErrors:false`) limpios al cierre.

## Fuera de alcance (para otra sesión)

- Hallazgo crítico #1 (`ventas_nr_despachar()`) — corregido por la sesión
  concurrente, migración `035`.
- §7.3 (refresco de UI tras mutación), §7.4 (UUID crudo de producto),
  §7.5 (badge "Próximamente"), §7.6 (costo vigente sin refrescar) — de la
  misma auditoría, fuera del alcance §3 de esta sesión.
- Las 5 pantallas ya paginadas (`entidades`, `productos`, `existencias`,
  `hallazgos`, `solicitudes`) no se migraron al componente
  `paginacion.tsx` nuevo — quedan como estaban, verificadas y fuera de
  alcance.
- Crear pantallas para `congelamientos`/`excepciones` — hoy no existen;
  sólo se paginaron sus endpoints.
