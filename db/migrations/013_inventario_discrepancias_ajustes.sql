-- ==========================================
-- RTB Sistema — 013: Discrepancias, ajustes autorizados, hallazgos y
-- redefinición de unidad de medida
--
-- Ver contexto/AUDITORIA_RTB-INV-01.md para el detalle completo. Cierra el
-- círculo que 011/012 dejaron abierto a propósito (ajuste_autorizado()
-- como stub que siempre devuelve false): a partir de aquí un movimiento de
-- tipo entrada_ajuste/salida_ajuste/entrada_conteo/salida_conteo sólo es
-- posible con un inventario_ajustes en estado 'autorizado'/'aplicado'.
--
-- Regla dura tomada literal del Registro de Discrepancias real
-- (CIE-DIS-01): "Una diferencia sin causa identificada no se ajusta: se
-- declara como hallazgo. Ajustar sin entender es hacer que el problema
-- desaparezca de la vista sin que desaparezca del almacén." Y:
-- "Ajustes aplicados sin autorización registrada: 34 de 34" — el hallazgo
-- que este archivo existe para cerrar estructuralmente, no por disciplina.
-- ==========================================

create type public.ajuste_estado as enum (
  'borrador', 'pendiente_autorizacion', 'autorizado', 'aplicado', 'rechazado', 'cancelado'
);
create type public.ajuste_tipo as enum (
  'conteo', 'reubicacion', 'correccion_captura', 'redefinicion_unidad', 'carga_inicial', 'merma', 'otro'
);
create type public.discrepancia_banda as enum ('documental', 'movimiento', 'regularizacion', 'sistema');
create type public.discrepancia_salida as enum (
  'ubi',              -- corrección de ubicación
  'cap',              -- corrección de captura
  'aju',              -- ajuste autorizado con soporte
  'aju_sin_soporte',  -- ajuste sin soporte (vocabulario real de RTB: "AJU s/s")
  'justificado',      -- material en tránsito
  'hal',              -- hallazgo abierto
  'men'                -- diferencia menor no rastreada
);
create type public.discrepancia_estado as enum (
  'abierta', 'en_investigacion', 'con_causa', 'resuelta', 'hallazgo', 'cancelada'
);
create type public.hallazgo_estado as enum ('abierto', 'en_seguimiento', 'cerrado_con_causa', 'cerrado_sin_causa');

-- =========================================
-- 1. TABLA: inventario_hallazgos — sobrevive al conteo, no se cancela al
--    cerrar el acta. Es lo que impide que "el problema desaparezca de la
--    vista". Va primero porque inventario_discrepancias la referencia.
-- =========================================
create table public.inventario_hallazgos (
  id uuid primary key default gen_random_uuid(),
  folio varchar(16) not null unique,          -- HAL-000123
  origen_conteo_id uuid references public.inventario_conteos(id) on delete restrict,
  descripcion text not null,
  impacto_piezas numeric(16, 4),
  impacto_valor numeric(20, 6),
  banda public.discrepancia_banda,
  estado public.hallazgo_estado not null default 'abierto',
  responsable_id uuid references public.profiles(id),
  fecha_limite date,
  conclusion text,
  cerrado_at timestamptz,
  cerrado_por uuid references public.profiles(id),
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hal_desc_chk check (length(btrim(descripcion)) > 0),
  constraint hal_cierre_chk check (
    (estado in ('cerrado_con_causa', 'cerrado_sin_causa')) = (conclusion is not null and cerrado_at is not null)
  )
);

comment on table public.inventario_hallazgos is
  'Hallazgo abierto cuando una diferencia no tiene causa identificada. '
  'Sobrevive al cierre del conteo que lo originó — no se cancela con el '
  'acta. "Ajustar sin entender es hacer que el problema desaparezca de la '
  'vista sin que desaparezca del almacén" (Registro de Discrepancias CIE-DIS-01).';

create index idx_hallazgos_estado on public.inventario_hallazgos (estado);
create index idx_hallazgos_conteo on public.inventario_hallazgos (origen_conteo_id);
create index idx_hallazgos_responsable on public.inventario_hallazgos (responsable_id);
create index idx_hallazgos_abiertos on public.inventario_hallazgos (fecha_limite) where estado in ('abierto', 'en_seguimiento');

create sequence public.inventario_hallazgos_folio_seq;

create or replace function public.hallazgos_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.folio is null then
    new.folio := 'HAL-' || lpad(nextval('public.inventario_hallazgos_folio_seq')::text, 6, '0');
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

