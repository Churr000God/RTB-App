-- ==========================================
-- RTB Sistema — 040: reescritura de la máquina de estados de cotización
-- (RTB-VEN-01) — segunda mitad de 039, aplicada después de que 039 hizo
-- commit (los valores de enum 'en_devolucion' ya existen para poder
-- referenciarlos aquí).
--
-- Reescribe, partiendo del cuerpo VIVO verificado con pg_get_functiondef()
-- contra Supabase real (no de 030/031, que 037_roles_comerciales.sql ya
-- había reemplazado):
--  - ventas_cotizacion_cancelar(): ahora sólo cancela desde 'aprobada'
--    (antes 'borrador'/'enviada'); cascada completa (pedido, NR si existe,
--    apartados) cuando no hay entrega; abre ventas_devoluciones en vez de
--    cancelar cuando el pedido ya muestra 'entregado'/'entregado_parcial'.
--  - ventas_cotizacion_linea_before_write(): candado total (no sólo 5
--    columnas de precio) fuera de borrador/enviada — cierra un hueco real
--    (cantidad/descuento/activo eran editables incluso en 'aprobada').
--  - cot_resolucion_motivo_chk: exige motivo también para 'en_devolucion'.
--  - ventas_cotizacion_eliminar() (nueva): borra líneas + cabecera de un
--    borrador en una sola transacción.
--  - ventas_devolucion_resolver() (nueva).
--  - ventas_kpis(): +devoluciones_pendientes.
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

-- =========================================
-- 1. ventas_cotizacion_cancelar() — reescrita
-- =========================================
create or replace function public.ventas_cotizacion_cancelar(p_cotizacion_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_actor uuid := auth.uid();
  v_cot record;
  v_pedido record;
  v_nr record;
  v_dev_folio text;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'gerente_comercial', 'ventas') then
    raise exception 'Sin permisos para cancelar una cotización.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'El motivo es obligatorio para cancelar una cotización.' using errcode = '23514';
  end if;

  select * into v_cot from public.ventas_cotizaciones where id = p_cotizacion_id for update;
  if not found then
    raise exception 'Cotización % no encontrada', p_cotizacion_id using errcode = 'P0002';
  end if;
  if public.current_user_role() = 'ventas' and v_cot.vendedor_id <> v_actor then
    raise exception 'No puedes cancelar la cotización de otro vendedor.' using errcode = '42501';
  end if;

  -- REGLA NUEVA: antes 'borrador' o 'enviada'; ahora sólo 'aprobada' — un
  -- borrador se borra (ventas_cotizacion_eliminar), un enviada se rechaza
  -- (ventas_cotizacion_rechazar).
  if v_cot.estado <> 'aprobada' then
    raise exception 'Sólo se cancela una cotización aprobada.' using errcode = '42501';
  end if;

  select * into v_pedido from public.ventas_pedidos where cotizacion_id = p_cotizacion_id for update;
  if not found then
    -- No debería ocurrir: ventas_cotizacion_aprobar() crea el pedido en la
    -- misma transacción en que aprueba. Guard defensivo, no silencioso.
    raise exception 'La cotización está aprobada pero no tiene pedido asociado — revisar integridad.'
      using errcode = 'P0002';
  end if;

  -- v_nr queda con todos los campos NULL si no existe fila (no lanza) —
  -- ventas_nr_emitir() exige pedido 'aprobado', así que puede existir una
  -- NR 'abierta' sin nada despachado incluso antes de liberar a Almacén.
  select * into v_nr from public.ventas_notas_remision where pedido_id = v_pedido.id;

  if v_pedido.estado in ('entregado', 'entregado_parcial') then
    -- RAMA DEVOLUCIÓN: ya salió mercancía física. No se cancela nada del
    -- pedido/NR/apartados (siguen reflejando lo que de verdad se entregó) —
    -- sólo se abre el registro de seguimiento. El proceso operativo real
    -- (recibir la devolución, reembolso, nota de crédito) es trabajo
    -- futuro, pendiente de Facturación (RTB-PRO-FAC-01).
    insert into public.ventas_devoluciones (cotizacion_id, pedido_id, nr_id, entidad_id, motivo, registrado_por)
    values (p_cotizacion_id, v_pedido.id, v_nr.id, v_cot.entidad_id, btrim(p_motivo), v_actor)
    returning folio into v_dev_folio;

    update public.ventas_cotizaciones
       set estado = 'en_devolucion', resuelta_at = now(), resuelta_por = v_actor,
           motivo_resolucion = btrim(p_motivo), updated_at = now()
     where id = p_cotizacion_id;

    update public.ventas_pedidos
       set estado = 'en_devolucion', updated_at = now()
     where id = v_pedido.id;

    return jsonb_build_object('success', true, 'resultado', 'en_devolucion', 'devolucion_folio', v_dev_folio);
  end if;

  -- RAMA CANCELACIÓN SIMPLE: nada se ha entregado (pedido 'aprobado' o
  -- 'liberado'; NR inexistente o sin nada despachado).
  update public.inventario_apartados
     set estado = 'liberado', motivo_liberacion = 'Cotización cancelada: ' || btrim(p_motivo)
   where pedido_id = v_pedido.id and estado = 'activo';

  if v_nr.id is not null then
    update public.ventas_notas_remision
       set estado = 'cancelada', cancelado_at = now(), cancelado_por = v_actor,
           motivo_cancelacion = btrim(p_motivo), updated_at = now()
     where id = v_nr.id;
  end if;

  update public.ventas_pedidos
     set estado = 'cancelado', cancelado_at = now(), cancelado_por = v_actor,
         motivo_cancelacion = btrim(p_motivo), updated_at = now()
   where id = v_pedido.id;

  update public.ventas_cotizaciones
     set estado = 'cancelada', resuelta_at = now(), resuelta_por = v_actor,
         motivo_resolucion = btrim(p_motivo), updated_at = now()
   where id = p_cotizacion_id;

  return jsonb_build_object('success', true, 'resultado', 'cancelada');
