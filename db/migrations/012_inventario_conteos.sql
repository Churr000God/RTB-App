-- ==========================================
-- RTB Sistema — 012: Conteos físicos (vista ciega, congelamiento,
-- asignaciones, versionado de acta y firmas)
--
-- Ver contexto/AUDITORIA_RTB-INV-01.md para el detalle completo. Antes de
-- las tablas nuevas, este archivo corrige un hueco real encontrado al
-- diseñar el flujo de conteo sobre 011_inventario_kardex.sql:
--
--   - `mov_ajuste_chk` sólo exigía `ajuste_id` (y por tanto
--     `ajuste_autorizado()`) para los tipos 'entrada_ajuste'/'salida_ajuste'.
--     Los tipos 'entrada_conteo'/'salida_conteo' sólo exigían `conteo_id`
--     — un rol con GRANT INSERT sobre el kardex (almacen/compras/...)
--     podría haber movido el teórico por la puerta de un conteo sin pasar
--     nunca por autorización, reabriendo exactamente el hallazgo real que
--     011 dice cerrar: "ajustes aplicados sin autorización registrada: 34
--     de 34". Se corrige exigiendo `ajuste_id` (y por tanto autorización)
--     también para 'entrada_conteo'/'salida_conteo': un movimiento que
--     nace de un conteo sigue necesitando el mismo ajuste autorizado que
--     cualquier otra corrección. Como `ajuste_id` no está ni estará en el
--     GRANT INSERT de `authenticated` (013), esto es estructural, no una
--     validación de API.
-- ==========================================

alter table public.inventario_movimientos drop constraint mov_ajuste_chk;
alter table public.inventario_movimientos add constraint mov_ajuste_chk check (
  (tipo in ('entrada_ajuste', 'salida_ajuste', 'entrada_conteo', 'salida_conteo')) = (ajuste_id is not null)
);

create or replace function public.inventario_movimientos_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unidad_base uuid;
  v_contenido numeric;
  v_unidad_contenido uuid;
  v_decimales smallint;
  v_saldo_anterior numeric;
  v_costo_promedio_anterior numeric;
  v_saldo_nuevo numeric;
  v_costo_promedio_nuevo numeric;
  v_congelamiento uuid;
begin
  select p.unidad_medida_id, p.contenido_por_unidad, p.unidad_contenido_id
    into v_unidad_base, v_contenido, v_unidad_contenido
    from public.productos p where p.id = new.producto_id;
  if not found then
    raise exception 'El producto % no existe', new.producto_id;
  end if;

  select decimales into v_decimales from public.unidades_medida where id = new.unidad_captura_id;
  if not found then
    raise exception 'La unidad de captura % no existe', new.unidad_captura_id;
  end if;
  if round(new.cantidad_capturada, v_decimales) <> new.cantidad_capturada then
    raise exception 'La cantidad % no respeta los % decimales permitidos por la unidad capturada',
      new.cantidad_capturada, v_decimales using errcode = '22003';
  end if;

  if new.unidad_captura_id = v_unidad_base then
    new.factor_conversion := 1;
  elsif new.unidad_captura_id = v_unidad_contenido then
    new.factor_conversion := 1 / v_contenido;
  else
    raise exception
      'Unidad de captura % incompatible con el producto % (base %, contenido %). '
      'Corregir la unidad del producto vía redefinición autorizada, no forzar el movimiento.',
      new.unidad_captura_id, new.producto_id, v_unidad_base, v_unidad_contenido
      using errcode = '22023';
  end if;
  new.unidad_base_id := v_unidad_base;
  new.cantidad := public.movimiento_signo(new.tipo) * (new.cantidad_capturada * new.factor_conversion);

  -- Ampliado: los 4 tipos de corrección (no sólo los de 'ajuste' literal)
  -- exigen ajuste autorizado — ver cabecera de este archivo.
  if new.tipo in ('entrada_ajuste', 'salida_ajuste', 'entrada_conteo', 'salida_conteo')
     and not public.ajuste_autorizado(new.ajuste_id) then
    raise exception
      'No se puede mover inventario con un ajuste no autorizado (%). RTB-CIE-01 exige '
      'autorización de Gerencia de Operaciones para todo cambio que mueva inventario.',
      new.ajuste_id using errcode = '42501';
  end if;

  v_congelamiento := public.inventario_congelamiento_activo(new.producto_id, new.ubicacion_id);
  if v_congelamiento is not null
     and not (new.tipo in ('entrada_conteo', 'salida_conteo') and new.conteo_id = v_congelamiento) then
    raise exception
      'Producto/ubicación congelado por el conteo % — no se puede mover inventario mientras dura el conteo',
      v_congelamiento using errcode = '55006';
  end if;

  loop
    select cantidad_teorica, costo_promedio into v_saldo_anterior, v_costo_promedio_anterior
      from public.inventario_existencias
     where producto_id = new.producto_id and ubicacion_id is not distinct from new.ubicacion_id
     for update;
    exit when found;
    begin
      insert into public.inventario_existencias (producto_id, ubicacion_id, created_by)
      values (new.producto_id, new.ubicacion_id, auth.uid());
    exception when unique_violation then
      null;
    end;
  end loop;

  v_saldo_nuevo := coalesce(v_saldo_anterior, 0) + new.cantidad;

  if new.cantidad > 0 then
    if new.costo_unitario is null then
      new.costo_unitario := coalesce(public.costo_unitario_vigente(new.producto_id, new.fecha_movimiento), 0);
    end if;
    if v_saldo_nuevo = 0 then
      v_costo_promedio_nuevo := coalesce(v_costo_promedio_anterior, new.costo_unitario);
    else
      v_costo_promedio_nuevo := (
        greatest(coalesce(v_saldo_anterior, 0), 0) * coalesce(v_costo_promedio_anterior, 0)
        + new.cantidad * new.costo_unitario
      ) / (greatest(coalesce(v_saldo_anterior, 0), 0) + new.cantidad);
    end if;
  else
    if new.costo_unitario is null then
      new.costo_unitario := coalesce(
        v_costo_promedio_anterior,
        public.costo_unitario_vigente(new.producto_id, new.fecha_movimiento),
        0
      );
    end if;
    v_costo_promedio_nuevo := v_costo_promedio_anterior;
  end if;

  new.costo_promedio_posterior := v_costo_promedio_nuevo;
  new.saldo_teorico_posterior := v_saldo_nuevo;

  if v_saldo_nuevo < 0 and not coalesce(new.permite_negativo, false) then
    raise exception
      'Saldo negativo no permitido: el producto % quedaría en % unidades base con este movimiento (%). '
      'Un faltante se registra como discrepancia, no como salida directa.',
      new.producto_id, v_saldo_nuevo, new.tipo
      using errcode = 'P0001';
  end if;

  update public.inventario_existencias
     set cantidad_teorica = v_saldo_nuevo,
         costo_promedio = v_costo_promedio_nuevo,
         fecha_ultimo_movimiento = new.fecha_movimiento,
         updated_at = now(), updated_by = auth.uid()
   where producto_id = new.producto_id and ubicacion_id is not distinct from new.ubicacion_id;

  if new.folio is null then
    new.folio := 'MOV-' || lpad(nextval('public.inventario_movimientos_folio_seq')::text, 8, '0');
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());

  return new;
