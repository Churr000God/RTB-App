# Sesión 2026-08-10 — RTB-ENT-01: leyenda de crédito, condición de proveedor, filtros de solicitudes, y hallazgo de "producto sin activar"

## Punto de partida

El dueño del proyecto dio de alta un cliente él mismo con `super_admin` y
notó que el aviso "supera $100,000, requiere aprobación" sólo aparecía
**después** de teclear una cifra sobre el umbral — pidió una leyenda fija.
A partir de ahí, en la misma conversación, pidió tres cosas más
encadenadas: (1) auditar cuáles de los 8 cambios controlados de P05 ya
tenían interfaz real para proponer/aprobar y construir las que faltaran,
(2) agregar búsqueda y filtros a `/dashboard/solicitudes`, (3) revisar por
qué un producto que él mismo dio de alta (`SLIM 18W CUADRADA SL CALIDO`)
se quedaba en `estado='borrador'` para siempre.

Esta sesión trabajó en paralelo con otra sobre el mismo repositorio que
tocó archivos compartidos (`entidad-detalle.tsx`, `permisos.ts`,
`REGLAS_APROBACION`) — ver `sessions` de esa sesión y
`rtb-ent01-p05-contactos-modal-fix.md` en memoria. Esa sesión agregó
`persona_tipo` como cambio controlado nuevo (migración `054`) y amplió
`rfc`/`razón social` para que `ventas` también pueda iniciarlos, construyendo
la tarjeta **"Información Fiscal"** con el componente `CampoP05`. Esta
sesión reutilizó exactamente ese patrón para el hueco que sí le tocaba
(`condicion_proveedor`), en vez de inventar uno paralelo — se verificó
`tsc --noEmit` limpio sobre el estado combinado de ambas antes de cerrar.

## 1. Leyenda del límite de crédito, siempre visible