end;
$$;

revoke execute on function public.ventas_cotizacion_cancelar(uuid, text) from public, anon;
grant execute on function public.ventas_cotizacion_cancelar(uuid, text) to authenticated;

-- =========================================
-- 2. ventas_cotizacion_linea_before_write() — candado total, más simple
-- =========================================
-- Antes: comparaba contra el LITERAL 'borrador' (no una lista) y sólo
-- protegía 5 columnas de precio — cantidad/descuento_porcentaje/activo/
-- observaciones eran editables en CUALQUIER estado, incluida 'aprobada'
-- con pedido y reservas ya creados (hueco real, cerrado aquí). Ahora:
-- bloqueo total de INSERT/UPDATE fuera de borrador/enviada — 'enviada'
-- gana el mismo poder de edición que 'borrador' (pedido explícito).
create or replace function public.ventas_cotizacion_linea_before_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado public.ventas_cotizacion_estado;
  v_debe_resolver boolean;
  v_detalle jsonb;
  v_precio numeric;
begin
  select estado into v_estado from public.ventas_cotizaciones
   where id = coalesce(new.cotizacion_id, old.cotizacion_id);

  if v_estado not in ('borrador', 'enviada') then
    raise exception 'Esta cotización ya no admite editar sus líneas (estado %).', v_estado
      using errcode = '42501';
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();

  if new.producto_id is null then
    new.en_consulta := true;
    new.precio_origen := null;
    new.precio_unitario := null;
    new.costo_base_snapshot := null;
    new.margen_snapshot := null;
    return new;
  end if;

  if new.unidad_medida_id is null then
    select unidad_medida_id into new.unidad_medida_id from public.productos where id = new.producto_id;
  end if;

  if new.precio_origen is null then
    -- Producto ya conocido (Compras respondió), pero Ventas aún no elige precio.
    new.en_consulta := true;
    new.precio_unitario := null;
    new.costo_base_snapshot := null;
    new.margen_snapshot := null;
    return new;
  end if;

  v_debe_resolver := (tg_op = 'INSERT')
    or (new.producto_id is distinct from old.producto_id)
    or (new.precio_origen is distinct from old.precio_origen);

  if not v_debe_resolver then
    return new;   -- sólo cambió cantidad/descuento/observaciones: no reabrir el snapshot
  end if;

  if new.precio_origen = 'costo_venta' then
    v_detalle := public.costo_venta_detalle(new.producto_id);
    v_precio := (v_detalle->>'costo_venta')::numeric;
    new.costo_base_snapshot := (v_detalle->>'costo_base')::numeric;
    new.margen_snapshot := (v_detalle->>'margen_porcentaje')::numeric;
  else
    select precio into v_precio
      from public.producto_precios_referencia
     where producto_id = new.producto_id
       and canal = new.precio_origen::text::public.precio_canal
       and vigente_hasta is null
     limit 1;
    new.costo_base_snapshot := null;
    new.margen_snapshot := null;
  end if;

  if v_precio is null then
    raise exception 'Este producto no tiene el precio "%" disponible: no se puede cotizar sin costo.', new.precio_origen
      using errcode = '22023';
  end if;

  new.precio_unitario := v_precio;
  new.en_consulta := false;
  return new;
end;
$$;

revoke execute on function public.ventas_cotizacion_linea_before_write() from public, anon, authenticated;