end;
$$;

-- =========================================
-- 1. Tipos enumerados
-- =========================================
create type public.conteo_estado as enum (
  'planificado', 'congelado', 'en_captura', 'en_conciliacion', 'cerrado', 'aplicado', 'cancelado'
);
create type public.conteo_tipo as enum ('general', 'ciclico', 'por_ubicacion', 'por_familia', 'puntual', 'reconteo');
create type public.conteo_linea_estado as enum (
  'no_visitada',           -- default. cantidad_fisica IS NULL. NO es cero (limitación #1 del Acta real).
  'contada',
  'recontada',
  'no_localizada',         -- se buscó y no está: cantidad_fisica = 0, explícito
  'ubicacion_incorrecta',  -- apareció en otro lado (Paso 0 · Reubicación, CIE-DIS-01 §IV)
  'bloqueada'               -- no se pudo acceder (obra, altura, material ajeno)
);
create type public.firma_rol as enum ('contador', 'supervisor', 'gerente_operaciones', 'testigo');

-- =========================================
-- 2. TABLA: inventario_conteos
-- =========================================
create table public.inventario_conteos (
  id uuid primary key default gen_random_uuid(),
  folio varchar(16) not null unique,     -- CNT-000123
  nombre varchar(160) not null,
  tipo public.conteo_tipo not null,
  alcance jsonb not null,                -- filtro ejecutable (lo interpreta la API al congelar)
  alcance_descripcion text not null,     -- el filtro en prosa, para el acta
  estado public.conteo_estado not null default 'planificado',

  -- Acta versionada: "Versión | Corte | Qué corrigió" (columnas reales del Acta CIE-CON-01).
  version numeric(3, 1) not null default 1.0,
  conteo_origen_id uuid references public.inventario_conteos(id) on delete restrict,

  corte_at timestamptz,
  congelado_at timestamptz,
  congelado_por uuid references public.profiles(id),
  descongelado_at timestamptz,
  descongelado_por uuid references public.profiles(id),

  -- "La vista no muestra cantidad teórica ni diferencia" (Acta CIE-CON-01 §II) — hard rule real.
  vista_ciega boolean not null default true,
  fecha_programada date,
  responsable_id uuid not null references public.profiles(id),
  supervisor_id uuid references public.profiles(id),

  exactitud_registro numeric(5, 2),
  exactitud_pieza numeric(5, 2),
  exactitud_valor numeric(5, 2),
  cobertura numeric(5, 2),

  cerrado_at timestamptz,
  cerrado_por uuid references public.profiles(id),
  aplicado_at timestamptz,
  aplicado_por uuid references public.profiles(id),
  cancelado_at timestamptz,
  cancelado_por uuid references public.profiles(id),
  motivo_cancelacion text,

  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cnt_folio_chk check (length(btrim(folio)) > 0),
  constraint cnt_alcance_chk check (jsonb_typeof(alcance) = 'object'),
  constraint cnt_congelado_chk check (
    (estado in ('congelado', 'en_captura', 'en_conciliacion', 'cerrado', 'aplicado'))
      <= (congelado_at is not null and corte_at is not null)
  ),
  constraint cnt_cancelado_chk check (
    (estado = 'cancelado') = (cancelado_at is not null and motivo_cancelacion is not null)
  ),
  constraint cnt_cerrado_chk check ((estado in ('cerrado', 'aplicado')) <= (cerrado_at is not null and cerrado_por is not null)),
  constraint cnt_aplicado_chk check ((estado = 'aplicado') = (aplicado_at is not null and aplicado_por is not null)),
  constraint cnt_version_chk check (version >= 1.0),
  constraint cnt_reconteo_chk check ((tipo = 'reconteo') <= (conteo_origen_id is not null))
);

comment on table public.inventario_conteos is
  'Sesión de conteo físico. estado gobierna la máquina de transición '
  '(inventario_conteos_before_update); un conteo no llega a cerrado sin '
  'firma de supervisor y de gerente_operaciones (inventario_conteo_firmas). '
  'alcance es el filtro que la API interpreta al congelar (P07/RTB-CIE-01), '
  'no una regla que viva en SQL: el universo de qué productos/ubicaciones '
  'entra a un conteo es demasiado variable para codificarlo en un CHECK.';

create index idx_conteos_estado on public.inventario_conteos (estado);
create index idx_conteos_responsable on public.inventario_conteos (responsable_id);
create index idx_conteos_supervisor on public.inventario_conteos (supervisor_id);
create index idx_conteos_origen on public.inventario_conteos (conteo_origen_id);
create index idx_conteos_folio_trgm on public.inventario_conteos using gin (folio gin_trgm_ops);

create sequence public.inventario_conteos_folio_seq;

-- =========================================
-- FK diferidas: 011 dejó conteo_id (movimientos) y conteo_id_ultimo
-- (existencias) sin referencia porque inventario_conteos no existía.
-- =========================================
alter table public.inventario_movimientos
  add constraint fk_movimientos_conteo foreign key (conteo_id) references public.inventario_conteos(id) on delete restrict;
alter table public.inventario_existencias
  add constraint fk_existencias_conteo_ultimo foreign key (conteo_id_ultimo) references public.inventario_conteos(id) on delete restrict;

-- =========================================
-- 3. TABLA: inventario_conteo_asignaciones (limitación #6: quién contó qué)
-- =========================================
create table public.inventario_conteo_asignaciones (
  id uuid primary key default gen_random_uuid(),
  conteo_id uuid not null references public.inventario_conteos(id) on delete restrict,
  ubicacion_id uuid references public.ubicaciones_internas(id) on delete restrict,
  familia_id uuid references public.producto_familias(id) on delete restrict,
  asignado_a uuid not null references public.profiles(id),
  asignado_por uuid not null references public.profiles(id) default auth.uid(),
  iniciado_at timestamptz,
  finalizado_at timestamptz,
  created_at timestamptz not null default now(),
  constraint asg_alcance_chk check (ubicacion_id is not null or familia_id is not null)
);

comment on table public.inventario_conteo_asignaciones is
  'Quién cuenta qué ubicación/familia dentro de un conteo — el export real '
  'de RTB no lo guarda hoy (limitación #6 del Acta CIE-CON-01). Respalda la '
  'RLS de captura de inventario_conteo_detalles: un rol almacen sólo puede '
  'escribir líneas de su propia asignación activa.';

create index idx_asignaciones_conteo on public.inventario_conteo_asignaciones (conteo_id);
create index idx_asignaciones_ubicacion on public.inventario_conteo_asignaciones (ubicacion_id);
create index idx_asignaciones_familia on public.inventario_conteo_asignaciones (familia_id);
create index idx_asignaciones_asignado on public.inventario_conteo_asignaciones (asignado_a);
create index idx_asignaciones_activa on public.inventario_conteo_asignaciones (conteo_id, asignado_a)
  where finalizado_at is null;

revoke all on public.inventario_conteo_asignaciones from anon, authenticated;
grant select, insert on public.inventario_conteo_asignaciones to authenticated;
grant update (iniciado_at, finalizado_at) on public.inventario_conteo_asignaciones to authenticated;
grant all on public.inventario_conteo_asignaciones to service_role;

alter table public.inventario_conteo_asignaciones enable row level security;

create policy conteo_asignaciones_select on public.inventario_conteo_asignaciones
  for select to authenticated
  using (public.current_user_role() is not null);
create policy conteo_asignaciones_insert on public.inventario_conteo_asignaciones
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'almacen']));
create policy conteo_asignaciones_update on public.inventario_conteo_asignaciones
  for update to authenticated
  using (
    public.current_user_role() = any (array['super_admin', 'direccion', 'almacen'])
    and (asignado_a = (select auth.uid()) or public.current_user_role() = any (array['super_admin', 'direccion']))
  )
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'almacen']));