revoke execute on function public.hallazgos_before_insert() from public, anon, authenticated;

create trigger before_insert_hallazgos
  before insert on public.inventario_hallazgos
  for each row execute function public.hallazgos_before_insert();

-- estado/conclusion/cerrado_* no son de escritura directa: se estampan al
-- transicionar a un estado de cierre, igual que apartados/conteo_detalles.
create or replace function public.hallazgos_before_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.folio := old.folio;
  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.estado in ('cerrado_con_causa', 'cerrado_sin_causa') and old.estado not in ('cerrado_con_causa', 'cerrado_sin_causa') then
    new.cerrado_at := now();
    new.cerrado_por := auth.uid();
  elsif new.estado not in ('cerrado_con_causa', 'cerrado_sin_causa') then
    new.cerrado_at := null;
    new.cerrado_por := null;
  else
    new.cerrado_at := old.cerrado_at;
    new.cerrado_por := old.cerrado_por;
  end if;
  return new;
end;
$$;

create trigger before_update_hallazgos
  before update on public.inventario_hallazgos
  for each row execute function public.hallazgos_before_update();

create trigger audit_hallazgos after insert or update on public.inventario_hallazgos
  for each row execute function public.audit_row();

revoke all on public.inventario_hallazgos from anon, authenticated;
grant select on public.inventario_hallazgos to authenticated;
-- estado/conclusion/cerrado_at/cerrado_por fuera del INSERT: un hallazgo
-- nace 'abierto' siempre (el DEFAULT), nunca ya cerrado.
grant insert (origen_conteo_id, descripcion, impacto_piezas, impacto_valor, banda, responsable_id, fecha_limite)
  on public.inventario_hallazgos to authenticated;
grant update (descripcion, impacto_piezas, impacto_valor, banda, responsable_id, fecha_limite, estado, conclusion)
  on public.inventario_hallazgos to authenticated;
grant all on public.inventario_hallazgos to service_role;

alter table public.inventario_hallazgos enable row level security;

create policy hallazgos_select on public.inventario_hallazgos
  for select to authenticated
  using (public.current_user_role() is not null);
create policy hallazgos_insert on public.inventario_hallazgos
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'almacen', 'compras']));
create policy hallazgos_update on public.inventario_hallazgos
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'almacen', 'compras']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'almacen', 'compras']));

-- =========================================
-- 2. TABLA: inventario_ajustes — el ajuste autorizado (CIE-AJU-01), de
--    primera clase. Espejo estructural de solicitudes_cambio (002).
-- =========================================
create table public.inventario_ajustes (
  id uuid primary key default gen_random_uuid(),
  folio varchar(16) not null unique,     -- AJU-000123
  tipo public.ajuste_tipo not null,
  motivo text not null,
  conteo_id uuid references public.inventario_conteos(id) on delete restrict,

  soporte_path text,                      -- bucket privado 'soportes-inventario'
  sin_soporte boolean not null default false,
  motivo_sin_soporte text,

  estado public.ajuste_estado not null default 'borrador',
  solicitante_id uuid not null references public.profiles(id) default auth.uid(),
  autorizador_id uuid references public.profiles(id),
  autorizado_at timestamptz,
  comentario_autorizacion text,
  motivo_rechazo text,
  aplicado_at timestamptz,
  aplicado_por uuid references public.profiles(id),
  impacto_piezas numeric(16, 4),
  impacto_valor numeric(20, 6),

  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint aju_motivo_chk check (length(btrim(motivo)) > 0),
  constraint aju_autorizacion_chk check (
    (estado in ('autorizado', 'aplicado')) = (autorizador_id is not null and autorizado_at is not null)
  ),
  -- "Ajustes aplicados sin autorización registrada: 34 de 34." Nadie
  -- autoriza lo suyo, a nivel de CHECK: ni la API con service_role puede
  -- saltárselo escribiendo autorizador_id = solicitante_id.
  constraint aju_no_autoaprobacion_chk check (autorizador_id is null or autorizador_id <> solicitante_id),
  constraint aju_soporte_chk check (
    (sin_soporte = false and soporte_path is not null)
    or (sin_soporte = true and length(btrim(coalesce(motivo_sin_soporte, ''))) > 0)
    or estado = 'borrador'   -- el soporte se exige al enviar a autorización, no al capturar
  ),
  constraint aju_rechazo_chk check ((estado = 'rechazado') = (motivo_rechazo is not null)),
  constraint aju_aplicado_chk check ((estado = 'aplicado') = (aplicado_at is not null and aplicado_por is not null))
);

