-- ==========================================
-- RTB Sistema — 002: Entidades, clientes, proveedores,
-- contactos, direcciones, audit_log, solicitudes_cambio
--
-- Origen: submódulo RTB-ENT-01 (paquete AbacusAI
-- Desarrollo_Subm_dulo_Cliente.zip, 2026-08-05). El documento técnico y los
-- 6 procedimientos operativos del paquete se auditaron contra este proyecto
-- real y NO se aplican literalmente — ver contexto/AUDITORIA_RTB-ENT-01.md
-- para el detalle completo de cada corrección. Resumen de las que tocan
-- este archivo:
--   - Las políticas RLS del doc usan auth.role() (devuelve
--     'authenticated'/'anon'/'service_role', nunca un rol de negocio) →
--     se usa public.current_user_role(), de 001_auth_profiles.sql.
--   - El doc usa roles 'admin' y 'rutas', que no existen en profiles.role →
--     'admin' se traduce a 'direccion', 'rutas' a 'logistica'.
--   - 'entidades'+'clientes'+'proveedores' tenían cada una su propio
--     estado/bloqueo → el estado vive SOLO en entidades.
--   - rfc con UNIQUE simple rompía los RFC genéricos (público en general /
--     extranjero), que se repiten legítimamente → índice único parcial.
--   - Sin audit_log pese a ser regla de negocio no negociable ("el
--     historial no se borra, se controla") → se crea, append-only.
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

create extension if not exists pg_trgm;

-- 1. Tipos enumerados
create type public.entidad_tipo as enum ('cliente', 'proveedor', 'mixta');

-- Un solo estado para toda la jerarquía (entidad, no cliente/proveedor por
-- separado). 'pendiente_aprobacion' NO es un estado: mientras una
-- modificación controlada espera aprobación (ver solicitudes_cambio más
-- abajo), la entidad sigue 'activo' — así lo exige el procedimiento P05
-- ("si RECHAZADO → vuelve a ACTIVO sin cambios"). El badge "Pendiente" de
-- la UI se deriva de una fila abierta en solicitudes_cambio, no de este enum.
create type public.entidad_estado as enum (
  'borrador', 'activo', 'bloqueado_temporal', 'bloqueado_permanente', 'inactivo'
);

create type public.persona_tipo as enum ('fisica', 'moral');
create type public.contacto_tipo as enum ('principal', 'facturacion', 'compras', 'ventas', 'tesoreria', 'operativo');
create type public.direccion_tipo as enum ('fiscal', 'envio', 'cobro', 'bodega', 'sucursal', 'oficina');
create type public.condicion_pago as enum ('credito_abierto', 'contado', 'anticipo_requerido');
create type public.canal_origen as enum ('ariba', 'correo', 'whatsapp', 'telefono', 'mostrador', 'otro');
create type public.solicitud_estado as enum ('pendiente', 'aprobada', 'rechazada', 'cancelada');

-- =========================================
-- 2. TABLA: entidades
-- =========================================
create table public.entidades (
  id uuid primary key default gen_random_uuid(),
  clave varchar(12) not null unique,          -- ENT-000123, la asigna un trigger
  nombre_legal varchar(200) not null,
  nombre_comercial varchar(200),
  tipo public.entidad_tipo not null,
  persona_tipo public.persona_tipo not null,
  rfc varchar(13),
  curp varchar(18),
  regimen_fiscal varchar(100),
  correo_principal varchar(254),
  telefono_principal varchar(30),
  sitio_web varchar(200),
  observaciones text,
  estado public.entidad_estado not null default 'activo',
  bloqueo_motivo text,
  bloqueado_at timestamptz,
  bloqueado_por uuid references public.profiles(id),
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entidades_rfc_len_chk check (rfc is null or length(rfc) in (12, 13)),
  constraint entidades_correo_chk check (
    correo_principal is null or correo_principal ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  ),
  -- Alta directa a 'activo' (decisión de alcance: sólo lo sensible pasa por
  -- aprobación). 'borrador' queda disponible para cuando se quiera capturar
  -- sin publicar. Un registro bloqueado siempre trae motivo y fecha, y
  -- viceversa: no hay bloqueo "mudo" ni fecha de bloqueo sin bloqueo.
  constraint entidades_bloqueo_consistencia_chk check (
    (estado in ('bloqueado_temporal', 'bloqueado_permanente')) = (bloqueado_at is not null)
  )
);

comment on table public.entidades is
  'Maestro de clientes/proveedores/mixtas. El estado y el bloqueo viven aquí '
  'únicamente — clientes y proveedores son extensiones 1:1 sin estado propio.';

-- RFC único, salvo los genéricos que el SAT permite repetir en cualquier
-- padrón mexicano (público en general / residente en el extranjero).
create unique index uq_entidades_rfc on public.entidades (rfc)
  where rfc is not null and rfc not in ('XAXX010101000', 'XEXX010101000');

create index idx_entidades_estado on public.entidades (estado);
create index idx_entidades_tipo on public.entidades (tipo);
create index idx_entidades_busqueda on public.entidades using gin (
  to_tsvector('spanish', coalesce(nombre_legal, '') || ' ' || coalesce(nombre_comercial, ''))
);
create index idx_entidades_clave_trgm on public.entidades using gin (clave gin_trgm_ops);
create index idx_entidades_rfc_trgm on public.entidades using gin (rfc gin_trgm_ops);

-- Generación de clave + normalización de RFC/CURP en alta.
create sequence public.entidades_clave_seq;

-- SECURITY DEFINER porque nextval() sobre entidades_clave_seq exige
-- privilegio USAGE que authenticated no tiene por defecto (Postgres no lo
-- concede a PUBLIC en secuencias nuevas) — más simple correr la
-- generación de clave como el dueño de la secuencia que andar
-- concediendo USAGE a cada rol que puede dar de alta una entidad.
create or replace function public.entidades_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.clave is null then
    new.clave := 'ENT-' || lpad(nextval('public.entidades_clave_seq')::text, 6, '0');
  end if;
  if new.rfc is not null then
    new.rfc := upper(btrim(new.rfc));
  end if;
  if new.curp is not null then
    new.curp := upper(btrim(new.curp));
  end if;
  return new;
end;
$$;

create trigger before_insert_entidades
  before insert on public.entidades
  for each row execute function public.entidades_before_insert();

-- Función de trigger, jamás debe invocarse directo (no requiere EXECUTE
-- para dispararse por trigger — Postgres la llama por su cuenta). Sin este
-- REVOKE queda expuesta como RPC público de PostgREST
-- (/rest/v1/rpc/entidades_before_insert): el mismo gotcha que
-- 001_auth_profiles.sql ya documenta y cierra para sus 3 helpers.
revoke execute on function public.entidades_before_insert() from public, anon, authenticated;

-- updated_at/updated_by en cada UPDATE. No se reutiliza
-- public.handle_updated_at() (de 001_auth_profiles.sql): esa función sólo
-- toca updated_at porque profiles no tiene updated_by; aquí sí lo hay, y
-- clave es inmutable una vez asignada (un cliente que se vuelve 'mixta' no
-- debe cambiar de folio).
create or replace function public.entidades_before_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.clave := old.clave;
  if new.rfc is not null then
    new.rfc := upper(btrim(new.rfc));
  end if;
  if new.curp is not null then
    new.curp := upper(btrim(new.curp));
  end if;
  return new;
end;
$$;

create trigger before_update_entidades
  before update on public.entidades
  for each row execute function public.entidades_before_update();

-- =========================================
-- 3. TABLA: clientes (1:1 con entidades)
-- =========================================
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  entidad_id uuid not null unique references public.entidades(id) on update cascade on delete restrict,
  limite_credito numeric(14, 2) not null default 0,
  dias_credito integer not null default 0,
  dias_gracia integer not null default 0,
  lista_precio varchar(50),
  descuento_maximo numeric(5, 2) not null default 0,
  vendedor_id uuid references public.profiles(id),   -- lo asume RTB-PRO-VEN-01 ("Vendedor")
  canal_origen public.canal_origen,                    -- lo asume RTB-PRO-VEN-01 ("Portal de origen")
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clientes_limite_chk check (limite_credito >= 0),
  constraint clientes_dias_chk check (dias_credito >= 0 and dias_gracia >= 0),
  constraint clientes_descuento_chk check (descuento_maximo >= 0 and descuento_maximo <= 100)
);

