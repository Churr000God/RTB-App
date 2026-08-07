-- ==========================================
-- RTB Sistema — 031: aprobación de cotización, pedido y reserva de
-- inventario en dos niveles (RTB-VEN-01)
--
-- Reserva/compromiso confirmados con el dueño del proyecto: un solo nivel
-- nuevo (`nivel`) sobre la tabla `inventario_apartados` que YA EXISTE
-- (011) — un único acumulador cantidad_apartada, para que "disponible" no
-- descuente dos veces la misma pieza. Reserva ocurre al APROBAR la
-- cotización; compromiso al LIBERAR el pedido a Almacén.
--
-- ventas_cotizacion_aprobar() es la función más delicada de todo el
-- módulo: evidencia + pedido + N líneas + N apartados, TODO en una sola
-- transacción (lección de 027: un for-loop de inserts sueltos desde la
-- ruta HTTP sobre una tabla append-only puede dejar reservas huérfanas
-- ante un fallo a mitad de camino).
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

-- =========================================
-- 1. TABLA: ventas_pedidos
-- =========================================
create type public.pedido_estado as enum (
  'aprobado', 'liberado', 'en_preparacion', 'entregado_parcial', 'entregado', 'cerrado', 'cancelado'
);

create table public.ventas_pedidos (
  id uuid primary key default gen_random_uuid(),
  folio varchar(16) not null unique,
  cotizacion_id uuid not null references public.ventas_cotizaciones(id) on delete restrict,
  entidad_id uuid not null references public.entidades(id) on delete restrict,
  vendedor_id uuid references public.profiles(id),
  moneda char(3) not null,
  requiere_po boolean not null default false,     -- foto de clientes.requiere_po al momento de aprobar
  estado public.pedido_estado not null default 'aprobado',
  liberado_at timestamptz,
  liberado_por uuid references public.profiles(id),
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ventas_pedidos is
  'Pedido de venta: nace SIEMPRE desde ventas_cotizacion_aprobar() —
   sin GRANT INSERT para authenticated, sólo las funciones SECURITY
   DEFINER lo crean/transicionan. requiere_po es una copia de la política
   del cliente al momento de aprobar, no una referencia viva.';

create index idx_ventas_pedidos_cotizacion on public.ventas_pedidos (cotizacion_id);
create index idx_ventas_pedidos_entidad on public.ventas_pedidos (entidad_id);
create index idx_ventas_pedidos_vendedor on public.ventas_pedidos (vendedor_id);
create index idx_ventas_pedidos_estado on public.ventas_pedidos (estado);

create sequence public.ventas_pedidos_folio_seq;

create or replace function public.ventas_pedido_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.folio is null then
    new.folio := 'PED-' || lpad(nextval('public.ventas_pedidos_folio_seq')::text, 6, '0');
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

revoke execute on function public.ventas_pedido_before_insert() from public, anon, authenticated;

create trigger before_insert_ventas_pedidos
  before insert on public.ventas_pedidos
  for each row execute function public.ventas_pedido_before_insert();

create trigger audit_ventas_pedidos after insert or update on public.ventas_pedidos
  for each row execute function public.audit_row();

-- Sin GRANT INSERT/UPDATE para authenticated: el pedido nace y transiciona
-- únicamente por función. No hace falta una política de insert/update —
-- el privilegio de tabla ya lo impide antes de que RLS entre en juego.
revoke all on public.ventas_pedidos from anon, authenticated;
grant select on public.ventas_pedidos to authenticated;
grant all on public.ventas_pedidos to service_role;

alter table public.ventas_pedidos enable row level security;

create policy ventas_pedidos_select on public.ventas_pedidos
  for select to authenticated
  using (public.current_user_role() is not null);

-- =========================================
-- 2. TABLA: ventas_pedido_lineas (copia inmutable del snapshot)
-- =========================================
create table public.ventas_pedido_lineas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.ventas_pedidos(id) on delete restrict,
  cotizacion_linea_id uuid references public.ventas_cotizacion_lineas(id) on delete restrict,
  producto_id uuid not null references public.productos(id) on delete restrict,
  cantidad numeric(16, 4) not null check (cantidad > 0),
  unidad_medida_id uuid not null references public.unidades_medida(id) on delete restrict,
  precio_unitario numeric(14, 4) not null check (precio_unitario >= 0),
  descuento_porcentaje numeric(5, 2) not null default 0 check (descuento_porcentaje between 0 and 100),
  importe numeric(18, 4) generated always as (
    round(cantidad * precio_unitario * (1 - descuento_porcentaje / 100.0), 4)
  ) stored,
  created_at timestamptz not null default now()
);

