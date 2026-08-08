# Sesión 2026-08-08 — Cotizaciones: búsqueda, tablero por estado y filtros

## Punto de partida

El dueño del proyecto pidió, en el módulo de Ventas, agregar a la pantalla de
Cotizaciones una barra de búsqueda por cliente/siglas/folio, una vista en
formato tarjetas tipo tablero usando los estados de la cotización, y filtros
por fecha de creación/aprobación (y cualquier otro campo útil).

La exploración mostró que `/dashboard/ventas/cotizaciones` era la única
pantalla de listado de Ventas que había quedado fuera de la migración a
"explorer" de la sesión de optimizaciones (`sessions/2026-08-07-ventas-optimizaciones.md`):
Server Component de 87 líneas con `.limit(50)` fijo, sin `count`, sin
paginación, sin búsqueda, y con un único filtro (`?estado=`) que le llegaba
del tablero de Ventas. El GET de `/api/ventas/cotizaciones` sí paginaba pero
ni siquiera traía el embed de `entidades` que el `page.tsx` necesitaba — el
mismo defecto de "dos fuentes de filtros que divergen" que ya se había
corregido en otras pantallas de Ventas.

Decisiones cerradas con el dueño del proyecto antes de implementar
(`AskUserQuestion`): tarjeta completa con monto total; un selector de campo
de fecha + un solo rango (no dos rangos independientes); filtros de "sólo
mías"/vendedor, canal, por vencer/vencidas y líneas en consulta; vista por
defecto **tablero**, recordando la última elegida.

## 1. Esquema — migración `038_ventas_cotizaciones_listado.sql`

Hechos verificados antes de diseñar: `ventas_cotizaciones` tiene
`entidad_id` (FK a `entidades`, no `cliente_id`); no existe columna de
total en la cabecera (vive en `sum(ventas_cotizacion_lineas.importe) where
activo`); sólo hay `enviada_at`/`resuelta_at` como timestamps de ciclo (no
existe `aprobada_at` — "fecha de aprobación" es `resuelta_at` con
`estado='aprobada'`); los únicos índices eran `(entidad_id)`,
`(vendedor_id)`, `(estado)` — nada sobre fecha, que es justo por dónde
ordena y filtra el listado nuevo.

Se creó la vista **`ventas_cotizaciones_listado`**
(`security_invoker = true` — primera vista de todo el repo) que aplana
`entidades` (`entidad_clave`/`entidad_siglas`/`entidad_nombre_legal`/
`entidad_nombre_comercial`) y agrega `total`/`lineas_count`/
`lineas_en_consulta`. El patrón "función, no vista" ya documentado en
`002_entidades_core.sql:496` existe para el caso de *saltarse* la RLS
(`security_invoker=false`, que el advisor marca `ERROR`) — aquí es al
revés: se quiere heredar la RLS de las tres tablas base tal cual, y
`security_invoker=true` no dispara ese advisor. Confirmado antes de
construir la vista que `ventas_cotizaciones_select`, `entidades_select` y
`ventas_cotizacion_lineas_select` son las tres exactamente
`using (current_user_role() is not null)` — ningún rol pierde filas por el
join.

Corrección post-primer-diseño (un agente Plan corrió en paralelo y aportó
dos mejoras reales, incorporadas antes de dar la migración por cerrada):
`LEFT JOIN` a `entidades` en vez de `INNER JOIN` — `entidad_id` es
`NOT NULL` con FK y hoy nunca falta la fila, pero con `security_invoker`
un `INNER JOIN` haría que la completitud del *listado de cotizaciones*
dependiera de la RLS de *otra* tabla; si `entidades_select` se estrechara
algún día por rol, cotizaciones enteras desaparecerían del listado en
silencio. Con `LEFT JOIN`, en ese escenario sólo se pierde el nombre del
cliente. Se aplicó como un `CREATE OR REPLACE VIEW` de corrección el mismo
día (mismo criterio que `030` + `ventas_cotizacion_before_update_fix` en
el historial de migraciones aplicadas) y se verificó con `EXPLAIN
(analyze, buffers, verbose)` que el `LEFT JOIN LATERAL` de líneas se poda
por completo del plan cuando PostgREST pide sólo `count(*)` — no hay
`SubPlan` sobre `ventas_cotizacion_lineas` en ese caso, así que el conteo
exacto de cada página/columna del tablero no paga la agregación.

4 índices nuevos: `created_at desc`, `enviada_at desc` (parcial),
`resuelta_at desc` (parcial), `vigencia_hasta` (parcial). `GRANT SELECT`
explícito a `authenticated` sobre la vista — el gotcha de RLS-sin-GRANT
(falla en silencio, `42501` no capturado) aplica igual a una vista;
verificado revocando el grant en una transacción con rollback y
confirmando el `42501`.

## 2. Capa compartida — `app/lib/ventas/listado-cotizaciones.ts`

