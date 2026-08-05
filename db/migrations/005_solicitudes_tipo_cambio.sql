-- ==========================================
-- RTB Sistema — 005: tipo_cambio en solicitudes_cambio
--
-- 002_entidades_core.sql modela solicitudes_cambio con `cambios jsonb`
-- pero sin decir A QUÉ regla de P05 §II corresponde la solicitud — y sin
-- eso, /api/solicitudes-cambio/[id]/resolver no puede saber si el
-- aprobador correcto es 'direccion' (límite de crédito, condición de
-- proveedor) o 'super_admin' (RFC, razón social, reactivación). Se
-- detectó al escribir esa ruta; se corrige aquí en vez de adivinar el
-- aprobador a partir de las claves de `cambios`.
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

-- bloqueo_temporal está aquí también: sigue el mismo patrón "direccion
-- inicia, super_admin aprueba" que los otros cinco (P05 §IV). El bloqueo
-- permanente NO está: super_admin lo ejecuta directo, sin segunda firma
-- (ver app/lib/entidades/permisos.ts::REGLAS_APROBACION).
create type public.cambio_controlado as enum (
  'rfc', 'razon_social', 'limite_credito', 'condicion_proveedor', 'reactivacion', 'bloqueo_temporal'
);

-- Tabla recién creada en 002, todavía sin filas de producción: se puede
-- añadir NOT NULL directo sin backfill.
alter table public.solicitudes_cambio add column tipo_cambio public.cambio_controlado not null;

create index idx_solicitudes_tipo_cambio on public.solicitudes_cambio (tipo_cambio);

comment on column public.solicitudes_cambio.tipo_cambio is
  'Cuál de las reglas de P05 §II aplica — determina el rol aprobador '
  '(app/lib/entidades/permisos.ts::REGLAS_APROBACION es el espejo TS).';