create index idx_clientes_vendedor on public.clientes (vendedor_id);

-- updated_at/updated_by genérico, reutilizable por cualquier tabla nueva
-- que tenga ambas columnas (a diferencia de entidades_before_update(), que
-- además fija clave — propia y exclusiva de la tabla entidades).
create or replace function public.set_updated_meta()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger before_update_clientes
  before update on public.clientes
  for each row execute function public.set_updated_meta();

-- Al dar de alta un rol sobre una entidad que ya tiene el rol contrario,
-- la sube a 'mixta' en vez de bloquear el alta (P02: "si la entidad ya
-- existe en clientes, no se duplica — se agrega el rol proveedor sobre la
-- misma entidad"). El DDL original del paquete no lo resolvía: permitía
-- tipo='cliente' con una fila en proveedores sin avisar.
-- SECURITY DEFINER a propósito: sube entidades.tipo a 'mixta' aunque quien
-- dispare el trigger (p.ej. 'ventas' insertando en clientes) sólo tenga
-- GRANT UPDATE de columnas no sensibles sobre entidades — tipo no está en
-- esa lista (es un campo derivado, no algo que el rol deba poder tocar
-- directamente).
create or replace function public.sync_entidad_tipo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tipo_actual public.entidad_tipo;
  v_rol_nuevo public.entidad_tipo := tg_argv[0]::public.entidad_tipo;
begin
  select tipo into v_tipo_actual from public.entidades where id = new.entidad_id;
  if v_tipo_actual is null then
    raise exception 'La entidad % no existe', new.entidad_id;
  end if;
  if v_tipo_actual <> v_rol_nuevo and v_tipo_actual <> 'mixta' then
    update public.entidades set tipo = 'mixta', updated_at = now() where id = new.entidad_id;
  end if;
  return new;
end;
$$;

create trigger sync_tipo_cliente
  before insert on public.clientes
  for each row execute function public.sync_entidad_tipo('cliente');

-- Misma razón que entidades_before_insert(): sólo debe dispararse por
-- trigger, nunca invocarse directo vía RPC.
revoke execute on function public.sync_entidad_tipo() from public, anon, authenticated;

-- =========================================
-- 4. TABLA: proveedores (1:1 con entidades)
-- =========================================
create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  entidad_id uuid not null unique references public.entidades(id) on update cascade on delete restrict,
  categoria varchar(100),
  plazo_pago integer not null default 0,
  credito_autorizado numeric(14, 2) not null default 0,
  moneda_default char(3) not null default 'MXN',
  condicion_pago public.condicion_pago not null default 'contado',  -- lo asume RTB-PRO-COM-01
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proveedores_plazo_chk check (plazo_pago >= 0),
  constraint proveedores_credito_chk check (credito_autorizado >= 0),
  constraint proveedores_moneda_chk check (moneda_default ~ '^[A-Z]{3}$')
);

