-- 044_ventas_po_funciones.sql
-- RTB-VEN-01 — Vía B, capa de funciones. Continuación de 043 (esquema).
-- Aplicar SIEMPRE después de 043: tiene_operaciones_abiertas()/ventas_kpis()
-- son "language sql" y Postgres valida sus literales de enum en el CREATE,
-- no al invocarlas — si este archivo se aplicara antes del swap de po_estado
-- en 043, el CREATE OR REPLACE fallaría.
--
-- Todo cuerpo de función reescrito aquí partió de pg_get_functiondef()
-- contra la base viva (no del texto de 037/040), para no revertir en
-- silencio los fixes de sesiones anteriores.

-- =========================================================================
-- 1. tiene_operaciones_abiertas() — ciclo de PO nuevo
-- =========================================================================

create or replace function public.tiene_operaciones_abiertas(p_entidad_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.ventas_cotizaciones c
     where c.entidad_id = p_entidad_id and c.estado in ('borrador', 'enviada', 'aprobada')
    union all
    select 1 from public.ventas_pedidos p
     where p.entidad_id = p_entidad_id and p.estado not in ('cerrado', 'cancelado')
    union all
    select 1 from public.ventas_notas_remision n
     where n.entidad_id = p_entidad_id
       and n.estado in ('abierta', 'en_preparacion', 'parcialmente_entregada',
                         'entregada_sin_po', 'parcialmente_respaldada', 'con_incidencia')
    union all
    select 1 from public.ventas_ordenes_compra_cliente o
     where o.entidad_id = p_entidad_id
       and o.estado in ('abierta', 'parcialmente_surtida', 'surtida', 'facturada')
  )
  where p_entidad_id is not null;
$function$;

-- =========================================================================
-- 2. ventas_kpis() — po_pendiente_confirmacion → po_por_surtir
-- =========================================================================

create or replace function public.ventas_kpis()
returns jsonb
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'cotizaciones_borrador', (select count(*) from public.ventas_cotizaciones where estado = 'borrador'),
    'cotizaciones_enviadas', (select count(*) from public.ventas_cotizaciones where estado = 'enviada'),
    'nr_entregadas_sin_po', (select count(*) from public.ventas_notas_remision where estado = 'entregada_sin_po'),
    'nr_parcialmente_respaldadas', (
      select count(*) from public.ventas_notas_remision where estado = 'parcialmente_respaldada'
    ),
    'nr_con_incidencia', (select count(*) from public.ventas_notas_remision where estado = 'con_incidencia'),
    'po_por_surtir', (
      select count(*) from public.ventas_ordenes_compra_cliente where estado in ('abierta', 'parcialmente_surtida')
    ),
    'valor_entregado_sin_po', (
      select coalesce(sum(n.valor_total), 0) from public.ventas_notas_remision n
       where n.estado in ('entregada_sin_po', 'parcialmente_respaldada')
    ),
    'autorizaciones_pendientes', (select count(*) from public.ventas_autorizaciones where estado = 'pendiente'),
    'clientes_congelados', (select count(*) from public.cliente_congelamientos where estado = 'activo'),
    'devoluciones_pendientes', (select count(*) from public.ventas_devoluciones where estado = 'pendiente')
  );
$function$;

-- =========================================================================
-- 3. ventas_cotizacion_aprobar() — bifurcación NR / PO
-- =========================================================================