comment on table public.inventario_ajustes is
  'Ajuste autorizado (CIE-AJU-01). aju_no_autoaprobacion_chk hace '
  'estructuralmente imposible que alguien autorice su propia solicitud. '
  'La resolución (autorizar/rechazar/aplicar) SIEMPRE pasa por el API con '
  'service_role, que valida requireApiRole([super_admin,direccion]) y '
  'escribe audit_log con IP — mismo patrón que solicitudes_cambio (002).';

create index idx_ajustes_estado on public.inventario_ajustes (estado);
create index idx_ajustes_conteo on public.inventario_ajustes (conteo_id);
create index idx_ajustes_solicitante on public.inventario_ajustes (solicitante_id);
create index idx_ajustes_autorizador on public.inventario_ajustes (autorizador_id);
create index idx_ajustes_pendientes on public.inventario_ajustes (estado) where estado = 'pendiente_autorizacion';

create sequence public.inventario_ajustes_folio_seq;

create or replace function public.ajustes_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.folio is null then
    new.folio := 'AJU-' || lpad(nextval('public.inventario_ajustes_folio_seq')::text, 6, '0');
  end if;
  new.solicitante_id := coalesce(new.solicitante_id, auth.uid());
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

revoke execute on function public.ajustes_before_insert() from public, anon, authenticated;

create trigger before_insert_ajustes
  before insert on public.inventario_ajustes
  for each row execute function public.ajustes_before_insert();

-- El contenido del ajuste queda fijo una vez que deja de ser 'borrador':
-- sólo el ciclo de vida (estado/autorizador/aplicado/rechazo, todos fuera
-- del GRANT UPDATE de authenticated) sigue avanzando. Se aplica también a
-- service_role — nadie reescribe el motivo de un ajuste ya enviado.
create or replace function public.ajustes_before_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.folio := old.folio;
  new.solicitante_id := old.solicitante_id;
  if old.estado <> 'borrador' then
    new.tipo := old.tipo;
    new.motivo := old.motivo;
    new.soporte_path := old.soporte_path;
    new.sin_soporte := old.sin_soporte;
    new.motivo_sin_soporte := old.motivo_sin_soporte;
    new.conteo_id := old.conteo_id;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger before_update_ajustes
  before update on public.inventario_ajustes
  for each row execute function public.ajustes_before_update();

create trigger audit_ajustes after insert or update on public.inventario_ajustes
  for each row execute function public.audit_row();

revoke all on public.inventario_ajustes from anon, authenticated;
grant select on public.inventario_ajustes to authenticated;
-- INSERT restringido: estado/autorizador_id/autorizado_at/aplicado_*/
-- comentario_autorizacion/motivo_rechazo fuera. Sin esto, un INSERT directo
-- podría crear un ajuste ya 'autorizado' con autorizador_id = cualquier
-- otro usuario real (que nunca lo autorizó) y satisfacer
-- aju_no_autoaprobacion_chk sin que nadie haya aprobado nada — el mismo
-- hueco que se cerró en inventario_conteos (ver 012).
grant insert (tipo, motivo, conteo_id, soporte_path, sin_soporte, motivo_sin_soporte)
  on public.inventario_ajustes to authenticated;
-- UPDATE también restringido a las mismas columnas; el trigger además las
-- congela en cuanto estado deja de ser 'borrador'.
grant update (tipo, motivo, conteo_id, soporte_path, sin_soporte, motivo_sin_soporte)
  on public.inventario_ajustes to authenticated;
grant all on public.inventario_ajustes to service_role;

alter table public.inventario_ajustes enable row level security;

create policy ajustes_select on public.inventario_ajustes
  for select to authenticated
  using (
    solicitante_id = (select auth.uid())
    or public.current_user_role() = any (array['super_admin', 'direccion', 'almacen', 'compras'])
  );
create policy ajustes_insert on public.inventario_ajustes
  for insert to authenticated
  with check (
    solicitante_id = (select auth.uid())
    and public.current_user_role() = any (array['super_admin', 'direccion', 'almacen', 'compras'])
  );
create policy ajustes_update on public.inventario_ajustes
  for update to authenticated
  using (solicitante_id = (select auth.uid()) and estado = 'borrador')
  with check (solicitante_id = (select auth.uid()) and estado = 'borrador');