-- =========================================
-- 4. TABLA: inventario_congelamientos (limitación #5: congelamiento demostrable)
-- =========================================
create table public.inventario_congelamientos (
  id uuid primary key default gen_random_uuid(),
  conteo_id uuid not null references public.inventario_conteos(id) on delete restrict,
  ubicacion_id uuid references public.ubicaciones_internas(id) on delete restrict,
  incluye_descendientes boolean not null default true,
  producto_id uuid references public.productos(id) on delete restrict,   -- congelamiento por producto puntual
  congelado_at timestamptz not null default now(),
  congelado_por uuid not null references public.profiles(id) default auth.uid(),
  liberado_at timestamptz,
  liberado_por uuid references public.profiles(id),
  motivo_liberacion text,
  updated_at timestamptz not null default now(),
  constraint cong_alcance_chk check (ubicacion_id is not null or producto_id is not null),
  constraint cong_liberacion_chk check (
    (liberado_at is null) = (liberado_por is null)
    and (liberado_at is null or length(btrim(coalesce(motivo_liberacion, ''))) > 0)
  )
);

comment on table public.inventario_congelamientos is
  'El freeze que de verdad impide movimientos: inventario_congelamiento_activo() '
  'lo consulta desde el trigger del kardex. No basta con timestamps en '
  'inventario_conteos — el bloqueo tiene que ser demostrable (limitación #5 del Acta).';

create index idx_congelamientos_conteo on public.inventario_congelamientos (conteo_id);
create index idx_congelamientos_ubicacion on public.inventario_congelamientos (ubicacion_id);
create index idx_congelamientos_producto on public.inventario_congelamientos (producto_id);
create unique index uq_congelamiento_activo on public.inventario_congelamientos (
  conteo_id,
  coalesce(ubicacion_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(producto_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where liberado_at is null;

create or replace function public.congelamientos_before_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.conteo_id := old.conteo_id;
  new.ubicacion_id := old.ubicacion_id;
  new.producto_id := old.producto_id;
  new.incluye_descendientes := old.incluye_descendientes;
  new.updated_at := now();
  if new.motivo_liberacion is distinct from old.motivo_liberacion and old.liberado_at is null then
    new.liberado_at := now();
    new.liberado_por := auth.uid();
  end if;
  return new;
end;
$$;

create trigger before_update_congelamientos
  before update on public.inventario_congelamientos
  for each row execute function public.congelamientos_before_update();

create trigger audit_congelamientos after insert or update on public.inventario_congelamientos
  for each row execute function public.audit_row();

-- Punto de extensión de 011 pasa a ser real: resuelve congelamiento vigente
-- contra el árbol de ubicaciones_internas (CTE recursiva de ancestros).
-- SECURITY DEFINER: lo invoca el trigger del kardex en nombre de cualquier
-- rol que registre un movimiento; el resultado (un folio de conteo) no
-- revela nada que el operador no vea ya en su propia pantalla de conteo.
-- Va aquí (no junto a inventario_conteos) porque `language sql` se valida
-- en CREATE, no en ejecución: inventario_congelamientos tiene que existir ya.
create or replace function public.inventario_congelamiento_activo(p_producto_id uuid, p_ubicacion_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive ancestros as (
    select id, parent_id from public.ubicaciones_internas where id = p_ubicacion_id
    union all
    select u.id, u.parent_id from public.ubicaciones_internas u join ancestros a on u.id = a.parent_id
  )
  select c.conteo_id from public.inventario_congelamientos c
   where c.liberado_at is null
     and (c.producto_id is null or c.producto_id = p_producto_id)
     and (
       c.ubicacion_id is null
       or c.ubicacion_id = p_ubicacion_id
       or (c.incluye_descendientes and c.ubicacion_id in (select id from ancestros))
     )
   limit 1;
$$;

revoke execute on function public.inventario_congelamiento_activo(uuid, uuid) from public, anon;
grant execute on function public.inventario_congelamiento_activo(uuid, uuid) to authenticated, service_role;

revoke all on public.inventario_congelamientos from anon, authenticated;
grant select, insert on public.inventario_congelamientos to authenticated;
grant update (motivo_liberacion) on public.inventario_congelamientos to authenticated;
grant all on public.inventario_congelamientos to service_role;

alter table public.inventario_congelamientos enable row level security;

create policy congelamientos_select on public.inventario_congelamientos
  for select to authenticated
  using (public.current_user_role() is not null);
create policy congelamientos_insert on public.inventario_congelamientos
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'almacen']));
create policy congelamientos_update on public.inventario_congelamientos
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'almacen']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'almacen']));