comment on table public.ventas_pedido_lineas is
  'Copia inmutable de la línea de cotización en el momento de aprobar —
   precio_unitario ya viene resuelto (nunca se recalcula aquí). Sin GRANT
   INSERT/UPDATE para authenticated: sólo ventas_cotizacion_aprobar() la
   escribe, dentro de la misma transacción que crea el pedido.';

create index idx_ventas_pedido_lineas_pedido on public.ventas_pedido_lineas (pedido_id);
create index idx_ventas_pedido_lineas_producto on public.ventas_pedido_lineas (producto_id);

create trigger audit_ventas_pedido_lineas after insert or update on public.ventas_pedido_lineas
  for each row execute function public.audit_row();

revoke all on public.ventas_pedido_lineas from anon, authenticated;
grant select on public.ventas_pedido_lineas to authenticated;
grant all on public.ventas_pedido_lineas to service_role;

alter table public.ventas_pedido_lineas enable row level security;

create policy ventas_pedido_lineas_select on public.ventas_pedido_lineas
  for select to authenticated
  using (public.current_user_role() is not null);

-- =========================================
-- 3. Extensión de inventario_apartados (011): nivel reserva/compromiso
-- =========================================
create type public.apartado_nivel as enum ('reserva', 'compromiso');

alter table public.inventario_apartados
  add column nivel public.apartado_nivel not null default 'reserva',
  add column pedido_id uuid references public.ventas_pedidos(id) on delete restrict,
  add constraint apartados_nivel_pedido_chk check (nivel = 'reserva' or pedido_id is not null);

create index idx_apartados_pedido on public.inventario_apartados (pedido_id) where pedido_id is not null;

comment on column public.inventario_apartados.nivel is
  'reserva = cotización aprobada (RTB-VEN-01); compromiso = liberado a
   Almacén. Un solo acumulador cantidad_apartada para ambos niveles: la
   promoción reserva→compromiso es un UPDATE que sólo cambia esta columna,
   nunca toca cantidad_apartada (evita el doble descuento).';

-- El GRANT INSERT original (011) era de tabla completa sin lista de
-- columnas — igual que el gotcha ya cerrado en 028 para
-- producto_familias, eso concede INSERT sobre columnas nuevas (nivel,
-- pedido_id) por defecto. 'ventas'/'almacen' sí insertan apartados
-- directamente (flujo normal de reserva libre de Almacén, no de Ventas)
-- y heredarían la capacidad de forjar nivel='compromiso'/pedido_id al dar
-- de alta un apartado. Se cierra explícitamente: sólo las funciones
-- SECURITY DEFINER (aquí, ventas_cotizacion_aprobar) escriben esas dos
-- columnas — corren como el dueño de la función y no dependen de este
-- GRANT.
revoke insert on public.inventario_apartados from authenticated;
grant insert (producto_id, ubicacion_id, cantidad, pedido_folio) on public.inventario_apartados to authenticated;

-- Reemplaza apartados_before_update() (011) añadiendo: (a) pedido_id
-- congelado (mismo alcance inmutable que producto_id/ubicacion_id/
-- cantidad/solicitante_id — reasignar un apartado a otro pedido por esta
-- vía queda excluido); (b) compromiso→reserva prohibido (una vez
-- liberado a Almacén no se retrocede sin liberar el apartado y crear uno
-- nuevo). El resto del cuerpo es idéntico al original — Almacén sigue
-- usando la misma función sin cambio de comportamiento en su circuito.
create or replace function public.apartados_before_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.estado <> 'activo' then
    raise exception 'Un apartado % ya no está activo, no admite más cambios', old.id
      using errcode = '42501';
  end if;
  new.producto_id := old.producto_id;
  new.ubicacion_id := old.ubicacion_id;
  new.cantidad := old.cantidad;
  new.solicitante_id := old.solicitante_id;
  new.pedido_id := old.pedido_id;
  new.updated_at := now();

  if old.nivel = 'compromiso' and new.nivel = 'reserva' then
    raise exception 'Un apartado comprometido no regresa a reserva; libéralo y crea uno nuevo si hace falta.'
      using errcode = '42501';
  end if;

  if new.estado is distinct from old.estado then
    new.liberado_at := now();
    new.liberado_por := auth.uid();
    update public.inventario_existencias
       set cantidad_apartada = greatest(cantidad_apartada - old.cantidad, 0),
           updated_at = now(), updated_by = auth.uid()
     where producto_id = old.producto_id and ubicacion_id is not distinct from old.ubicacion_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.apartados_before_update() from public, anon, authenticated;

