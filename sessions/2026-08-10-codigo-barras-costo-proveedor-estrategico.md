# Sesión 2026-08-10 — RTB-INV-01: código de barras autogenerado, "estratégico" en el alta, costo ligado a proveedor

## Punto de partida

El dueño del proyecto probó dar de alta un producto y trajo cuatro
preguntas/pedidos en un solo mensaje:

1. El campo "Código de barras" del alta no debía ser algo capturado a mano
   ni relacionado con el proveedor — quería que el sistema lo generara al
   dar de alta el producto, y que en el futuro sirviera para un lector de
   barras real.
2. Al registrar un costo, el formulario también debía preguntar a qué
   proveedor pertenece — lo describió como "un registro cruzado" útil para
   filtrar costos por proveedor en facturas y solicitudes de compra
   futuras.
3. Qué significa el campo "estratégico".
4. Dónde se asigna la ubicación del inventario — no la encontró en el alta.

Sesión concurrente en el mismo repositorio (`2026-08-10-condicion-proveedor-y-filtros-solicitudes.md`)
tocando `entidad-detalle.tsx`/`permisos.ts` de RTB-ENT-01 — sin
solapamiento de archivos con esta sesión salvo `CLAUDE.md`. El commit
final de ambas quedó combinado por fuera de esta sesión (ver "Cierre").

## 1. Las dos preguntas que no necesitaron cambiar código

