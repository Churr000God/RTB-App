# Sesión 2026-08-07 — RTB-VEN-01: corrección de UX/refresco/presentación (§7.1, 7.3–7.6 de la auditoría)

## Punto de partida

`contexto/AUDITORIA_RTB-VEN-01.md` dejó, además del hallazgo crítico #1
(despacho de NR, corregido por otra sesión sobre este mismo repositorio
con la migración `035`), cinco defectos de experiencia detectados en la
verificación clic a clic con los 8 usuarios QA: §7.1 (crash de
`Tooltip`, ya corregido por la propia sesión de auditoría), §7.3 (la UI
no refresca tras una mutación exitosa — riesgo real de doble envío),
§7.4 (UUID crudo de `producto_id` en vez de nombre), §7.5 (la tarjeta de
Ventas del dashboard seguía en "Próximamente" pese a estar activo) y
§7.6 (el KPI "Costo vigente" no se actualiza tras registrar un costo).

Encargo: cerrar §7.1 (confirmar), §7.3–§7.6, con una revisión preventiva
de pantallas cercanas del módulo por el mismo defecto de refresco, sin
tocar migraciones SQL, RLS, `inventario_apartados` ni la lógica de
despacho de NR (eso era el hallazgo #1, tarea aparte ya tomada por otra
sesión).

**Tres decisiones tomadas antes de implementar** (`AskUserQuestion`):
feedback de éxito = indicador inline «Actualizando…» hasta que el
refresco termina, más `toast` de `sonner` sólo donde no hay cambio
visible (guardar política comercial, registrar costo); `inventario/
ajustes/[id]/page.tsx` recibe el fix mínimo del refresco, no una
reestructuración a Server Component + cliente (es RTB-INV-01 y la
auditoría sólo reporta el refresco, no la arquitectura de la pantalla);
no se añade un `TooltipProvider` global — se mantienen los locales y se
documenta la convención.

**Sesión concurrente:** esta sesión trabajó en paralelo con otras dos
sobre el mismo repositorio (hallazgo #1 de despacho, migración `035`, y
§3 de rendimiento/paginación, migración `036` — ver
`sessions/2026-08-07-ventas-optimizaciones.md`). La cookie de sesión de
Supabase Auth es por origen, no por pestaña: varias veces un login de
esta sesión se vio pisado por el login de otra a media verificación
(`QA Ventas` apareciendo como `QA Dirección` sin haber cerrado sesión, o
viceversa). Se resolvió cerrando sesión y reingresando con cuidado
(evitando el autocompletado del navegador, que en un caso sustituyó el
correo tecleado) y confirmando cada resultado en pantalla antes de
continuar. `npx tsc --noEmit` se corrió varias veces durante la sesión,
no sólo al final, para detectar de inmediato si un archivo compartido
con otra sesión quedaba en un estado a medio escribir.

## §7.1 — Crash de `Tooltip` al elegir producto en cotización

Ya venía corregido de la propia sesión de auditoría
(`cotizacion-detalle.tsx:10` con `TooltipProvider` importado y
envolviendo el `<Tooltip>` de "Costo de Venta" localmente). Se confirmó
en el navegador que elegir un producto no truena la pantalla y el
tooltip abre. Se dejó documentada la convención en
`app/components/ui/tooltip.tsx`: el repo no monta un `<TooltipProvider>`
global (ni en `app/layout.tsx` ni en `dashboard/layout.tsx`) — cada uso
nuevo de `<Tooltip>` necesita envolver el suyo local, es lo que evita la
recaída de este mismo crash. Se descartó un provider global: sólo 2
archivos del repo usan `<Tooltip>`, ambos ya con provider local, y uno
global en `DashboardShell` no cubriría `/login`.

## §7.3 — La UI no refresca tras una mutación exitosa

**Causa raíz, dos mecanismos:**

1. **Estado espejo de props del servidor.** Las 4 pantallas de detalle
   de Ventas (`cotizacion-detalle.tsx`, `pedido-detalle.tsx`,
   `nr-detalle.tsx`, `po-detalle.tsx`) hacían `useState(propDelServidor)`.
   `router.refresh()` re-renderiza el árbol con props nuevas, pero un
   `useState` sólo lee su argumento en el primer render — el espejo
   ignoraba el dato fresco para siempre. Por eso "Aprobar" dejaba el
   badge en "Enviada" aunque el `accion()` de la pantalla ya llamaba a
   `router.refresh()`.