-- Sin política de UPDATE que permita mover estado: autorizar/rechazar/
-- aplicar SIEMPRE pasa por el API con service_role.

-- =========================================
-- 3. Punto de extensión de 011 pasa a ser real.
-- =========================================
create or replace function public.ajuste_autorizado(p_ajuste_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.inventario_ajustes a
     where a.id = p_ajuste_id and a.estado in ('autorizado', 'aplicado')
  );
$$;

-- FK diferida: 011 dejó ajuste_id (movimientos) sin referencia porque
-- inventario_ajustes no existía.
alter table public.inventario_movimientos
  add constraint fk_movimientos_ajuste foreign key (ajuste_id) references public.inventario_ajustes(id) on delete restrict;

-- =========================================
-- 4. TABLA: inventario_discrepancias
-- =========================================
create table public.inventario_discrepancias (
  id uuid primary key default gen_random_uuid(),
  folio varchar(16) not null unique,     -- DIS-000123
  conteo_id uuid references public.inventario_conteos(id) on delete restrict,
  conteo_detalle_id uuid references public.inventario_conteo_detalles(id) on delete restrict,
  producto_id uuid not null references public.productos(id) on delete restrict,
  ubicacion_id uuid references public.ubicaciones_internas(id) on delete restrict,

  cantidad_teorica numeric(16, 4) not null,
  cantidad_fisica numeric(16, 4) not null,
  diferencia numeric(16, 4) generated always as (cantidad_fisica - cantidad_teorica) stored,
  costo_unitario_snapshot numeric(14, 6),
  valor_diferencia numeric(20, 6) generated always as (
    case when costo_unitario_snapshot is null then null
         else (cantidad_fisica - cantidad_teorica) * costo_unitario_snapshot end
  ) stored,

  causa_presunta text,                    -- texto libre, deliberado
  banda public.discrepancia_banda,        -- qué área investiga
  salida public.discrepancia_salida,
  estado public.discrepancia_estado not null default 'abierta',

  -- Paso 0 · Reubicación (CIE-DIS-01 §IV): una pieza mal ubicada genera DOS discrepancias.
  discrepancia_par_id uuid references public.inventario_discrepancias(id) on delete restrict,
  par_confirmado_por uuid references public.profiles(id),
  par_confirmado_at timestamptz,

  investigador_id uuid references public.profiles(id),
  ajuste_id uuid references public.inventario_ajustes(id) on delete restrict,
  hallazgo_id uuid references public.inventario_hallazgos(id) on delete restrict,
  resuelto_at timestamptz,
  resuelto_por uuid references public.profiles(id),

  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- ===== LA REGLA DURA, COMO CHECK =====
  -- "Una diferencia sin causa identificada no se ajusta: se declara como
  -- hallazgo." 'hal' y 'men' son las únicas salidas que NO exigen causa —
  -- precisamente porque no ajustan nada. Ni service_role puede saltárselo.
  constraint dis_causa_chk check (
    salida is null
    or salida in ('hal', 'men')
    or (banda is not null and length(btrim(coalesce(causa_presunta, ''))) > 0)
  ),
  constraint dis_ajuste_chk check ((salida in ('aju', 'aju_sin_soporte')) = (ajuste_id is not null)),
  constraint dis_hallazgo_chk check ((salida = 'hal') = (hallazgo_id is not null)),
  constraint dis_resuelta_chk check ((estado = 'resuelta') = (salida is not null and resuelto_at is not null)),
  constraint dis_par_chk check (discrepancia_par_id is distinct from id),
  -- El Paso 0 codificado: no se puede cerrar como "corrección de ubicación" sin señalar la pareja.
  constraint dis_ubi_chk check (salida <> 'ubi' or discrepancia_par_id is not null)
);

comment on table public.inventario_discrepancias is
  'Registro de Discrepancias (CIE-DIS-01). dis_causa_chk es la regla dura '
  'del documento real convertida en CHECK: sin causa presunta y banda, la '
  'única salida posible es hal (hallazgo) o men (diferencia menor) — nunca '
  'un ajuste. discrepancia_par_id + dis_ubi_chk codifican el Paso 0 · '
  'Reubicación: un faltante y un sobrante que en realidad son la misma pieza.';