Antes: `{condición && <p>Supera $100,000...</p>}` en dos sitios (alta y
edición de cliente) — sólo se veía después de escribir un monto sobre el
umbral, y el texto era inexacto para `super_admin` ("quedará pendiente de
aprobación" aunque ese rol ejecuta directo).

Componente nuevo `app/components/entidades/aviso-credito.tsx`
(`<AvisoLimiteCredito>`): decide con `ejecutaDirecto('limite_credito',
role)` — la misma función que ya usan las rutas de API, nunca una copia
paralela — y renderiza siempre uno de cuatro textos (¿supera el umbral? ×
¿el rol ejecuta directo?). De paso, `entidades/nueva/page.tsx` corrigió su
propio cálculo de `requiereAprobacion`, que sólo miraba el umbral sin
consultar `ejecutaDirecto`.

Verificado con `qa.ventas` (alta y edición: leyenda ⓘ visible desde $0,
cambia a ⚠ al superar $100,000) y `qa.superadmin` (mismo flujo, texto "tu
rol lo aplica directo", cambio aplicado sin solicitud).

## 2. Auditoría de los 8 cambios controlados — hueco real en `condicion_proveedor`

El lado de **aprobar/rechazar** resultó ser uno solo, genérico, y cubría
los 8 tipos desde siempre vía `/dashboard/solicitudes` (decide con
`REGLAS_APROBACION[tipo].aprueba` en el servidor — no hay pantalla
dedicada por tipo). El lado de **proponer** tenía un hueco real:
`condicion_proveedor` (categoría + condición de pago de un proveedor) no
tenía ningún camino de escritura desde la UI — la tarjeta "Condiciones
comerciales · Proveedor" era de sólo lectura, sin lápiz ni ruta, aunque el
resolver ya sabía aplicarlo (`CAMPOS_PERMITIDOS.condicion_proveedor`) y la
regla ya estaba declarada en `REGLAS_APROBACION` desde el origen del
módulo. Confirmado a nivel de esquema que es un cambio controlado real, no
sólo de UI: `categoria`/`condicion_pago` nunca tuvieron `GRANT UPDATE` para
`authenticated` (`015_catalogo_marcas_y_gobierno.sql`).

Cerrado con:

- **`PATCH /api/entidades/[id]/proveedor`** (ruta nueva) — mismo patrón
  dual que `.../cliente` de `limite_credito`: decide con
  `ejecutaDirecto('condicion_proveedor', rol)` si aplica directo
  (`super_admin`, con el cliente admin porque las columnas no tienen
  `GRANT`) o crea una `solicitud_cambio` (`compras`, con motivo obligatorio
  capturado en el propio formulario, no generado fijo en el servidor).
- **`CampoP05Multi`** (`entidad-detalle.tsx`) — variante nueva de
  `CampoP05` para un cambio controlado que cubre **dos** columnas en una
  sola solicitud (`categoria` + `condicion_pago` juntas, mismo `motivo`).
  `CampoP05` original no se tocó; sus 3 usos de un solo campo
  (`persona_tipo`/`razon_social`/`rfc`, de la sesión concurrente) siguen
  iguales.

Bug encontrado de paso, no relacionado con la ruta nueva en sí: el Server
Component de la ficha de entidad (`entidades/[id]/page.tsx`) nunca incluía
`tabla='proveedores'` al construir el filtro `.or()` de
`solicitudesPendientes` — mismo defecto ya conocido y corregido una vez
para `tabla='clientes'` (el comentario que documentaba ese fix seguía en el
archivo, pero sin la rama de proveedores). Sin corregirlo, "Solicitud
pendiente" nunca se habría mostrado para `condicion_proveedor` aunque la
solicitud existiera y fuera resoluble — se habría descubierto recién al
intentar aprobarla desde `/dashboard/solicitudes`, no desde la ficha.

## 3. Búsqueda/filtros en `/dashboard/solicitudes` + ocultar el botón según permiso real

Filtros agregados: texto libre (nombre/razón social/nombre comercial/RFC/
siglas de la entidad asociada, y `motivo`), tipo de cambio (7 tipos reales
— `bloqueo_permanente` nunca genera solicitud), rango de fechas de creación
(`<RangoFechas>`, primer uso fuera de Ventas), "Sólo mías"
(`solicitante_id = uid`). Columna nueva **Solicitante**, resuelta con
`public.usuarios_directorio()` (mismo RPC que ya usan Ventas/Inventario
para esto — `profiles_select` sólo deja ver la fila propia). Paginación
convergida a `<Paginacion>` (su propio comentario ya señalaba esta pantalla
como una de las 5 pendientes de converger).

Módulo nuevo `app/lib/entidades/listado-solicitudes.ts` — mismo pivote
anti-duplicación que `lib/ventas/listado-cotizaciones.ts`, pero **sin**
importar de `lib/ventas/*`: esa dirección de dependencia iría al revés de
cómo está diseñado el repo (Ventas depende de Entidades, no al contrario),
así que `valorLike`/`diaSiguiente` se duplicaron ahí en 4 líneas cada uno
en vez de cruzar el import. La búsqueda de texto resuelve en dos pasos
porque `solicitudes_cambio.registro_id` es polimórfico: `ilike` sobre
`entidades` (nombre/RFC/clave/siglas) → ids, luego `clientes`/`proveedores`
cuyo `entidad_id` esté en ese resultado → sus propios ids, y un `.or()`
final combinando `and(tabla.eq.X,registro_id.in.(...))` por cada tabla más
`motivo.ilike` — mismo patrón and-dentro-de-or que ya usa
`entidades/[id]/page.tsx` para resolver las solicitudes de una entidad.

Al ver la bandeja con los 8 tipos mezclados salió un segundo pedido: con
la tabla ya poblada de datos de prueba, `direccion` veía el botón "Aprobar"
en los 5 tipos que sólo `super_admin` resuelve (`rfc`/`razon_social`/
`persona_tipo`/`reactivacion`/`bloqueo_temporal`) y se llevaba un `403`
real al intentarlo. Corregido espejando en cliente la misma regla que ya
aplicaba el servidor: `REGLAS_APROBACION[tipo].aprueba?.includes(role)` —
si no coincide, la celda muestra **"Sólo lectura — aprueba `<rol>`"** en
vez del botón. El servidor sigue siendo la barrera real; esto sólo evita
el viaje redondo que iba a fallar.

## 4. Verificación

`docker compose exec web npx tsc --noEmit` limpio en cada paso (sin
migración SQL en esta sesión, así que no aplica `docker build --target
builder`/`get_advisors` de esquema — sí se corrió `get_advisors` de todas
formas por rigor, sin `ERROR` nuevo).

Clic a clic real con usuarios QA, nunca la cuenta del dueño del proyecto
(contraseña común `RtbQA-2026!` — nota: el correo real de `super_admin` es
**`qa.superadmin@qa.refacrtb.mx`**, sin guion bajo; un primer intento con
`qa.super_admin@` falló login y se confirmó por SQL contra `auth.users`,
corregido en la memoria de credenciales QA):

- `qa.compras` → ficha de "QA Proveedor Uno": lápiz nuevo en "Condiciones
  comerciales · Proveedor", propone categoría + condición de pago con
  motivo → `202`, solicitud pendiente visible en la propia ficha.
- `qa.direccion` → `/dashboard/solicitudes`: la solicitud aparece con tipo,
  entidad, motivo y **solicitante = QA Compras**; búsqueda por
  "Proveedor Uno" la aísla, búsqueda por "Cliente Uno" da vacío
  correctamente, filtro de tipo "Condición de proveedor" la aísla también;
  aprobada → confirmado por SQL directo que `proveedores.categoria`/
  `condicion_pago` cambiaron.
- `qa.superadmin` → mismo proveedor: cambia categoría/condición de pago
  directo, sin solicitud — confirmado por SQL (`updated_at` fresco).
- `qa.ventas` propuso un cambio de razón social sobre "QA Cliente Uno" →
  `qa.direccion` lo vio como **"Sólo lectura — aprueba Super Admin"**, sin
  botones → `qa.superadmin` sí vio Aprobar/Rechazar y lo aprobó (dato de
  prueba resuelto, sin dejar pendientes).
- Confirmado por `information_schema.column_privileges` que
  `categoria`/`condicion_pago` de `proveedores` siguen sin `UPDATE` para
  `authenticated` (sólo `INSERT`/`SELECT`) — la ruta nueva no abrió ningún
  hueco de privilegio, sigue dependiendo de `service_role`.

## 5. Hallazgo aparte, dejado en pendientes a petición del dueño del proyecto

Revisando por qué `RTB-ILU-000007` ("SLIM 18W CUADRADA SL CALIDO", dado de
alta por el propio dueño del proyecto con `super_admin`) quedó en
`estado='borrador'`, se confirmó que **no existe ningún camino, para
ningún rol, que lo pase a `'activo'`**:

- El formulario de alta nunca pide `estado` — el schema lo pone en
  `'borrador'` por `default` siempre.
- `productos.estado` no está en el `GRANT UPDATE` de `authenticated`
  (`015_catalogo_marcas_y_gobierno.sql:115-118`), y ninguna de las 6 rutas
  de `/api/productos/**` la escribe con `service_role` (sí lo hacen para
  `stock_minimo`/`stock_maximo`/`es_estrategico` — mismo patrón que podría
  reutilizarse).
- La UI sólo muestra el estado con un badge de sólo lectura, sin botón
  cerca.
- La spec del módulo (`contexto/RTB-INV-01_Modulo_Productos_Inventario.md`
  §4) nunca incluyó "activar un producto" entre sus 5 cambios controlados
  reales — el paso nunca se diseñó, no es que falte construirlo sobre un
  diseño ya decidido.

No se construyó en esta sesión — el dueño del proyecto pidió explícitamente
dejarlo documentado en pendientes en vez de decidir el criterio (¿libre
para `super_admin`/`direccion`? ¿exige costo y unidad ya capturados?) sobre
la marcha. Detalle completo en `db/procesos/alta-producto.md` y TODO en
`CLAUDE.md`.

## Archivos nuevos

- `app/components/entidades/aviso-credito.tsx`
- `app/app/api/entidades/[id]/proveedor/route.ts`
- `app/lib/entidades/listado-solicitudes.ts`

## Alcance dejado fuera, anotado

- La activación de productos (§5) queda como TODO explícito, sin código.
- No se tocó el mecanismo de `POST /api/solicitudes-cambio` genérico ni el
  resolver (`.../resolver/route.ts`) — sólo se les dio, por fin, una
  interfaz real de propuesta a `condicion_proveedor`.
- `gerente_comercial` sigue sin poder proponer ni aprobar ningún cambio
  controlado de este módulo (no está en ningún `REGLAS_APROBACION`, ni en
  el guard de la página `/dashboard/solicitudes`) — señalado ya en una
  sesión anterior, no se tocó aquí.
