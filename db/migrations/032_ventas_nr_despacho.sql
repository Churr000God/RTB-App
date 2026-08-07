-- ==========================================
-- RTB Sistema — 032: Nota de Remisión (el tablero de seguimiento) y
-- despacho al kardex (RTB-VEN-01)
--
-- El "por qué" de este archivo es literal en RTB-PRO-VEN-01 §III: el
-- reloj de cobranza de 90 días sólo arranca cuando existe la PO; entre "NR
-- emitida" y "PO recibida" puede pasar tiempo indefinido, y sin un
-- registro activo esa NR queda fuera del radar de cobranza — dinero
-- entregado sin seguimiento. ventas_notas_remision + ventas_nr_lineas son
-- ese registro; ventas_nr_despachar() es el único camino por el que
-- 'ventas' llega a insertar en inventario_movimientos (append-only,
-- irreversible) sin que se le amplíe la RLS de esa tabla — la función
-- corre como el dueño (postgres, sin FORCE ROW LEVEL SECURITY en el
-- proyecto) y sólo emite 'salida_venta' ligada a un apartado del propio
-- pedido, nunca cualquier otro tipo de movimiento.
--
-- ALCANCE DE ESTA ENTREGA: implementa la Vía A (aprobación con NR, sin PO
-- todavía) de RTB-PRO-VEN-01 §II Paso 5, que es la que sostiene todo el
-- subproceso de seguimiento (§III). La Vía B (PO directa, sin NR) queda
-- simplificada: el pedido se aprueba y libera a Almacén igual (031), pero
-- su despacho/entrega sin NR no tiene función dedicada en esta entrega —
-- limitación conocida, documentada en el TODO de CLAUDE.md para cuando el
-- dueño del proyecto decida cómo quiere rastrear esa vía.
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

-- =========================================
-- 1. TABLA: ventas_notas_remision
-- =========================================
create type public.nr_estado as enum (
  'abierta', 'en_preparacion', 'parcialmente_entregada', 'entregada_sin_po',
  'parcialmente_respaldada', 'po_vinculada', 'facturada', 'pagada_cerrada', 'cancelada', 'con_incidencia'
);

create table public.ventas_notas_remision (
  id uuid primary key default gen_random_uuid(),
  folio varchar(16) not null unique,
  -- Una NR por pedido en esta entrega (simplificación de alcance — ver
  -- cabecera): RTB-PRO-VEN-01 no describe partir un pedido entre varias NR.
  pedido_id uuid not null references public.ventas_pedidos(id) on delete restrict,
  entidad_id uuid not null references public.entidades(id) on delete restrict,
  vendedor_id uuid references public.profiles(id),
  moneda char(3) not null,
  estado public.nr_estado not null default 'abierta',
  emitida_at timestamptz not null default now(),
  entregada_at timestamptz,
  valor_total numeric(16, 4),
  ultimo_contacto_at timestamptz,
  nota_ultimo_contacto text,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_ventas_nr_pedido unique (pedido_id)
);

comment on table public.ventas_notas_remision is
  'El tablero de seguimiento de RTB-PRO-VEN-01 §III. facturada/
   pagada_cerrada existen en el enum pero NINGUNA función de esta entrega
   los escribe — los escribirá RTB-PRO-FAC-01 cuando exista. Nace
   únicamente por ventas_nr_emitir(); sin GRANT INSERT/UPDATE para
   authenticated.';

create index idx_ventas_nr_pedido on public.ventas_notas_remision (pedido_id);
create index idx_ventas_nr_entidad on public.ventas_notas_remision (entidad_id);
create index idx_ventas_nr_vendedor on public.ventas_notas_remision (vendedor_id);
create index idx_ventas_nr_estado on public.ventas_notas_remision (estado);

create sequence public.ventas_nr_folio_seq;

create or replace function public.ventas_nr_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.folio is null then
    new.folio := 'NR-' || lpad(nextval('public.ventas_nr_folio_seq')::text, 6, '0');
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

revoke execute on function public.ventas_nr_before_insert() from public, anon, authenticated;

create trigger before_insert_ventas_nr
  before insert on public.ventas_notas_remision
  for each row execute function public.ventas_nr_before_insert();

create trigger audit_ventas_nr after insert or update on public.ventas_notas_remision
  for each row execute function public.audit_row();

revoke all on public.ventas_notas_remision from anon, authenticated;
grant select on public.ventas_notas_remision to authenticated;
grant all on public.ventas_notas_remision to service_role;