**"Estratégico" (`es_estrategico`)** ya tenía efecto real, sólo que
invisible: en `inventario_alerta_stock()` (`014_inventario_kpis.sql:159-161`),
si un producto tiene existencia física y lleva más de 180 días sin
movimiento, la acción sugerida normalmente es `'bloquear_compra'` — marcado
como estratégico, baja a `'revisar'`. Mismo criterio que ya usa "cliente
estratégico" como excepción al bloqueo de compra en
`RTB-PRO-COM-01_Modulo_Compras.md` §III. El campo nunca tuvo control de UI
(ni en el alta ni después) — sólo se mostraba de sólo lectura ("Estratégico:
No"), de ahí la pregunta. Aparte, confirmado que
`inventario_alerta_stock()`/`GET /api/inventario/alertas` no tiene **ningún**
consumidor de UI todavía — es lógica lista, esperando a que exista el
módulo de Compras.

**La ubicación no se asigna en el alta por diseño.** `productos` (catálogo)
e `inventario_existencias` (existencia por producto+ubicación) son
conceptos separados a propósito; esa segunda tabla no admite
`INSERT`/`UPDATE` directo — sólo la escribe el trigger del kardex o la
aplicación de un conteo. Un producto nuevo nace siempre sin ubicación
(documentado: así está hoy el 73.9% del catálogo real). El camino real:
`Inventario → Ajustes → Nuevo ajuste → agregar línea`, con su propio
selector de ubicación.

## 2. Código de barras autogenerado y fijo (`055_productos_codigo_barras_autogenerado.sql`)

Antes: `productos.codigo_barras` era `varchar(60)` libre, sin `unique`, sin
`check`, capturado a mano en el alta (`nuevo/page.tsx`) y editable después
vía `productoUpdateLibreSchema`.

Decisión confirmada con el dueño del proyecto vía `AskUserQuestion` (dos
preguntas, ambas con la opción recomendada elegida):

- **Formato:** igual al código interno (`RTB-<familia>-000123`), impreso
  como símbolo Code128 — acepta alfanumérico directo, sin necesidad de un
  checksum EAN-13 aparte.
- **Edición:** fijo para siempre, ni `super_admin` lo edita después — para
  que una etiqueta ya impresa nunca deje de coincidir con el sistema.

Implementación:

- `productos_before_insert()` gana una línea, después de resolver y
  normalizar `codigo_interno`: `new.codigo_barras := new.codigo_interno;`
  — sin condicional, así que ignora cualquier valor que el cliente mande
  en el `INSERT` (el `GRANT INSERT` de `productos` no restringe columnas,
  a diferencia del `UPDATE`).
- `revoke update (codigo_barras) on public.productos from authenticated`
  — cierra el único camino de escritura que quedaba.
- Backfill de los 5 productos de prueba existentes
  (`codigo_barras = codigo_interno` donde era `NULL`) + `ALTER COLUMN ...
  SET NOT NULL`.
- `codigo_barras` salió de `productoCreateSchema` y
  `productoUpdateLibreSchema` (`lib/inventario/schemas.ts`) — el campo ya
  no existe como entrada válida en ningún payload, no sólo se ignora.
- `nuevo/page.tsx`: se quitó el `<Input>` de "Código de barras"; en su
  lugar, una nota bajo "Código interno": *"También es el código de barras:
  el sistema lo genera, no se captura ni se edita después."*
- `producto-detalle.tsx`: el código de barras ahora se muestra en el
  encabezado de la ficha, junto al código interno y el SKU (antes no se
  mostraba en ningún lado).

Verificado con SQL simulando rol real: `INSERT` sin `codigo_interno` ni
`codigo_barras` (rol `compras`) → ambos quedan iguales
(`RTB-GRIU-000008`); `UPDATE productos SET codigo_barras = 'FORJADO'`
como `super_admin` → `42501` (`permission denied for table productos`).

## 3. Checkbox "Producto estratégico" en el alta

`productoCreateSchema` ya aceptaba `es_estrategico` (nunca se exponía en
el formulario) y el `GRANT INSERT` de `productos` no restringe columnas —
no hizo falta ningún cambio de backend, sólo agregar el checkbox a
`nuevo/page.tsx` (sección renombrada "Ubicación y compras") con la misma
explicación de efecto que se le dio al dueño del proyecto ("si lleva más
de 180 días sin movimiento... la sugerencia baja a 'revisar' en vez de
'bloquear compra'"). Editarlo **después** de creado sigue sin control de
UI — mismo hueco que ya tenían `stock_minimo`/`stock_maximo`, fuera de
alcance de esta sesión.

## 4. El costo de catálogo liga a un proveedor

`producto_costos.proveedor_producto_id` existía desde
`010_inventario_costos.sql` (con su índice, su FK, y ya validado por
`productoCostoCreateSchema`) — el formulario "Nuevo costo" de la pestaña
Costos lo ignoraba por completo, ni un `<select>`.

Al investigar cómo exponerlo salió un hallazgo más grande: la tabla real
que liga proveedor↔producto↔precio (`proveedor_productos`) **no tenía
ninguna pantalla en todo el repositorio** — cero consumidores de
`POST /api/proveedor-productos`. Un `<select>` simple habría quedado
siempre vacío.

Decisión confirmada con el dueño del proyecto (`AskUserQuestion`): **no**
construir una pantalla completa de "lista de precios de proveedor"
todavía — un selector rápido dentro del mismo formulario de costo basta.

Implementación:

- **`CostosTab`** (`producto-detalle.tsx`): el formulario "Nuevo costo"
  gana un `<select>` "Proveedor (opcional)" con los `proveedor_productos`
  que ya tiene el producto (`GET /api/proveedor-productos?producto_id=`),
  más la opción **"+ Agregar proveedor nuevo…"**.
- Elegir esa opción despliega un mini-formulario: `<ProveedorCombobox>` +
  costo del proveedor + unidad en la que cotiza → `POST
  /api/proveedor-productos` con el mínimo de campos (`proveedor_id`,
  `producto_id`, `costo_unitario`, `unidad_medida_id`) → el `id` devuelto
  queda preseleccionado como `proveedor_producto_id` del costo que se está
  registrando.
- **`ProveedorCombobox`** (`components/inventario/proveedor-combobox.tsx`,
  nuevo) — calcado de `EntidadCombobox` (Ventas) pero filtrando
  `proveedor`/`mixta` en vez de `cliente`/`mixta`. Busca sobre
  `entidades`, no sobre `proveedores` — como esa tabla no comparte `id`
  con `entidades` (`proveedores.entidad_id` → `entidades.id`), resolver el
  `proveedor_id` real para el `POST` exige un segundo fetch:
  `GET /api/entidades/{entidadId}` → `data.proveedor.id`.
- Gateado por rol: la opción "+ Agregar proveedor nuevo…" sólo aparece si
  `puede(role, 'proveedor_productos', 'insert')` — `finanzas` puede leer
  `proveedor_productos` (matriz existente) pero no dar de alta uno, así
  que ve el selector sin esa opción.
- **`GET /api/proveedor-productos`** ganó el embed
  `proveedores(entidades(nombre_comercial, nombre_legal))` para poder
  mostrar el nombre del proveedor en el `<select>`.
- **`GET /api/productos/[id]/costos`** gana la resolución del nombre del
  proveedor para el histórico — con una consulta aparte a
  `proveedor_productos` (no un embed anidado de 3 niveles desde
  `producto_costos`), a propósito: `almacen` no tiene `SELECT` sobre
  `proveedor_productos`, así que un embed ahí volvería `null` en silencio
  para ese rol en vez de que PostgREST rechazara el embed completo.
  Columna nueva "Proveedor" en la tabla histórica.

Verificado extremo a extremo en el navegador (`super_admin` de prueba):
alta de "Producto Prueba Codigo Barras" con "Producto estratégico"
marcado → ficha muestra "RTB-AHO-000009 · Código de barras:
RTB-AHO-000009" y "Estratégico: Sí" → pestaña Costos, "+ Agregar
proveedor nuevo…" con "QA Proveedor Uno" (búsqueda real, ya existente) →
costo $115.00, unidad JGO → proveedor preseleccionado tras crearse →
costo de catálogo $125.50 guardado con "QA Proveedor Uno" visible en el
histórico.

## Verificación y cierre

`docker build --target builder` limpio (TypeScript real) tras cada bloque
de cambios. `get_advisors` sin `ERROR` nuevo tras la migración `055`. Los
datos de prueba (producto, `producto_costos`, `proveedor_productos`) se
borraron por SQL directo al terminar — el catálogo real sigue vacío por
decisión del dueño del proyecto (carga de los 1,388 SKU reales pendiente
aparte, ver TODO de `CLAUDE.md`), así que no aportaban valor como
evidencia.

El commit final de esta sesión quedó combinado con el de la sesión
concurrente (`condicion_proveedor`/filtros de solicitudes) — no se generó
por separado. Se verificó después del hecho que el contenido en disco de
cada archivo propio de esta sesión llegó intacto al repositorio
(`git show --stat` del commit + `grep` de las funciones/componentes
clave), sin pérdida de trabajo de ninguna de las dos sesiones.

## Archivos tocados

- `db/migrations/055_productos_codigo_barras_autogenerado.sql` (nuevo)
- `app/lib/inventario/schemas.ts` — `codigo_barras` fuera de ambos schemas
- `app/types/inventario.ts` — `codigo_barras: string` (ya no nullable)
- `app/app/dashboard/productos/nuevo/page.tsx` — quita input de código de
  barras, agrega checkbox "Producto estratégico" + notas explicativas
- `app/app/dashboard/productos/[id]/producto-detalle.tsx` — código de
  barras en encabezado; `CostosTab` con selector/alta de proveedor
- `app/components/inventario/proveedor-combobox.tsx` (nuevo)
- `app/app/api/proveedor-productos/route.ts` — embed de nombre de proveedor
- `app/app/api/productos/[id]/costos/route.ts` — resolución de nombre de
  proveedor en el histórico
- `db/ESQUEMA.md`, `db/procesos/alta-producto.md`,
  `contexto/RTB-INV-01_Modulo_Productos_Inventario.md`, `CLAUDE.md`
  (documentación)
