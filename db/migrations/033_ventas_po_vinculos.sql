-- ==========================================
-- RTB Sistema — 033: Purchase Order del cliente y vínculos PO↔NR por
-- partida (RTB-VEN-01)
--
-- La decisión técnica central del documento de reglas del dueño del
-- proyecto (2026-08-07): "No debemos modelar PO y NR con una simple llave
-- foránea directa. Necesitamos una tabla de asignación por partida que
-- registre qué cantidad y qué monto de cada PO cubren cada partida de
-- cada NR." Eso es ventas_po_nr_vinculos — la cobertura se calcula SIEMPRE
-- por agregación con filtro de estado, nunca con un contador
-- denormalizado (evita el doble conteo, lección de 027 sobre escrituras
-- relacionadas no atómicas).
--
-- Regla explícita del dueño del proyecto: si una PO consolidada tiene
-- varias partidas y UNA SOLA tiene diferencia de costo unitario, se
-- bloquea LA PO COMPLETA — no se procesa parcialmente. La excepción por
-- subtotal coincidente exige autorización de Dirección.
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

-- =========================================
-- 1. TABLA: ventas_autorizaciones (excepciones/correcciones de Dirección)
-- =========================================
-- Tabla propia, NO se extiende solicitudes_cambio/cambio_controlado
-- (002/005): ALTER TYPE ... ADD VALUE no puede usarse en la misma
-- transacción en que se añade, y apply_migration envuelve cada archivo en
-- una transacción — sería un fallo garantizado.
create type public.ventas_autorizacion_tipo as enum (
  'excepcion_subtotal', 'codigo_divergente', 'duplicidad_confirmada', 'correccion_documento'
);
create type public.ventas_autorizacion_estado as enum ('pendiente', 'autorizada', 'rechazada');

create table public.ventas_autorizaciones (
  id uuid primary key default gen_random_uuid(),
  tipo public.ventas_autorizacion_tipo not null,
  documento_tipo varchar(40) not null,     -- 'purchase_order' | 'po_partida' | ...
  documento_id uuid not null,              -- polimórfico, como solicitudes_cambio
  version_anterior jsonb,
  cambios jsonb,
  motivo text not null,
  evidencia_path text,
  solicitante_id uuid not null references public.profiles(id) default auth.uid(),
  autorizador_id uuid references public.profiles(id),
  autorizado_at timestamptz,
  comentario_resolucion text,
  estado public.ventas_autorizacion_estado not null default 'pendiente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vaut_motivo_chk check (length(btrim(motivo)) > 0),
  constraint vaut_no_autoaprobacion_chk check (autorizador_id is null or autorizador_id <> solicitante_id),
  constraint vaut_resolucion_chk check (
    (estado = 'pendiente') = (autorizador_id is null and autorizado_at is null)
  )
);

comment on table public.ventas_autorizaciones is
  'Excepciones/correcciones que requieren autorización de Dirección
   (subtotal coincidente con unitarios distintos, duplicidad confirmada,
   corrección post-envío). Mismo patrón anti-autoaprobación que
   solicitudes_cambio (002) y aju_no_autoaprobacion_chk (013). Resolución
   sólo por ventas_autorizacion_resolver().';

create index idx_ventas_aut_documento on public.ventas_autorizaciones (documento_tipo, documento_id);
create index idx_ventas_aut_pendientes on public.ventas_autorizaciones (estado) where estado = 'pendiente';

create trigger audit_ventas_autorizaciones after insert or update on public.ventas_autorizaciones
  for each row execute function public.audit_row();

revoke all on public.ventas_autorizaciones from anon, authenticated;
grant select on public.ventas_autorizaciones to authenticated;
grant insert (tipo, documento_tipo, documento_id, version_anterior, cambios, motivo, evidencia_path)
  on public.ventas_autorizaciones to authenticated;
grant all on public.ventas_autorizaciones to service_role;

alter table public.ventas_autorizaciones enable row level security;

create policy ventas_aut_select on public.ventas_autorizaciones
  for select to authenticated
  using (public.current_user_role() is not null);