alter table public.ventas_notas_remision enable row level security;

-- Visibilidad amplia: el tablero lo leen Ventas, Facturación (qué
-- facturar), Cobranza/Finanzas (seguimiento de cobro), Dirección (cuentas
-- de alto valor) — RTB-PRO-VEN-01 §III RACI.
create policy ventas_nr_select on public.ventas_notas_remision
  for select to authenticated
  using (public.current_user_role() is not null);

-- =========================================
-- 2. TABLA: ventas_nr_lineas
-- =========================================
create table public.ventas_nr_lineas (
  id uuid primary key default gen_random_uuid(),
  nr_id uuid not null references public.ventas_notas_remision(id) on delete restrict,
  pedido_linea_id uuid not null references public.ventas_pedido_lineas(id) on delete restrict,
  producto_id uuid not null references public.productos(id) on delete restrict,
  cantidad numeric(16, 4) not null check (cantidad > 0),
  cantidad_entregada numeric(16, 4) not null default 0 check (cantidad_entregada >= 0),
  unidad_medida_id uuid not null references public.unidades_medida(id) on delete restrict,
  precio_unitario numeric(14, 4) not null check (precio_unitario >= 0),
  importe numeric(18, 4) generated always as (round(cantidad * precio_unitario, 4)) stored,
  constraint nr_linea_entregada_chk check (cantidad_entregada <= cantidad)
);

comment on table public.ventas_nr_lineas is
  'Copia de la línea de pedido en la NR — precio_unitario heredado del
   snapshot, nunca recalculado. cantidad_entregada la actualiza
   exclusivamente ventas_nr_despachar(). Contra esta cantidad (no contra
   pedido_lineas) se calculará "cantidad respaldada por PO" en 033.';

create index idx_ventas_nr_lineas_nr on public.ventas_nr_lineas (nr_id);
create index idx_ventas_nr_lineas_producto on public.ventas_nr_lineas (producto_id);

revoke all on public.ventas_nr_lineas from anon, authenticated;
grant select on public.ventas_nr_lineas to authenticated;
grant all on public.ventas_nr_lineas to service_role;

alter table public.ventas_nr_lineas enable row level security;

create policy ventas_nr_lineas_select on public.ventas_nr_lineas
  for select to authenticated
  using (public.current_user_role() is not null);

-- =========================================
-- 3. TABLA: ventas_nr_seguimientos (el "último contacto" del tablero)
-- =========================================
create table public.ventas_nr_seguimientos (
  id uuid primary key default gen_random_uuid(),
  nr_id uuid not null references public.ventas_notas_remision(id) on delete restrict,
  canal public.canal_origen not null,
  nota text not null,
  created_by uuid not null references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  constraint nr_seg_nota_chk check (length(btrim(nota)) > 0)
);

comment on table public.ventas_nr_seguimientos is
  'Append-only: cada gestión de "perseguir la PO con el cliente"
   (RTB-PRO-VEN-01 §III) queda aquí. Un trigger AFTER INSERT cachea el
   último registro en ventas_notas_remision.ultimo_contacto_at/
   nota_ultimo_contacto para no tener que agregar en cada lectura del
   tablero.';

create index idx_ventas_nr_seg_nr on public.ventas_nr_seguimientos (nr_id, created_at desc);

create or replace function public.ventas_nr_seguimiento_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.ventas_notas_remision
     set ultimo_contacto_at = new.created_at, nota_ultimo_contacto = new.nota, updated_at = now()
   where id = new.nr_id;
  return new;
end;
$$;

revoke execute on function public.ventas_nr_seguimiento_after_insert() from public, anon, authenticated;

create trigger after_insert_ventas_nr_seguimientos
  after insert on public.ventas_nr_seguimientos
  for each row execute function public.ventas_nr_seguimiento_after_insert();

revoke all on public.ventas_nr_seguimientos from anon, authenticated;
grant select on public.ventas_nr_seguimientos to authenticated;
grant insert (nr_id, canal, nota) on public.ventas_nr_seguimientos to authenticated;
grant all on public.ventas_nr_seguimientos to service_role;

alter table public.ventas_nr_seguimientos enable row level security;

create policy ventas_nr_seg_select on public.ventas_nr_seguimientos
  for select to authenticated
  using (public.current_user_role() is not null);
create policy ventas_nr_seg_insert on public.ventas_nr_seguimientos
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'ventas']));

