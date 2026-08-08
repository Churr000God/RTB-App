-- 045_ventas_surtir_solo_almacen.sql
-- RTB-VEN-01 — corrección de negocio pedida por el dueño del proyecto
-- (2026-08-08, misma jornada que 043/044): surtir es trabajo físico de
-- Almacén, no de Ventas. Se retira 'ventas' del guard de rol de AMBAS
-- funciones de despacho (NR y PO) — comparten el mismo criterio de
-- permisos desde su diseño ("mismo conjunto de roles en ambas funciones
-- SQL, un solo lugar que actualizar si algún día divergen", ver 044).
-- 'super_admin'/'direccion'/'gerente_comercial' conservan la capacidad
-- como autoridad de override/soporte — el dueño del proyecto pidió quitar
-- específicamente a 'ventas', no a los roles gerenciales.
--
-- Cuerpo vivo tomado de pg_get_functiondef() antes de tocarlo (mismo
-- criterio de siempre) — el único cambio real en ambas es la lista de
-- roles del primer guard.

create or replace function public.ventas_nr_despachar(p_nr_id uuid, p_lineas jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
  if public.current_user_role() not in ('super_admin', 'direccion', 'gerente_comercial', 'almacen') then
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

    -- Emparejamiento exacto por línea de pedido de origen (035) — antes
    -- se buscaba sólo por producto_id con "order by created_at limit 1",
    -- que elegía en falso entre dos líneas del mismo producto (hallazgo
    -- crítico #1). uq_apartados_pedido_linea_activo garantiza que esta
    -- consulta encuentra como máximo una fila.
    select * into v_apartado from public.inventario_apartados
     where pedido_id = v_pedido.id and pedido_linea_id = v_nr_linea.pedido_linea_id
       and nivel = 'compromiso' and estado = 'activo'
     for update;
    if not found then
      raise exception 'No hay una reserva comprometida para la línea de esta NR (producto %).', v_producto.codigo_interno
        using errcode = 'P0002';
    end if;
    if v_apartado.cantidad < v_cantidad_base then
      raise exception 'La reserva comprometida no alcanza para despachar esa cantidad de la línea (producto %).',
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
    --    fila NUEVA (011 — el alcance de un apartado es inmutable), con
    --    el MISMO pedido_linea_id que el apartado consumido — sigue
    --    siendo la reserva de la misma línea, sólo que por menos
    --    cantidad. Dos sentencias top-level separadas (consumir, luego
    --    insertar), no una sola que confíe en un trigger para degradar
    --    la fila vieja — mismo patrón que exigió 023 para el índice
    --    único de "una fila activa por grupo" (aquí,
    --    uq_apartados_pedido_linea_activo).
    v_remanente_base := v_apartado.cantidad - v_cantidad_base;

    update public.inventario_apartados
       set estado = 'consumido', motivo_liberacion = 'Despachado en ' || v_nr.folio
     where id = v_apartado.id;

    if v_remanente_base > 0 then
      insert into public.inventario_apartados
        (producto_id, ubicacion_id, cantidad, pedido_folio, pedido_id, pedido_linea_id, nivel, solicitante_id)
      values
        (v_apartado.producto_id, v_apartado.ubicacion_id, v_remanente_base, v_apartado.pedido_folio,
         v_apartado.pedido_id, v_apartado.pedido_linea_id, 'compromiso', v_actor);
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
$function$;

create or replace function public.ventas_po_despachar(p_po_id uuid, p_lineas jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_po record;
  v_pedido record;
  v_item record;
  v_partida record;
  v_apartado record;
  v_producto record;
  v_factor numeric;
  v_cantidad_base numeric;
  v_remanente_base numeric;
  v_pendientes integer;
  v_movimientos integer := 0;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'gerente_comercial', 'almacen') then
    raise exception 'Sin permisos para surtir una orden de compra.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;

  select * into v_po from public.ventas_ordenes_compra_cliente where id = p_po_id for update;
  if not found then
    raise exception 'Orden de compra % no encontrada', p_po_id using errcode = 'P0002';
  end if;
  if v_po.pedido_id is null then
    raise exception 'Esta orden de compra no tiene un pedido asociado: no se puede surtir.' using errcode = '42501';
  end if;
  if v_po.estado not in ('abierta', 'parcialmente_surtida') then
    raise exception 'Esta orden de compra ya no admite surtido (estado %).', v_po.estado using errcode = '42501';
  end if;

  select * into v_pedido from public.ventas_pedidos where id = v_po.pedido_id for update;
  if v_pedido.estado not in ('liberado', 'entregado_parcial') then
    raise exception 'El pedido debe estar liberado a Almacén antes de surtir la orden de compra.' using errcode = '42501';
  end if;

  for v_item in select * from jsonb_to_recordset(p_lineas) as x(po_partida_id uuid, cantidad numeric)
  loop
    if v_item.cantidad is null or v_item.cantidad <= 0 then
      raise exception 'Cantidad a surtir inválida.' using errcode = '22023';
    end if;

    select * into v_partida from public.ventas_po_partidas
     where id = v_item.po_partida_id and po_id = p_po_id for update;
    if not found then
      raise exception 'Partida % no encontrada en esta orden de compra', v_item.po_partida_id using errcode = 'P0002';
    end if;
    if v_partida.producto_id is null or v_partida.unidad_medida_id is null or v_partida.pedido_linea_id is null then
      raise exception 'La partida % no tiene producto/unidad/línea de pedido asociados — no se puede surtir.',
        v_item.po_partida_id using errcode = '22023';
    end if;
    if v_item.cantidad > (v_partida.cantidad - v_partida.cantidad_entregada) then
      raise exception 'La partida % ya no tiene esa cantidad pendiente por entregar.', v_item.po_partida_id
        using errcode = '22023';
    end if;

    select * into v_producto from public.productos where id = v_partida.producto_id;
    if v_partida.unidad_medida_id = v_producto.unidad_medida_id then
      v_factor := 1;
    elsif v_producto.unidad_contenido_id is not null and v_partida.unidad_medida_id = v_producto.unidad_contenido_id then
      v_factor := 1 / nullif(v_producto.contenido_por_unidad, 0);
    else
      raise exception 'Unidad de la partida incompatible con el producto %.', v_producto.codigo_interno
        using errcode = '22023';
    end if;
    v_cantidad_base := v_item.cantidad * v_factor;

    -- Emparejamiento exacto por línea de pedido de origen (035/043) —
    -- uq_apartados_pedido_linea_activo garantiza que esta consulta
    -- encuentra como máximo una fila, sin necesidad de order by/limit.
    select * into v_apartado from public.inventario_apartados
     where pedido_id = v_pedido.id and pedido_linea_id = v_partida.pedido_linea_id
       and nivel = 'compromiso' and estado = 'activo'
     for update;
    if not found then
      raise exception 'No hay una reserva comprometida para esta partida (producto %).', v_producto.codigo_interno
        using errcode = 'P0002';
    end if;
    if v_apartado.cantidad < v_cantidad_base then
      raise exception 'La reserva comprometida no alcanza para surtir esa cantidad de la partida (producto %).',
        v_producto.codigo_interno using errcode = '22023';
    end if;

    -- 1) Kardex: salida_venta, referenciando la PO (no una NR). El trigger
    --    valida negativo/congelamiento/decimales y calcula el costo — nada
    --    de eso se duplica aquí. 'ventas' NO está en la RLS de insert de
    --    inventario_movimientos: esta función corre como su dueño y sólo
    --    emite este tipo exacto.
    insert into public.inventario_movimientos
      (tipo, producto_id, ubicacion_id, unidad_captura_id, cantidad_capturada,
       referencia_tipo, referencia_folio, entidad_id, apartado_id)
    values
      ('salida_venta', v_partida.producto_id, v_apartado.ubicacion_id, v_partida.unidad_medida_id, v_item.cantidad,
       'orden_compra_cliente', v_po.folio, v_po.entidad_id, v_apartado.id);
    v_movimientos := v_movimientos + 1;

    -- 2) Consumir el apartado y, si sobra, reinsertar el remanente como
    --    fila NUEVA (el alcance de un apartado es inmutable, 011) — dos
    --    sentencias top-level separadas, en este orden, por
    --    uq_apartados_pedido_linea_activo (mismo patrón que 032/035).
    v_remanente_base := v_apartado.cantidad - v_cantidad_base;

    update public.inventario_apartados
       set estado = 'consumido', motivo_liberacion = 'Surtido en ' || v_po.folio
     where id = v_apartado.id;

    if v_remanente_base > 0 then
      insert into public.inventario_apartados
        (producto_id, ubicacion_id, cantidad, pedido_folio, pedido_id, pedido_linea_id, nivel, solicitante_id)
      values
        (v_apartado.producto_id, v_apartado.ubicacion_id, v_remanente_base, v_apartado.pedido_folio,
         v_apartado.pedido_id, v_apartado.pedido_linea_id, 'compromiso', v_actor);
    end if;

    update public.ventas_po_partidas
       set cantidad_entregada = cantidad_entregada + v_item.cantidad
     where id = v_partida.id;
  end loop;

  select count(*) filter (where cantidad_entregada < cantidad)
    into v_pendientes
    from public.ventas_po_partidas where po_id = p_po_id;

  update public.ventas_ordenes_compra_cliente
     set estado = (case when v_pendientes = 0 then 'surtida' else 'parcialmente_surtida' end)::public.po_estado,
         surtida_at = case when v_pendientes = 0 then now() else surtida_at end,
         updated_at = now()
   where id = p_po_id;

  update public.ventas_pedidos
     set estado = (case when v_pendientes = 0 then 'entregado' else 'entregado_parcial' end)::public.pedido_estado,
         updated_at = now()
   where id = v_pedido.id;

  return jsonb_build_object(
    'success', true, 'po_folio', v_po.folio, 'movimientos_generados', v_movimientos, 'partidas_pendientes', v_pendientes
  );
end;
$function$;
