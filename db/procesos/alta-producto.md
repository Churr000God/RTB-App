# Proceso — Alta de producto y unidad de medida

Catálogo maestro de RTB-INV-01. Corrige al paquete original (`sku UNIQUE`,
`unidad_medida` como `CHECK` cerrado de 3 valores) contra la realidad del
catálogo real — ver `contexto/AUDITORIA_RTB-INV-01.md`, hallazgos 2 y 3.

`familia_id` (obligatorio), `categoria_id` y `marca_id` (ambos opcionales)
se seleccionan de catálogos administrables — ver
`db/procesos/administracion-catalogos.md` para cómo se dan de alta esos
valores y la diferencia entre familia (gobierna la unidad de medida) y
categoría (taxonomía comercial libre). Antes de `015_catalogo_marcas_y_gobierno.sql`
(2026-08-06), `marca` era texto libre en `productos` — se sustituyó por
`marca_id` (FK a `producto_marcas`) para que "BOSCH"/"Bosch"/"bosch " dejen
de convivir como tres marcas distintas.

## Quién puede

Consultar: los 8 roles. Crear/editar libremente: `super_admin`,
`direccion`, `compras`, `almacen`. Editar `stock_minimo`/`stock_maximo`/
`es_estrategico`: sólo `super_admin`/`direccion`/`compras` (vía API con
`service_role` — el `GRANT` de Postgres no distingue rol de negocio dentro
de `authenticated`) — `es_estrategico` sí se puede fijar **al dar de alta**
(el `GRANT INSERT` no restringe columnas, sólo el `UPDATE` posterior), por
eso el formulario de alta tiene su checkbox aunque no exista uno para
editarlo después.

## Dónde

UI: `app/app/dashboard/productos/nuevo/page.tsx` (alta),
`app/app/dashboard/productos/[id]/producto-detalle.tsx` (edición). API:
`app/app/api/productos/route.ts` (GET/POST), `app/app/api/productos/[id]/route.ts`
(GET/PATCH).

## Flujo de alta

1. `POST /api/productos` con `{ familia_id, unidad_medida_id, nombre, ... }`
   — validado por `productoCreateSchema` (`app/lib/inventario/schemas.ts`).
2. Si se omite `codigo_interno`, `productos_before_insert()` lo genera:
   `RTB-<clave de la familia>-000123` (secuencia `productos_codigo_seq`).
3. `sku` se normaliza a mayúsculas; `sku_normalizado` (columna generada)
   queda listo para cruces de catálogo↔proveedor sin depender de guiones.
4. Si `contenido_por_unidad ≠ 1` (el producto se lleva en una unidad que
   agrupa, p.ej. `KIT`), `unidad_contenido_id` es obligatorio
   (`productos_unidad_contenido_chk`).
5. `codigo_barras` se autogenera **igual a `codigo_interno`** en el mismo
   trigger (`productos_before_insert()`, `055_productos_codigo_barras_autogenerado.sql`,
   2026-08-10) — ya no es un campo del formulario de alta ni de ningún
   `PATCH`; el `GRANT UPDATE` de `productos` no lo incluye, así que ni
   `super_admin` puede cambiarlo después. Decisión del dueño del proyecto:
   reusar el código interno (Code128 acepta alfanumérico directo, sin
   checksum EAN-13) y dejarlo fijo para siempre, para que una etiqueta ya
   impresa nunca deje de coincidir con el sistema.

## Estado del producto: nace en `borrador` y nadie puede activarlo (hueco confirmado 2026-08-10)

`productos.estado` (`borrador → activo → descontinuado`, o `→
requiere_depuracion`/`fusionado`) sigue el ciclo documentado en
`contexto/RTB-INV-01_Modulo_Productos_Inventario.md` §2.2, pero **el
formulario de alta nunca pide el estado** — `productoCreateSchema` lo pone
en `'borrador'` por `default` siempre, sin ningún campo en la UI que lo
sobrescriba. Confirmado con un producto real dado de alta como
`super_admin` (`RTB-ILU-000007`, "SLIM 18W CUADRADA SL CALIDO") que quedó
en `borrador`.