-- =========================================
-- 5. TABLA: inventario_conteo_detalles (vista ciega por privilegio de columna)
-- =========================================
create table public.inventario_conteo_detalles (
  id uuid primary key default gen_random_uuid(),
  conteo_id uuid not null references public.inventario_conteos(id) on delete restrict,
  producto_id uuid not null references public.productos(id) on delete restrict,
  ubicacion_id uuid references public.ubicaciones_internas(id) on delete restrict,

  -- SNAPSHOT AL CORTE. No se recalcula nunca: el acta tiene que ser reproducible.
  cantidad_teorica numeric(16, 4) not null,
  unidad_base_id uuid not null references public.unidades_medida(id) on delete restrict,
  contenido_por_unidad_snapshot numeric(14, 4) not null,
  costo_unitario_snapshot numeric(14, 6),
  -- Limitaciones #3/#4 del Acta: de dónde salió el costo, o que no había ninguno.
  costo_origen varchar(24) check (costo_origen is null or costo_origen in (
    'promedio', 'catalogo', 'proveedor_preferente', 'sin_costo'
  )),

  -- CAPTURA (vista ciega: sin cantidad_teorica/diferencia visibles, ver GRANT abajo)
  estado_conteo public.conteo_linea_estado not null default 'no_visitada',
  cantidad_fisica numeric(16, 4),
  unidad_captura_id uuid references public.unidades_medida(id) on delete restrict,
  cantidad_capturada numeric(16, 4),
  contado_por uuid references public.profiles(id),
  contado_at timestamptz,
  ubicacion_contada_id uuid references public.ubicaciones_internas(id) on delete restrict,   -- Paso 0 · Reubicación

  -- RECUENTO
  cantidad_fisica_recuento numeric(16, 4),
  recontado_por uuid references public.profiles(id),
  recontado_at timestamptz,

  diferencia numeric(16, 4) generated always as (
    case when cantidad_fisica is null then null else cantidad_fisica - cantidad_teorica end
  ) stored,
  valor_diferencia numeric(20, 6) generated always as (
    case when cantidad_fisica is null or costo_unitario_snapshot is null then null
         else (cantidad_fisica - cantidad_teorica) * costo_unitario_snapshot end
  ) stored,

  -- Limitación #7: faltante vs. material solicitado y no recibido.
  solicitud_compra_folio varchar(40),
  cantidad_en_transito numeric(16, 4) not null default 0,

  observaciones text,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Limitación #1, como CHECK: un 0 físico jamás vuelve a confundirse con "no visitada".
  constraint det_estado_cantidad_chk check (
    (estado_conteo in ('no_visitada', 'bloqueada') and cantidad_fisica is null)
    or (estado_conteo in ('contada', 'recontada', 'ubicacion_incorrecta') and cantidad_fisica is not null)
    or (estado_conteo = 'no_localizada' and cantidad_fisica = 0)
  ),
  constraint det_fisica_no_negativa_chk check (cantidad_fisica is null or cantidad_fisica >= 0),
  constraint det_autoria_chk check (
    (cantidad_fisica is not null) <= (contado_por is not null and contado_at is not null)
  ),
  constraint det_transito_chk check (cantidad_en_transito >= 0),
  constraint det_reubicacion_chk check (
    (estado_conteo = 'ubicacion_incorrecta') <= (ubicacion_contada_id is not null)
  )
);