create trigger before_update_proveedores
  before update on public.proveedores
  for each row execute function public.set_updated_meta();

create trigger sync_tipo_proveedor
  before insert on public.proveedores
  for each row execute function public.sync_entidad_tipo('proveedor');

-- =========================================
-- 5. TABLA: contactos ("modificación libre" según P05 — sin flujo de aprobación)
-- =========================================
create table public.contactos (
  id uuid primary key default gen_random_uuid(),
  entidad_id uuid not null references public.entidades(id) on update cascade on delete restrict,
  nombre varchar(200) not null,
  cargo varchar(100),
  tipo public.contacto_tipo not null default 'operativo',
  correo varchar(254),
  telefono varchar(30),
  extension varchar(10),
  es_principal boolean not null default false,
  activo boolean not null default true,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contactos_correo_chk check (
    correo is null or correo ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  )
);

create unique index uq_contacto_principal_entidad on public.contactos (entidad_id)
  where es_principal = true and activo = true;
create index idx_contactos_entidad on public.contactos (entidad_id);

create trigger before_update_contactos
  before update on public.contactos
  for each row execute function public.set_updated_meta();

-- =========================================
-- 6. TABLA: direcciones ("modificación libre" según P05)
-- =========================================
create table public.direcciones (
  id uuid primary key default gen_random_uuid(),
  entidad_id uuid not null references public.entidades(id) on update cascade on delete restrict,
  tipo public.direccion_tipo not null,
  calle varchar(200) not null,
  numero_exterior varchar(20),
  numero_interior varchar(20),
  colonia varchar(120),
  ciudad varchar(120) not null,
  entidad_federativa varchar(120) not null,   -- renombrado de 'estado': el doc original
                                               -- lo confundía con el estado del flujo
  pais varchar(120) not null default 'México',
  codigo_postal varchar(10) not null,
  referencia text,
  latitud numeric(10, 7),
  longitud numeric(10, 7),
  es_principal boolean not null default false,
  activo boolean not null default true,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint direcciones_cp_chk check (codigo_postal ~ '^[0-9]{5}$'),
  constraint direcciones_geo_chk check (
    (latitud is null and longitud is null) or
    (latitud between -90 and 90 and longitud between -180 and 180)
  )
);