**No existe ningún camino, para ningún rol, que mueva un producto de
`borrador` a `activo`:**

- `productos.estado` **no** está en el `GRANT UPDATE` de `authenticated`
  (`015_catalogo_marcas_y_gobierno.sql:115-118` — el `revoke update on
  public.productos` + `grant` que le siguió sólo cubre `nombre,
  descripcion, marca_id, modelo, categoria_id, codigo_barras,
  requiere_ubicacion, observaciones`). Como los roles de la app comparten
  el mismo rol de Postgres `authenticated`, esto bloquea a **todos**,
  incluido `super_admin` a nivel RLS.
- La única puerta que sí podría saltarse ese `GRANT` es una ruta con
  `service_role` (mismo patrón que `stock_minimo`/`stock_maximo`/
  `es_estrategico` en `PATCH /api/productos/[id]`) — pero ninguna de las 6
  rutas de `/api/productos/**` toca `estado`.
- La UI (`producto-detalle.tsx`, `productos-explorer.tsx`) sólo **muestra**
  el estado con `<ProductoEstadoBadge>` de sólo lectura; no hay botón cerca.
- La spec del propio módulo (`RTB-INV-01_Modulo_Productos_Inventario.md`
  §4 "Cambios controlados") no lista "activar un producto" entre los 5
  cambios controlados reales del módulo (autorizar/aplicar ajuste,
  autorizar/aplicar redefinición de unidad, fusionar producto) — el paso
  nunca se diseñó, no es sólo que falte construirlo.

**Pendiente para una sesión aparte** (ver TODO en `CLAUDE.md`): decidir con
el dueño del proyecto quién activa un producto y bajo qué condición (¿libre
para `super_admin`/`direccion`? ¿exige costo y unidad ya capturados?
¿aplica también a `requiere_depuracion`?) antes de construir la ruta/botón.

## Dos identificadores, ninguno es la identidad única condicional

`codigo_interno` es la clave de RTB — único **sólo** entre filas
`estado='activo'` (índice único parcial), porque la carga histórica real
trae códigos truncados y duplicados (`RTB-REFU-` en dos productos
distintos). `sku` es el número de parte del fabricante y **no** lleva
restricción de unicidad — hay pares reales (`RTB-ILU-SL18B`/`SL18C`) que lo
comparten junto con el nombre.

## La unidad de medida es de sólo lectura después del alta

`unidad_medida_id`/`contenido_por_unidad`/`unidad_contenido_id` **no**
están en el `GRANT UPDATE` de `productos`, y `productos_guard_unidad()`
(013) rechaza cualquier intento directo de cambiarlas — incluso con
`service_role`. Es la causa #1 de pérdida de inventario medida por RTB
(14 de 27 folios de no conformidad, −$37,919.77): la única vía de cambio es
una redefinición autorizada, ver `db/procesos/redefinicion-unidad-medida.md`.

## Fusión de duplicados

`POST /api/productos/[id]/fusionar` (`super_admin`/`direccion`) marca un
producto como `estado='fusionado'` apuntando a su canónico
(`producto_canonico_id`). No es un borrado — el registro persiste con su
historial de kardex intacto; el catálogo debe empezar a referenciar el
canónico hacia adelante.

## Fotos del producto (`021_producto_imagenes.sql`, 2026-08-06)

Desde la pestaña "Imágenes" del detalle (`producto-detalle.tsx`),
`super_admin`/`direccion`/`compras`/`almacen` pueden subir hasta 10 fotos
por producto (JPG/PNG/WebP, 5 MB máx. cada una). El botón "Subir fotos"
(`components/inventario/imagen-uploader.tsx`) redimensiona la imagen en el
navegador con `<canvas>` antes de subirla (lado largo 1600px + una
miniatura de 400px), corrigiendo de paso la rotación EXIF de fotos de
celular. `POST /api/productos/[id]/imagenes` recibe el archivo por
`FormData` — no por URL firmada — y guarda el objeto en el bucket
**público** `productos-imagenes`: la URL es permanente y sigue
funcionando dentro de un PDF, una impresión o un correo archivado, algo
que una URL firmada no garantiza. La primera foto que se sube nace
"principal" automáticamente; se puede cambiar la principal, reordenar o
quitar una foto desde la misma pestaña (quitar borra también el archivo
del bucket, no sólo la fila). La galería de `/dashboard/productos`
(toggle junto al buscador) usa la foto principal de cada producto; los
que no tienen foto muestran un ícono de caja.

