-- ==========================================
-- RTB Sistema — 003: Ubicaciones internas (árbol jerárquico)
--
-- Corrige tres defectos del DDL original del paquete RTB-ENT-01 (ver
-- contexto/AUDITORIA_RTB-ENT-01.md):
--   - No tenía parent_id/nivel pese a que el procedimiento P04 exige una
--     jerarquía de 5 niveles con código autogenerado por herencia de
--     prefijo → se modela como árbol auto-referencial.
--   - entidad_id apuntaba a clientes/proveedores; el "Nivel 1 · Entidad"
--     de P04 es un centro operativo de RTB (almacén matriz, sucursal), no
--     una entidad externa → sin esa FK, el nivel 1 es la raíz del propio
--     árbol.
--   - P04 exige 5 niveles pero el mockup de UI implementa sólo 4 (sin
--     pasillo) con prefijos distintos → profundidad flexible 1-5: `tipo`
--     debe ser estrictamente más profundo que el de su padre en la
--     taxonomía, pero puede saltarse niveles intermedios.
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

create type public.ubicacion_tipo as enum ('centro_operativo', 'zona', 'pasillo', 'rack', 'posicion');
create type public.ubicacion_clasificacion as enum ('fisica', 'logica', 'especial');
create type public.ubicacion_uso_especial as enum (
  'cuarentena', 'devoluciones', 'material_danado', 'recepcion', 'embarque', 'picking'
);

-- Orden semántico de la taxonomía de P04, independiente de `nivel` (que es
-- la profundidad real del árbol). Permite que un rack cuelgue directo de
-- una zona sin pasillo intermedio, como hace el mockup, sin permitir un
-- pasillo colgando de un rack (retroceso ilegal en la jerarquía).
create or replace function public.ubicacion_tipo_rango(p_tipo public.ubicacion_tipo)
returns smallint
language sql
immutable
security invoker
set search_path = public, pg_temp
as $$
  select case p_tipo
    when 'centro_operativo' then 1
    when 'zona' then 2
    when 'pasillo' then 3
    when 'rack' then 4
    when 'posicion' then 5
  end;
$$;

create table public.ubicaciones_internas (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.ubicaciones_internas(id) on delete restrict,
  nivel smallint not null,                 -- profundidad real del árbol, 1..5
  segmento varchar(30) not null,           -- fragmento propio: 'ALM-A', 'R01', 'N2'
  codigo varchar(160) not null unique,     -- codigo del padre + '-' + segmento
  tipo public.ubicacion_tipo not null,
  clasificacion public.ubicacion_clasificacion not null default 'fisica',
  uso_especial public.ubicacion_uso_especial,
  nombre varchar(120) not null,
  descripcion text,
  capacidad_posiciones integer,            -- la ocupación NO se guarda aquí: es
                                            -- un cálculo de Almacén (módulo futuro)
  responsable_id uuid references public.profiles(id),
  activo boolean not null default true,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ubicaciones_nivel_chk check (nivel between 1 and 5),
  constraint ubicaciones_capacidad_chk check (capacidad_posiciones is null or capacidad_posiciones > 0),
  constraint ubicaciones_uso_especial_chk check (
    clasificacion = 'especial' or uso_especial is null
  )
);

comment on table public.ubicaciones_internas is
  'Árbol de centros operativos, zonas, pasillos, racks y posiciones de RTB. '
  'Profundidad flexible (1-5): tipo debe ser más profundo que el del padre '
  'en la taxonomía, pero puede saltarse niveles intermedios.';

create index idx_ubicaciones_parent on public.ubicaciones_internas (parent_id);
create index idx_ubicaciones_tipo on public.ubicaciones_internas (tipo);
create index idx_ubicaciones_activo on public.ubicaciones_internas (activo);
create index idx_ubicaciones_responsable on public.ubicaciones_internas (responsable_id);

-- Único entre hermanos: NULL <> NULL en Postgres, así que una raíz por
-- segmento necesita su propio índice parcial (no basta con
-- UNIQUE(parent_id, segmento), que no compara dos parent_id NULL entre sí).
create unique index uq_ubicaciones_segmento_raiz on public.ubicaciones_internas (segmento) where parent_id is null;
create unique index uq_ubicaciones_segmento_hijo on public.ubicaciones_internas (parent_id, segmento) where parent_id is not null;