2. **El refetch de cliente que sí existía no se esperaba antes de
   reactivar el botón, y tragaba sus propios errores.** `void cargar()`
   corría después de `setLoading(false)`, así que el botón se reactivaba
   con datos viejos en pantalla — la ventana exacta en la que un usuario
   reintenta. `if (res.ok) {…}`/`if (data?.data) {…}` sin `else`
   convertían un refetch fallido en "no pasó nada".

**Regla adoptada para el módulo:** el Server Component es la única
fuente de verdad para lo que vive en la base; el estado de cliente sólo
guarda lo que el servidor no sabe (formularios en captura, diálogos
abiertos, vínculos propuestos aún no persistidos, resultados efímeros de
una validación).

**Infraestructura nueva:**

- `app/lib/ui/use-accion-servidor.ts` — hook `useAccionServidor()`:
  `ejecutar(url, init)` hace el `fetch` con `cache:'no-store'`, captura
  el error de red y el del cuerpo de la respuesta, y en éxito dispara
  `startTransition(() => router.refresh())`. Expone `{ejecutar, enviando,
  refrescando, ocupado, error, setError}` — `ocupado` cubre toda la
  ventana de riesgo (POST + refresh), no sólo el POST.
- `app/components/ui/actualizando.tsx` — `<Actualizando activo />`:
  indicador «Actualizando…» junto al badge de estado mientras el
  refresco sigue en vuelo.

**Pantallas corregidas** (se retira el `useState(prop)` y el `recargar()`
que duplicaba la petición; se usan las props directas y `useAccionServidor()`):

- `cotizacion-detalle.tsx` — `LineaRow`/`AgregarLineaForm` usan el hook
  directamente; desaparecen los callbacks `onCambio`/`onAgregada`.
- `pedido-detalle.tsx` — además se retiró la inferencia
  `url.includes('liberar')` para decidir el nuevo estado: ahora lo dice
  el servidor.
- `nr-detalle.tsx` — `cobertura` ya era prop pura, así que las 4 tarjetas
  de cobertura se recalculan solas tras despachar; se mantuvo el
  `setOpen(false)` **antes** del refresco en `DespacharDialog` (el
  diálogo cierra de inmediato, el refresh sigue en una transición
  diferida).
- `po-detalle.tsx` — `propuestos`/`resultado`/`aceptarCodigo`/
  `autorizacionId` se conservan como estado local (no vienen del
  servidor, y `router.refresh()` no desmonta componentes cliente, así
  que sobreviven al refresco). **Excepción documentada:** `validar()`
  NO usa `useAccionServidor()` — `ventas_po_validar()` responde `200`
  con `{success:false, motivo, mensaje}` como resultado de negocio
  válido (PO bloqueada/rechazada, nada persistido), así que refrescar en
  ese caso sería tráfico de red sin motivo; el hook sólo se usa para
  `validar()` cuando `success===true` (manual, con `useTransition`
  propio) y para el resto de acciones de la pantalla (agregar partida).
  `solicitarAutorizacion()` ganó la rama de error que antes no tenía
  (`if (!res.ok) setError(...)`). `PartidasCard.lineaNumero` pasó de
  `useState(String(partidas.length + 1))` (se desincronizaba desde la
  segunda alta) a derivarse de las props en cada render
  (`Math.max(...partidas.map(p => p.linea_numero)) + 1`), con
  `useState<string|null>` sólo para la edición manual del campo.
- `components/ventas/cartera-comercial-tab.tsx` — `guardarPolitica()` no
  hacía nada tras el `ok`; ahora `toast.success('Política comercial
  guardada.')` + `router.refresh()`. `cargarEstado()` con
  `cache:'no-store'` y error visible.
- `ventas/consultas/consultas-bandeja.tsx`,
  `ventas/autorizaciones/autorizaciones-bandeja.tsx` — mismo tratamiento
  preventivo (ya refrescaban, pero con un segundo `GET` propio sin
  `no-store`; se pasaron al hook/patrón único del módulo).

**Mismo defecto fuera de Ventas, encontrado de paso:**

- `app/app/dashboard/inventario/ajustes/[id]/page.tsx` (RTB-INV-01) —
  fix mínimo, sin reestructurar el archivo (es la única pantalla de
  detalle 100% cliente del repo, decisión explícita de no tocar su
  arquitectura en esta sesión): `accion()` ahora espera `cargar()` antes
  de reactivar el botón, `cargar()` usa `cache:'no-store'` y muestra el
  error del refetch (antes se tragaba en silencio), y `router.refresh()`
  se agregó para invalidar el Router Cache de Next — sin él, volver a la
  bandeja `/dashboard/inventario/ajustes` o a la ficha de un producto
  tras aplicar un ajuste servía un payload RSC viejo.
- `app/app/dashboard/productos/[id]/producto-detalle.tsx` — ver §7.6.