create unique index uq_direccion_principal_entidad_tipo on public.direcciones (entidad_id, tipo)
  where es_principal = true and activo = true;
create index idx_direcciones_entidad on public.direcciones (entidad_id);
create index idx_direcciones_cp on public.direcciones (codigo_postal);

create trigger before_update_direcciones
  before update on public.direcciones
  for each row execute function public.set_updated_meta();

-- =========================================
-- 7. TABLA: audit_log — append-only, regla de negocio no negociable
--    ("los datos no se borran — se controlan", P05 §V).
-- =========================================
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tabla varchar(60) not null,
  registro_id uuid not null,
  accion varchar(40) not null,
  campo varchar(120),
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  motivo text,
  usuario_id uuid references public.profiles(id),
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

comment on table public.audit_log is
  'Append-only. Sin GRANT UPDATE/DELETE para authenticated bajo ninguna '
  'circunstancia; los triggers audit_row() escriben con SECURITY DEFINER '
  'porque el rol que dispara el cambio no tiene privilegio directo sobre '
  'esta tabla, ni falta que le haga.';

create index idx_audit_log_registro on public.audit_log (tabla, registro_id);
create index idx_audit_log_usuario on public.audit_log (usuario_id);
create index idx_audit_log_created on public.audit_log (created_at desc);