## Qué puede fallar

| Síntoma | Causa |
|---|---|
| "Ya existe un producto activo con ese código interno" | `uq_productos_codigo_activo` — el código ya está en uso por otra fila `estado='activo'` |
| "Si el contenido por unidad no es 1, indica la unidad del contenido" | `productos_unidad_contenido_chk` |
| 403 al editar `stock_minimo`/`stock_maximo`/`es_estrategico` | Tu rol no es `super_admin`/`direccion`/`compras` |
| La unidad de medida no cambia con un `PATCH` directo | Es la barrera intencional — usa `/redefinir-unidad` |
| "Formato no admitido (¿HEIC de iPhone?...)" al subir una foto | `createImageBitmap` no decodifica HEIC fuera de Safari — cambiar la cámara del iPhone a "Más compatible" o convertir a JPG antes de subir |
| "Para cambiar la imagen principal, marca otra imagen como principal" | El PATCH de imágenes rechaza `es_principal: false` explícito a propósito — despromover sin promover otra dejaría al producto sin principal |
| El producto se queda en "Borrador" para siempre, ni `super_admin` lo cambia | Hueco confirmado 2026-08-10 — no existe ruta ni botón que escriba `estado`, ver sección arriba |
| No hay forma de editar el código de barras después del alta | Es intencional desde `055` (2026-08-10) — se autogenera y queda fijo, ni `super_admin` lo cambia |
| El selector de proveedor en "Nuevo costo" no tiene "+ Agregar proveedor nuevo…" | Tu rol es `finanzas` — puede registrar costos pero no dar de alta un `proveedor_productos` (`GRANT INSERT` restringido a `super_admin`/`direccion`/`compras`) |

## Costo de catálogo — pantalla (gap de UI cerrado 2026-08-06)

Pestaña "Costos" del detalle de producto: histórico de vigencias +
formulario de alta (`POST /api/productos/[id]/costos`, roles `super_admin`/
`direccion`/`compras`/`finanzas`). Antes la ruta existía y respondía sin
ningún botón que la llamara (`contexto/AUDITORIA_QA_ROLES_2026-08-06.md`
§4). Carga retroactiva exige `motivo` (`pc_retroactivo_chk`); sólo una
fila puede quedar sin `vigente_hasta` a la vez
(`uq_producto_costos_abierto`).

**Proveedor del costo (2026-08-10).** El formulario también pregunta a qué
proveedor pertenece el costo — liga `producto_costos.proveedor_producto_id`
(existía en el schema desde `010_inventario_costos.sql`, sin ningún
selector de UI). Sirve para filtrar costos por proveedor en facturas y
solicitudes de compra cuando exista el módulo de Compras. El selector
ofrece los `proveedor_productos` que ya tiene el producto, más
**"+ Agregar proveedor nuevo…"** — como esa tabla tampoco tenía ninguna
pantalla propia, ese mini-formulario (`<ProveedorCombobox>` +
costo del proveedor + unidad en la que cotiza) también sirve de alta
rápida de un `proveedor_productos`, restringida a
`super_admin`/`direccion`/`compras` (`finanzas` ve el selector pero no la
opción de agregar — no tiene `GRANT INSERT` sobre esa tabla). El nombre
del proveedor en el histórico se resuelve con una consulta aparte
(`GET /api/productos/[id]/costos`), no con un embed anidado de 3 niveles,
para que un rol sin `SELECT` en `proveedor_productos` (`almacen`) reciba
`null` en silencio en vez de que el embed completo falle.