create or replace function public.ventas_cotizacion_aprobar(p_cotizacion_id uuid, p_aprobacion jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
  v_via public.pedido_via;
  v_numero_po text;
  v_numero_po_normalizado text;
  v_po_id uuid;
  v_po_folio varchar;
  v_total_lineas numeric;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'gerente_comercial', 'ventas') then
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

  -- Vía elegida (043): 'nota_remision' por omisión, para no romper a
  -- ningún llamador existente que aún no mande 'via' en el payload.
  v_via := coalesce(nullif(p_aprobacion->>'via', ''), 'nota_remision')::public.pedido_via;

  if v_via = 'orden_compra' then
    v_numero_po := nullif(btrim(p_aprobacion->>'numero_po'), '');
    if v_numero_po is null then
      raise exception 'Falta el número de PO del cliente para aprobar por esta vía.' using errcode = '22023';
    end if;

    -- Mismo criterio de normalización que la columna generada
    -- numero_po_normalizado (033): nullif(upper(btrim(...)), '') — replicado
    -- aquí para dar un mensaje de negocio legible antes de que el índice
    -- único (uq_po_numero) lo rechace con un 23505 crudo.
    v_numero_po_normalizado := nullif(upper(btrim(v_numero_po)), '');
    if exists (
      select 1 from public.ventas_ordenes_compra_cliente
       where entidad_id = v_cot.entidad_id
         and numero_po_normalizado = v_numero_po_normalizado
         and estado <> 'cancelada'
    ) then
      raise exception 'Ya existe una PO con ese número para este cliente — revisa si es duplicada.'
        using errcode = '22023';
    end if;
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

  insert into public.ventas_pedidos (cotizacion_id, entidad_id, vendedor_id, moneda, requiere_po, via)
  values (p_cotizacion_id, v_cot.entidad_id, v_cot.vendedor_id, v_cot.moneda, coalesce(v_requiere_po, false), v_via)
  returning id, folio into v_pedido_id, v_pedido_folio;

  insert into public.ventas_pedido_lineas
    (pedido_id, cotizacion_linea_id, producto_id, cantidad, unidad_medida_id, precio_unitario, descuento_porcentaje)
  select v_pedido_id, l.id, l.producto_id, l.cantidad, l.unidad_medida_id, l.precio_unitario, l.descuento_porcentaje
    from public.ventas_cotizacion_lineas l
   where l.cotizacion_id = p_cotizacion_id and l.activo;

  -- Una reserva por línea, en unidad BASE del producto (mismo factor de
  -- conversión que valida el kardex, 011) — inventario_apartados.cantidad
  -- siempre está en unidad base, sin excepción. pedido_linea_id (035) es
  -- lo que permite a ventas_nr_despachar()/ventas_po_despachar() emparejar
  -- sin ambigüedad cuando dos líneas comparten producto.
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
      (producto_id, ubicacion_id, cantidad, pedido_folio, pedido_id, pedido_linea_id, nivel, solicitante_id)
    values
      (v_linea.producto_id, v_ubicacion, v_cantidad_base, v_pedido_folio, v_pedido_id, v_linea.pedido_linea_id,
       'reserva', v_actor);
  end loop;

  -- Vía B (043): la PO nace aquí, en la misma transacción que el pedido,
  -- con sus partidas copiadas 1:1 de las líneas recién insertadas — nunca
  -- se vuelve a teclear a mano lo que el sistema ya tiene.
  if v_via = 'orden_compra' then
    select coalesce(sum(importe), 0) into v_total_lineas
      from public.ventas_pedido_lineas where pedido_id = v_pedido_id;

    insert into public.ventas_ordenes_compra_cliente
      (numero_po, entidad_id, pedido_id, cotizacion_id, moneda,
       subtotal_declarado, total_declarado, fecha_po, canal_entrega, evidencia_path,
       razon_social_declarada, rfc_declarado)
    select
      v_numero_po, v_cot.entidad_id, v_pedido_id, p_cotizacion_id, v_cot.moneda,
      coalesce(nullif(p_aprobacion->>'subtotal_declarado', '')::numeric, v_total_lineas),
      coalesce(nullif(p_aprobacion->>'total_declarado', '')::numeric, v_total_lineas),
      nullif(p_aprobacion->>'fecha_po', '')::date,
      nullif(p_aprobacion->>'canal_entrega', '')::public.canal_origen,
      nullif(p_aprobacion->>'evidencia_path', ''),
      left(e.nombre_legal, 255), e.rfc
    from public.entidades e where e.id = v_cot.entidad_id
    returning id, folio into v_po_id, v_po_folio;

    -- row_number() con pl.id de desempate: todas las líneas de este
    -- pedido nacieron del mismo INSERT ... SELECT de arriba y comparten
    -- created_at al microsegundo dentro de la misma transacción — "order
    -- by created_at" solo sería arbitrario (mismo gotcha ya documentado
    -- para ventas_nr_despachar()/035).
    insert into public.ventas_po_partidas
      (po_id, pedido_id, linea_numero, descripcion, cantidad, precio_unitario,
       producto_id, unidad_medida_id, pedido_linea_id)
    select
      v_po_id, v_pedido_id,
      row_number() over (order by pl.created_at, pl.id),
      coalesce(pr.descripcion, pr.nombre),
      pl.cantidad, pl.precio_unitario, pl.producto_id, pl.unidad_medida_id, pl.id
    from public.ventas_pedido_lineas pl
    join public.productos pr on pr.id = pl.producto_id
    where pl.pedido_id = v_pedido_id;
  end if;

  update public.ventas_cotizaciones
     set estado = 'aprobada', resuelta_at = now(), resuelta_por = v_actor, updated_at = now()
   where id = p_cotizacion_id;

  return jsonb_build_object(
    'success', true, 'pedido_id', v_pedido_id, 'pedido_folio', v_pedido_folio, 'lineas', v_lineas,
    'via', v_via, 'po_id', v_po_id, 'po_folio', v_po_folio
  );