-- =========================================
-- 4. ventas_cotizacion_aprobar() — evidencia + pedido + líneas + reservas,
--    una sola transacción.
-- =========================================
create or replace function public.ventas_cotizacion_aprobar(p_cotizacion_id uuid, p_aprobacion jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_cot record;
  v_estado_cliente jsonb;
  v_pedido_id uuid;
  v_pedido_folio varchar;
  v_requiere_po boolean;
  v_canal public.canal_origen;
  v_datos_faltantes text[];
  v_lineas integer;
  v_linea record;
  v_factor numeric;
  v_cantidad_base numeric;
  v_ubicacion uuid;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'ventas') then
    raise exception 'Sin permisos para aprobar una cotización.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;

  select * into v_cot from public.ventas_cotizaciones where id = p_cotizacion_id for update;
  if not found then
    raise exception 'Cotización % no encontrada', p_cotizacion_id using errcode = 'P0002';
  end if;
  if public.current_user_role() = 'ventas' and v_cot.vendedor_id <> v_actor then
    raise exception 'No puedes aprobar la cotización de otro vendedor.' using errcode = '42501';
  end if;
  if v_cot.estado <> 'enviada' then
    raise exception 'Sólo se aprueba una cotización enviada.' using errcode = '42501';
  end if;
  if v_cot.vigencia_hasta is not null and v_cot.vigencia_hasta < current_date then
    raise exception 'La cotización ya expiró: no se puede aprobar.' using errcode = '42501';
  end if;

  v_estado_cliente := public.cliente_puede_operar(v_cot.entidad_id);
  if not (v_estado_cliente->>'puede')::boolean then
    raise exception 'No se puede aprobar: %', (v_estado_cliente->>'motivo') using errcode = '42501';
  end if;

  v_canal := nullif(p_aprobacion->>'canal', '')::public.canal_origen;
  if v_canal is null then
    raise exception 'Falta el canal de la evidencia de aprobación.' using errcode = '22023';
  end if;

  select array(select jsonb_array_elements_text(coalesce(p_aprobacion->'datos_faltantes', '[]'::jsonb)))
    into v_datos_faltantes;

  select count(*) into v_lineas from public.ventas_cotizacion_lineas
   where cotizacion_id = p_cotizacion_id and activo;
  if v_lineas = 0 then
    raise exception 'La cotización no tiene líneas activas.' using errcode = '22023';
  end if;

  insert into public.ventas_aprobaciones
    (cotizacion_id, canal, evidencia_path, referencia, contacto_id, datos_faltantes, registrado_por)
  values (
    p_cotizacion_id, v_canal, nullif(p_aprobacion->>'evidencia_path', ''), nullif(p_aprobacion->>'referencia', ''),
    nullif(p_aprobacion->>'contacto_id', '')::uuid, coalesce(v_datos_faltantes, '{}'::text[]), v_actor
  );

  select requiere_po into v_requiere_po from public.clientes where entidad_id = v_cot.entidad_id;

  insert into public.ventas_pedidos (cotizacion_id, entidad_id, vendedor_id, moneda, requiere_po)
  values (p_cotizacion_id, v_cot.entidad_id, v_cot.vendedor_id, v_cot.moneda, coalesce(v_requiere_po, false))
  returning id, folio into v_pedido_id, v_pedido_folio;

  insert into public.ventas_pedido_lineas
    (pedido_id, cotizacion_linea_id, producto_id, cantidad, unidad_medida_id, precio_unitario, descuento_porcentaje)
  select v_pedido_id, l.id, l.producto_id, l.cantidad, l.unidad_medida_id, l.precio_unitario, l.descuento_porcentaje
    from public.ventas_cotizacion_lineas l
   where l.cotizacion_id = p_cotizacion_id and l.activo;

  -- Una reserva por línea, en unidad BASE del producto (mismo factor de
  -- conversión que valida el kardex, 011) — inventario_apartados.cantidad
  -- siempre está en unidad base, sin excepción.
  for v_linea in
    select pl.id as pedido_linea_id, pl.producto_id, pl.cantidad, pl.unidad_medida_id,
           p.unidad_medida_id as base_id, p.unidad_contenido_id, p.contenido_por_unidad, p.codigo_interno
      from public.ventas_pedido_lineas pl
      join public.productos p on p.id = pl.producto_id
     where pl.pedido_id = v_pedido_id
  loop
    if v_linea.unidad_medida_id = v_linea.base_id then
      v_factor := 1;
    elsif v_linea.unidad_contenido_id is not null and v_linea.unidad_medida_id = v_linea.unidad_contenido_id then
      v_factor := 1 / nullif(v_linea.contenido_por_unidad, 0);
    else
      raise exception 'Unidad de captura incompatible con el producto % en la línea del pedido.', v_linea.codigo_interno
        using errcode = '22023';
    end if;

    v_cantidad_base := v_linea.cantidad * v_factor;

    -- Ubicación con más disponible; NULL si el producto no tiene
    -- existencia todavía (inventario_apartados lo admite: 011).
    select ubicacion_id into v_ubicacion
      from public.inventario_existencias
     where producto_id = v_linea.producto_id
     order by cantidad_disponible desc nulls last
     limit 1;

    insert into public.inventario_apartados
      (producto_id, ubicacion_id, cantidad, pedido_folio, pedido_id, nivel, solicitante_id)
    values
      (v_linea.producto_id, v_ubicacion, v_cantidad_base, v_pedido_folio, v_pedido_id, 'reserva', v_actor);
  end loop;

  update public.ventas_cotizaciones
     set estado = 'aprobada', resuelta_at = now(), resuelta_por = v_actor, updated_at = now()
   where id = p_cotizacion_id;

  return jsonb_build_object(
    'success', true, 'pedido_id', v_pedido_id, 'pedido_folio', v_pedido_folio, 'lineas', v_lineas
  );