create index idx_ubicaciones_codigo_trgm on public.ubicaciones_internas using gin (codigo gin_trgm_ops);
create index idx_ubicaciones_nombre_trgm on public.ubicaciones_internas using gin (nombre gin_trgm_ops);

-- Calcula nivel/código a partir del padre y valida la taxonomía. SECURITY
-- INVOKER: sólo lee la fila padre (SELECT ya concedido a authenticated) y
-- escribe columnas de la propia fila que se está insertando, sin tocar
-- privilegios de otra tabla.
create or replace function public.ubicaciones_before_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_parent_nivel smallint;
  v_parent_codigo varchar;
  v_parent_tipo public.ubicacion_tipo;
begin
  if new.segmento is null or btrim(new.segmento) = '' then
    raise exception 'El segmento es obligatorio';
  end if;
  new.segmento := upper(btrim(new.segmento));

  if new.parent_id is null then
    new.nivel := 1;
    new.codigo := new.segmento;
  else
    select nivel, codigo, tipo into v_parent_nivel, v_parent_codigo, v_parent_tipo
      from public.ubicaciones_internas where id = new.parent_id;
    if not found then
      raise exception 'La ubicación padre % no existe', new.parent_id;
    end if;
    if v_parent_nivel >= 5 then
      raise exception 'La jerarquía no admite más de 5 niveles';
    end if;
    if public.ubicacion_tipo_rango(new.tipo) <= public.ubicacion_tipo_rango(v_parent_tipo) then
      raise exception 'El tipo % no puede colgar de un padre de tipo % (retrocede en la jerarquía)',
        new.tipo, v_parent_tipo;
    end if;
    new.nivel := v_parent_nivel + 1;
    new.codigo := v_parent_codigo || '-' || new.segmento;
  end if;

  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

create trigger before_insert_ubicaciones
  before insert on public.ubicaciones_internas
  for each row execute function public.ubicaciones_before_insert();

-- Bloquea la reestructuración del árbol vía UPDATE (parent_id/segmento/
-- codigo/nivel/tipo quedan fijos una vez creada la fila — mover un nodo
-- exigiría recalcular el código de toda su descendencia, fuera de alcance)
-- y aplica la regla de permisos de P04: 'almacen' opera pero no desactiva.
create or replace function public.ubicaciones_before_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.activo is distinct from old.activo and public.current_user_role() = 'almacen' then
    raise exception 'almacen no tiene permiso para activar/desactivar ubicaciones (P04)'
      using errcode = '42501';
  end if;
  new.parent_id := old.parent_id;
  new.segmento := old.segmento;
  new.codigo := old.codigo;
  new.nivel := old.nivel;
  new.tipo := old.tipo;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger before_update_ubicaciones
  before update on public.ubicaciones_internas
  for each row execute function public.ubicaciones_before_update();

create trigger audit_ubicaciones after insert or update on public.ubicaciones_internas
  for each row execute function public.audit_row();

-- =========================================
-- Privilegios y RLS
-- =========================================
revoke all on public.ubicaciones_internas from anon, authenticated;
grant select, insert on public.ubicaciones_internas to authenticated;
grant update (nombre, descripcion, responsable_id, capacidad_posiciones, clasificacion, uso_especial, activo)
  on public.ubicaciones_internas to authenticated;
grant all on public.ubicaciones_internas to service_role;
-- Sin GRANT DELETE: regla de negocio "no borrado físico operativo".

alter table public.ubicaciones_internas enable row level security;

-- Los 8 roles consultan (matriz de permisos: todos tienen R sobre ubicaciones).
create policy ubicaciones_select on public.ubicaciones_internas
  for select to authenticated
  using (public.current_user_role() is not null);

create policy ubicaciones_insert on public.ubicaciones_internas
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'almacen']));

create policy ubicaciones_update on public.ubicaciones_internas
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'almacen']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'almacen']));

-- Sin DELETE: regla de negocio "no borrado físico".