-- =========================================
-- 4. ventas_nr_emitir() — Vía A: registra la NR (RTB-PRO-VEN-01 §II Paso 5-A.1)
-- =========================================
create or replace function public.ventas_nr_emitir(p_pedido_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_pedido record;
  v_nr_id uuid;
  v_nr_folio varchar;
  v_lineas integer;
  v_valor_total numeric;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'ventas') then
    raise exception 'Sin permisos para emitir una nota de remisión.' using errcode = '42501';
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
  if public.current_user_role() = 'ventas' and v_pedido.vendedor_id <> v_actor then
    raise exception 'No puedes emitir la NR de otro vendedor.' using errcode = '42501';
  end if;
  if v_pedido.estado <> 'aprobado' then
    raise exception 'Sólo se emite una NR para un pedido recién aprobado, antes de liberarlo a Almacén.'
      using errcode = '42501';
  end if;
  if exists (select 1 from public.ventas_notas_remision where pedido_id = p_pedido_id) then
    raise exception 'Este pedido ya tiene una NR emitida.' using errcode = '42501';
  end if;

  insert into public.ventas_notas_remision (pedido_id, entidad_id, vendedor_id, moneda)
  values (p_pedido_id, v_pedido.entidad_id, v_pedido.vendedor_id, v_pedido.moneda)
  returning id, folio into v_nr_id, v_nr_folio;

  insert into public.ventas_nr_lineas (nr_id, pedido_linea_id, producto_id, cantidad, unidad_medida_id, precio_unitario)
  select v_nr_id, pl.id, pl.producto_id, pl.cantidad, pl.unidad_medida_id, pl.precio_unitario
    from public.ventas_pedido_lineas pl
   where pl.pedido_id = p_pedido_id;
  get diagnostics v_lineas = row_count;

  select sum(importe) into v_valor_total from public.ventas_nr_lineas where nr_id = v_nr_id;
  update public.ventas_notas_remision set valor_total = coalesce(v_valor_total, 0) where id = v_nr_id;

  return jsonb_build_object('success', true, 'nr_id', v_nr_id, 'folio', v_nr_folio, 'lineas', v_lineas);
end;
$$;

revoke execute on function public.ventas_nr_emitir(uuid) from public, anon;
grant execute on function public.ventas_nr_emitir(uuid) to authenticated;

