# Proceso — Administración de catálogos (familias, categorías, marcas, unidades)

Añadido en `015_catalogo_marcas_y_gobierno.sql` (2026-08-06). Antes de esta
migración, `unidades_medida`/`producto_familias`/`producto_categorias` ya
eran tablas reales con RLS y `GRANT` (`009_inventario_catalogo.sql`), pero
no existía ninguna pantalla para administrarlas — sólo se veían como
`<select>` dentro del alta de producto. Y la base estaba completamente
vacía (0 productos, 0 familias, 0 categorías, 0 unidades), así que ese
`<select>` no tenía nada que ofrecer: **no se podía dar de alta ni un
producto**. Esta migración resolvió ambas cosas a la vez: sembró un mínimo
de unidades/familias y añadió `producto_marcas` + la pantalla que faltaba.

## Familia vs. categoría — no son niveles de una jerarquía

Son dos clasificaciones independientes que cruzan entre sí, cada una con un
propósito distinto:

| | Familia | Categoría |
|---|---|---|
| Obligatoria en `productos` | Sí (`familia_id not null`) | No (`categoria_id` nullable) |
| Qué gobierna | La **unidad de medida por defecto** y el **prefijo del código interno** (`RTB-<clave familia>-000123`) | Nada técnico — es taxonomía comercial libre, para navegar/reportar |
| Por qué importa | Es la causa #1 de pérdida medida por RTB: una familia con la unidad mal definida generó −$37,919.77 en discrepancias (`AUDITORIA_RTB-INV-01.md`) | Se dejó nullable a propósito — exigirla habría bloqueado la migración del 73.9% del catálogo sin ubicación |
| Quién administra | `super_admin`/`direccion`/`compras` (**sin** `almacen` desde `015`) | `super_admin`/`direccion`/`compras`/`almacen` |
| Ejemplo | `GRIU` (Griferías y urinarios), `FER` (Ferretería), `HER` (Herramientas) | "Sanitarios residenciales", "Herramienta eléctrica" — libres, las define el negocio |

Un producto de la familia `GRIU` puede caer en la categoría "Sanitarios
residenciales" o "Sanitarios comerciales" según a quién va dirigido; la
familia no determina la categoría ni viceversa.

`producto_marcas` (marca del fabricante — Bosch, Truper, etc.) y
`unidades_medida` (pieza, paquete, metro lineal...) son los otros dos
catálogos de apoyo; ninguno de los dos tiene esa relación de gobierno con
otra tabla — son planos.

## Quién puede

| Catálogo | Consultar | Alta/edición |
|---|---|---|
| `unidades_medida` | 8 roles | `super_admin`, `direccion`, `compras` |
| `producto_familias` | 8 roles | `super_admin`, `direccion`, `compras` |
| `producto_categorias` | 8 roles | `super_admin`, `direccion`, `compras`, `almacen` |
| `producto_marcas` | 8 roles | `super_admin`, `direccion`, `compras`, `almacen` |

Ninguno tiene `GRANT DELETE` — baja lógica con `activo=false` (regla de
negocio "no borrado físico" del sistema completo). `clave` queda fuera del
`GRANT UPDATE` de las cuatro tablas: es inmutable después del alta.

## Dónde

UI: `app/app/dashboard/catalogos/` (`page.tsx` Server Component +
`catalogos-explorer.tsx` con pestañas Familias · Categorías · Marcas ·
Unidades de medida, dirigido por el descriptor compartido
`app/lib/inventario/catalogos.ts`). API: `app/app/api/catalogos/[tipo]/route.ts`
(GET/POST) y `[tipo]/[id]/route.ts` (PATCH), donde `tipo ∈ unidades-medida
| familias | categorias | marcas`.

## Flujo de alta/edición

1. `POST /api/catalogos/<tipo>` valida contra el schema zod correspondiente
   (`app/lib/inventario/schemas.ts`) y usa `requireApiRole(rolesQuePueden(...))`
   — la lista de roles se deriva de `app/lib/inventario/permisos.ts`, la
   misma matriz que gatea los botones de la UI. RLS es la barrera real; el
   guard de API es defensa en profundidad.
2. `clave` se normaliza a mayúsculas en el cliente antes de enviarla
   (espejo del `CHECK ... = upper(btrim(clave))` de cada tabla).
3. `PATCH /api/catalogos/<tipo>/<id>` nunca acepta `clave` — el campo se
   renderiza deshabilitado en el modal de edición con la nota "La clave no
   se puede cambiar después del alta".
4. Añadir un catálogo nuevo (5º) se registra en tres sitios y TypeScript
   obliga a la exhaustividad si falta alguno: `CATALOGO_TIPOS`/`CATALOGO_META`
   en `catalogos.ts`, y el `Record<CatalogoTipo, ZodSchema>` de cada una de
   las dos rutas de API.

## Semilla mínima (015)

Sin ella no se podía dar de alta ni un producto — la base estaba vacía.

- **6 unidades de medida:** `PZ` (pieza), `PAQ` (paquete), `KIT`, `JGO`
  (juego), `ML` (metro lineal), `MTS` (metros). `decimales=0` en las de
  conteo/agrupación no es cosmético — impide capturar "2.5 piezas" como
  error de captura silencioso (el kardex lo valida).
- **10 familias:** `GRIU`, `REFU`, `PLO`, `FER`, `CER`, `ILU`, `ETI`, `AHO`,
  `CON`, `HER` — las claves ya estaban documentadas en el comentario de
  `009_inventario_catalogo.sql`; los nombres largos son una propuesta a
  confirmar por el dueño del proyecto, editable desde la pestaña Familias.
- Categorías y marcas quedan **vacías** — se capturan desde la pantalla
  nueva, según necesidad del negocio.

## Qué puede fallar

| Síntoma | Causa |
|---|---|
| "Ya existe un registro con esa clave" | `UNIQUE` de `clave` en la tabla — traducido desde `duplicate key`/`unique` |
| El campo Clave aparece deshabilitado al editar | Esperado — `clave` no está en el `GRANT UPDATE` de ninguna de las cuatro tablas |
| 403 al intentar dar de alta una familia/unidad como `almacen` | Esperado desde `015` — ese rol salió del gobierno de unidad/familia; sigue pudiendo con categorías y marcas |
| Un producto no puede cambiar de marca a "Sin marca" | Bug si ocurre — el cliente debe mandar `marca_id: null`, nunca `''` (`z.string().uuid()` rechaza cadena vacía) |
| `delete from producto_marcas ...` falla | Esperado — `on delete restrict`; hay productos referenciándola. Desactivar con `activo=false`, no borrar |