comment on table public.inventario_conteo_detalles is
  'Línea de conteo. GRANT SELECT deliberadamente omite cantidad_teorica, '
  'diferencia, valor_diferencia y costo_unitario_snapshot: la vista ciega '
  '("no muestra cantidad teórica ni diferencia", Acta CIE-CON-01 §II) es un '
  'privilegio de columna de Postgres, no una regla de pantalla — un '
  'capturista no puede leerlas ni con curl directo a PostgREST. La única '
  'puerta al teórico es public.conteo_conciliacion().';

create unique index uq_det_conteo_prod_ubi on public.inventario_conteo_detalles (conteo_id, producto_id, ubicacion_id)
  where ubicacion_id is not null;
create unique index uq_det_conteo_prod_sin_ubi on public.inventario_conteo_detalles (conteo_id, producto_id)
  where ubicacion_id is null;
create index idx_det_conteo on public.inventario_conteo_detalles (conteo_id);
create index idx_det_producto on public.inventario_conteo_detalles (producto_id);
create index idx_det_ubicacion on public.inventario_conteo_detalles (ubicacion_id);
create index idx_det_estado on public.inventario_conteo_detalles (estado_conteo);
create index idx_det_no_visitada on public.inventario_conteo_detalles (conteo_id) where estado_conteo = 'no_visitada';
create index idx_det_contado_por on public.inventario_conteo_detalles (contado_por);
create index idx_det_ubicacion_contada on public.inventario_conteo_detalles (ubicacion_contada_id);
create index idx_det_unidad_base on public.inventario_conteo_detalles (unidad_base_id);
create index idx_det_unidad_captura on public.inventario_conteo_detalles (unidad_captura_id);