end;
$function$;

-- =========================================================================
-- 4. ventas_nr_emitir() — un pedido de Vía B no lleva NR
-- =========================================================================

create or replace function public.ventas_nr_emitir(p_pedido_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_pedido record;
  v_nr_id uuid;
  v_nr_folio varchar;
  v_lineas integer;
  v_valor_total numeric;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'gerente_comercial', 'ventas') then
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
  if v_pedido.via = 'orden_compra' then
    raise exception 'Este pedido se aprobó como orden de compra del cliente: se surte desde la PO, sin nota de remisión.'
      using errcode = '42501';
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
$function$;

-- =========================================================================
-- 5. ventas_po_adjuntar_evidencia() — nueva
-- =========================================================================

create or replace function public.ventas_po_adjuntar_evidencia(p_po_id uuid, p_path text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_po record;
  v_path text;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'gerente_comercial', 'ventas') then
    raise exception 'Sin permisos para adjuntar el documento de una orden de compra.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;

  v_path := nullif(btrim(p_path), '');
  if v_path is null then
    raise exception 'Falta la ruta del archivo.' using errcode = '22023';
  end if;

  select * into v_po from public.ventas_ordenes_compra_cliente where id = p_po_id for update;
  if not found then
    raise exception 'Orden de compra % no encontrada', p_po_id using errcode = 'P0002';
  end if;
  if v_po.estado = 'cancelada' then
    raise exception 'No se puede adjuntar un documento a una orden de compra cancelada.' using errcode = '42501';
  end if;

  update public.ventas_ordenes_compra_cliente
     set evidencia_path = v_path, updated_at = now()
   where id = p_po_id;

  return jsonb_build_object('success', true, 'evidencia_path', v_path);
end;
$function$;

revoke execute on function public.ventas_po_adjuntar_evidencia(uuid, text) from public, anon;
grant execute on function public.ventas_po_adjuntar_evidencia(uuid, text) to authenticated;

-- =========================================================================
-- 6. ventas_po_despachar() — espejo de ventas_nr_despachar() (037), Vía B
-- =========================================================================

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
  if public.current_user_role() not in ('super_admin', 'direccion', 'gerente_comercial', 'almacen', 'ventas') then
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

revoke execute on function public.ventas_po_despachar(uuid, jsonb) from public, anon;
grant execute on function public.ventas_po_despachar(uuid, jsonb) to authenticated;

-- =========================================================================
-- 7. ventas_po_cancelar() — nueva, sin consumidor de UI en esta entrega
--    (ver TODO en CLAUDE.md); la cancelación de negocio real pasa por
--    ventas_cotizacion_cancelar() (§8), que la invoca por UPDATE directo.
--    Se crea de todas formas para poder cancelar una PO huérfana desde SQL
--    en QA/soporte sin tener que tocar la cotización.
-- =========================================================================

create or replace function public.ventas_po_cancelar(p_po_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_po record;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'gerente_comercial') then
    raise exception 'Sin permisos para cancelar una orden de compra.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'El motivo es obligatorio para cancelar una orden de compra.' using errcode = '23514';
  end if;

  select * into v_po from public.ventas_ordenes_compra_cliente where id = p_po_id for update;
  if not found then
    raise exception 'Orden de compra % no encontrada', p_po_id using errcode = 'P0002';
  end if;
  if v_po.estado = 'cancelada' then
    raise exception 'Esta orden de compra ya está cancelada.' using errcode = '42501';
  end if;
  if v_po.estado <> 'abierta' then
    raise exception 'Esta orden de compra ya tiene mercancía surtida: la salida es una devolución, no una cancelación.'
      using errcode = '42501';
  end if;

  update public.ventas_ordenes_compra_cliente
     set estado = 'cancelada', cancelada_at = now(), cancelada_por = v_actor,
         motivo_cancelacion = btrim(p_motivo), updated_at = now()
   where id = p_po_id;

  return jsonb_build_object('success', true);
end;
$function$;

revoke execute on function public.ventas_po_cancelar(uuid, text) from public, anon;
grant execute on function public.ventas_po_cancelar(uuid, text) to authenticated;