create policy ventas_aut_insert on public.ventas_autorizaciones
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'ventas']));

create or replace function public.ventas_autorizacion_resolver(p_id uuid, p_aprobar boolean, p_comentario text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_aut record;
begin
  if public.current_user_role() not in ('super_admin', 'direccion') then
    raise exception 'Sin permisos para resolver una autorización de Ventas.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;

  select * into v_aut from public.ventas_autorizaciones where id = p_id for update;
  if not found then
    raise exception 'Autorización % no encontrada', p_id using errcode = 'P0002';
  end if;
  if v_aut.estado <> 'pendiente' then
    raise exception 'Esta autorización ya fue resuelta.' using errcode = '42501';
  end if;
  if v_aut.solicitante_id = v_actor then
    raise exception 'No puedes resolver tu propia solicitud.' using errcode = '42501';
  end if;
  if not p_aprobar and length(btrim(coalesce(p_comentario, ''))) = 0 then
    raise exception 'El comentario es obligatorio al rechazar.' using errcode = '23514';
  end if;

  update public.ventas_autorizaciones
     set estado = case when p_aprobar then 'autorizada' else 'rechazada' end::public.ventas_autorizacion_estado,
         autorizador_id = v_actor, autorizado_at = now(), comentario_resolucion = p_comentario, updated_at = now()
   where id = p_id;

  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.ventas_autorizacion_resolver(uuid, boolean, text) from public, anon;
grant execute on function public.ventas_autorizacion_resolver(uuid, boolean, text) to authenticated;

-- =========================================
-- 2. TABLA: ventas_ordenes_compra_cliente
-- =========================================
create type public.po_estado as enum (
  'recibida', 'en_validacion', 'parcialmente_vinculada', 'vinculada',
  'pendiente_de_confirmacion', 'rechazada', 'corregida', 'cancelada'
);

create table public.ventas_ordenes_compra_cliente (
  id uuid primary key default gen_random_uuid(),
  folio varchar(16) not null unique,           -- POC-000000, folio interno de RTB
  numero_po varchar(80) not null,              -- número que el cliente puso en su documento
  numero_po_normalizado varchar(80) generated always as (nullif(upper(btrim(numero_po)), '')) stored,
  entidad_id uuid not null references public.entidades(id) on delete restrict,
  pedido_id uuid references public.ventas_pedidos(id) on delete restrict,   -- Vía B: PO directa
  moneda char(3) not null,
  subtotal_declarado numeric(16, 4),
  total_declarado numeric(16, 4),
  fecha_po date,
  canal_entrega public.canal_origen,
  evidencia_path text,
  razon_social_declarada varchar(255),
  rfc_declarado varchar(13),
  estado public.po_estado not null default 'recibida',
  recibida_por uuid references public.profiles(id) default auth.uid(),
  validada_at timestamptz,
  validada_por uuid references public.profiles(id),
  motivo_rechazo text,
  duplicada_de uuid references public.ventas_ordenes_compra_cliente(id) on delete restrict,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint po_moneda_chk check (moneda ~ '^[A-Z]{3}$'),
  constraint po_rechazo_chk check (estado <> 'rechazada' or motivo_rechazo is not null)
);

comment on table public.ventas_ordenes_compra_cliente is
  'PO del cliente. numero_po_normalizado (nullif(upper(btrim(...)),'''')
   evita que "" colisione con el índice único parcial — mismo gotcha que
   entidades.siglas (020). duplicada_de enlaza una incidencia de PO
   posiblemente duplicada (documento §3 del dueño del proyecto) sin
   asumir automáticamente cuál es la válida.';

create unique index uq_po_numero on public.ventas_ordenes_compra_cliente (entidad_id, numero_po_normalizado)
  where estado <> 'cancelada' and numero_po_normalizado is not null;
create index idx_po_entidad on public.ventas_ordenes_compra_cliente (entidad_id);
create index idx_po_pedido on public.ventas_ordenes_compra_cliente (pedido_id);
create index idx_po_estado on public.ventas_ordenes_compra_cliente (estado);

create sequence public.ventas_po_folio_seq;

create or replace function public.ventas_po_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.folio is null then
    new.folio := 'POC-' || lpad(nextval('public.ventas_po_folio_seq')::text, 6, '0');
  end if;
  new.recibida_por := coalesce(new.recibida_por, auth.uid());
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

revoke execute on function public.ventas_po_before_insert() from public, anon, authenticated;

create trigger before_insert_ventas_po
  before insert on public.ventas_ordenes_compra_cliente
  for each row execute function public.ventas_po_before_insert();

create trigger before_update_ventas_po
  before update on public.ventas_ordenes_compra_cliente
  for each row execute function public.set_updated_meta();

create trigger audit_ventas_po after insert or update on public.ventas_ordenes_compra_cliente
  for each row execute function public.audit_row();

revoke all on public.ventas_ordenes_compra_cliente from anon, authenticated;
grant select on public.ventas_ordenes_compra_cliente to authenticated;
grant insert (numero_po, entidad_id, pedido_id, moneda, subtotal_declarado, total_declarado, fecha_po,
              canal_entrega, evidencia_path, razon_social_declarada, rfc_declarado)
  on public.ventas_ordenes_compra_cliente to authenticated;
grant all on public.ventas_ordenes_compra_cliente to service_role;

alter table public.ventas_ordenes_compra_cliente enable row level security;

create policy ventas_po_select on public.ventas_ordenes_compra_cliente
  for select to authenticated
  using (public.current_user_role() is not null);
create policy ventas_po_insert on public.ventas_ordenes_compra_cliente
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'ventas']));

-- =========================================
-- 3. TABLA: ventas_po_partidas
-- =========================================
create table public.ventas_po_partidas (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.ventas_ordenes_compra_cliente(id) on delete restrict,
  linea_numero integer not null,
  codigo_cliente varchar(80),
  descripcion text,
  cantidad numeric(16, 4) not null check (cantidad > 0),
  precio_unitario numeric(14, 4) not null check (precio_unitario >= 0),
  subtotal numeric(18, 4) generated always as (round(cantidad * precio_unitario, 4)) stored,
  producto_id uuid references public.productos(id) on delete restrict,
  codigo_divergente boolean not null default false,
  created_at timestamptz not null default now(),
  constraint uq_po_partida_linea unique (po_id, linea_numero)
);

comment on table public.ventas_po_partidas is
  'Partida declarada por el cliente en su PO. codigo_divergente queda en
   true cuando ventas_po_validar() la aprobó pese a que codigo_cliente no
   coincidía con el código interno del producto (costo/subtotal sí
   cuadraron) — auditable, no silencioso.';

create index idx_po_partidas_po on public.ventas_po_partidas (po_id);
create index idx_po_partidas_producto on public.ventas_po_partidas (producto_id);

revoke all on public.ventas_po_partidas from anon, authenticated;
grant select on public.ventas_po_partidas to authenticated;
grant insert (po_id, linea_numero, codigo_cliente, descripcion, cantidad, precio_unitario, producto_id)
  on public.ventas_po_partidas to authenticated;
grant all on public.ventas_po_partidas to service_role;

alter table public.ventas_po_partidas enable row level security;

create policy ventas_po_partidas_select on public.ventas_po_partidas
  for select to authenticated
  using (public.current_user_role() is not null);
create policy ventas_po_partidas_insert on public.ventas_po_partidas
  for insert to authenticated
  with check (
    exists (
      select 1 from public.ventas_ordenes_compra_cliente po
       where po.id = po_id and po.estado in ('recibida', 'en_validacion')
         and public.current_user_role() = any (array['super_admin', 'direccion', 'ventas'])
    )
  );

-- =========================================
-- 4. TABLA: ventas_po_nr_vinculos — la asignación N↔M por partida
-- =========================================
create type public.vinculo_estado as enum (
  'pendiente', 'validado', 'rechazado_por_precio', 'rechazado_por_cantidad',
  'rechazado_por_duplicidad', 'aprobado_para_facturacion', 'facturado', 'cancelado'
);

create table public.ventas_po_nr_vinculos (
  id uuid primary key default gen_random_uuid(),
  po_partida_id uuid not null references public.ventas_po_partidas(id) on delete restrict,
  nr_linea_id uuid not null references public.ventas_nr_lineas(id) on delete restrict,
  cantidad_cubierta numeric(16, 4) not null check (cantidad_cubierta > 0),
  monto_cubierto numeric(18, 4) not null check (monto_cubierto >= 0),
  estado public.vinculo_estado not null default 'pendiente',
  autorizacion_id uuid references public.ventas_autorizaciones(id) on delete restrict,
  motivo text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

comment on table public.ventas_po_nr_vinculos is
  'La tabla de asignación PO↔NR por partida — el núcleo del módulo
   (decisión técnica del dueño del proyecto). "Cantidad respaldada por
   PO" se calcula SIEMPRE por agregación con filter (where estado in
   (''validado'',''aprobado_para_facturacion'',''facturado'')), nunca con
   un contador — un vínculo cancelado/rechazado sale de la suma
   automáticamente. Sin GRANT INSERT/UPDATE para authenticated: sólo
   ventas_po_validar() los escribe.';

create unique index uq_vinculo_par on public.ventas_po_nr_vinculos (po_partida_id, nr_linea_id)
  where estado <> 'cancelado';
create index idx_vinculos_partida on public.ventas_po_nr_vinculos (po_partida_id);
create index idx_vinculos_nr_linea on public.ventas_po_nr_vinculos (nr_linea_id);

revoke all on public.ventas_po_nr_vinculos from anon, authenticated;
grant select on public.ventas_po_nr_vinculos to authenticated;
grant all on public.ventas_po_nr_vinculos to service_role;

alter table public.ventas_po_nr_vinculos enable row level security;

create policy ventas_vinculos_select on public.ventas_po_nr_vinculos
  for select to authenticated
  using (public.current_user_role() is not null);

-- Dos constraint triggers DIFERIDOS (idioma de movimiento_valida_par,
-- 011): un CHECK no puede mirar filas hermanas, y un trigger NO diferido
-- rompería una vinculación multilínea legítima a media escritura (cada
-- INSERT vería el estado transitorio de los anteriores en el mismo lote).
create or replace function public.vinculo_valida_cobertura_nr()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nr_linea_id uuid;
  v_entregada numeric;
  v_cubierta numeric;
begin
  v_nr_linea_id := coalesce(new.nr_linea_id, old.nr_linea_id);
  select cantidad_entregada into v_entregada from public.ventas_nr_lineas where id = v_nr_linea_id;
  select coalesce(sum(cantidad_cubierta), 0) into v_cubierta
    from public.ventas_po_nr_vinculos
   where nr_linea_id = v_nr_linea_id and estado in ('validado', 'aprobado_para_facturacion', 'facturado');
  if v_cubierta > v_entregada then
    raise exception 'La cobertura de PO de esta línea de NR (%) excede lo entregado (%).', v_cubierta, v_entregada
      using errcode = '22023';
  end if;
  return null;
end;
$$;

revoke execute on function public.vinculo_valida_cobertura_nr() from public, anon, authenticated;

create constraint trigger trg_vinculo_valida_cobertura_nr
  after insert or update on public.ventas_po_nr_vinculos
  deferrable initially deferred
  for each row execute function public.vinculo_valida_cobertura_nr();

create or replace function public.vinculo_valida_cobertura_partida()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_partida_id uuid;
  v_cantidad_po numeric;
  v_cubierta numeric;
begin
  v_partida_id := coalesce(new.po_partida_id, old.po_partida_id);
  select cantidad into v_cantidad_po from public.ventas_po_partidas where id = v_partida_id;
  select coalesce(sum(cantidad_cubierta), 0) into v_cubierta
    from public.ventas_po_nr_vinculos
   where po_partida_id = v_partida_id and estado in ('validado', 'aprobado_para_facturacion', 'facturado');
  if v_cubierta > v_cantidad_po then
    raise exception 'La cobertura de esta partida de PO (%) excede lo declarado (%).', v_cubierta, v_cantidad_po
      using errcode = '22023';
  end if;
  return null;
end;
$$;

revoke execute on function public.vinculo_valida_cobertura_partida() from public, anon, authenticated;

create constraint trigger trg_vinculo_valida_cobertura_partida
  after insert or update on public.ventas_po_nr_vinculos
  deferrable initially deferred
  for each row execute function public.vinculo_valida_cobertura_partida();

-- =========================================
-- 5. ventas_po_validar() — el cruce de precios y la asignación
-- =========================================
-- p_vinculos: jsonb array [{"po_partida_id": uuid, "nr_linea_id": uuid,
-- "cantidad_cubierta": numeric}, ...]. Orden de reglas, tal como las
-- confirmó el dueño del proyecto:
--   1. Moneda de la PO vs. moneda de cada NR involucrada -> bloqueo total.
--   2. RFC declarado vs. entidades.rfc -> rechazo de la PO completa.
--   3. Cruce de precio unitario partida↔línea de NR en SQL (numeric,
--      nunca en TypeScript por precisión de punto flotante) -> UNA sola
--      partida divergente bloquea TODA la PO, sin excepción.
--   4. Excepción por subtotal coincidente -> requiere
--      p_autorizacion_id de tipo 'excepcion_subtotal', estado
--      'autorizada', mismo documento_id = po_id.
--   5. Código de cliente divergente -> permitido si costo/subtotal
--      cuadran, marcado auditable (codigo_divergente=true).
--   6. Duplicidad -> si la cobertura propuesta excedería lo entregado,
--      el vínculo nace 'rechazado_por_duplicidad' y la PO queda
--      'pendiente_de_confirmacion', salvo autorización
--      'duplicidad_confirmada'.
create or replace function public.ventas_po_validar(
  p_po_id uuid, p_vinculos jsonb, p_autorizacion_id uuid default null,
  p_aceptar_codigo_divergente boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_po record;
  v_entidad record;
  v_item record;
  v_partida record;
  v_nr_linea record;
  v_producto record;
  v_nr record;
  v_subtotal_po numeric := 0;
  v_subtotal_nr numeric := 0;
  v_hay_discrepancia_precio boolean := false;
  v_excepcion_valida boolean := false;
  v_hay_duplicidad boolean := false;
  v_vinculos_creados integer := 0;
  v_partidas_afectadas uuid[] := '{}';
  v_estado_final public.po_estado;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'ventas') then
    raise exception 'Sin permisos para validar una PO.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;

  select * into v_po from public.ventas_ordenes_compra_cliente where id = p_po_id for update;
  if not found then
    raise exception 'PO % no encontrada', p_po_id using errcode = 'P0002';
  end if;
  if v_po.estado not in ('recibida', 'en_validacion', 'parcialmente_vinculada', 'pendiente_de_confirmacion') then
    raise exception 'Esta PO ya no admite validación (estado %).', v_po.estado using errcode = '42501';
  end if;

  select * into v_entidad from public.entidades where id = v_po.entidad_id;

  -- 2) Cliente legal / RFC
  if v_po.rfc_declarado is not null and v_entidad.rfc is not null
     and upper(btrim(v_po.rfc_declarado)) <> upper(btrim(v_entidad.rfc)) then
    update public.ventas_ordenes_compra_cliente
       set estado = 'rechazada', motivo_rechazo = 'El RFC declarado en la PO no coincide con el de la entidad.',
           updated_at = now()
     where id = p_po_id;
    return jsonb_build_object(
      'success', false, 'motivo', 'rfc_no_coincide',
      'mensaje', 'El RFC declarado no coincide con el de la entidad. Se solicita corrección al cliente.'
    );
  end if;

  -- Recorrido 1: acumular subtotales y detectar discrepancia de precio
  -- (SIEMPRE en SQL/numeric — nunca comparar floats de JS).
  for v_item in select * from jsonb_to_recordset(p_vinculos)
    as x(po_partida_id uuid, nr_linea_id uuid, cantidad_cubierta numeric)
  loop
    select * into v_partida from public.ventas_po_partidas where id = v_item.po_partida_id and po_id = p_po_id;
    if not found then
      raise exception 'La partida % no pertenece a esta PO.', v_item.po_partida_id using errcode = '22023';
    end if;
    select * into v_nr_linea from public.ventas_nr_lineas where id = v_item.nr_linea_id;
    if not found then
      raise exception 'Línea de NR % no encontrada.', v_item.nr_linea_id using errcode = 'P0002';
    end if;
    select * into v_nr from public.ventas_notas_remision where id = v_nr_linea.nr_id;

    -- 1) Moneda
    if v_po.moneda <> v_nr.moneda then
      raise exception 'La moneda de la PO (%) no coincide con la de la NR % (%): bloqueo de vinculación.',
        v_po.moneda, v_nr.folio, v_nr.moneda using errcode = '42501';
    end if;

    if v_partida.precio_unitario <> v_nr_linea.precio_unitario then
      v_hay_discrepancia_precio := true;
    end if;

    v_subtotal_po := v_subtotal_po + (v_partida.cantidad * v_partida.precio_unitario);
    v_subtotal_nr := v_subtotal_nr + (v_item.cantidad_cubierta * v_nr_linea.precio_unitario);

    v_partidas_afectadas := array_append(v_partidas_afectadas, v_partida.id);
  end loop;

  -- 3) Bloqueo total por discrepancia de precio, salvo 4) excepción de
  --    subtotal coincidente con autorización vigente.
  if v_hay_discrepancia_precio then
    if v_subtotal_po = v_subtotal_nr then
      if p_autorizacion_id is not null then
        select exists (
          select 1 from public.ventas_autorizaciones
           where id = p_autorizacion_id and tipo = 'excepcion_subtotal' and estado = 'autorizada'
             and documento_tipo = 'purchase_order' and documento_id = p_po_id
        ) into v_excepcion_valida;
      end if;
      if not v_excepcion_valida then
        update public.ventas_ordenes_compra_cliente set estado = 'en_validacion', updated_at = now() where id = p_po_id;
        return jsonb_build_object(
          'success', false, 'motivo', 'requiere_autorizacion_subtotal',
          'mensaje', 'Los costos unitarios varían pero el subtotal coincide: requiere autorización de Dirección '
                     '(ventas_autorizaciones tipo excepcion_subtotal) antes de vincular.'
        );
      end if;
    else
      update public.ventas_ordenes_compra_cliente set estado = 'en_validacion', updated_at = now() where id = p_po_id;
      return jsonb_build_object(
        'success', false, 'motivo', 'costo_no_coincide',
        'mensaje', 'Al menos una partida tiene costo unitario distinto al de su NR y el subtotal tampoco '
                   'coincide: se bloquea la PO completa hasta corregir el documento del cliente.'
      );
    end if;
  end if;

  -- Recorrido 2: código divergente + duplicidad + creación de vínculos.
  for v_item in select * from jsonb_to_recordset(p_vinculos)
    as x(po_partida_id uuid, nr_linea_id uuid, cantidad_cubierta numeric)
  loop
    select * into v_partida from public.ventas_po_partidas where id = v_item.po_partida_id;
    select * into v_nr_linea from public.ventas_nr_lineas where id = v_item.nr_linea_id;
    select * into v_producto from public.productos where id = v_nr_linea.producto_id;

    if v_partida.codigo_cliente is not null and v_producto.codigo_interno is not null
       and upper(btrim(v_partida.codigo_cliente)) <> upper(btrim(v_producto.codigo_interno)) then
      if not p_aceptar_codigo_divergente then
        raise exception
          'El código "%" de la partida no coincide con el código interno %: confirma con '
          'aceptar_codigo_divergente si el costo/subtotal ya cuadraron.', v_partida.codigo_cliente, v_producto.codigo_interno
          using errcode = '22023';
      end if;
      update public.ventas_po_partidas set codigo_divergente = true where id = v_partida.id;
    end if;

    -- 6) Duplicidad: ¿la cobertura ya validada + esta propuesta excede lo entregado?
    v_hay_duplicidad := (
      (select coalesce(sum(cantidad_cubierta), 0) from public.ventas_po_nr_vinculos
        where nr_linea_id = v_item.nr_linea_id
          and estado in ('validado', 'aprobado_para_facturacion', 'facturado'))
      + v_item.cantidad_cubierta
    ) > v_nr_linea.cantidad_entregada;

    if v_hay_duplicidad and not exists (
      select 1 from public.ventas_autorizaciones
       where tipo = 'duplicidad_confirmada' and estado = 'autorizada'
         and documento_tipo = 'purchase_order' and documento_id = p_po_id
    ) then
      insert into public.ventas_po_nr_vinculos
        (po_partida_id, nr_linea_id, cantidad_cubierta, monto_cubierto, estado, motivo, created_by)
      values (
        v_item.po_partida_id, v_item.nr_linea_id, v_item.cantidad_cubierta,
        round(v_item.cantidad_cubierta * v_nr_linea.precio_unitario, 4), 'rechazado_por_duplicidad',
        'Posible PO duplicada: la cobertura propuesta excede lo entregado en esta línea.', v_actor
      );
    else
      insert into public.ventas_po_nr_vinculos
        (po_partida_id, nr_linea_id, cantidad_cubierta, monto_cubierto, estado, autorizacion_id, created_by)
      values (
        v_item.po_partida_id, v_item.nr_linea_id, v_item.cantidad_cubierta,
        round(v_item.cantidad_cubierta * v_nr_linea.precio_unitario, 4), 'validado', p_autorizacion_id, v_actor
      );
      v_vinculos_creados := v_vinculos_creados + 1;
    end if;
  end loop;

  -- 7) Recalcular estado de la PO por agregación (nunca a mano).
  if v_hay_duplicidad and v_vinculos_creados = 0 then
    v_estado_final := 'pendiente_de_confirmacion';
  elsif exists (
    select 1 from public.ventas_po_partidas p
     where p.po_id = p_po_id
       and coalesce((select sum(v.cantidad_cubierta) from public.ventas_po_nr_vinculos v
                      where v.po_partida_id = p.id
                        and v.estado in ('validado', 'aprobado_para_facturacion', 'facturado')), 0) < p.cantidad
  ) then
    v_estado_final := 'parcialmente_vinculada';
  else
    v_estado_final := 'vinculada';
  end if;

  update public.ventas_ordenes_compra_cliente
     set estado = v_estado_final, validada_at = now(), validada_por = v_actor, updated_at = now()
   where id = p_po_id;

  -- Recalcular estado de cada NR afectada por agregación de cobertura.
  update public.ventas_notas_remision nr
     set estado = case
       when (
         select coalesce(sum(nl.cantidad_entregada), 0) - coalesce((
           select sum(v.cantidad_cubierta) from public.ventas_po_nr_vinculos v
            join public.ventas_nr_lineas l2 on l2.id = v.nr_linea_id
           where l2.nr_id = nr.id and v.estado in ('validado', 'aprobado_para_facturacion', 'facturado')
         ), 0)
         from public.ventas_nr_lineas nl where nl.nr_id = nr.id
       ) <= 0 and nr.estado in ('entregada_sin_po', 'parcialmente_respaldada')
       then 'po_vinculada'::public.nr_estado
       when nr.estado in ('entregada_sin_po', 'po_vinculada')
       then 'parcialmente_respaldada'::public.nr_estado
       else nr.estado
     end,
     updated_at = now()
   where nr.id in (
     select l.nr_id from public.ventas_nr_lineas l
      where l.id in (select (jsonb_array_elements(p_vinculos)->>'nr_linea_id')::uuid)
   );

  return jsonb_build_object(
    'success', true, 'estado_po', v_estado_final, 'vinculos_creados', v_vinculos_creados,
    'partidas_afectadas', v_partidas_afectadas
  );
end;
$$;

revoke execute on function public.ventas_po_validar(uuid, jsonb, uuid, boolean) from public, anon;
grant execute on function public.ventas_po_validar(uuid, jsonb, uuid, boolean) to authenticated;
