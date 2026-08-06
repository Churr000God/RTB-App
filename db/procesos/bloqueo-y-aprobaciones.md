# Proceso — Bloqueo de entidad y cola de solicitudes de cambio

Implementa P05 §II/§IV del paquete original, corregido: los roles `admin`
(→`direccion`) y el umbral de $50,000 (→ $100,000, manda P05 sobre el
mockup). Detalle en `contexto/AUDITORIA_RTB-ENT-01.md`.

## Los siete cambios controlados

Tabla completa en `app/lib/entidades/permisos.ts::REGLAS_APROBACION` (espejo
en TypeScript) y en el enum `public.cambio_controlado`
(`db/migrations/005_solicitudes_tipo_cambio.sql`).

| `tipo_cambio` | Inicia | Aprueba | Ruta |
|---|---|---|---|
| `rfc` | `super_admin` | ejecuta directo | `PATCH /api/entidades/[id]` |
| `razon_social` | `direccion` | `super_admin` | `POST /api/solicitudes-cambio` |
| `limite_credito` | `ventas` | `direccion` | `POST /api/solicitudes-cambio` |
| `condicion_proveedor` | `compras` | `direccion` | `POST /api/solicitudes-cambio` |
| `reactivacion` | `direccion` | `super_admin` | `POST /api/entidades/[id]/desbloquear` |
| `bloqueo_temporal` | `direccion` | `super_admin` | `POST /api/entidades/[id]/bloquear` |
| `bloqueo_permanente` | `super_admin` | ejecuta directo | `POST /api/entidades/[id]/bloquear` |

`super_admin` siempre ejecuta directo cualquiera de los siete — la matriz de
permisos le da control total (`ejecuta_directo()` en `permisos.ts` lo
codifica explícitamente).

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
