# Proceso — Bloqueo de entidad y cola de solicitudes de cambio

Implementa P05 §II/§IV del paquete original, corregido: los roles `admin`
(→`direccion`) y el umbral de $50,000 (→ $100,000, manda P05 sobre el
mockup). Detalle en `contexto/AUDITORIA_RTB-ENT-01.md`.

## Los ocho cambios controlados

Tabla completa en `app/lib/entidades/permisos.ts::REGLAS_APROBACION` (espejo
en TypeScript) y en el enum `public.cambio_controlado`
(`db/migrations/005_solicitudes_tipo_cambio.sql`, `persona_tipo` agregado en
`054_entidades_persona_tipo_cambio_controlado.sql`, 2026-08-10).

| `tipo_cambio` | Inicia | Aprueba | Ruta para iniciar |
|---|---|---|---|
| `rfc` | `super_admin`, `ventas` | `super_admin` | `PATCH /api/entidades/[id]` (directo) o `POST /api/solicitudes-cambio` |
| `razon_social` | `direccion`, `ventas` | `super_admin` | ídem |
| `persona_tipo` | `direccion`, `ventas` | `super_admin` | ídem |
| `limite_credito` | `ventas` | `direccion` | `PATCH /api/entidades/[id]/cliente` (decide sola directo vs. solicitud según `ejecutaDirecto`) |
| `condicion_proveedor` | `compras` | `direccion` | `PATCH /api/entidades/[id]/proveedor` (mismo patrón dual que `limite_credito`) |
| `reactivacion` | `direccion` | `super_admin` | `POST /api/entidades/[id]/desbloquear` |
| `bloqueo_temporal` | `direccion` | `super_admin` | `POST /api/entidades/[id]/bloquear` |
| `bloqueo_permanente` | `super_admin` | ejecuta directo (`aprueba: null`) | `POST /api/entidades/[id]/bloquear` |

`super_admin` siempre ejecuta directo cualquiera de los ocho — la matriz de
permisos le da control total (`ejecutaDirecto()` en `permisos.ts` lo
codifica explícitamente). Antes de `054` (2026-08-10), `rfc`/`razon_social`
sólo podían iniciarlos `super_admin`/`direccion` respectivamente y
`persona_tipo` no tenía ningún camino de escritura (ni `GRANT`, ni entrada
en el enum, ni campo en ningún schema zod) — un hueco real, no sólo de UI.

### Dos patrones de "iniciar", según el tipo

- **`rfc`/`razon_social`/`persona_tipo`** (un solo campo por `tipo_cambio`):
  tarjeta **"Información Fiscal"** en la ficha de entidad
  (`InformacionFiscalCard`/`CampoP05` en `entidad-detalle.tsx`) — un lápiz
  por campo, visible sólo si el rol figura en `inicia` para ese tipo.
  `CampoP05` decide en el propio componente: `directo` → `PATCH
  /api/entidades/[id]`; si no → `POST /api/solicitudes-cambio` con el
  motivo capturado en un textarea.
- **`limite_credito`/`condicion_proveedor`** (columnas sin `GRANT UPDATE`
  para `authenticated`, ninguna ruta genérica las cubre): cada una tiene su
  propia ruta `PATCH` dedicada (`.../cliente`, `.../proveedor`) que decide
  ella misma directo-vs-solicitud con `ejecutaDirecto()` — nunca pasan por
  `POST /api/solicitudes-cambio` desde el cliente. `condicion_proveedor` es
  además el único de los ocho que cubre **dos** columnas en una sola
  solicitud (`categoria` + `condicion_pago`, `CAMPOS_PERMITIDOS` en el
  resolver) — su editor en la ficha de proveedor usa **`CampoP05Multi`**
  (variante de `CampoP05` para varios campos a la vez), no el componente de
  un solo campo.

## Flujo genérico de una solicitud (RFC/razón social/crédito/condición)

1. **Crear** — `POST /api/solicitudes-cambio` con `{ tabla, registro_id,
   tipo_cambio, cambios, motivo }`. La ruta comprueba que el rol de quien
   llama esté en `REGLAS_APROBACION[tipo_cambio].inicia` antes de insertar
   (además de la RLS de `solicitudes_cambio`, que ya limita quién puede
   insertar en general).
2. **Queda `pendiente`** en `solicitudes_cambio`, visible para el
   solicitante (RLS: `solicitante_id = auth.uid()`) y para
   `direccion`/`super_admin` (ven todas).
3. **Resolver** — `POST /api/solicitudes-cambio/[id]/resolver` con
   `{ decision: 'aprobar'|'rechazar', comentario_resolucion? }`. La ruta:
   - Verifica que quien resuelve esté en `REGLAS_APROBACION[tipo_cambio].aprueba`.
   - Verifica que **no sea la misma persona que solicitó** (`403` si
     `solicitante_id === auth.userId` — nadie aprueba lo suyo).
   - Si aprueba: aplica sólo los campos permitidos para ese `tipo_cambio`
     (`CAMPOS_PERMITIDOS` en la propia ruta — allowlist explícita, no confía
     ciegamente en las claves del jsonb `cambios`) con el cliente
     `service_role`, porque esas columnas nunca tienen `GRANT UPDATE` para
     `authenticated`.
   - Si rechaza: no toca la tabla de negocio, sólo marca la solicitud.
   - Escribe un evento en `audit_log` con IP/motivo.

## Bloqueo temporal