-- contado_por/contado_at/recontado_por/recontado_at NO son de escritura
-- directa (ver GRANT más abajo): si el cliente pudiera fijarlos, cualquier
-- almacen podría atribuir un conteo a otro compañero o retrasar la hora,
-- vaciando de sentido la limitación #6 ("no se registra quién contó qué
-- ubicación"). Se estampan aquí con auth.uid()/now() al primer cambio de
-- estado hacia "visitada", igual que apartados_before_update() estampa
-- liberado_por/liberado_at.
create or replace function public.conteo_detalles_before_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();

  if new.estado_conteo is distinct from old.estado_conteo then
    if new.estado_conteo in ('contada', 'no_localizada', 'ubicacion_incorrecta') and old.contado_por is null then
      new.contado_por := auth.uid();
      new.contado_at := now();
    elsif new.estado_conteo = 'recontada' then
      if old.contado_por is null then
        new.contado_por := auth.uid();
        new.contado_at := now();
      else
        new.contado_por := old.contado_por;
        new.contado_at := old.contado_at;
      end if;
      new.recontado_por := auth.uid();
      new.recontado_at := now();
    else
      new.contado_por := old.contado_por;
      new.contado_at := old.contado_at;
      new.recontado_por := old.recontado_por;
      new.recontado_at := old.recontado_at;
    end if;
  else
    new.contado_por := old.contado_por;
    new.contado_at := old.contado_at;
    new.recontado_por := old.recontado_por;
    new.recontado_at := old.recontado_at;
  end if;

  return new;
end;
$$;

create trigger before_update_conteo_detalles
  before update on public.inventario_conteo_detalles
  for each row execute function public.conteo_detalles_before_update();

create trigger audit_conteo_detalles after insert or update on public.inventario_conteo_detalles
  for each row execute function public.audit_row();

revoke all on public.inventario_conteo_detalles from anon, authenticated;

-- SELECT por columna: cantidad_teorica/diferencia/valor_diferencia/
-- costo_unitario_snapshot/costo_origen quedan fuera. Un rol de captura no
-- puede verlas ni con `select *`.
grant select (
  id, conteo_id, producto_id, ubicacion_id, unidad_base_id, contenido_por_unidad_snapshot,
  estado_conteo, cantidad_fisica, unidad_captura_id, cantidad_capturada, contado_por, contado_at,
  ubicacion_contada_id, cantidad_fisica_recuento, recontado_por, recontado_at,
  solicitud_compra_folio, cantidad_en_transito, observaciones, created_at, updated_at
) on public.inventario_conteo_detalles to authenticated;

-- contado_por/contado_at/recontado_por/recontado_at deliberadamente fuera:
-- los estampa el trigger, no el cliente.
grant update (
  estado_conteo, cantidad_fisica, unidad_captura_id, cantidad_capturada,
  ubicacion_contada_id, cantidad_fisica_recuento, observaciones
) on public.inventario_conteo_detalles to authenticated;
-- Sin GRANT INSERT: las líneas las genera el congelamiento (API con service_role).
grant all on public.inventario_conteo_detalles to service_role;

alter table public.inventario_conteo_detalles enable row level security;

-- select: los 8 roles ven las columnas que el GRANT les deja ver (que ya
-- excluye el teórico). direccion/super_admin sí ven todo porque
-- conteo_conciliacion() los distingue por rol, no esta política.
create policy conteo_detalles_select on public.inventario_conteo_detalles
  for select to authenticated
  using (public.current_user_role() is not null);

-- update: super_admin/direccion siempre; almacen sólo en su propia
-- asignación activa y sólo mientras el conteo está en_captura.
create policy conteo_detalles_update on public.inventario_conteo_detalles
  for update to authenticated
  using (
    public.current_user_role() = any (array['super_admin', 'direccion'])
    or (
      public.current_user_role() = 'almacen'
      and exists (
        select 1 from public.inventario_conteos c
         where c.id = inventario_conteo_detalles.conteo_id and c.estado = 'en_captura'
      )
      and exists (
        select 1 from public.inventario_conteo_asignaciones a
         where a.conteo_id = inventario_conteo_detalles.conteo_id
           and a.asignado_a = (select auth.uid())
           and a.finalizado_at is null
           and (a.ubicacion_id is null or a.ubicacion_id = inventario_conteo_detalles.ubicacion_id)
      )
    )
  )
  with check (
    public.current_user_role() = any (array['super_admin', 'direccion', 'almacen'])
  );