-- Trigger genérico de auditoría de fila. SECURITY DEFINER a propósito: el
-- usuario que dispara el INSERT/UPDATE (p.ej. 'ventas') no tiene ni debe
-- tener privilegio de escritura directa sobre audit_log.
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_registro_id uuid;
begin
  if tg_op = 'DELETE' then
    v_registro_id := old.id;
  else
    v_registro_id := new.id;
  end if;

  insert into public.audit_log (tabla, registro_id, accion, datos_anteriores, datos_nuevos, usuario_id)
  values (
    tg_table_name,
    v_registro_id,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end,
    auth.uid()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.audit_row() from public, anon, authenticated;

create trigger audit_entidades after insert or update on public.entidades
  for each row execute function public.audit_row();
create trigger audit_clientes after insert or update on public.clientes
  for each row execute function public.audit_row();
create trigger audit_proveedores after insert or update on public.proveedores
  for each row execute function public.audit_row();
create trigger audit_contactos after insert or update on public.contactos
  for each row execute function public.audit_row();
create trigger audit_direcciones after insert or update on public.direcciones
  for each row execute function public.audit_row();

-- =========================================
-- 8. TABLA: solicitudes_cambio — implementa el flujo "modificación
--    controlada" de P05 sin ensuciar el enum de estado de entidades.
-- =========================================
create table public.solicitudes_cambio (
  id uuid primary key default gen_random_uuid(),
  tabla varchar(60) not null,
  registro_id uuid not null,
  cambios jsonb not null,
  motivo text not null,
  solicitante_id uuid not null references public.profiles(id) default auth.uid(),
  estado public.solicitud_estado not null default 'pendiente',
  aprobador_id uuid references public.profiles(id),
  comentario_resolucion text,
  resuelto_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint solicitudes_cambio_cambios_chk check (jsonb_typeof(cambios) = 'object'),
  constraint solicitudes_cambio_motivo_chk check (length(btrim(motivo)) > 0),
  constraint solicitudes_cambio_resolucion_chk check (
    (estado = 'pendiente') = (aprobador_id is null and resuelto_at is null)
  )
);

comment on table public.solicitudes_cambio is
  'Cola de aprobación para cambios sensibles (RFC, razón social, crédito '
  'sobre umbral, condición de proveedor, reactivación, bloqueo temporal). '
  'La resolución SIEMPRE pasa por el API con service_role: nadie puede '
  'aprobar su propia solicitud a nivel de privilegio de columna.';

create index idx_solicitudes_registro on public.solicitudes_cambio (tabla, registro_id);
create index idx_solicitudes_pendientes on public.solicitudes_cambio (estado) where estado = 'pendiente';
create index idx_solicitudes_solicitante on public.solicitudes_cambio (solicitante_id);

-- Reutiliza el trigger de 001_auth_profiles.sql: solicitudes_cambio no
-- tiene updated_by (la autoría de la resolución ya queda en aprobador_id).
create trigger set_updated_at_solicitudes
  before update on public.solicitudes_cambio
  for each row execute function public.handle_updated_at();

-- Punto de extensión documentado para el bloqueo permanente (P05 §V: "no
-- debe haber pedidos/facturas/pagos abiertos"). Ventas/Compras no existen
-- todavía, así que hoy siempre responde false; cuando existan, se añade
-- aquí la consulta real sin tocar el resto del módulo.
create or replace function public.tiene_operaciones_abiertas(p_entidad_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  -- TODO(RTB-VEN-01 / RTB-COM-01): consultar pedidos/facturas/pagos
  -- abiertos que referencien p_entidad_id en cuanto esas tablas existan.
  select false where p_entidad_id is not null;
$$;

revoke execute on function public.tiene_operaciones_abiertas(uuid) from public, anon;
grant execute on function public.tiene_operaciones_abiertas(uuid) to authenticated, service_role;

-- =========================================
-- 9. Directorio de usuarios — profiles_select sólo deja ver la fila propia
--    (o todas si eres super_admin), así que sin esto ninguna pantalla de
--    ENT-01 podría rotular "creado por" / "aprobó". No toca la política ya
--    auditada de profiles.
--
--    Function, no view: una vista `security_invoker = false` hace lo
--    mismo pero el linter de Supabase la marca ERROR ("Security Definer
--    View") por ser una superficie de riesgo más difícil de auditar que
--    una función. Con una función el mismo patrón queda en la categoría
--    WARN ya aceptada para is_super_admin()/is_active_user() en
--    001_auth_profiles.sql — incluso el vector de ataque es idéntico
--    (SECURITY DEFINER + SET search_path).
-- =========================================
create or replace function public.usuarios_directorio()
returns table (id uuid, full_name text, role text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.full_name, p.role
  from public.profiles p
  where p.is_active;
$$;

revoke execute on function public.usuarios_directorio() from public, anon;
grant execute on function public.usuarios_directorio() to authenticated, service_role;

-- =========================================
-- 10. Privilegios de tabla (barrera previa a RLS, como en 001_auth_profiles.sql)
-- =========================================

-- entidades: los campos sensibles (nombre_legal/RFC/CURP/tipo/persona_tipo/
-- estado/bloqueo_*/clave/created_by) sólo se escriben vía API con
-- service_role, que aplica primero la lógica de aprobación de P05. El
-- resto de la fila sí es de escritura directa para los roles con permiso
-- (la RLS de update decide cuáles).
revoke all on public.entidades from anon, authenticated;
grant select, insert on public.entidades to authenticated;
grant update (nombre_comercial, correo_principal, telefono_principal, sitio_web, observaciones)
  on public.entidades to authenticated;
grant all on public.entidades to service_role;

-- clientes: limite_credito es el campo controlado (P05: aprobación sobre
-- umbral) → sólo service_role. El resto es libre para quien tenga INSERT/
-- UPDATE por RLS.
revoke all on public.clientes from anon, authenticated;
grant select, insert on public.clientes to authenticated;
grant update (dias_credito, dias_gracia, lista_precio, descuento_maximo, vendedor_id, canal_origen)
  on public.clientes to authenticated;
grant all on public.clientes to service_role;

-- proveedores: categoria/condicion_pago son el campo controlado del doc
-- ("categoría de proveedor: compras inicia, direccion aprueba").
revoke all on public.proveedores from anon, authenticated;
grant select, insert on public.proveedores to authenticated;
grant update (plazo_pago, credito_autorizado, moneda_default) on public.proveedores to authenticated;
grant all on public.proveedores to service_role;

-- contactos y direcciones: "modificación libre" completa por RLS, sin
-- restricción de columna.
revoke all on public.contactos from anon, authenticated;
grant select, insert, update on public.contactos to authenticated;
grant all on public.contactos to service_role;

revoke all on public.direcciones from anon, authenticated;
grant select, insert, update on public.direcciones to authenticated;
grant all on public.direcciones to service_role;

-- audit_log: sin GRANT alguno a authenticated. Sólo se escribe vía
-- audit_row() (SECURITY DEFINER) o desde el API con service_role para los
-- eventos de negocio (bloqueo, aprobación) que llevan IP/motivo.
revoke all on public.audit_log from anon, authenticated;
grant all on public.audit_log to service_role;

-- solicitudes_cambio: cualquier rol con permiso de iniciar un cambio
-- controlado puede crear la fila; la resolución (estado/aprobador_id/
-- comentario_resolucion/resuelto_at) es exclusiva de service_role para que
-- nadie pueda aprobar su propia solicitud a nivel de privilegio de columna.
revoke all on public.solicitudes_cambio from anon, authenticated;
grant select, insert on public.solicitudes_cambio to authenticated;
grant all on public.solicitudes_cambio to service_role;

-- Ninguna tabla de este archivo tiene GRANT DELETE para authenticated:
-- regla de negocio "no borrado físico operativo".

-- =========================================
-- 11. RLS
-- =========================================
alter table public.entidades enable row level security;
alter table public.clientes enable row level security;
alter table public.proveedores enable row level security;
alter table public.contactos enable row level security;
alter table public.direcciones enable row level security;
alter table public.audit_log enable row level security;
alter table public.solicitudes_cambio enable row level security;

-- current_user_role() (de 001_auth_profiles.sql) devuelve NULL si el
-- usuario está desactivado, y `NULL = any(...)` es NULL, que RLS trata
-- como falso: la regla "un usuario inactivo no opera nada" queda cubierta
-- sin comprobación adicional en cada política.

-- ---- entidades: los 8 roles consultan; alta y bloqueo por rol de negocio.
create policy entidades_select on public.entidades
  for select to authenticated
  using (public.current_user_role() is not null);

create policy entidades_insert on public.entidades
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'ventas', 'compras']));

create policy entidades_update on public.entidades
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'ventas', 'compras']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'ventas', 'compras']));