`POST /api/entidades/[id]/bloquear` con `{ tipo: 'temporal', motivo }`:

- Si lo pide `direccion` → crea una `solicitudes_cambio` (`tipo_cambio:
  'bloqueo_temporal'`) y responde `202` — queda pendiente de `super_admin`.
- Si lo pide `super_admin` → se aplica directo: `entidades.estado =
  'bloqueado_temporal'`, `bloqueado_at = now()`, `bloqueado_por = auth.uid()`,
  más un evento explícito en `audit_log` con IP (el trigger genérico también
  dispara, pero sin IP).

## Bloqueo permanente

Sólo `super_admin`, `{ tipo: 'permanente', motivo }`. Antes de aplicar,
llama a `public.tiene_operaciones_abiertas(entidad_id)` — **hoy siempre
`false`** porque Ventas/Compras no existen todavía; es el punto de extensión
documentado para cuando sí existan (`db/migrations/002_entidades_core.sql`).
No tiene reversión: `bloqueado_permanente` no admite `desbloquear`.

## Desbloqueo (sólo bloqueo temporal)

`POST /api/entidades/[id]/desbloquear` — mismo patrón dual: `direccion`
solicita (`tipo_cambio: 'reactivacion'`), `super_admin` ejecuta directo.
Devuelve `409` si la entidad está `bloqueado_permanente` ("requiere migración
especial de datos") o si no está bloqueada.

## Qué puede fallar

| Síntoma | Causa |
|---|---|
| 403 "Tu rol no puede solicitar un cambio de tipo..." | El rol no está en `inicia` para ese `tipo_cambio` |
| 403 "No puedes aprobar tu propia solicitud" | `solicitante_id === auth.userId` |
| 409 "Esta solicitud ya fue resuelta" | Doble clic / carrera entre dos aprobadores |
| 409 "La entidad tiene operaciones abiertas" | `tiene_operaciones_abiertas()` — hoy nunca debería pasar |

## Pantalla

`/dashboard/solicitudes` (`super_admin`/`direccion` — gap de UI cerrado
2026-08-06, `contexto/AUDITORIA_QA_ROLES_2026-08-06.md` §4): antes
`POST /api/solicitudes-cambio/[id]/resolver` existía y respondía sin
ninguna pantalla que lo llamara — una solicitud pendiente real de la
campaña de QA (bloqueo temporal de un proveedor) era invisible salvo por
SQL directo. Como `registro_id` es polimórfico (`entidades`/`clientes`/
`proveedores` según `tabla`), la ruta `GET /api/solicitudes-cambio`
resuelve el nombre de la entidad server-side antes de responder, en vez
de dejar que la pantalla repita ese join condicional.

**Búsqueda y filtros** (2026-08-10): texto libre (nombre/razón social/
nombre comercial/RFC/siglas de la entidad asociada, y `motivo`), tipo de
cambio, rango de fechas de creación (`<RangoFechas>`) y "Sólo mías"
(`solicitante_id = uid`). Construidos en
`app/lib/entidades/listado-solicitudes.ts` (mismo pivote anti-duplicación
que `lib/ventas/listado-cotizaciones.ts`, pero sin importar de ahí — la
dirección de dependencia del repo es `ventas` → `entidades`, no al revés;
`valorLike`/`diaSiguiente` se duplican en 4 líneas cada uno). La búsqueda
de texto resuelve en dos pasos porque `registro_id` es polimórfico: primero
`ilike` sobre `entidades`, luego `clientes`/`proveedores` cuyo `entidad_id`
esté en ese resultado, y arma un `.or()` con `and(tabla.eq.X,
registro_id.in.(...))` por cada tabla más `motivo.ilike`. Columna nueva
**Solicitante** (resuelta con `public.usuarios_directorio()`, RPC ya usado
en Ventas/Inventario para el mismo propósito — `profiles_select` sólo deja
ver la fila propia). Paginación convergida a `<Paginacion>`
(`components/ui/paginacion.tsx`), que ya señalaba esta pantalla como una de
las 5 pendientes de converger.

**El botón Aprobar/Rechazar sólo aparece si el rol de quien mira coincide
con `REGLAS_APROBACION[tipo_cambio].aprueba`** (2026-08-10). Antes se
mostraba a cualquiera de los dos roles con acceso a la pantalla —
`direccion` podía intentar aprobar un `rfc`/`razon_social`/`persona_tipo`/
`reactivacion`/`bloqueo_temporal` (los 5 tipos donde sólo `super_admin`
aprueba) y se llevaba un `403` real del servidor en vez de nunca ver el
botón. Ahora, si el rol no puede resolver ese tipo, ve **"Sólo lectura —
aprueba `<rol>`"** en su lugar — el servidor sigue siendo la barrera real
(`REGLAS_APROBACION[tipo].aprueba.includes(rol)` en
`.../resolver/route.ts`), esto sólo evita el viaje redondo que iba a
fallar.

**Bug encontrado y corregido de paso:** el Server Component de la ficha de
entidad (`app/app/dashboard/entidades/[id]/page.tsx`) nunca incluía
`tabla='proveedores'` al construir el filtro de `solicitudesPendientes` —
mismo defecto ya conocido y corregido una vez para `tabla='clientes'`
(comentario ya en el archivo). Sin el fix, el badge "Solicitud pendiente"
de `condicion_proveedor` nunca se habría mostrado en la ficha del
proveedor, aunque la solicitud sí existiera y fuera resoluble.