-- =========================================
-- 6. TABLA: inventario_conteo_versiones (acta versionada real: "Versión | Corte | Qué corrigió")
-- =========================================
create table public.inventario_conteo_versiones (
  id uuid primary key default gen_random_uuid(),
  conteo_id uuid not null references public.inventario_conteos(id) on delete restrict,
  version numeric(3, 1) not null,
  corte_at timestamptz not null,
  que_corrigio text not null,
  snapshot jsonb not null,     -- totales/KPIs congelados de esa versión, para reproducir el acta
  generado_por uuid not null references public.profiles(id) default auth.uid(),
  generado_at timestamptz not null default now(),
  constraint ver_que_corrigio_chk check (length(btrim(que_corrigio)) > 0),
  constraint ver_snapshot_chk check (jsonb_typeof(snapshot) = 'object'),
  unique (conteo_id, version)
);

comment on table public.inventario_conteo_versiones is
  'Historial del acta. No se publica una versión sin decir qué corrigió '
  '— regla de gobierno del Acta CIE-CON-01 real (V1.0→V3.0), convertida en CHECK.';

create index idx_conteo_versiones_conteo on public.inventario_conteo_versiones (conteo_id);

revoke all on public.inventario_conteo_versiones from anon, authenticated;
grant select, insert on public.inventario_conteo_versiones to authenticated;
grant all on public.inventario_conteo_versiones to service_role;
-- Sin UPDATE/DELETE: una versión publicada del acta no se edita.

alter table public.inventario_conteo_versiones enable row level security;

create policy conteo_versiones_select on public.inventario_conteo_versiones
  for select to authenticated
  using (public.current_user_role() is not null);
create policy conteo_versiones_insert on public.inventario_conteo_versiones
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion']));

-- =========================================
-- 7. TABLA: inventario_conteo_firmas
-- =========================================
create table public.inventario_conteo_firmas (
  id uuid primary key default gen_random_uuid(),
  conteo_id uuid not null references public.inventario_conteos(id) on delete restrict,
  version numeric(3, 1) not null,
  firmante_id uuid not null references public.profiles(id) default auth.uid(),
  rol_firma public.firma_rol not null,
  hash_contenido text not null,     -- digest del acta al firmar: una edición posterior es detectable
  comentario text,
  firmado_at timestamptz not null default now(),
  unique (conteo_id, version, firmante_id, rol_firma)
);

comment on table public.inventario_conteo_firmas is
  'XII Acta y firmas del Acta CIE-CON-01 real. Sin GRANT UPDATE/DELETE: una '
  'firma no se edita. inventario_conteos_before_update() exige firma de '
  'supervisor y de gerente_operaciones antes de aceptar estado=cerrado.';

create index idx_conteo_firmas_conteo on public.inventario_conteo_firmas (conteo_id);
create index idx_conteo_firmas_firmante on public.inventario_conteo_firmas (firmante_id);

revoke all on public.inventario_conteo_firmas from anon, authenticated;
grant select, insert on public.inventario_conteo_firmas to authenticated;
grant all on public.inventario_conteo_firmas to service_role;
-- Sin UPDATE/DELETE en absoluto.

alter table public.inventario_conteo_firmas enable row level security;

create policy conteo_firmas_select on public.inventario_conteo_firmas
  for select to authenticated
  using (public.current_user_role() is not null);
create policy conteo_firmas_insert on public.inventario_conteo_firmas
  for insert to authenticated
  with check (
    firmante_id = (select auth.uid())
    and public.current_user_role() = any (array['super_admin', 'direccion', 'almacen'])
  );

-- =========================================
-- 8. Máquina de estados de inventario_conteos (ahora que conteo_firmas existe)
-- =========================================
create or replace function public.inventario_conteos_before_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_permitidas public.conteo_estado[];
begin
  new.folio := old.folio;
  new.tipo := old.tipo;
  new.alcance := old.alcance;
  new.alcance_descripcion := old.alcance_descripcion;
  new.conteo_origen_id := old.conteo_origen_id;
  new.updated_at := now();
  new.updated_by := auth.uid();

  if new.estado is distinct from old.estado then
    v_permitidas := case old.estado
      when 'planificado' then array['congelado', 'cancelado']::public.conteo_estado[]
      when 'congelado' then array['en_captura', 'cancelado']::public.conteo_estado[]
      when 'en_captura' then array['en_conciliacion', 'cancelado']::public.conteo_estado[]
      when 'en_conciliacion' then array['cerrado', 'cancelado']::public.conteo_estado[]
      when 'cerrado' then array['aplicado']::public.conteo_estado[]
      else array[]::public.conteo_estado[]
    end;
    if not (new.estado = any (v_permitidas)) then
      raise exception 'Transición de conteo no permitida: % → %', old.estado, new.estado
        using errcode = '42501';
    end if;

    if new.estado = 'congelado' then
      new.corte_at := coalesce(new.corte_at, now());
      new.congelado_at := now();
      new.congelado_por := auth.uid();
    end if;

    if new.estado = 'cancelado' then
      new.cancelado_at := now();
      new.cancelado_por := auth.uid();
    end if;

    -- Un conteo no se cierra sin firma de supervisor y de Gerencia de
    -- Operaciones (RTB-CIE-01, citado por el Acta real).
    if new.estado = 'cerrado' then
      if not exists (
        select 1 from public.inventario_conteo_firmas f
         where f.conteo_id = new.id and f.version = old.version and f.rol_firma = 'supervisor'
      ) or not exists (
        select 1 from public.inventario_conteo_firmas f
         where f.conteo_id = new.id and f.version = old.version and f.rol_firma = 'gerente_operaciones'
      ) then
        raise exception
          'Un conteo no se cierra sin firma de supervisor y de Gerencia de Operaciones (RTB-CIE-01)'
          using errcode = '42501';
      end if;
      new.cerrado_at := now();
      new.cerrado_por := auth.uid();
    end if;

    if new.estado = 'aplicado' then
      new.aplicado_at := now();
      new.aplicado_por := auth.uid();
    end if;
  end if;

  return new;
