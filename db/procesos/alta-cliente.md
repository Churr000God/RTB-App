# Proceso — Alta y edición de cliente

## Quién puede

Dar de alta: `super_admin`, `direccion`, `ventas` (RLS `entidades_insert` +
`clientes_insert`). `ventas` no puede dar de alta un `tipo='proveedor'` — lo
bloquea la propia ruta de API antes de tocar la base de datos.

## Dónde

- **UI:** `/dashboard/entidades/nueva`
  (`app/app/dashboard/entidades/nueva/page.tsx`) — formulario compuesto:
  datos generales + comerciales + contacto principal + dirección fiscal, todo
  en un solo envío.
- **API:** `POST /api/entidades` (`app/app/api/entidades/route.ts`).

## Flujo de alta

1. El formulario arma un payload con `entidadCreateSchema`
   (`app/lib/entidades/schemas.ts`): datos de `entidades` +
   sub-objeto `cliente` (obligatorio si `tipo` es `cliente` o `mixta`) +
   `contacto_principal`/`direccion_fiscal` opcionales.
2. La ruta valida con zod, comprueba que `ventas` no esté dando de alta un
   proveedor, e inserta con el **cliente del propio usuario**
   (`createSupabaseServerClient()` — RLS decide, no `service_role`): primero
   `entidades`, luego `clientes` con el `entidad_id` recién creado.
3. Si `clientes` (o el contacto/dirección) falla después de crear la
   `entidad`, la ruta borra la entidad con el cliente admin —
   `authenticated` no tiene `GRANT DELETE`, así que el rollback de esta
   operación puntual necesita `service_role`.
4. Al insertar en `entidades`, el trigger `entidades_before_insert()` genera
   `clave` (`ENT-000123`, secuencia `entidades_clave_seq`) y normaliza
   `rfc`/`curp` a mayúsculas.
5. **La entidad queda `activa` de inmediato** — no hay paso de aprobación
   para el alta en sí. Sólo los cambios *posteriores* sensibles la requieren
   (ver `bloqueo-y-aprobaciones.md`).

## Si la entidad ya existe como proveedor

Si se da de alta un `clientes` sobre una `entidad` que ya tiene fila en
`proveedores` (o viceversa), el trigger `sync_entidad_tipo()` sube
`entidades.tipo` a `'mixta'` automáticamente — **no se duplica el registro**.
Esto corrige al paquete original de AbacusAI, que permitía la combinación sin
avisar (ver `contexto/AUDITORIA_RTB-ENT-01.md`, hallazgo 6/9).

## Edición: libre vs. controlada

`PATCH /api/entidades/[id]` (`app/app/api/entidades/[id]/route.ts`) separa
dos clases de cambio:

- **Libre** (cualquier rol con acceso de escritura): `nombre_comercial`,
  `correo_principal`, `telefono_principal`, `sitio_web`, `observaciones`,
  `siglas`. Va con el cliente del propio usuario, la política RLS de
  `UPDATE` decide. Estos seis campos se editan desde la pestaña "General"
  del detalle de la entidad (`app/app/dashboard/entidades/[id]/entidad-detalle.tsx`,
  botón "Editar" junto a "Datos generales").
- **`siglas`** (opcional, ej. "TMEX", "AT&T"): identificador corto de la
  entidad, normalizado a MAYÚSCULAS por el mismo trigger que rfc/curp,
  único cuando no es nulo (`020_entidades_siglas.sql`). Entra al buscador
  de `/dashboard/entidades` junto a razón social/clave/RFC, y alimenta el
  avatar del detalle cuando existe (si no, se calculan iniciales de la
  razón social).
- **Controlada** (`nombre_legal`/`rfc`): sólo `super_admin` puede tocarlos
  directo desde esta misma ruta (usa el cliente admin, porque esas dos
  columnas no tienen `GRANT UPDATE` para `authenticated`). Cualquier otro rol
  recibe `403` con el mensaje "requiere una solicitud de cambio aprobada" —
  debe pasar por `POST /api/solicitudes-cambio` (ver
  `bloqueo-y-aprobaciones.md`).

`clientes.limite_credito` sigue la misma lógica pero vive en otra tabla: no
tiene `GRANT UPDATE` para nadie salvo `service_role`; el cambio > $100,000
exige una solicitud aprobada por `direccion`.

## Contactos y direcciones — modificación libre real

A diferencia de lo anterior, `contactos` y `direcciones` no tienen ningún
campo controlado (P05: "modificación libre"). Rutas:
`GET/POST /api/entidades/[id]/contactos`,
`PATCH /api/entidades/[id]/contactos/[cid]`, y el mismo patrón para
`direcciones`. Reglas de la base de datos, no de la API:

- Sólo un contacto `es_principal=true` activo por entidad (índice único
  parcial) — un segundo intento falla con `unique_violation`, la ruta lo
  traduce a "Ya existe un contacto principal para esta entidad."
- Sólo una dirección principal por `(entidad_id, tipo)`.
- "Borrar" un contacto/dirección es `PATCH { activo: false }`, nunca
  `DELETE`.

Desde 2026-08-06 la pestaña "Contactos y direcciones" de la ficha
(`/dashboard/entidades/[id]`) agrega/edita/archiva directamente — antes de
esa fecha las rutas de arriba existían sin ninguna pantalla que las
llamara. Una dirección también puede llevar coordenada
(`latitud`/`longitud`) con geocodificación y mapa: ver
[`direcciones-y-mapa.md`](./direcciones-y-mapa.md).

## Qué puede fallar

| Síntoma | Causa |
|---|---|
| "Ya existe una entidad con ese RFC" | Violación del índice único parcial de `rfc` (los genéricos `XAXX010101000`/`XEXX010101000` sí se repiten) |
| 403 al editar `rfc`/`nombre_legal` | El rol no es `super_admin` — hay que ir por `solicitudes_cambio` |
| "Faltan los datos comerciales de cliente" | `tipo='cliente'` sin el sub-objeto `cliente` en el payload (refinamiento de zod) |