create index idx_discrepancias_conteo on public.inventario_discrepancias (conteo_id);
create index idx_discrepancias_conteo_detalle on public.inventario_discrepancias (conteo_detalle_id);
create index idx_discrepancias_producto on public.inventario_discrepancias (producto_id);
create index idx_discrepancias_ubicacion on public.inventario_discrepancias (ubicacion_id);
create index idx_discrepancias_estado on public.inventario_discrepancias (estado);
create index idx_discrepancias_abiertas on public.inventario_discrepancias (producto_id) where estado in ('abierta', 'en_investigacion');
create index idx_discrepancias_investigador on public.inventario_discrepancias (investigador_id);
create index idx_discrepancias_ajuste on public.inventario_discrepancias (ajuste_id);
create index idx_discrepancias_hallazgo on public.inventario_discrepancias (hallazgo_id);
create index idx_discrepancias_par on public.inventario_discrepancias (discrepancia_par_id);

create sequence public.inventario_discrepancias_folio_seq;

create or replace function public.discrepancias_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.folio is null then
    new.folio := 'DIS-' || lpad(nextval('public.inventario_discrepancias_folio_seq')::text, 6, '0');
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

revoke execute on function public.discrepancias_before_insert() from public, anon, authenticated;

create trigger before_insert_discrepancias
  before insert on public.inventario_discrepancias
  for each row execute function public.discrepancias_before_insert();

-- resuelto_por/resuelto_at/par_confirmado_* se estampan aquí, no los pone
-- el cliente (mismo criterio que contado_por en conteo_detalles, 012). El
-- snapshot del corte (cantidad_teorica/cantidad_fisica/costo_unitario_snapshot)
-- y las FK de origen quedan congeladas: una discrepancia no cambia de qué
-- conteo/línea la originó.
create or replace function public.discrepancias_before_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.folio := old.folio;
  new.conteo_id := old.conteo_id;
  new.conteo_detalle_id := old.conteo_detalle_id;
  new.producto_id := old.producto_id;
  new.ubicacion_id := old.ubicacion_id;
  new.cantidad_teorica := old.cantidad_teorica;
  new.cantidad_fisica := old.cantidad_fisica;
  new.costo_unitario_snapshot := old.costo_unitario_snapshot;
  new.updated_at := now();
  new.updated_by := auth.uid();

  if new.discrepancia_par_id is distinct from old.discrepancia_par_id and new.discrepancia_par_id is not null then
    new.par_confirmado_por := auth.uid();
    new.par_confirmado_at := now();
  else
    new.par_confirmado_por := old.par_confirmado_por;
    new.par_confirmado_at := old.par_confirmado_at;
  end if;

  if new.estado = 'resuelta' and old.estado <> 'resuelta' then
    new.resuelto_at := now();
    new.resuelto_por := auth.uid();
  elsif new.estado <> 'resuelta' then
    new.resuelto_at := null;
    new.resuelto_por := null;
  else
    new.resuelto_at := old.resuelto_at;
    new.resuelto_por := old.resuelto_por;
  end if;

  return new;
end;
$$;

create trigger before_update_discrepancias
  before update on public.inventario_discrepancias
  for each row execute function public.discrepancias_before_update();

-- Paso 0: la pareja debe ser el mismo producto con signo opuesto (un
-- faltante y un sobrante). AFTER (no diferido): la pareja tiene que existir
-- ya al momento de enlazarla — coherente con el flujo real ("antes de
-- rastrear se busca el par" entre discrepancias ya detectadas).
create or replace function public.discrepancias_valida_par()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_par record;
begin
  if new.discrepancia_par_id is not null then
    select producto_id, diferencia into v_par
      from public.inventario_discrepancias where id = new.discrepancia_par_id;
    if not found then
      raise exception 'La discrepancia pareja % no existe', new.discrepancia_par_id;
    end if;
    if v_par.producto_id <> new.producto_id then
      raise exception 'Paso 0 · Reubicación: la pareja debe ser del mismo producto' using errcode = '23514';
    end if;
    if new.diferencia = 0 or v_par.diferencia = 0 or sign(v_par.diferencia) = sign(new.diferencia) then
      raise exception
        'Paso 0 · Reubicación: la pareja debe tener signo opuesto (un faltante y un sobrante)'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger validar_par_discrepancias after insert or update on public.inventario_discrepancias
  for each row execute function public.discrepancias_valida_par();

create trigger audit_discrepancias after insert or update on public.inventario_discrepancias
  for each row execute function public.audit_row();

revoke all on public.inventario_discrepancias from anon, authenticated;
grant select on public.inventario_discrepancias to authenticated;
-- estado/salida/ajuste_id/hallazgo_id/resuelto_*/par_confirmado_* fuera del
-- INSERT: una discrepancia nace 'abierta' y sin resolución — igual criterio
-- que inventario_conteos/inventario_ajustes.
grant insert (
  conteo_id, conteo_detalle_id, producto_id, ubicacion_id, cantidad_teorica, cantidad_fisica,
  costo_unitario_snapshot, causa_presunta, banda, discrepancia_par_id, investigador_id
) on public.inventario_discrepancias to authenticated;
grant update (
  causa_presunta, banda, salida, investigador_id, ajuste_id, hallazgo_id, discrepancia_par_id, estado
) on public.inventario_discrepancias to authenticated;
grant all on public.inventario_discrepancias to service_role;

alter table public.inventario_discrepancias enable row level security;

create policy discrepancias_select on public.inventario_discrepancias
  for select to authenticated
  using (public.current_user_role() is not null);
create policy discrepancias_insert on public.inventario_discrepancias
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'almacen', 'compras']));
create policy discrepancias_update on public.inventario_discrepancias
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'almacen', 'compras']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'almacen', 'compras']));