-- =========================================================================
-- 8. ventas_cotizacion_cancelar() — corrige valor_entregado=0 en Vía B y
--    cancela la PO en la rama de cancelación limpia
-- =========================================================================

create or replace function public.ventas_cotizacion_cancelar(p_cotizacion_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_cot record;
  v_pedido record;
  v_nr record;
  v_po record;
  v_valor numeric;
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

  if v_cot.estado <> 'aprobada' then
    raise exception 'Sólo se cancela una cotización aprobada.' using errcode = '42501';
  end if;

  select * into v_pedido from public.ventas_pedidos where cotizacion_id = p_cotizacion_id for update;
  if not found then
    raise exception 'La cotización está aprobada pero no tiene pedido asociado — revisar integridad.'
      using errcode = 'P0002';
  end if;

  select * into v_nr from public.ventas_notas_remision where pedido_id = v_pedido.id;
  select * into v_po from public.ventas_ordenes_compra_cliente
   where pedido_id = v_pedido.id and estado <> 'cancelada'
   order by created_at desc limit 1;

  if v_pedido.estado in ('entregado', 'entregado_parcial') then
    -- 043: en Vía B (v_pedido.via = 'orden_compra') no hay ventas_nr_lineas
    -- que sumar — el select original sobre esa tabla devolvía 0 filas y la
    -- devolución nacía mintiendo con valor_entregado = 0. Se bifurca por
    -- la fuente real de "cuánto se entregó" según la vía.
    if v_pedido.via = 'orden_compra' then
      select coalesce(sum(pp.cantidad_entregada * pp.precio_unitario), 0) into v_valor
        from public.ventas_po_partidas pp
        join public.ventas_ordenes_compra_cliente po on po.id = pp.po_id
       where po.pedido_id = v_pedido.id and po.estado <> 'cancelada';
    else
      select coalesce(sum(l.cantidad_entregada * l.precio_unitario), 0) into v_valor
        from public.ventas_nr_lineas l
       where l.nr_id = v_nr.id;
    end if;

    insert into public.ventas_devoluciones
      (cotizacion_id, pedido_id, nr_id, po_id, entidad_id, motivo, registrado_por, valor_entregado)
    values
      (p_cotizacion_id, v_pedido.id, v_nr.id, v_po.id, v_cot.entidad_id, btrim(p_motivo), v_actor, round(v_valor, 4))
    returning folio into v_dev_folio;

    update public.ventas_cotizaciones
       set estado = 'en_devolucion', resuelta_at = now(), resuelta_por = v_actor,
           motivo_resolucion = btrim(p_motivo), updated_at = now()
     where id = p_cotizacion_id;

    update public.ventas_pedidos
       set estado = 'en_devolucion', updated_at = now()
     where id = v_pedido.id;

    -- La PO (si hay) NO se toca aquí: queda parcialmente_surtida/surtida,
    -- que es la verdad (hubo entrega). Su cierre tras resolver la
    -- devolución no está construido en esta entrega — ver TODO.

    return jsonb_build_object(
      'success', true, 'resultado', 'en_devolucion',
      'devolucion_folio', v_dev_folio, 'valor_entregado', round(v_valor, 4)
    );
  end if;

  update public.inventario_apartados
     set estado = 'liberado', motivo_liberacion = 'Cotización cancelada: ' || btrim(p_motivo)
   where pedido_id = v_pedido.id and estado = 'activo';

  if v_nr.id is not null then
    update public.ventas_notas_remision
       set estado = 'cancelada', cancelado_at = now(), cancelado_por = v_actor,
           motivo_cancelacion = btrim(p_motivo), updated_at = now()
     where id = v_nr.id;
  end if;

  -- 043: cancelación limpia de la PO de Vía B (si existe y no ha surtido
  -- nada — si hubiera surtido algo, v_pedido.estado ya habría entrado en
  -- la rama de devolución de arriba). UPDATE directo, no
  -- ventas_po_cancelar(): esa función exige rol
  -- super_admin/direccion/gerente_comercial, más estrecho que quien puede
  -- cancelar una cotización (incluye 'ventas').
  if v_po.id is not null then
    update public.ventas_ordenes_compra_cliente
       set estado = 'cancelada', cancelada_at = now(), cancelada_por = v_actor,
           motivo_cancelacion = 'Cotización cancelada: ' || btrim(p_motivo), updated_at = now()
     where id = v_po.id;
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
$function$;