end;
$$;

revoke execute on function public.ventas_cotizacion_aprobar(uuid, jsonb) from public, anon;
grant execute on function public.ventas_cotizacion_aprobar(uuid, jsonb) to authenticated;

-- =========================================
-- 5. ventas_pedido_liberar_almacen() — reserva → compromiso
-- =========================================
create or replace function public.ventas_pedido_liberar_almacen(p_pedido_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_pedido record;
  v_estado_cliente jsonb;
  v_filas integer;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'ventas', 'almacen') then
    raise exception 'Sin permisos para liberar un pedido a Almacén.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;

  select * into v_pedido from public.ventas_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido % no encontrado', p_pedido_id using errcode = 'P0002';
  end if;
  if v_pedido.estado <> 'aprobado' then
    raise exception 'Sólo se libera un pedido recién aprobado.' using errcode = '42501';
  end if;

  v_estado_cliente := public.cliente_puede_operar(v_pedido.entidad_id);
  if not (v_estado_cliente->>'puede')::boolean then
    raise exception 'No se puede liberar: %', (v_estado_cliente->>'motivo') using errcode = '42501';
  end if;

  -- Un solo UPDATE que sólo cambia `nivel`: apartados_before_update() no
  -- toca cantidad_apartada cuando `estado` no cambia (011) — el
  -- acumulador queda intacto, sin doble descuento.
  update public.inventario_apartados
     set nivel = 'compromiso'
   where pedido_id = p_pedido_id and estado = 'activo' and nivel = 'reserva';
  get diagnostics v_filas = row_count;

  update public.ventas_pedidos
     set estado = 'liberado', liberado_at = now(), liberado_por = v_actor, updated_at = now()
   where id = p_pedido_id;

  return jsonb_build_object('success', true, 'apartados_promovidos', v_filas);
end;
$$;

revoke execute on function public.ventas_pedido_liberar_almacen(uuid) from public, anon;
grant execute on function public.ventas_pedido_liberar_almacen(uuid) to authenticated;