Pivote anti-duplicación: el GET (modo lista), el GET (modo tablero, una
consulta por estado) y el `page.tsx` necesitan exactamente los mismos
filtros. `parsearFiltrosCotizacion()` acepta tanto `URLSearchParams` como
el `searchParams` de Next, valida cada enum contra su tupla `as const`
(el endpoint viejo no validaba `estado`, así que `?estado=xxx` habría dado
un `22P02` crudo), y resuelve `solo_mias=1` al `auth.userId` real del que
llama — nunca confía en un `vendedor_id` que mande el cliente para "sólo
mías". `aplicarFiltrosCotizacion()` encadena `.or()/.in()/.eq()/.gte()/
.lt()`; el cierre del rango de fecha es distinto según la columna sea
`timestamptz` (límite superior exclusivo al día siguiente) o `date`
(`vigencia_hasta`, `.lte()` directo) — el caso que se verificó
explícitamente en el navegador porque es el que más fácil se rompe.
`ordenarCotizaciones()` añade `folio desc` como desempate determinista
(mismo problema de fondo que el gotcha ya documentado de `created_at` sin
desempatar filas hermanas de un mismo `INSERT`).

Escapado de búsqueda: el patrón existente en `api/entidades/route.ts` sólo
neutraliza `%`/`_`, no comas ni paréntesis — que son separadores
estructurales de `or=(...)` en PostgREST. La razón social real de QA
("QA Cliente Uno, S.A. de C.V.") tiene coma, así que el caso no es de
laboratorio. Se resolvió envolviendo el valor en comillas dobles
(`folio.ilike."%valor%"`), verificado clic a clic sin `PGRST100`.

## 3. API y UI

`GET /api/ventas/cotizaciones` (el `POST` no se tocó): nuevo contrato con
`q`, `estado` (ahora acepta lista separada por comas, compatible con el
`?estado=borrador` que ya mandaba el tablero de Ventas), `fecha_campo` +
`desde`/`hasta`, `entidad_id`, `vendedor_id`/`solo_mias`, `canal`,
`vigencia`, `en_consulta`, `orden`, `vista` (`lista`/`tablero`), `page`,
`tope`. Se aprovechó para cablear `ventas_cotizaciones_expirar()` (034) —
su propio comentario decía "se invoca al cargar el listado de
cotizaciones" pero el único llamador real era `notas-remision/route.ts`;
sin esto la columna "Expirada" del tablero mentía hasta que alguien abría
Remisiones.

UI nueva bajo `app/app/dashboard/ventas/cotizaciones/`:
`cotizaciones-explorer.tsx` (estado de filtros/vista/página, debounce de
300 ms en la búsqueda, guarda anti-carrera con un contador de petición,
vista inicial siempre `'tablero'` con lectura de `localStorage` en
`useEffect` — nunca en el inicializador de `useState`, mismo criterio que
`productos-explorer.tsx` para no romper la hidratación),
`cotizaciones-filtros.tsx` (búsqueda, chips de estado multi-selección,
panel plegable de fecha/canal/vendedor/vigencia/en-consulta),
`cotizaciones-tablero.tsx` + `cotizacion-tarjeta.tsx` (6 columnas en el
orden del ciclo de vida, `count` real de PostgREST por columna — no
`data.length`, acotado por `tope` —, "Ver las N restantes" cuando hay más
de las mostradas; sólo lectura, sin drag & drop porque toda transición
pasa por una función `SECURITY DEFINER` y `rechazar`/`cancelar` exigen
`motivo_resolucion`), `cotizaciones-tabla.tsx` (con `<Paginacion>`
compartido). Componente nuevo `components/ui/rango-fechas.tsx`: primer
consumidor de `components/ui/calendar.tsx`, huérfano desde la purga de
componentes de la sesión de optimizaciones.

## 4. Verificación

SQL simulando rol real (`ventas`, UUID resuelto como literal antes de
`set local role authenticated` — el gotcha ya documentado): conteo de la
vista igual al de la tabla base; total de la vista igual a
`sum(importe) where activo` calculado aparte en las 6 filas existentes;
`42501` al revocar el `GRANT` de la vista, ruta normal al restaurarlo;
`EXPLAIN` confirmando la poda del `LEFT JOIN LATERAL` en `count(*)`.
`get_advisors` (security): sin ningún `ERROR` nuevo y, en particular, sin
`security_definer_view` — todos los `WARN` son los ya aceptados y
documentados en `db/ESQUEMA.md`. `npx tsc --noEmit` y
`docker build --target builder` limpios.

Clic a clic real con la extensión Claude in Chrome, usuario `qa.ventas@`:
búsqueda por folio, por siglas (`QATST`) y por razón social **con coma**
("QA Cliente Uno, S.A." — 4 resultados correctos, sin romper el `.or()`);
filtro de fecha de creación acotado a un solo día (7 de agosto) devolviendo
5 de 6 (excluye correctamente la del 8 — la prueba exacta del cierre de
rango); cambio de campo a "Fecha de envío" con el mismo rango excluyendo
los 2 borradores sin `enviada_at` (3 resultados); "Sólo mías" filtrando a
las 4 cotizaciones de `QA Ventas (prueba)`; deep-link `?estado=borrador`
desde el tablero de Ventas con el chip activo y el enlace "ver todas";
persistencia de la vista tabla/tablero en `localStorage` tras F5, sin
parpadeo ni warning de hidratación en consola; `count` real por columna
del tablero confirmado con `tope=1` vía `fetch` directo desde la consola
del navegador (columnas con más tarjetas de las mostradas). Acceso negado
confirmado con `qa.almacen@` (redirect a `/dashboard`, sin `Ventas` en el
sidebar) y `403 {"error":"Sin permisos"}` en el API. Sin cambios de RLS,
sin `service_role` nuevo.

## Alcance dejado fuera, anotado

Orden "Mayor/menor monto" no se verificó con `EXPLAIN` a escala real (la
base tiene 6 filas) — si el catálogo real de 1,388 SKU y su volumen de
cotizaciones hacen que ordenar por `total` sea costoso, ese `EXPLAIN`
queda pendiente antes de confiar en el índice implícito. Cancelar/rechazar
una cotización desde la UI para poblar esas dos columnas del tablero con
datos reales (hoy vacías, mensaje correcto "Sin cotizaciones en este
estado") no se ejerció en esta sesión — el mecanismo ya estaba
verificado en la auditoría de RTB-VEN-01, no era el objeto de este cambio.