-- =========================================
-- 5. TABLA: inventario_ajuste_lineas
-- =========================================
create table public.inventario_ajuste_lineas (
  id uuid primary key default gen_random_uuid(),
  ajuste_id uuid not null references public.inventario_ajustes(id) on delete restrict,
  producto_id uuid not null references public.productos(id) on delete restrict,
  ubicacion_id uuid references public.ubicaciones_internas(id) on delete restrict,
  discrepancia_id uuid references public.inventario_discrepancias(id) on delete restrict,
  cantidad_ajuste numeric(16, 4) not null check (cantidad_ajuste <> 0),   -- signada, en unidad base
  costo_unitario numeric(14, 6),
  movimiento_id uuid references public.inventario_movimientos(id) on delete restrict,   -- se llena al aplicar
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.inventario_ajuste_lineas is
  'Líneas de un ajuste autorizado: qué producto/ubicación y cuánto. '
  'movimiento_id lo llena la API con service_role al aplicar el ajuste '
  '(genera el inventario_movimientos correspondiente, tipo entrada_ajuste/'
  'salida_ajuste con este ajuste_id).';

create index idx_ajuste_lineas_ajuste on public.inventario_ajuste_lineas (ajuste_id);
create index idx_ajuste_lineas_producto on public.inventario_ajuste_lineas (producto_id);
create index idx_ajuste_lineas_ubicacion on public.inventario_ajuste_lineas (ubicacion_id);
create index idx_ajuste_lineas_discrepancia on public.inventario_ajuste_lineas (discrepancia_id);
create index idx_ajuste_lineas_movimiento on public.inventario_ajuste_lineas (movimiento_id);

create trigger before_update_ajuste_lineas
  before update on public.inventario_ajuste_lineas
  for each row execute function public.set_updated_meta();

create trigger audit_ajuste_lineas after insert or update on public.inventario_ajuste_lineas
  for each row execute function public.audit_row();

revoke all on public.inventario_ajuste_lineas from anon, authenticated;
grant select on public.inventario_ajuste_lineas to authenticated;
grant insert (ajuste_id, producto_id, ubicacion_id, discrepancia_id, cantidad_ajuste, costo_unitario)
  on public.inventario_ajuste_lineas to authenticated;
grant update (cantidad_ajuste, costo_unitario) on public.inventario_ajuste_lineas to authenticated;
grant all on public.inventario_ajuste_lineas to service_role;

alter table public.inventario_ajuste_lineas enable row level security;

-- Ligado al estado 'borrador' del ajuste padre y a su solicitante: mismas
-- condiciones que ajustes_update (002/013), para que las líneas no se
-- puedan tocar una vez enviado el ajuste a autorización.
create policy ajuste_lineas_select on public.inventario_ajuste_lineas
  for select to authenticated
  using (public.current_user_role() is not null);
create policy ajuste_lineas_insert on public.inventario_ajuste_lineas
  for insert to authenticated
  with check (
    public.current_user_role() = any (array['super_admin', 'direccion', 'almacen', 'compras'])
    and exists (
      select 1 from public.inventario_ajustes a
       where a.id = ajuste_id and a.estado = 'borrador' and a.solicitante_id = (select auth.uid())
    )
  );
create policy ajuste_lineas_update on public.inventario_ajuste_lineas
  for update to authenticated
  using (
    exists (
      select 1 from public.inventario_ajustes a
       where a.id = ajuste_id and a.estado = 'borrador' and a.solicitante_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.inventario_ajustes a
       where a.id = ajuste_id and a.estado = 'borrador' and a.solicitante_id = (select auth.uid())
    )
  );

-- =========================================
-- 6. TABLA: producto_unidad_redefiniciones — la única puerta para cambiar
--    unidad_medida_id/contenido_por_unidad de un producto (causa #1 de
--    pérdida medida). Misma forma que un ajuste autorizado.
-- =========================================
create table public.producto_unidad_redefiniciones (
  id uuid primary key default gen_random_uuid(),
  folio varchar(16) not null unique,     -- RUM-000123
  producto_id uuid not null references public.productos(id) on delete restrict,
  familia_id uuid references public.producto_familias(id) on delete restrict,   -- redefinición de familia completa
  unidad_anterior_id uuid not null references public.unidades_medida(id) on delete restrict,
  contenido_anterior numeric(14, 4) not null,
  unidad_nueva_id uuid not null references public.unidades_medida(id) on delete restrict,
  contenido_nuevo numeric(14, 4) not null,
  motivo text not null,
  existencia_base_anterior numeric(16, 4) not null,       -- snapshot al solicitar
  existencia_base_convertida numeric(16, 4) not null,     -- lo que queda bajo la unidad nueva
  requiere_reconteo boolean not null default true,
  conteo_id uuid references public.inventario_conteos(id) on delete restrict,   -- el reconteo que la cierra
  ajuste_id uuid references public.inventario_ajustes(id) on delete restrict,   -- el ajuste de la conversión

  estado public.ajuste_estado not null default 'pendiente_autorizacion',
  solicitante_id uuid not null references public.profiles(id) default auth.uid(),
  autorizador_id uuid references public.profiles(id),
  autorizado_at timestamptz,
  aplicado_at timestamptz,
  aplicado_por uuid references public.profiles(id),

  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint rum_motivo_chk check (length(btrim(motivo)) > 0),
  constraint rum_cambio_real_chk check (
    unidad_anterior_id is distinct from unidad_nueva_id or contenido_anterior <> contenido_nuevo
  ),
  constraint rum_autorizacion_chk check (
    (estado in ('autorizado', 'aplicado')) = (autorizador_id is not null and autorizado_at is not null)
  ),
  constraint rum_no_autoaprobacion_chk check (autorizador_id is null or autorizador_id <> solicitante_id),
  constraint rum_aplicado_chk check ((estado = 'aplicado') = (aplicado_at is not null and aplicado_por is not null)),
  -- No se puede dar por aplicada una redefinición que exigía reconteo sin el reconteo.
  constraint rum_reconteo_chk check (estado <> 'aplicado' or requiere_reconteo = false or conteo_id is not null)
);

comment on table public.producto_unidad_redefiniciones is
  'Única vía para cambiar la unidad de medida/factor de un producto — '
  'productos_guard_unidad() rechaza cualquier UPDATE directo de '
  'productos.unidad_medida_id/contenido_por_unidad que no venga respaldado '
  'por una fila aquí en estado autorizado con esos valores exactos. '
  'Causa #1 de pérdida medida: 14 de 27 folios de no conformidad, '
  '-2,811 piezas, -$37,919.77 (Registro de Discrepancias CIE-DIS-01).';

create index idx_redefiniciones_producto on public.producto_unidad_redefiniciones (producto_id);
create index idx_redefiniciones_familia on public.producto_unidad_redefiniciones (familia_id);
create index idx_redefiniciones_estado on public.producto_unidad_redefiniciones (estado);
create index idx_redefiniciones_conteo on public.producto_unidad_redefiniciones (conteo_id);
create index idx_redefiniciones_ajuste on public.producto_unidad_redefiniciones (ajuste_id);
create index idx_redefiniciones_unidad_anterior on public.producto_unidad_redefiniciones (unidad_anterior_id);
create index idx_redefiniciones_unidad_nueva on public.producto_unidad_redefiniciones (unidad_nueva_id);

create sequence public.producto_unidad_redefiniciones_folio_seq;

create or replace function public.redefiniciones_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.folio is null then
    new.folio := 'RUM-' || lpad(nextval('public.producto_unidad_redefiniciones_folio_seq')::text, 6, '0');
  end if;
  new.solicitante_id := coalesce(new.solicitante_id, auth.uid());
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

revoke execute on function public.redefiniciones_before_insert() from public, anon, authenticated;

create trigger before_insert_redefiniciones
  before insert on public.producto_unidad_redefiniciones
  for each row execute function public.redefiniciones_before_insert();

create or replace function public.redefiniciones_before_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.folio := old.folio;
  new.solicitante_id := old.solicitante_id;
  new.producto_id := old.producto_id;
  new.familia_id := old.familia_id;
  new.unidad_anterior_id := old.unidad_anterior_id;
  new.contenido_anterior := old.contenido_anterior;
  new.unidad_nueva_id := old.unidad_nueva_id;
  new.contenido_nuevo := old.contenido_nuevo;
  new.existencia_base_anterior := old.existencia_base_anterior;
  new.existencia_base_convertida := old.existencia_base_convertida;
  if old.estado <> 'pendiente_autorizacion' then
    new.motivo := old.motivo;
    new.conteo_id := old.conteo_id;
    new.requiere_reconteo := old.requiere_reconteo;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger before_update_redefiniciones
  before update on public.producto_unidad_redefiniciones
  for each row execute function public.redefiniciones_before_update();

create trigger audit_redefiniciones after insert or update on public.producto_unidad_redefiniciones
  for each row execute function public.audit_row();

revoke all on public.producto_unidad_redefiniciones from anon, authenticated;
grant select on public.producto_unidad_redefiniciones to authenticated;
-- estado/autorizador_id/autorizado_at/aplicado_* fuera del INSERT: mismo
-- motivo que en inventario_ajustes — nace 'pendiente_autorizacion' siempre
-- vía el DEFAULT, nunca ya autorizada.
grant insert (
  producto_id, familia_id, unidad_anterior_id, contenido_anterior, unidad_nueva_id, contenido_nuevo,
  motivo, existencia_base_anterior, existencia_base_convertida, requiere_reconteo, conteo_id
) on public.producto_unidad_redefiniciones to authenticated;
grant update (motivo, conteo_id, requiere_reconteo) on public.producto_unidad_redefiniciones to authenticated;
grant all on public.producto_unidad_redefiniciones to service_role;

alter table public.producto_unidad_redefiniciones enable row level security;

create policy redefiniciones_select on public.producto_unidad_redefiniciones
  for select to authenticated
  using (public.current_user_role() is not null);
create policy redefiniciones_insert on public.producto_unidad_redefiniciones
  for insert to authenticated
  with check (
    solicitante_id = (select auth.uid())
    and public.current_user_role() = any (array['super_admin', 'direccion', 'compras', 'almacen'])
  );
create policy redefiniciones_update on public.producto_unidad_redefiniciones
  for update to authenticated
  using (solicitante_id = (select auth.uid()) and estado = 'pendiente_autorizacion')
  with check (solicitante_id = (select auth.uid()) and estado = 'pendiente_autorizacion');

-- Guard sobre productos: la unidad de medida sólo cambia con una
-- redefinición autorizada. Se aplica también a service_role, porque el
-- trigger corre para cualquier UPDATE sin importar quién lo dispare.
create or replace function public.productos_guard_unidad()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if (new.unidad_medida_id, new.contenido_por_unidad) is distinct from (old.unidad_medida_id, old.contenido_por_unidad) then
    if not exists (
      select 1 from public.producto_unidad_redefiniciones r
       where r.producto_id = new.id and r.estado = 'autorizado'
         and r.unidad_nueva_id = new.unidad_medida_id and r.contenido_nuevo = new.contenido_por_unidad
    ) then
      raise exception
        'La unidad de medida de un producto sólo cambia con una redefinición autorizada '
        '(RTB-INV-01 · causa #1 de pérdida de inventario medida: 14 de 27 folios de no conformidad)'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger before_update_productos_guard_unidad
  before update on public.productos
  for each row execute function public.productos_guard_unidad();

-- =========================================
-- 7. Storage: bucket privado para soportes de ajuste (factura/OC/foto que
--    respalda el ajuste, CIE-AJU-01). Mismo criterio que
--    comprobantes-bancarios en 004_cuentas_bancarias.sql.
-- =========================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'soportes-inventario', 'soportes-inventario', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

create policy soportes_inventario_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'soportes-inventario'
    and public.current_user_role() = any (array['super_admin', 'direccion', 'almacen', 'compras'])
  );

create policy soportes_inventario_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'soportes-inventario'
    and public.current_user_role() = any (array['super_admin', 'direccion', 'almacen', 'compras'])
  );

-- Sin UPDATE/DELETE: un soporte subido es evidencia.