-- =========================================
-- 3. cot_resolucion_motivo_chk — extendida a 'en_devolucion'
-- =========================================
alter table public.ventas_cotizaciones drop constraint cot_resolucion_motivo_chk;
alter table public.ventas_cotizaciones add constraint cot_resolucion_motivo_chk check (
  estado not in ('rechazada', 'cancelada', 'en_devolucion')
  or length(btrim(coalesce(motivo_resolucion, ''))) > 0
);

-- =========================================
-- 4. ventas_cotizacion_eliminar() — nueva
-- =========================================
create or replace function public.ventas_cotizacion_eliminar(p_cotizacion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_actor uuid := auth.uid();
  v_cot record;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'gerente_comercial', 'ventas') then
    raise exception 'Sin permisos para eliminar una cotización.' using errcode = '42501';
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
    raise exception 'No puedes eliminar la cotización de otro vendedor.' using errcode = '42501';
  end if;
  if v_cot.estado <> 'borrador' then
    raise exception 'Sólo se elimina una cotización en borrador.' using errcode = '42501';
  end if;

  -- Una sola transacción — nunca dos llamadas sueltas desde el cliente
  -- (mismo criterio que el gotcha de 027_ajuste_aplicar_atomico.sql). El
  -- usuario no borra líneas a mano primero: este único botón hace las dos
  -- cosas.
  delete from public.ventas_cotizacion_lineas where cotizacion_id = p_cotizacion_id;
  delete from public.ventas_cotizaciones where id = p_cotizacion_id;

  return jsonb_build_object('success', true, 'folio', v_cot.folio);
end;
$$;

revoke execute on function public.ventas_cotizacion_eliminar(uuid) from public, anon;
grant execute on function public.ventas_cotizacion_eliminar(uuid) to authenticated;

-- =========================================
-- 5. ventas_devolucion_resolver() — nueva
-- =========================================
create or replace function public.ventas_devolucion_resolver(p_devolucion_id uuid, p_notas text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_actor uuid := auth.uid();
  v_dev record;
begin
  -- Resolver una devolución es una confirmación gerencial de que el
  -- proceso físico terminó — no 'ventas' (mismo criterio que quién
  -- autoriza excepciones de subtotal en este módulo).
  if public.current_user_role() not in ('super_admin', 'direccion', 'gerente_comercial') then
    raise exception 'Sin permisos para resolver una devolución.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;

  select * into v_dev from public.ventas_devoluciones where id = p_devolucion_id for update;
  if not found then
    raise exception 'Devolución % no encontrada', p_devolucion_id using errcode = 'P0002';
  end if;
  if v_dev.estado = 'resuelta' then
    raise exception 'Esta devolución ya está resuelta.' using errcode = '42501';
  end if;

  update public.ventas_devoluciones
     set estado = 'resuelta', resuelta_at = now(), resuelta_por = v_actor,
         notas_resolucion = nullif(btrim(coalesce(p_notas, '')), ''), updated_at = now()
   where id = p_devolucion_id;

  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.ventas_devolucion_resolver(uuid, text) from public, anon;
grant execute on function public.ventas_devolucion_resolver(uuid, text) to authenticated;

-- =========================================
-- 6. ventas_kpis() — +devoluciones_pendientes
-- =========================================
create or replace function public.ventas_kpis()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'cotizaciones_borrador', (select count(*) from public.ventas_cotizaciones where estado = 'borrador'),
    'cotizaciones_enviadas', (select count(*) from public.ventas_cotizaciones where estado = 'enviada'),
    'nr_entregadas_sin_po', (select count(*) from public.ventas_notas_remision where estado = 'entregada_sin_po'),
    'nr_parcialmente_respaldadas', (
      select count(*) from public.ventas_notas_remision where estado = 'parcialmente_respaldada'
    ),
    'nr_con_incidencia', (select count(*) from public.ventas_notas_remision where estado = 'con_incidencia'),
    'po_pendiente_confirmacion', (
      select count(*) from public.ventas_ordenes_compra_cliente where estado = 'pendiente_de_confirmacion'
    ),
    'valor_entregado_sin_po', (
      select coalesce(sum(n.valor_total), 0) from public.ventas_notas_remision n
       where n.estado in ('entregada_sin_po', 'parcialmente_respaldada')
    ),
    'autorizaciones_pendientes', (select count(*) from public.ventas_autorizaciones where estado = 'pendiente'),
    'clientes_congelados', (select count(*) from public.cliente_congelamientos where estado = 'activo'),
    'devoluciones_pendientes', (select count(*) from public.ventas_devoluciones where estado = 'pendiente')
  );
$$;

revoke execute on function public.ventas_kpis() from public, anon;
grant execute on function public.ventas_kpis() to authenticated, service_role;