end;
$$;

create trigger before_update_conteos
  before update on public.inventario_conteos
  for each row execute function public.inventario_conteos_before_update();

create trigger audit_conteos after insert or update on public.inventario_conteos
  for each row execute function public.audit_row();

-- Folio + autoría en el alta.
create or replace function public.inventario_conteos_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.folio is null then
    new.folio := 'CNT-' || lpad(nextval('public.inventario_conteos_folio_seq')::text, 6, '0');
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

revoke execute on function public.inventario_conteos_before_insert() from public, anon, authenticated;

create trigger before_insert_conteos
  before insert on public.inventario_conteos
  for each row execute function public.inventario_conteos_before_insert();

-- =========================================
-- 9. Privilegios y RLS de inventario_conteos
-- =========================================
revoke all on public.inventario_conteos from anon, authenticated;
grant select on public.inventario_conteos to authenticated;
-- INSERT restringido por columna: sin esto, un INSERT (que la máquina de
-- estados de inventario_conteos_before_update() NO cubre — sólo corre en
-- UPDATE) podría crear directamente una fila con estado='cerrado'/'aplicado'
-- y cerrado_at/aplicado_at/congelado_at forjados, saltándose por completo
-- la exigencia de firmas. Toda fila nueva nace en 'planificado' (el
-- DEFAULT) y recorre la máquina de estados por UPDATE, sin excepción.
grant insert (
  tipo, alcance, alcance_descripcion, version, conteo_origen_id,
  vista_ciega, fecha_programada, responsable_id, supervisor_id, nombre
) on public.inventario_conteos to authenticated;
grant update (
  nombre, alcance_descripcion, fecha_programada, supervisor_id, estado,
  exactitud_registro, exactitud_pieza, exactitud_valor, cobertura, motivo_cancelacion
) on public.inventario_conteos to authenticated;
grant all on public.inventario_conteos to service_role;

alter table public.inventario_conteos enable row level security;

create policy inventario_conteos_select on public.inventario_conteos
  for select to authenticated
  using (public.current_user_role() is not null);
create policy inventario_conteos_insert on public.inventario_conteos
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'almacen']));
create policy inventario_conteos_update on public.inventario_conteos
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'almacen']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'almacen']));

-- =========================================
-- 10. conteo_conciliacion() — la única puerta al teórico durante la captura.
--     SECURITY DEFINER, función y no vista (el advisor marca ERROR una
--     vista definer y sólo WARN una función — mismo criterio que
--     usuarios_directorio() en 002 y proveedor_cuentas_resumen() en 004).
--     Devuelve cero filas para quien no debe verlas: "seguro por defecto".
-- =========================================
create or replace function public.conteo_conciliacion(p_conteo_id uuid)
returns table (
  detalle_id uuid, producto_id uuid, codigo_interno varchar, nombre varchar,
  ubicacion_id uuid, codigo_ubicacion varchar, estado_conteo public.conteo_linea_estado,
  cantidad_teorica numeric, cantidad_fisica numeric, diferencia numeric,
  costo_unitario numeric, valor_diferencia numeric, costo_origen varchar,
  cantidad_en_transito numeric, contado_por uuid, contado_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.id, d.producto_id, p.codigo_interno, p.nombre,
         d.ubicacion_id, u.codigo, d.estado_conteo,
         d.cantidad_teorica, d.cantidad_fisica, d.diferencia,
         d.costo_unitario_snapshot, d.valor_diferencia, d.costo_origen,
         d.cantidad_en_transito, d.contado_por, d.contado_at
    from public.inventario_conteo_detalles d
    join public.inventario_conteos c on c.id = d.conteo_id
    join public.productos p on p.id = d.producto_id
    left join public.ubicaciones_internas u on u.id = d.ubicacion_id
   where d.conteo_id = p_conteo_id
     and public.current_user_role() is not null
     and (
       c.estado <> 'en_captura'
       or c.vista_ciega = false
       or public.current_user_role() = any (array['super_admin', 'direccion'])
     );
$$;

revoke execute on function public.conteo_conciliacion(uuid) from public, anon;
grant execute on function public.conteo_conciliacion(uuid) to authenticated, service_role;
