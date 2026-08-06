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
de `authenticated`).

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

## Qué puede fallar

| Síntoma | Causa |
|---|---|
| "Ya existe un producto activo con ese código interno" | `uq_productos_codigo_activo` — el código ya está en uso por otra fila `estado='activo'` |
| "Si el contenido por unidad no es 1, indica la unidad del contenido" | `productos_unidad_contenido_chk` |
| 403 al editar `stock_minimo`/`stock_maximo`/`es_estrategico` | Tu rol no es `super_admin`/`direccion`/`compras` |
| La unidad de medida no cambia con un `PATCH` directo | Es la barrera intencional — usa `/redefinir-unidad` |