-- ---- clientes: ventas administra, compras/finanzas/facturacion sólo leen.
create policy clientes_select on public.clientes
  for select to authenticated
  using (public.current_user_role() is not null);

create policy clientes_insert on public.clientes
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'ventas']));

create policy clientes_update on public.clientes
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'ventas']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'ventas']));

-- ---- proveedores: compras administra.
create policy proveedores_select on public.proveedores
  for select to authenticated
  using (public.current_user_role() is not null);

create policy proveedores_insert on public.proveedores
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras']));

create policy proveedores_update on public.proveedores
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'compras']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras']));

-- ---- contactos: ventas/compras/finanzas capturan y editan (modificación libre).
create policy contactos_select on public.contactos
  for select to authenticated
  using (public.current_user_role() is not null);

create policy contactos_insert on public.contactos
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'ventas', 'compras', 'finanzas']));

create policy contactos_update on public.contactos
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'ventas', 'compras', 'finanzas']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'ventas', 'compras', 'finanzas']));

-- ---- direcciones: ventas/compras/almacen/logistica capturan y editan.
create policy direcciones_select on public.direcciones
  for select to authenticated
  using (public.current_user_role() is not null);

create policy direcciones_insert on public.direcciones
  for insert to authenticated
  with check (
    public.current_user_role() = any (array['super_admin', 'direccion', 'ventas', 'compras', 'almacen', 'logistica'])
  );

create policy direcciones_update on public.direcciones
  for update to authenticated
  using (
    public.current_user_role() = any (array['super_admin', 'direccion', 'ventas', 'compras', 'almacen', 'logistica'])
  )
  with check (
    public.current_user_role() = any (array['super_admin', 'direccion', 'ventas', 'compras', 'almacen', 'logistica'])
  );

-- ---- audit_log: sólo direccion/super_admin consultan el historial completo.
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion']));

-- ---- solicitudes_cambio: el solicitante ve las suyas; direccion/super_admin ven todas.
create policy solicitudes_select on public.solicitudes_cambio
  for select to authenticated
  using (
    solicitante_id = (select auth.uid())
    or public.current_user_role() = any (array['super_admin', 'direccion'])
  );

create policy solicitudes_insert on public.solicitudes_cambio
  for insert to authenticated
  with check (
    solicitante_id = (select auth.uid())
    and public.current_user_role() = any (array['super_admin', 'direccion', 'ventas', 'compras'])
  );

-- Sin política de UPDATE: la resolución (aprobar/rechazar) va siempre por
-- el API con service_role, que además valida que el aprobador no sea el
-- propio solicitante.

-- Sin DELETE en ninguna tabla: regla de negocio "no borrado físico".