## §7.4 — UUID crudo de producto en vez de nombre

Las consultas de servidor de Ventas hacían `.select('*')` sin ningún
embed a `productos`. Se añadió `productos(codigo_interno, nombre)` en:

- `ventas/cotizaciones/[id]/page.tsx`, `ventas/pedidos/[id]/page.tsx`,
  `ventas/remisiones/[id]/page.tsx` (Server Components).
- `api/ventas/cotizaciones/[id]/route.ts`,
  `api/ventas/pedidos/[id]/route.ts`,
  `api/ventas/notas-remision/[id]/route.ts` (los `GET` que esas mismas
  pantallas usan para refrescar) — additivo, no rompe ningún consumidor
  existente.

Viable porque ya existían las FKs `producto_id references
public.productos(id)` en `ventas_cotizacion_lineas` (030), `ventas_
pedido_lineas` (031) y `ventas_nr_lineas` (032), y la política
`productos_select` (009) permite `SELECT` a los 8 roles — mismo patrón
ya funcional en `api/inventario/ajustes/[id]/route.ts`.

Componente nuevo, `app/components/inventario/producto-etiqueta.tsx`
(`<ProductoEtiqueta>`), junto a `producto-combobox.tsx` (Ventas ya
importa de ahí): nombre sobre código interno
(`text-xs text-muted-foreground tabular-nums`, mismo formato que el
combobox); si la línea está "en consulta" y sin producto de catálogo
todavía, muestra la `descripcion_libre` sobre "Sin producto de catálogo"
en ámbar (mismo fondo que ya usaba esa fila); si no hay ni producto ni
descripción, "Producto no disponible" con el UUID sólo en `title=` para
soporte — **nunca se pinta el UUID como texto visible**. Se usa en
`cotizacion-detalle.tsx` (tabla y fila "en consulta"),
`pedido-detalle.tsx`, `nr-detalle.tsx` (tabla y diálogo de despacho) y
también en `inventario/ajustes/[id]/page.tsx`, que antes mostraba el
nombre pero perdía el código interno (`l.productos?.nombre ??
l.producto_id`, sin código).

`app/types/inventario.ts` ganó `ProductoResumen` (forma mínima del
embed); `app/types/ventas.ts` ganó `productos?: ProductoResumen | null`
en `CotizacionLineaRow`/`PedidoLineaRow`.

## §7.5 — Tarjeta "Ventas" del dashboard seguía en "Próximamente"

`app/app/dashboard/page.tsx` mantenía su propio arreglo `MODULE_CARDS`
con el badge "Próximamente" **hardcodeado** en el `.map()`, sin ningún
filtro por rol — una segunda lista de módulos, desincronizada de
`NAV_SECTIONS` (`app/lib/rbac/config.ts`, la que ya usa el sidebar, y
donde Ventas dejó de tener `badge` desde que se activó).

Se sustituyó por `getNavForRole(role)` filtrando la sección "Módulos"
(constante nueva `SECCION_MODULOS` exportada en `lib/rbac/config.ts`,
para no dejar el string "Módulos" repetido y sin nombre). Queda un mapa
local sólo de **presentación** (color de marca, descripción) indexado
por `href` — el resto (qué módulos existen, para qué rol, si tienen
badge) viene de la fuente única. Sin `badge` la tarjeta es ahora un
`<Link>` navegable; con `badge` sigue siendo un recuadro atenuado no
interactivo, mismo criterio que ya aplica el sidebar. El `StatCard`
"Módulos Planificados" (antes `MODULE_CARDS.length`, fijo en 6 para
cualquier rol) pasó a "Módulos disponibles" = los que ese rol ve sin
badge.

## §7.6 — "Costo vigente" no se refresca tras registrar un costo

Dos piezas — arreglar sólo el refresco habría dejado al usuario viendo
el mismo número sin explicación, indistinguible de que el fix no
funcionó:

1. **Refresco real.** `CostosTab.registrarCosto` en `producto-detalle.tsx`
   ahora espera `cargar()` (histórico — refetch obligatorio, no viene
   del Server Component), muestra `toast.success('Costo de catálogo
   registrado.')` y dispara `startTransition(() => router.refresh())`,
   que reevalúa la RPC `costo_unitario_vigente` (prop del Server
   Component, `productos/[id]/page.tsx:26`) y con ella el KPI de
   cabecera. `cargar()` del histórico ganó `cache:'no-store'` y muestra
   su error en vez de dejar la tabla vacía en silencio.