-- =========================================
-- 5. ventas_nr_despachar() — el kardex real
-- =========================================
-- p_lineas: jsonb array [{"nr_linea_id": uuid, "cantidad": numeric}, ...]
-- en la MISMA unidad en que se capturó la línea de NR — el trigger del
-- kardex (011/012) valida decimales/conversión, no se duplica aquí.
create or replace function public.ventas_nr_despachar(p_nr_id uuid, p_lineas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_nr record;
  v_pedido record;
  v_item record;
  v_nr_linea record;
  v_apartado record;
  v_producto record;
  v_factor numeric;
  v_cantidad_base numeric;
  v_remanente_base numeric;
  v_pendientes integer;
  v_movimientos integer := 0;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'almacen', 'ventas') then
    raise exception 'Sin permisos para despachar una nota de remisión.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;

  select * into v_nr from public.ventas_notas_remision where id = p_nr_id for update;
  if not found then
    raise exception 'NR % no encontrada', p_nr_id using errcode = 'P0002';
  end if;
  if v_nr.estado not in ('abierta', 'en_preparacion', 'parcialmente_entregada') then
    raise exception 'Esta NR ya no admite despacho (estado %).', v_nr.estado using errcode = '42501';
  end if;

  select * into v_pedido from public.ventas_pedidos where id = v_nr.pedido_id for update;
  if v_pedido.estado not in ('liberado', 'entregado_parcial') then
    raise exception 'El pedido debe estar liberado a Almacén antes de despachar.' using errcode = '42501';
  end if;

  for v_item in select * from jsonb_to_recordset(p_lineas) as x(nr_linea_id uuid, cantidad numeric)
  loop
    if v_item.cantidad is null or v_item.cantidad <= 0 then
      raise exception 'Cantidad a despachar inválida.' using errcode = '22023';
    end if;

    select * into v_nr_linea from public.ventas_nr_lineas
     where id = v_item.nr_linea_id and nr_id = p_nr_id for update;
    if not found then
      raise exception 'Línea de NR % no encontrada en esta NR', v_item.nr_linea_id using errcode = 'P0002';
    end if;
    if v_item.cantidad > (v_nr_linea.cantidad - v_nr_linea.cantidad_entregada) then
      raise exception 'La línea % ya no tiene esa cantidad pendiente por entregar.', v_item.nr_linea_id
        using errcode = '22023';
    end if;

    select * into v_producto from public.productos where id = v_nr_linea.producto_id;
    if v_nr_linea.unidad_medida_id = v_producto.unidad_medida_id then
      v_factor := 1;
    elsif v_producto.unidad_contenido_id is not null and v_nr_linea.unidad_medida_id = v_producto.unidad_contenido_id then
      v_factor := 1 / nullif(v_producto.contenido_por_unidad, 0);
    else
      raise exception 'Unidad de la línea incompatible con el producto %.', v_producto.codigo_interno
        using errcode = '22023';
    end if;
    v_cantidad_base := v_item.cantidad * v_factor;

    select * into v_apartado from public.inventario_apartados
     where pedido_id = v_pedido.id and producto_id = v_nr_linea.producto_id
       and nivel = 'compromiso' and estado = 'activo'
     order by created_at
     limit 1
     for update;
    if not found then
      raise exception 'No hay una reserva comprometida para el producto % en este pedido.', v_producto.codigo_interno
        using errcode = 'P0002';
    end if;
    if v_apartado.cantidad < v_cantidad_base then
      raise exception 'La reserva comprometida no alcanza para despachar esa cantidad del producto %.',
        v_producto.codigo_interno using errcode = '22023';
    end if;

    -- 1) Kardex: salida_venta. El trigger valida negativo/congelamiento/
    --    decimales y calcula el costo — nada de eso se duplica aquí.
    --    'ventas' NO está en la RLS de insert de inventario_movimientos:
    --    esta función corre como su dueño y sólo emite este tipo exacto.
    insert into public.inventario_movimientos
      (tipo, producto_id, ubicacion_id, unidad_captura_id, cantidad_capturada,
       referencia_tipo, referencia_folio, entidad_id, apartado_id)
    values
      ('salida_venta', v_nr_linea.producto_id, v_apartado.ubicacion_id, v_nr_linea.unidad_medida_id, v_item.cantidad,
       'nota_remision', v_nr.folio, v_nr.entidad_id, v_apartado.id);
    v_movimientos := v_movimientos + 1;

    -- 2) Consumir el apartado. Despacho parcial: el remanente nace como
    --    fila NUEVA (011 — el alcance de un apartado es inmutable).
    --    Consumir TODO + reinstalar el remanente neta correctamente
    --    cantidad_apartada: decrementa por el total, incrementa por el
    --    remanente = decremento neto de lo realmente despachado, sin
    --    tocar el acumulador dos veces por separado.
    v_remanente_base := v_apartado.cantidad - v_cantidad_base;

    update public.inventario_apartados
       set estado = 'consumido', motivo_liberacion = 'Despachado en ' || v_nr.folio
     where id = v_apartado.id;

    if v_remanente_base > 0 then
      insert into public.inventario_apartados
        (producto_id, ubicacion_id, cantidad, pedido_folio, pedido_id, nivel, solicitante_id)
      values
        (v_apartado.producto_id, v_apartado.ubicacion_id, v_remanente_base, v_apartado.pedido_folio,
         v_apartado.pedido_id, 'compromiso', v_actor);
    end if;

    update public.ventas_nr_lineas
       set cantidad_entregada = cantidad_entregada + v_item.cantidad
     where id = v_nr_linea.id;
  end loop;

  select count(*) filter (where cantidad_entregada < cantidad)
    into v_pendientes
    from public.ventas_nr_lineas where nr_id = p_nr_id;

  update public.ventas_notas_remision
     set estado = case when v_pendientes = 0 then 'entregada_sin_po' else 'parcialmente_entregada' end::public.nr_estado,
         entregada_at = case when v_pendientes = 0 then now() else entregada_at end,
         updated_at = now()
   where id = p_nr_id;

  update public.ventas_pedidos
     set estado = case when v_pendientes = 0 then 'entregado' else 'entregado_parcial' end::public.pedido_estado,
         updated_at = now()
   where id = v_pedido.id;

  return jsonb_build_object('success', true, 'movimientos_generados', v_movimientos, 'lineas_pendientes', v_pendientes);
end;
$$;

revoke execute on function public.ventas_nr_despachar(uuid, jsonb) from public, anon;
grant execute on function public.ventas_nr_despachar(uuid, jsonb) to authenticated;