2. **No mentir sobre por qué la cifra no se mueve.**
   `costo_unitario_vigente()` (`011_inventario_kardex.sql:690-708`) es
   una cascada que prioriza `inventario_existencias.costo_promedio`
   (la fila con más `cantidad_teorica`) sobre `producto_costos` — en un
   producto con existencias valuadas (`RTB-FER-000006`, con stock real
   de `AJU-000018`), un costo de catálogo nuevo **legítimamente no
   cambia** el KPI. Se replicó en `ProductoDetalle` sólo la primera rama
   de esa cascada (la única verificable con los datos que la página ya
   trae — `existenciasIniciales`) para derivar `fuenteCosto`: "Promedio
   de inventario" o "Catálogo o proveedor", pintado como nota bajo el
   KPI (`KpiCard` ganó una prop `nota?`). Cuando aplica, la pestaña
   Costos muestra además un aviso explicativo antes del formulario de
   alta.

## Verificación clic a clic

Con usuarios QA reales (`qa.<rol>@qa.refacrtb.mx`), nunca la cuenta del
dueño del proyecto:

1. **`qa.almacen`** — dashboard: tarjeta Ventas activa y navegable, sin
   "Próximamente"; Almacén con "Próximamente"; "Módulos disponibles: 1".
2. **`qa.almacen` → `qa.direccion`** — ajuste nuevo `AJU-000019`: agregar
   línea de `RTB-FER-000006` (cantidad -1) → aparece en la tabla al
   instante con código+nombre, sin UUID; "Enviar a autorización" → badge
   cambia a "Pendiente de autorización" sin recargar. `qa.direccion`
   autoriza → badge "Autorizado" y aparece "Aplicar al kardex" sin
   recargar; aplica → badge "Aplicado" sin recargar. Volver a la bandeja
   `/dashboard/inventario/ajustes` → el estado nuevo ya se ve (confirma
   la invalidación del Router Cache, no sólo de la ruta activa).
3. **`qa.direccion`** — dashboard: mismo resultado que `qa.almacen`
   (Ventas activa, resto "Próximamente").
4. **`qa.ventas`** — cotización nueva `COT-000061`: elegir producto no
   truena la pantalla (§7.1), tooltip de "Costo de Venta" abre; agregar
   línea → aparece al instante con código+nombre; "Enviar al cliente" →
   badge "Enviada" sin recargar; "Aprobar (cliente aceptó)" → el diálogo
   cierra, badge "Aprobada" y los botones cambian sin recargar (el
   defecto exacto de §7.3).
5. **`qa.direccion`** — pedido `PED-000041` (generado por la aprobación
   anterior): producto con código+nombre; "Liberar a Almacén" → badge
   "Liberado a Almacén" por dato real del servidor, no por
   `url.includes('liberar')` como antes.
6. **`qa.ventas`** — NR `NR-000014` (la misma de la reproducción del
   hallazgo #1, con sus 2 líneas de 5 y 3 piezas del mismo producto):
   ambas líneas muestran código+nombre en la tabla y en el diálogo de
   despacho, ningún UUID; registrar un seguimiento → aparece en la lista
   al instante sin recargar.
7. **`qa.compras`** — `RTB-FER-000006` → pestaña Costos: aviso "Este
   producto tiene existencias valuadas..." visible antes de registrar;
   KPI "Costo vigente $100.00" con nota "Promedio de inventario" bajo el
   número. Intento de registrar un segundo costo mientras el anterior
   sigue vigente sin fecha de cierre → error real de negocio mostrado en
   el formulario ("Ya existe un costo vigente sin fecha de cierre; cierra
   el anterior primero"), no un silencio — confirma que el error del
   `ejecutar()`/`cargar()` sí llega a la pantalla.

`npx tsc --noEmit` y `docker build --target builder -f Dockerfile .`
(TypeScript real, `ignoreBuildErrors:false`) limpios, verificados varias
veces durante la sesión (no sólo al cierre) por la escritura concurrente
de otras dos sesiones sobre archivos compartidos del mismo módulo.

## Fuera de alcance (para otra sesión)

- Hallazgo crítico #1 (`ventas_nr_despachar()`) — corregido en paralelo
  por otra sesión, migración `035`.
- §3 de la auditoría (rendimiento/paginación) — corregido en paralelo
  por otra sesión, migración `036`; ver
  `sessions/2026-08-07-ventas-optimizaciones.md`.
- Migrar `inventario/ajustes/[id]/page.tsx` a Server Component + detalle
  cliente (como `conteos/[id]`) — decisión explícita de esta sesión de
  no reestructurar esa pantalla, sólo su refresco.
- Vía B (PO directa sin NR) y el reloj de cobranza/CFDI de
  RTB-PRO-FAC-01 — sin relación con esta sesión, quedan en el TODO del
  proyecto.
