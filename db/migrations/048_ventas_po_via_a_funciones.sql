-- 048_ventas_po_via_a_funciones.sql
-- RTB-VEN-01 — Vía A: funciones. Continúa 046/047 (ya en commit).
-- Toda función preexistente que se reescribe parte de su cuerpo VIVO
-- (pg_get_functiondef(), obtenido justo antes de escribir este archivo),
-- nunca del texto de una migración anterior — 043/044/045 ya reemplazaron
-- varias, y usar el texto viejo revertiría esos fixes en silencio.

-- ── Helpers internos (sin GRANT a authenticated: se invocan sólo desde
--    otras funciones SECURITY DEFINER, que corren como su dueño) ────────

create or replace function public.ventas_nr_recalcular_estado(p_nr_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_nr record;
  v_entrega_completa boolean;
  v_lineas_sin_respaldo integer;
  v_algo_respaldado boolean;
  v_nuevo public.nr_estado;
begin
  select * into v_nr from public.ventas_notas_remision where id = p_nr_id;
  -- Sólo estados posteriores a la entrega — nunca toca abierta/en_preparacion
  -- (nada que respaldar todavía) ni facturada/pagada_cerrada/cancelada/
  -- con_incidencia (fuera del ciclo de respaldo).
  if v_nr.estado not in ('entregada_sin_po', 'parcialmente_entregada', 'parcialmente_respaldada', 'po_vinculada') then
    return;
  end if;

  select count(*) filter (where cantidad_entregada < cantidad) = 0
    into v_entrega_completa
    from public.ventas_nr_lineas where nr_id = p_nr_id;

  -- Por línea, nunca por agregado de toda la NR (anti-defecto #3 de
  -- ventas_po_validar(), 033: ahí una sobrecobertura en una línea podía
  -- compensar una infracobertura en otra). Excluye vínculos de una PO
  -- congelada (pendiente_de_autorizacion) — ésos no cuentan como respaldo
  -- real todavía.
  select
    count(*) filter (
      where nl.cantidad_entregada > 0 and nl.cantidad_entregada > coalesce(v.cubierta, 0)
    ),
    bool_or(nl.cantidad_entregada > 0 and coalesce(v.cubierta, 0) > 0)
  into v_lineas_sin_respaldo, v_algo_respaldado
  from public.ventas_nr_lineas nl
  left join lateral (
    select sum(vv.cantidad_cubierta) as cubierta
    from public.ventas_po_nr_vinculos vv
    join public.ventas_po_partidas pp on pp.id = vv.po_partida_id
    join public.ventas_ordenes_compra_cliente po on po.id = pp.po_id
    where vv.nr_linea_id = nl.id
      and vv.estado in ('validado', 'aprobado_para_facturacion', 'facturado')
      and po.estado <> 'pendiente_de_autorizacion'
  ) v on true
  where nl.nr_id = p_nr_id;

  if not v_entrega_completa then
    v_nuevo := 'parcialmente_entregada';
  elsif v_lineas_sin_respaldo = 0 then
    v_nuevo := 'po_vinculada';
  elsif coalesce(v_algo_respaldado, false) then
    v_nuevo := 'parcialmente_respaldada';
  else
    v_nuevo := 'entregada_sin_po';
  end if;

  if v_nuevo is distinct from v_nr.estado then
    update public.ventas_notas_remision set estado = v_nuevo, updated_at = now() where id = p_nr_id;
  end if;
end;
$function$;

revoke execute on function public.ventas_nr_recalcular_estado(uuid) from public, anon, authenticated;

create or replace function public.ventas_po_recalcular_estado(p_po_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_po record;
  v_compromiso_pendientes integer;
  v_compromiso_iniciado boolean;
  v_respaldo_pendiente integer;
  v_nuevo public.po_estado;
begin
  select * into v_po from public.ventas_ordenes_compra_cliente where id = p_po_id;
  -- Nunca descongela sola (pendiente_de_autorizacion) ni toca un estado
  -- terminal (cancelada/facturada/pagada_cerrada).
  if v_po.estado in ('pendiente_de_autorizacion', 'cancelada', 'facturada', 'pagada_cerrada') then
    return;
  end if;

  select
    count(*) filter (where cantidad_entregada < cantidad),
    bool_or(cantidad_entregada > 0)
  into v_compromiso_pendientes, v_compromiso_iniciado
  from public.ventas_po_partidas where po_id = p_po_id and tipo = 'compromiso';

  select count(*) into v_respaldo_pendiente
    from public.ventas_po_partidas pp
   where pp.po_id = p_po_id and pp.tipo = 'respaldo'
     and not exists (
       select 1 from public.ventas_po_nr_vinculos v
        where v.po_partida_id = pp.id and v.estado in ('validado', 'aprobado_para_facturacion', 'facturado')
     );

  if coalesce(v_compromiso_pendientes, 0) = 0 and v_respaldo_pendiente = 0 then
    v_nuevo := 'vinculada';
  elsif coalesce(v_compromiso_pendientes, 0) > 0 and coalesce(v_compromiso_iniciado, false) then
    v_nuevo := 'parcialmente_surtida';
  else
    v_nuevo := 'abierta';
  end if;

  if v_nuevo is distinct from v_po.estado then
    update public.ventas_ordenes_compra_cliente
       set estado = v_nuevo,
           surtida_at = case when v_nuevo = 'vinculada' and surtida_at is null then now() else surtida_at end,
           updated_at = now()
     where id = p_po_id;
  end if;
end;
$function$;

revoke execute on function public.ventas_po_recalcular_estado(uuid) from public, anon, authenticated;

create or replace function public.ventas_po_nrs_afectadas(p_po_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(array_agg(distinct l2.nr_id), '{}'::uuid[])
  from public.ventas_po_nr_vinculos v
  join public.ventas_po_partidas pp on pp.id = v.po_partida_id
  join public.ventas_nr_lineas l2 on l2.id = v.nr_linea_id
  where pp.po_id = p_po_id and v.estado in ('validado', 'aprobado_para_facturacion', 'facturado');
$function$;

revoke execute on function public.ventas_po_nrs_afectadas(uuid) from public, anon, authenticated;

-- Inserta partidas de respaldo (ya entregadas por una NR) y de compromiso
-- nuevas (producto de catálogo sin cotización, caso N) sobre una PO que ya
-- existe. Compartida por ventas_po_crear_desde_nr() y
-- ventas_po_resolver_autorizacion() (al materializar una ampliación
-- aprobada) — un solo lugar que valida/inserta, para que ambos caminos no
-- diverjan. NO llama a ventas_nr_recalcular_estado() por sí misma: el
-- llamador decide primero si la PO queda congelada por divergencia de
-- precio, y sólo entonces recalcula — recalcular antes reflejaría un
-- respaldo que está a punto de dejar de contar.
create or replace function public.ventas_po_agregar_partidas(p_po_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_po record;
  v_siguiente_numero integer;
  v_item record;
  v_nr_linea record;
  v_partida_id uuid;
  v_producto record;
  v_factor numeric;
  v_cantidad_base numeric;
  v_ubicacion uuid;
  v_divergencias jsonb := '[]'::jsonb;
  v_nr_ids_afectados uuid[] := '{}';
  v_respaldo_count integer := 0;
  v_compromiso_count integer := 0;
begin
  select * into v_po from public.ventas_ordenes_compra_cliente where id = p_po_id for update;
  if not found then
    raise exception 'Orden de compra % no encontrada', p_po_id using errcode = 'P0002';
  end if;

  select coalesce(max(linea_numero), 0) into v_siguiente_numero from public.ventas_po_partidas where po_id = p_po_id;

  -- Partidas de respaldo: cubren mercancía YA ENTREGADA por una NR.
  -- cantidad_entregada nace igual a cantidad (es la verdad: ya salió del
  -- almacén) — po_partida_respaldo_chk (047) lo exige.
  for v_item in select * from jsonb_to_recordset(coalesce(p_payload->'respaldo', '[]'::jsonb))
    as x(nr_linea_id uuid, cantidad numeric, precio_unitario numeric)
  loop
    if v_item.cantidad is null or v_item.cantidad <= 0 then
      raise exception 'Cantidad de respaldo inválida.' using errcode = '22023';
    end if;
    if v_item.precio_unitario is null or v_item.precio_unitario < 0 then
      raise exception 'Precio unitario de respaldo inválido.' using errcode = '22023';
    end if;

    select nl.*, nr.entidad_id as nr_entidad_id, nr.folio as nr_folio,
           pr.descripcion as producto_descripcion, pr.nombre as producto_nombre
      into v_nr_linea
      from public.ventas_nr_lineas nl
      join public.ventas_notas_remision nr on nr.id = nl.nr_id
      join public.productos pr on pr.id = nl.producto_id
     where nl.id = v_item.nr_linea_id
     for update of nl;
    if not found then
      raise exception 'Línea de NR % no encontrada', v_item.nr_linea_id using errcode = 'P0002';
    end if;
    if v_nr_linea.nr_entidad_id <> v_po.entidad_id then
      raise exception 'La línea de NR % no pertenece al cliente de esta orden de compra.', v_item.nr_linea_id
        using errcode = '22023';
    end if;

    v_siguiente_numero := v_siguiente_numero + 1;
    insert into public.ventas_po_partidas
      (po_id, linea_numero, descripcion, cantidad, precio_unitario, producto_id, unidad_medida_id,
       cantidad_entregada, tipo)
    values
      (p_po_id, v_siguiente_numero, coalesce(v_nr_linea.producto_descripcion, v_nr_linea.producto_nombre),
       v_item.cantidad, v_item.precio_unitario, v_nr_linea.producto_id, v_nr_linea.unidad_medida_id,
       v_item.cantidad, 'respaldo')
    returning id into v_partida_id;

    -- El trigger diferido vinculo_valida_cobertura_nr()/_partida() (033)
    -- rechaza al COMMIT si esta cantidad excede lo disponible — es el
    -- requisito 3 (una línea de NR ya cubierta del todo no vuelve a
    -- estar disponible) hecho cumplir por el propio esquema.
    insert into public.ventas_po_nr_vinculos
      (po_partida_id, nr_linea_id, cantidad_cubierta, monto_cubierto, estado, created_by)
    values
      (v_partida_id, v_item.nr_linea_id, v_item.cantidad,
       round(v_item.cantidad * v_item.precio_unitario, 4), 'validado', v_actor);

    if v_item.precio_unitario <> v_nr_linea.precio_unitario then
      v_divergencias := v_divergencias || jsonb_build_object(
        'po_partida_id', v_partida_id, 'nr_folio', v_nr_linea.nr_folio, 'nr_linea_id', v_item.nr_linea_id,
        'precio_nr', v_nr_linea.precio_unitario, 'precio_po', v_item.precio_unitario,
        'diferencia', round(v_item.cantidad * (v_item.precio_unitario - v_nr_linea.precio_unitario), 4)
      );
    end if;

    if not (v_nr_linea.nr_id = any(v_nr_ids_afectados)) then
      v_nr_ids_afectados := array_append(v_nr_ids_afectados, v_nr_linea.nr_id);
    end if;
    v_respaldo_count := v_respaldo_count + 1;
  end loop;

  -- Partidas de compromiso nuevas (caso N): producto del catálogo sin
  -- cotización de origen — apartan por po_partida_id (047), nunca por
  -- pedido_linea_id, porque no hay pedido.
  for v_item in select * from jsonb_to_recordset(coalesce(p_payload->'compromiso_nuevas', '[]'::jsonb))
    as x(producto_id uuid, cantidad numeric, unidad_medida_id uuid, precio_unitario numeric, codigo_cliente text)
  loop
    if v_item.producto_id is null then
      raise exception 'Toda partida nueva debe traer un producto del catálogo.' using errcode = '22023';
    end if;
    if v_item.cantidad is null or v_item.cantidad <= 0 then
      raise exception 'Cantidad inválida en una partida nueva.' using errcode = '22023';
    end if;
    if v_item.precio_unitario is null or v_item.precio_unitario < 0 then
      raise exception 'Precio unitario inválido en una partida nueva.' using errcode = '22023';
    end if;

    select * into v_producto from public.productos where id = v_item.producto_id;
    if not found then
      raise exception 'Producto % no encontrado', v_item.producto_id using errcode = 'P0002';
    end if;
    if v_item.unidad_medida_id = v_producto.unidad_medida_id then
      v_factor := 1;
    elsif v_producto.unidad_contenido_id is not null and v_item.unidad_medida_id = v_producto.unidad_contenido_id then
      v_factor := 1 / nullif(v_producto.contenido_por_unidad, 0);
    else
      raise exception 'Unidad incompatible con el producto %.', v_producto.codigo_interno using errcode = '22023';
    end if;
    v_cantidad_base := v_item.cantidad * v_factor;

    v_siguiente_numero := v_siguiente_numero + 1;
    insert into public.ventas_po_partidas
      (po_id, linea_numero, descripcion, cantidad, precio_unitario, producto_id, unidad_medida_id,
       codigo_cliente, tipo)
    values
      (p_po_id, v_siguiente_numero, coalesce(v_producto.descripcion, v_producto.nombre), v_item.cantidad,
       v_item.precio_unitario, v_item.producto_id, v_item.unidad_medida_id,
       nullif(btrim(v_item.codigo_cliente), ''), 'compromiso')
    returning id into v_partida_id;

    -- Ubicación con más disponible; NULL si el producto no tiene
    -- existencia todavía (inventario_apartados lo admite, 011).
    select ubicacion_id into v_ubicacion
      from public.inventario_existencias
     where producto_id = v_item.producto_id
     order by cantidad_disponible desc nulls last
     limit 1;

    -- pedido_folio = folio de la PO (no hay pedido) — sólo para que Almacén
    -- vea a qué documento pertenece este apartado en pantalla.
    insert into public.inventario_apartados
      (producto_id, ubicacion_id, cantidad, pedido_folio, po_partida_id, nivel, solicitante_id)
    values
      (v_item.producto_id, v_ubicacion, v_cantidad_base, v_po.folio, v_partida_id, 'reserva', v_actor);

    v_compromiso_count := v_compromiso_count + 1;
  end loop;

  return jsonb_build_object(
    'respaldo_creadas', v_respaldo_count, 'compromiso_creadas', v_compromiso_count,
    'divergencias', v_divergencias, 'nr_ids_afectados', to_jsonb(v_nr_ids_afectados)
  );
end;
$function$;

revoke execute on function public.ventas_po_agregar_partidas(uuid, jsonb) from public, anon, authenticated;

-- ── ventas_cotizacion_aprobar(): edición aditiva ────────────────────────
-- Cuerpo vivo (043/044) + un solo bloque nuevo: si p_aprobacion trae po_id,
-- las líneas seleccionadas se insertan como partidas 'compromiso' en esa PO
-- YA EXISTENTE (nacida en ventas_po_crear_desde_nr(), caso C de la Vía A)
-- en vez de crear una PO nueva — decisión del dueño del proyecto: editar
-- esta función compartida con la otra sesión en vez de duplicar su lógica
-- de apartados/conversión de unidad. El resto del cuerpo es idéntico.
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
  v_po_id_existente uuid;
  v_po_existente record;
  v_siguiente_numero_po integer;
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
  v_po_id_existente := nullif(p_aprobacion->>'po_id', '')::uuid;

  if v_via = 'orden_compra' and v_po_id_existente is null then
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
  elsif v_via = 'orden_compra' and v_po_id_existente is not null then
    -- Vía A (048), caso C: la PO ya existe (nace en
    -- ventas_po_crear_desde_nr()) — sólo se le agregan las líneas
    -- seleccionadas de esta cotización, nunca se crea una PO nueva.
    select * into v_po_existente from public.ventas_ordenes_compra_cliente where id = v_po_id_existente for update;
    if not found then
      raise exception 'Orden de compra % no encontrada', v_po_id_existente using errcode = 'P0002';
    end if;
    if v_po_existente.entidad_id <> v_cot.entidad_id then
      raise exception 'La orden de compra no pertenece a este cliente.' using errcode = '22023';
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

  if v_via = 'orden_compra' and v_po_id_existente is not null then
    -- Vía A (048), caso C: agrega las líneas de esta cotización como
    -- partidas 'compromiso' a la PO existente, continuando la numeración.
    select coalesce(max(linea_numero), 0) into v_siguiente_numero_po
      from public.ventas_po_partidas where po_id = v_po_id_existente;

    insert into public.ventas_po_partidas
      (po_id, pedido_id, linea_numero, descripcion, cantidad, precio_unitario,
       producto_id, unidad_medida_id, pedido_linea_id, tipo)
    select
      v_po_id_existente, v_pedido_id,
      v_siguiente_numero_po + row_number() over (order by pl.created_at, pl.id),
      coalesce(pr.descripcion, pr.nombre),
      pl.cantidad, pl.precio_unitario, pl.producto_id, pl.unidad_medida_id, pl.id, 'compromiso'
    from public.ventas_pedido_lineas pl
    join public.productos pr on pr.id = pl.producto_id
    where pl.pedido_id = v_pedido_id;

    v_po_id := v_po_id_existente;
    v_po_folio := v_po_existente.folio;
  elsif v_via = 'orden_compra' then
    -- Vía B (043): la PO nace aquí, en la misma transacción que el pedido,
    -- con sus partidas copiadas 1:1 de las líneas recién insertadas — nunca
    -- se vuelve a teclear a mano lo que el sistema ya tiene.
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

-- ── ventas_nr_lineas_disponibles(): requisito 3 hecho consulta ──────────
-- disponible = cantidad_entregada - Σ cantidad_cubierta activa. Una línea
-- de NR cubierta del todo (disponible <= 0) simplemente no aparece —
-- "no debe estar disponible para asociar nuevamente a menos de que no se
-- haya asociado la cantidad total del material". p_nr_ids filtra a NR
-- específicas ya elegidas en el paso 2 del asistente; NULL trae todas las
-- del cliente.
create or replace function public.ventas_nr_lineas_disponibles(p_entidad_id uuid, p_nr_ids uuid[] default null)
returns table (
  nr_id uuid, nr_folio varchar, nr_linea_id uuid, producto_id uuid,
  producto_codigo varchar, producto_nombre varchar, unidad_medida_id uuid,
  cantidad_entregada numeric, cantidad_asociada numeric, disponible numeric, precio_unitario numeric
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select
    nr.id, nr.folio, nl.id, nl.producto_id, p.codigo_interno, p.nombre, nl.unidad_medida_id,
    nl.cantidad_entregada,
    coalesce(v.cubierta, 0) as cantidad_asociada,
    nl.cantidad_entregada - coalesce(v.cubierta, 0) as disponible,
    nl.precio_unitario
  from public.ventas_nr_lineas nl
  join public.ventas_notas_remision nr on nr.id = nl.nr_id
  join public.productos p on p.id = nl.producto_id
  left join lateral (
    select sum(vv.cantidad_cubierta) as cubierta
    from public.ventas_po_nr_vinculos vv
    where vv.nr_linea_id = nl.id and vv.estado in ('validado', 'aprobado_para_facturacion', 'facturado')
  ) v on true
  where nr.entidad_id = p_entidad_id
    and nr.estado <> 'cancelada'
    and (p_nr_ids is null or nl.nr_id = any(p_nr_ids))
    and nl.cantidad_entregada - coalesce(v.cubierta, 0) > 0;
$function$;

revoke execute on function public.ventas_nr_lineas_disponibles(uuid, uuid[]) from public, anon;
grant execute on function public.ventas_nr_lineas_disponibles(uuid, uuid[]) to authenticated;

-- ── ventas_po_crear_desde_nr(): núcleo de la Vía A ──────────────────────
-- Registra desde el tablero de NR la PO que llega DESPUÉS de una o varias
-- NR ya emitidas. Nunca se rellena como una cotización nueva: pide los
-- datos de la PO y del cliente, deja seleccionar NR/partidas de respaldo
-- (ya entregadas) y partidas por entregar (de una cotización existente,
-- caso C, o nuevas del catálogo, caso N). Toda la mercancía por entregar
-- se apunta a apartar/surtir contra ESTA PO (ventas_po_despachar(), 048).
create or replace function public.ventas_po_crear_desde_nr(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_entidad_id uuid;
  v_estado_cliente jsonb;
  v_numero_po text;
  v_numero_po_normalizado text;
  v_po_id uuid;
  v_po_folio varchar;
  v_resultado_partidas jsonb;
  v_cot_payload jsonb;
  v_cot_id uuid;
  v_cot record;
  v_lineas_incluidas uuid[];
  v_resultado_aprobar jsonb;
  v_pedido_id uuid;
  v_pedido_folio varchar;
  v_total_partidas numeric;
  v_divergencias jsonb;
  v_respaldo_creadas integer;
  v_compromiso_nuevas_creadas integer;
  v_compromiso_cotizacion_creadas integer := 0;
  v_estado_final public.po_estado;
  v_nr_ids_arr uuid[];
  v_nr_id uuid;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'gerente_comercial', 'ventas') then
    raise exception 'Sin permisos para registrar una orden de compra.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;

  v_entidad_id := nullif(p_payload->>'entidad_id', '')::uuid;
  if v_entidad_id is null then
    raise exception 'Falta el cliente de la orden de compra.' using errcode = '22023';
  end if;

  v_estado_cliente := public.cliente_puede_operar(v_entidad_id);
  if not (v_estado_cliente->>'puede')::boolean then
    raise exception 'No se puede registrar la orden de compra: %', (v_estado_cliente->>'motivo') using errcode = '42501';
  end if;

  if jsonb_array_length(coalesce(p_payload->'respaldo', '[]'::jsonb)) = 0
     and jsonb_array_length(coalesce(p_payload->'compromiso_nuevas', '[]'::jsonb)) = 0
     and (p_payload->'compromiso_cotizacion') is null
  then
    raise exception 'La orden de compra debe incluir al menos una partida (de respaldo, de una cotización o nueva).'
      using errcode = '22023';
  end if;

  v_numero_po := nullif(btrim(p_payload->>'numero_po'), '');
  if v_numero_po is null then
    raise exception 'Falta el número de PO del cliente.' using errcode = '22023';
  end if;
  v_numero_po_normalizado := nullif(upper(btrim(v_numero_po)), '');
  if exists (
    select 1 from public.ventas_ordenes_compra_cliente
     where entidad_id = v_entidad_id and numero_po_normalizado = v_numero_po_normalizado and estado <> 'cancelada'
  ) then
    raise exception 'Ya existe una PO con ese número para este cliente — revisa si es duplicada.' using errcode = '22023';
  end if;

  insert into public.ventas_ordenes_compra_cliente
    (numero_po, entidad_id, moneda, fecha_po, canal_entrega, evidencia_path,
     razon_social_declarada, rfc_declarado, subtotal_declarado, total_declarado, origen)
  select
    v_numero_po, v_entidad_id,
    coalesce(nullif(p_payload->>'moneda', ''), 'MXN'),
    nullif(p_payload->>'fecha_po', '')::date,
    nullif(p_payload->>'canal_entrega', '')::public.canal_origen,
    nullif(p_payload->>'evidencia_path', ''),
    coalesce(nullif(p_payload->>'razon_social_declarada', ''), left(e.nombre_legal, 255)),
    coalesce(nullif(p_payload->>'rfc_declarado', ''), e.rfc),
    nullif(p_payload->>'subtotal_declarado', '')::numeric,
    nullif(p_payload->>'total_declarado', '')::numeric,
    'posterior_a_entrega'
  from public.entidades e where e.id = v_entidad_id
  returning id, folio into v_po_id, v_po_folio;

  -- Partidas de respaldo + compromiso nuevas (caso N).
  v_resultado_partidas := public.ventas_po_agregar_partidas(v_po_id, p_payload);
  v_respaldo_creadas := (v_resultado_partidas->>'respaldo_creadas')::integer;
  v_compromiso_nuevas_creadas := (v_resultado_partidas->>'compromiso_creadas')::integer;
  v_divergencias := coalesce(v_resultado_partidas->'divergencias', '[]'::jsonb);

  -- Partidas de compromiso desde una cotización ya hecha (caso C): las
  -- líneas seleccionadas se aprueban como pedido de esta misma PO
  -- (delega en ventas_cotizacion_aprobar() con po_id — edición aditiva de
  -- arriba); las NO seleccionadas se desactivan con nota, nunca se borran
  -- (decisión del dueño del proyecto).
  v_cot_payload := p_payload->'compromiso_cotizacion';
  if v_cot_payload is not null then
    v_cot_id := nullif(v_cot_payload->>'cotizacion_id', '')::uuid;
    select array(select (jsonb_array_elements_text(coalesce(v_cot_payload->'lineas_incluidas', '[]'::jsonb)))::uuid)
      into v_lineas_incluidas;

    select * into v_cot from public.ventas_cotizaciones where id = v_cot_id for update;
    if not found then
      raise exception 'Cotización % no encontrada', v_cot_id using errcode = 'P0002';
    end if;
    if v_cot.entidad_id <> v_entidad_id then
      raise exception 'La cotización no pertenece a este cliente.' using errcode = '22023';
    end if;

    update public.ventas_cotizacion_lineas
       set activo = false,
           observaciones = btrim(coalesce(observaciones || ' ', '') || 'No incluida en la PO ' || v_po_folio || '.')
     where cotizacion_id = v_cot_id and activo
       and not (id = any(coalesce(v_lineas_incluidas, '{}'::uuid[])));

    v_resultado_aprobar := public.ventas_cotizacion_aprobar(
      v_cot_id,
      jsonb_build_object(
        'via', 'orden_compra',
        'po_id', v_po_id,
        'canal', v_cot_payload->'aprobacion'->>'canal',
        'evidencia_path', v_cot_payload->'aprobacion'->>'evidencia_path',
        'referencia', v_cot_payload->'aprobacion'->>'referencia',
        'contacto_id', v_cot_payload->'aprobacion'->>'contacto_id',
        'datos_faltantes', coalesce(v_cot_payload->'aprobacion'->'datos_faltantes', '[]'::jsonb)
      )
    );
    v_pedido_id := (v_resultado_aprobar->>'pedido_id')::uuid;
    v_pedido_folio := v_resultado_aprobar->>'pedido_folio';
    select count(*) into v_compromiso_cotizacion_creadas
      from public.ventas_pedido_lineas where pedido_id = v_pedido_id;
  end if;

  -- Totales declarados opcionales: si no vinieron, se calculan de lo
  -- realmente capturado (respaldo + compromiso, de cualquier origen).
  select coalesce(sum(subtotal), 0) into v_total_partidas from public.ventas_po_partidas where po_id = v_po_id;
  update public.ventas_ordenes_compra_cliente
     set subtotal_declarado = coalesce(subtotal_declarado, v_total_partidas),
         total_declarado = coalesce(total_declarado, v_total_partidas)
   where id = v_po_id;

  -- Requisito 1/2: cualquier divergencia de precio (sólo puede venir de
  -- partidas de respaldo) congela la PO COMPLETA — nunca respalda ninguna
  -- NR hasta que Dirección resuelva.
  if jsonb_array_length(v_divergencias) > 0 then
    insert into public.ventas_autorizaciones (tipo, documento_tipo, documento_id, cambios, motivo, solicitante_id)
    values (
      'precio_po_divergente', 'orden_compra_cliente', v_po_id,
      jsonb_build_object('divergencias', v_divergencias),
      'El precio de una o más partidas de respaldo difiere del precio de la NR que cubren.',
      v_actor
    );
    update public.ventas_ordenes_compra_cliente set estado = 'pendiente_de_autorizacion', updated_at = now()
     where id = v_po_id;
  else
    perform public.ventas_po_recalcular_estado(v_po_id);
    select array(select (jsonb_array_elements_text(v_resultado_partidas->'nr_ids_afectados'))::uuid) into v_nr_ids_arr;
    foreach v_nr_id in array coalesce(v_nr_ids_arr, '{}'::uuid[]) loop
      perform public.ventas_nr_recalcular_estado(v_nr_id);
    end loop;
  end if;

  select estado into v_estado_final from public.ventas_ordenes_compra_cliente where id = v_po_id;

  return jsonb_build_object(
    'success', true, 'po_id', v_po_id, 'po_folio', v_po_folio, 'estado', v_estado_final,
    'respaldo_creadas', v_respaldo_creadas, 'compromiso_nuevas_creadas', v_compromiso_nuevas_creadas,
    'compromiso_cotizacion_creadas', v_compromiso_cotizacion_creadas,
    'pedido_id', v_pedido_id, 'pedido_folio', v_pedido_folio,
    'divergencias', v_divergencias
  );
end;
$function$;

revoke execute on function public.ventas_po_crear_desde_nr(jsonb) from public, anon;
grant execute on function public.ventas_po_crear_desde_nr(jsonb) to authenticated;

-- ── ventas_po_ampliar(): requisito 6 — agregar NR/partidas a una PO ya
--    creada requiere autorización de Dirección ────────────────────────
-- No inserta nada — guarda el payload propuesto en
-- ventas_autorizaciones.cambios y congela la PO; sólo se materializa al
-- aprobarse (ventas_po_resolver_autorizacion(), abajo). Alcance de esta
-- entrega: sólo respaldo + compromiso_nuevas (mismo payload que
-- ventas_po_agregar_partidas admite) — TODO fuera de alcance: ampliar con
-- líneas de OTRA cotización distinta a la que ya tiene la PO.
create or replace function public.ventas_po_ampliar(p_po_id uuid, p_payload jsonb, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_po record;
  v_aut_id uuid;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'gerente_comercial', 'ventas') then
    raise exception 'Sin permisos para ampliar una orden de compra.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'El motivo es obligatorio para solicitar una ampliación.' using errcode = '23514';
  end if;
  if jsonb_array_length(coalesce(p_payload->'respaldo', '[]'::jsonb)) = 0
     and jsonb_array_length(coalesce(p_payload->'compromiso_nuevas', '[]'::jsonb)) = 0
  then
    raise exception 'La ampliación debe incluir al menos una partida nueva.' using errcode = '22023';
  end if;

  select * into v_po from public.ventas_ordenes_compra_cliente where id = p_po_id for update;
  if not found then
    raise exception 'Orden de compra % no encontrada', p_po_id using errcode = 'P0002';
  end if;
  if v_po.estado in ('cancelada', 'facturada', 'pagada_cerrada') then
    raise exception 'Esta orden de compra ya no admite ampliaciones (estado %).', v_po.estado using errcode = '42501';
  end if;
  if v_po.estado = 'pendiente_de_autorizacion' then
    raise exception 'Esta orden de compra ya tiene una autorización pendiente — resuélvela antes de solicitar otra.'
      using errcode = '42501';
  end if;

  insert into public.ventas_autorizaciones
    (tipo, documento_tipo, documento_id, version_anterior, cambios, motivo, solicitante_id)
  values (
    'ampliacion_po', 'orden_compra_cliente', p_po_id,
    jsonb_build_object('estado', v_po.estado), p_payload, btrim(p_motivo), v_actor
  )
  returning id into v_aut_id;

  update public.ventas_ordenes_compra_cliente set estado = 'pendiente_de_autorizacion', updated_at = now()
   where id = p_po_id;

  return jsonb_build_object('success', true, 'autorizacion_id', v_aut_id);
end;
$function$;

revoke execute on function public.ventas_po_ampliar(uuid, jsonb, text) from public, anon;
grant execute on function public.ventas_po_ampliar(uuid, jsonb, text) to authenticated;

-- ── ventas_po_corregir_precio(): único camino de salida cuando una
--    autorización de precio_po_divergente fue RECHAZADA ────────────────
create or replace function public.ventas_po_corregir_precio(p_po_id uuid, p_partidas jsonb, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_po record;
  v_ultima_aut record;
  v_item record;
  v_partida record;
  v_divergencias jsonb := '[]'::jsonb;
  v_nr_linea record;
  v_nr_id uuid;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'gerente_comercial', 'ventas') then
    raise exception 'Sin permisos para corregir el precio de una orden de compra.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'El motivo es obligatorio para corregir el precio.' using errcode = '23514';
  end if;

  select * into v_po from public.ventas_ordenes_compra_cliente where id = p_po_id for update;
  if not found then
    raise exception 'Orden de compra % no encontrada', p_po_id using errcode = 'P0002';
  end if;
  if v_po.estado <> 'pendiente_de_autorizacion' then
    raise exception 'Esta orden de compra no está en autorización.' using errcode = '42501';
  end if;

  select * into v_ultima_aut from public.ventas_autorizaciones
   where documento_tipo = 'orden_compra_cliente' and documento_id = p_po_id and tipo = 'precio_po_divergente'
   order by created_at desc limit 1;
  if not found or v_ultima_aut.estado <> 'rechazada' then
    raise exception 'No hay una autorización de precio rechazada para corregir en esta orden de compra.'
      using errcode = '42501';
  end if;

  for v_item in select * from jsonb_to_recordset(p_partidas) as x(po_partida_id uuid, precio_unitario numeric)
  loop
    if v_item.precio_unitario is null or v_item.precio_unitario < 0 then
      raise exception 'Precio unitario inválido.' using errcode = '22023';
    end if;
    select * into v_partida from public.ventas_po_partidas where id = v_item.po_partida_id and po_id = p_po_id
     for update;
    if not found then
      raise exception 'Partida % no encontrada en esta orden de compra', v_item.po_partida_id using errcode = 'P0002';
    end if;
    if v_partida.tipo <> 'respaldo' then
      raise exception 'Sólo se corrige el precio de una partida de respaldo.' using errcode = '22023';
    end if;

    update public.ventas_po_partidas set precio_unitario = v_item.precio_unitario where id = v_partida.id;

    update public.ventas_po_nr_vinculos
       set monto_cubierto = round(cantidad_cubierta * v_item.precio_unitario, 4)
     where po_partida_id = v_partida.id and estado in ('validado', 'aprobado_para_facturacion', 'facturado');
  end loop;

  -- Recalcula divergencias sobre TODAS las partidas de respaldo de la PO
  -- (no sólo las que llegaron en este payload) — una corrección parcial no
  -- debe descongelar si otra partida sigue divergente.
  for v_partida in select * from public.ventas_po_partidas where po_id = p_po_id and tipo = 'respaldo'
  loop
    select nl.*, nr.folio as nr_folio into v_nr_linea
      from public.ventas_po_nr_vinculos v
      join public.ventas_nr_lineas nl on nl.id = v.nr_linea_id
      join public.ventas_notas_remision nr on nr.id = nl.nr_id
     where v.po_partida_id = v_partida.id and v.estado in ('validado', 'aprobado_para_facturacion', 'facturado')
     limit 1;
    if found and v_partida.precio_unitario <> v_nr_linea.precio_unitario then
      v_divergencias := v_divergencias || jsonb_build_object(
        'po_partida_id', v_partida.id, 'nr_folio', v_nr_linea.nr_folio,
        'precio_nr', v_nr_linea.precio_unitario, 'precio_po', v_partida.precio_unitario,
        'diferencia', round(v_partida.cantidad * (v_partida.precio_unitario - v_nr_linea.precio_unitario), 4)
      );
    end if;
  end loop;

  if jsonb_array_length(v_divergencias) > 0 then
    insert into public.ventas_autorizaciones (tipo, documento_tipo, documento_id, cambios, motivo, solicitante_id)
    values (
      'precio_po_divergente', 'orden_compra_cliente', p_po_id,
      jsonb_build_object('divergencias', v_divergencias),
      'Corrección de precio (' || btrim(p_motivo) || ') — aún hay diferencias contra la NR.',
      v_actor
    );
    return jsonb_build_object('success', true, 'sigue_divergente', true, 'divergencias', v_divergencias);
  end if;

  update public.ventas_ordenes_compra_cliente set estado = 'abierta', updated_at = now() where id = p_po_id;
  perform public.ventas_po_recalcular_estado(p_po_id);

  foreach v_nr_id in array public.ventas_po_nrs_afectadas(p_po_id) loop
    perform public.ventas_nr_recalcular_estado(v_nr_id);
  end loop;

  return jsonb_build_object('success', true, 'sigue_divergente', false);
end;
$function$;

revoke execute on function public.ventas_po_corregir_precio(uuid, jsonb, text) from public, anon;
grant execute on function public.ventas_po_corregir_precio(uuid, jsonb, text) to authenticated;

-- ── ventas_po_liberar_almacen(): un solo botón para la PO mixta ─────────
-- Promueve reserva→compromiso los apartados propios de la PO (caso N, sin
-- pedido) y, para cada pedido distinto que sus partidas de compromiso
-- referencien (caso C), reutiliza ventas_pedido_liberar_almacen() —
-- idempotente: sólo actúa sobre los que siguen 'aprobado'.
create or replace function public.ventas_po_liberar_almacen(p_po_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_po record;
  v_estado_cliente jsonb;
  v_filas_propias integer;
  v_pedido_id uuid;
  v_pedidos_liberados integer := 0;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'gerente_comercial', 'ventas', 'almacen') then
    raise exception 'Sin permisos para liberar una orden de compra a Almacén.' using errcode = '42501';
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
  if v_po.estado not in ('abierta', 'parcialmente_surtida') then
    raise exception 'Esta orden de compra no admite liberar a Almacén en su estado actual (%).', v_po.estado
      using errcode = '42501';
  end if;

  v_estado_cliente := public.cliente_puede_operar(v_po.entidad_id);
  if not (v_estado_cliente->>'puede')::boolean then
    raise exception 'No se puede liberar: %', (v_estado_cliente->>'motivo') using errcode = '42501';
  end if;

  update public.inventario_apartados
     set nivel = 'compromiso'
   where po_partida_id in (select id from public.ventas_po_partidas where po_id = p_po_id)
     and estado = 'activo' and nivel = 'reserva';
  get diagnostics v_filas_propias = row_count;

  for v_pedido_id in
    select distinct pedido_id from public.ventas_po_partidas
     where po_id = p_po_id and pedido_id is not null
  loop
    if (select estado from public.ventas_pedidos where id = v_pedido_id) = 'aprobado' then
      perform public.ventas_pedido_liberar_almacen(v_pedido_id);
      v_pedidos_liberados := v_pedidos_liberados + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true, 'apartados_propios_promovidos', v_filas_propias, 'pedidos_liberados', v_pedidos_liberados
  );
end;
$function$;

revoke execute on function public.ventas_po_liberar_almacen(uuid) from public, anon;
grant execute on function public.ventas_po_liberar_almacen(uuid) to authenticated;

-- ── ventas_vinculo_cancelar(): restaurada (dropeada en 043) ─────────────
-- Nunca borra la fila. Bloqueada si el vínculo ya está en facturación.
-- Recalcula PO y NR con los helpers nuevos (ventas_po_recalcular_estado()/
-- ventas_nr_recalcular_estado()) en vez del CASE inline que sólo avanzaba
-- (el propio defecto que 036 ya había corregido en la Vía A original).
create or replace function public.ventas_vinculo_cancelar(p_vinculo_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_po_id uuid;
  v_nr_id uuid;
  v_vinculo record;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'gerente_comercial', 'ventas') then
    raise exception 'Sin permisos para cancelar un vínculo PO↔NR.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'El motivo es obligatorio para cancelar un vínculo.' using errcode = '23514';
  end if;

  select pp.po_id, nl.nr_id into v_po_id, v_nr_id
    from public.ventas_po_nr_vinculos v
    join public.ventas_po_partidas pp on pp.id = v.po_partida_id
    join public.ventas_nr_lineas nl on nl.id = v.nr_linea_id
   where v.id = p_vinculo_id;
  if v_po_id is null then
    raise exception 'Vínculo % no encontrado', p_vinculo_id using errcode = 'P0002';
  end if;

  -- Orden de bloqueo anti-deadlock (036): PO primero, luego el vínculo.
  perform 1 from public.ventas_ordenes_compra_cliente where id = v_po_id for update;
  select * into v_vinculo from public.ventas_po_nr_vinculos where id = p_vinculo_id for update;

  if v_vinculo.estado = 'cancelado' then
    raise exception 'Este vínculo ya está cancelado.' using errcode = '42501';
  end if;
  if v_vinculo.estado in ('aprobado_para_facturacion', 'facturado') then
    raise exception 'Este vínculo ya está en facturación — corrígelo por el proceso de corrección de documento.'
      using errcode = '42501';
  end if;

  update public.ventas_po_nr_vinculos
     set estado = 'cancelado', cancelado_at = now(), cancelado_por = v_actor, motivo_cancelacion = btrim(p_motivo)
   where id = p_vinculo_id;

  perform public.ventas_po_recalcular_estado(v_po_id);
  perform public.ventas_nr_recalcular_estado(v_nr_id);

  return jsonb_build_object('success', true, 'po_id', v_po_id, 'nr_id', v_nr_id);
end;
$function$;

revoke execute on function public.ventas_vinculo_cancelar(uuid, text) from public, anon;
grant execute on function public.ventas_vinculo_cancelar(uuid, text) to authenticated;

-- ── ventas_po_resolver_autorizacion(): dispatch interno tras resolver una
--    autorización de PO ──────────────────────────────────────────────
-- Invocada desde ventas_autorizacion_resolver() (abajo). Sin GRANT a
-- authenticated: sólo tiene sentido después de que la autorización ya se
-- marcó autorizada/rechazada.
create or replace function public.ventas_po_resolver_autorizacion(p_autorizacion_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_aut record;
  v_resultado jsonb;
  v_nr_ids_arr uuid[];
  v_nr_id uuid;
begin
  select * into v_aut from public.ventas_autorizaciones where id = p_autorizacion_id;

  if v_aut.tipo = 'ampliacion_po' then
    if v_aut.estado = 'autorizada' then
      v_resultado := public.ventas_po_agregar_partidas(v_aut.documento_id, v_aut.cambios);

      if jsonb_array_length(coalesce(v_resultado->'divergencias', '[]'::jsonb)) > 0 then
        -- La ampliación trajo su propia divergencia de precio: la PO se
        -- queda congelada con una autorización de precio nueva en vez de
        -- descongelarse a medias.
        insert into public.ventas_autorizaciones (tipo, documento_tipo, documento_id, cambios, motivo, solicitante_id)
        values (
          'precio_po_divergente', 'orden_compra_cliente', v_aut.documento_id,
          jsonb_build_object('divergencias', v_resultado->'divergencias'),
          'Divergencia de precio detectada al materializar una ampliación autorizada.',
          v_aut.solicitante_id
        );
        update public.ventas_ordenes_compra_cliente set estado = 'pendiente_de_autorizacion', updated_at = now()
         where id = v_aut.documento_id;
      else
        update public.ventas_ordenes_compra_cliente set estado = 'abierta', updated_at = now()
         where id = v_aut.documento_id;
        perform public.ventas_po_recalcular_estado(v_aut.documento_id);

        select array(select (jsonb_array_elements_text(coalesce(v_resultado->'nr_ids_afectados', '[]'::jsonb)))::uuid)
          into v_nr_ids_arr;
        foreach v_nr_id in array coalesce(v_nr_ids_arr, '{}'::uuid[]) loop
          perform public.ventas_nr_recalcular_estado(v_nr_id);
        end loop;
      end if;
    else
      -- Rechazada: nada se materializó, la PO vuelve al estado que tenía
      -- antes de solicitar la ampliación (version_anterior).
      update public.ventas_ordenes_compra_cliente
         set estado = coalesce((v_aut.version_anterior->>'estado')::public.po_estado, 'abierta'), updated_at = now()
       where id = v_aut.documento_id;
    end if;

  elsif v_aut.tipo = 'precio_po_divergente' then
    if v_aut.estado = 'autorizada' then
      -- El precio divergente queda aceptado tal cual está — las partidas y
      -- vínculos ya existen desde que se congeló la PO, sólo descongela.
      update public.ventas_ordenes_compra_cliente set estado = 'abierta', updated_at = now()
       where id = v_aut.documento_id;
      perform public.ventas_po_recalcular_estado(v_aut.documento_id);

      foreach v_nr_id in array public.ventas_po_nrs_afectadas(v_aut.documento_id) loop
        perform public.ventas_nr_recalcular_estado(v_nr_id);
      end loop;
    end if;
    -- Rechazada: se queda congelada — ventas_po_corregir_precio() es el
    -- único camino de salida (busca la última autorización de precio
    -- rechazada).
  end if;
end;
$function$;

revoke execute on function public.ventas_po_resolver_autorizacion(uuid) from public, anon, authenticated;

-- ── ventas_po_cancelar(): ampliada a los 2 estados nuevos ───────────────
-- Cuerpo vivo (044) + admite también 'pendiente_de_autorizacion' y
-- 'vinculada' (antes sólo 'abierta') — cancela sus vínculos activos y
-- libera sus apartados propios (caso N, sin pedido) antes de cancelar.
create or replace function public.ventas_po_cancelar(p_po_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_po record;
  v_nr_ids uuid[];
  v_nr_id uuid;
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
  -- Vía A (048): además de 'abierta' (Vía B, sin ninguna partida surtida
  -- todavía), también se puede cancelar una PO 'pendiente_de_autorizacion'
  -- (nada se materializó todavía) o 'vinculada' (todo resuelto sin que se
  -- haya movido kardex por esta PO — sólo posible en una PO puramente de
  -- respaldo). Cualquier otro estado ya tiene mercancía surtida por esta
  -- PO: la salida correcta es una devolución.
  if v_po.estado not in ('abierta', 'pendiente_de_autorizacion', 'vinculada') then
    raise exception 'Esta orden de compra ya tiene mercancía surtida: la salida es una devolución, no una cancelación.'
      using errcode = '42501';
  end if;

  v_nr_ids := public.ventas_po_nrs_afectadas(p_po_id);

  update public.ventas_po_nr_vinculos v
     set estado = 'cancelado', cancelado_at = now(), cancelado_por = v_actor,
         motivo_cancelacion = 'PO cancelada: ' || btrim(p_motivo)
    from public.ventas_po_partidas pp
   where v.po_partida_id = pp.id and pp.po_id = p_po_id
     and v.estado in ('validado', 'aprobado_para_facturacion', 'facturado');

  update public.inventario_apartados
     set estado = 'liberado', motivo_liberacion = 'PO ' || v_po.folio || ' cancelada: ' || btrim(p_motivo)
   where po_partida_id in (select id from public.ventas_po_partidas where po_id = p_po_id)
     and estado = 'activo';

  update public.ventas_ordenes_compra_cliente
     set estado = 'cancelada', cancelada_at = now(), cancelada_por = v_actor,
         motivo_cancelacion = btrim(p_motivo), updated_at = now()
   where id = p_po_id;

  foreach v_nr_id in array v_nr_ids loop
    perform public.ventas_nr_recalcular_estado(v_nr_id);
  end loop;

  return jsonb_build_object('success', true);
end;
$function$;

-- ── ventas_autorizacion_resolver(): dispatch de PO agregado ─────────────
-- Cuerpo vivo (033/037) + la cola final: si la autorización es de una PO
-- (precio_po_divergente/ampliacion_po), despacha a
-- ventas_po_resolver_autorizacion(). Sin esto, aprobar/rechazar desde la
-- bandeja dejaría la PO congelada para siempre.
create or replace function public.ventas_autorizacion_resolver(p_id uuid, p_aprobar boolean, p_comentario text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_aut record;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'gerente_comercial') then
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

  if v_aut.documento_tipo = 'orden_compra_cliente' and v_aut.tipo in ('precio_po_divergente', 'ampliacion_po') then
    perform public.ventas_po_resolver_autorizacion(p_id);
  end if;

  return jsonb_build_object('success', true);
end;
$function$;

-- ── ventas_nr_cobertura(): ampliada con lo "en autorización" ────────────
-- Cuerpo vivo (034) + separa el respaldo real (PO no congelada) del
-- respaldo "en autorización" (vínculos que existen pero cuya PO está
-- pendiente_de_autorizacion) — sin esto, una PO congelada por precio
-- divergente se vería indistinguible de "sin respaldo todavía".
create or replace function public.ventas_nr_cobertura(p_nr_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'cantidad_entregada', coalesce(sum(nl.cantidad_entregada), 0),
    'cantidad_respaldada', coalesce((
      select sum(v.cantidad_cubierta) from public.ventas_po_nr_vinculos v
       join public.ventas_nr_lineas l2 on l2.id = v.nr_linea_id
       join public.ventas_po_partidas pp on pp.id = v.po_partida_id
       join public.ventas_ordenes_compra_cliente po on po.id = pp.po_id
      where l2.nr_id = p_nr_id and v.estado in ('validado', 'aprobado_para_facturacion', 'facturado')
        and po.estado <> 'pendiente_de_autorizacion'
    ), 0),
    'cantidad_en_autorizacion', coalesce((
      select sum(v.cantidad_cubierta) from public.ventas_po_nr_vinculos v
       join public.ventas_nr_lineas l2 on l2.id = v.nr_linea_id
       join public.ventas_po_partidas pp on pp.id = v.po_partida_id
       join public.ventas_ordenes_compra_cliente po on po.id = pp.po_id
      where l2.nr_id = p_nr_id and v.estado in ('validado', 'aprobado_para_facturacion', 'facturado')
        and po.estado = 'pendiente_de_autorizacion'
    ), 0),
    'monto_entregado', coalesce(sum(nl.cantidad_entregada * nl.precio_unitario), 0),
    'monto_respaldado', coalesce((
      select sum(v.monto_cubierto) from public.ventas_po_nr_vinculos v
       join public.ventas_nr_lineas l2 on l2.id = v.nr_linea_id
       join public.ventas_po_partidas pp on pp.id = v.po_partida_id
       join public.ventas_ordenes_compra_cliente po on po.id = pp.po_id
      where l2.nr_id = p_nr_id and v.estado in ('validado', 'aprobado_para_facturacion', 'facturado')
        and po.estado <> 'pendiente_de_autorizacion'
    ), 0),
    'monto_en_autorizacion', coalesce((
      select sum(v.monto_cubierto) from public.ventas_po_nr_vinculos v
       join public.ventas_nr_lineas l2 on l2.id = v.nr_linea_id
       join public.ventas_po_partidas pp on pp.id = v.po_partida_id
       join public.ventas_ordenes_compra_cliente po on po.id = pp.po_id
      where l2.nr_id = p_nr_id and v.estado in ('validado', 'aprobado_para_facturacion', 'facturado')
        and po.estado = 'pendiente_de_autorizacion'
    ), 0)
  )
  from public.ventas_nr_lineas nl
  where nl.nr_id = p_nr_id;
$function$;

-- ── tiene_operaciones_abiertas(): ampliada a los 2 estados nuevos ───────
-- Cuerpo vivo (034/044) + 'pendiente_de_autorizacion'/'vinculada' en la
-- rama de PO — sin esto, un cliente con una PO congelada o vinculada se
-- vería "sin operaciones abiertas" y sería desactivable. language sql: va
-- después de 046 (valida los literales de enum en el CREATE).
create or replace function public.tiene_operaciones_abiertas(p_entidad_id uuid)
returns boolean
language sql
stable
security definer
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
       and o.estado in ('abierta', 'parcialmente_surtida', 'surtida', 'facturada',
                         'pendiente_de_autorizacion', 'vinculada')
  )
  where p_entidad_id is not null;
$function$;

-- ── ventas_po_despachar(): generalizada (no bifurcada) ──────────────────
-- Cuerpo vivo (045) + se le quita la exigencia de un único pedido_id (una
-- PO de Vía A puede cubrir varios pedidos, o ninguno); rechaza partidas
-- 'respaldo' (ya entregadas) y PO congeladas; el apartado se resuelve por
-- pedido_linea_id o po_partida_id según cuál tenga la partida; se
-- recalculan todos los pedidos tocados, no uno solo.
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
  v_pedidos_tocados uuid[] := '{}';
  v_pedido_id uuid;
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
  if v_po.estado = 'pendiente_de_autorizacion' then
    raise exception 'Esta orden de compra está en autorización — no se puede surtir hasta que se resuelva.'
      using errcode = '42501';
  end if;
  if v_po.estado not in ('abierta', 'parcialmente_surtida') then
    raise exception 'Esta orden de compra ya no admite surtido (estado %).', v_po.estado using errcode = '42501';
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
    if v_partida.tipo = 'respaldo' then
      raise exception 'La partida % ya fue entregada (es de respaldo) — no se surte.', v_item.po_partida_id
        using errcode = '42501';
    end if;
    if v_partida.producto_id is null or v_partida.unidad_medida_id is null then
      raise exception 'La partida % no tiene producto/unidad asociados — no se puede surtir.', v_item.po_partida_id
        using errcode = '22023';
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

    -- Cada origen resuelve su apartado por su propia columna (047):
    -- pedido_linea_id (caso C) o po_partida_id (caso N, sin pedido).
    -- uq_apartados_pedido_linea_activo/uq_apartados_po_partida_activo
    -- garantizan como máximo una fila en cada caso.
    if v_partida.pedido_linea_id is not null then
      select * into v_pedido from public.ventas_pedidos where id = v_partida.pedido_id for update;
      if v_pedido.estado not in ('liberado', 'entregado_parcial') then
        raise exception 'El pedido % debe estar liberado a Almacén antes de surtir esta orden de compra.',
          v_pedido.folio using errcode = '42501';
      end if;
      if not (v_partida.pedido_id = any(v_pedidos_tocados)) then
        v_pedidos_tocados := array_append(v_pedidos_tocados, v_partida.pedido_id);
      end if;

      select * into v_apartado from public.inventario_apartados
       where pedido_id = v_partida.pedido_id and pedido_linea_id = v_partida.pedido_linea_id
         and nivel = 'compromiso' and estado = 'activo'
       for update;
    else
      select * into v_apartado from public.inventario_apartados
       where po_partida_id = v_partida.id and nivel = 'compromiso' and estado = 'activo'
       for update;
    end if;
    if not found then
      raise exception 'No hay una reserva comprometida para esta partida (producto %).', v_producto.codigo_interno
        using errcode = 'P0002';
    end if;
    if v_apartado.cantidad < v_cantidad_base then
      raise exception 'La reserva comprometida no alcanza para surtir esa cantidad de la partida (producto %).',
        v_producto.codigo_interno using errcode = '22023';
    end if;

    -- 1) Kardex: salida_venta, referenciando la PO. El trigger valida
    --    negativo/congelamiento/decimales y calcula el costo.
    insert into public.inventario_movimientos
      (tipo, producto_id, ubicacion_id, unidad_captura_id, cantidad_capturada,
       referencia_tipo, referencia_folio, entidad_id, apartado_id)
    values
      ('salida_venta', v_partida.producto_id, v_apartado.ubicacion_id, v_partida.unidad_medida_id, v_item.cantidad,
       'orden_compra_cliente', v_po.folio, v_po.entidad_id, v_apartado.id);
    v_movimientos := v_movimientos + 1;

    -- 2) Consumir el apartado y, si sobra, reinsertar el remanente como
    --    fila NUEVA con el MISMO origen (pedido_linea_id o po_partida_id).
    v_remanente_base := v_apartado.cantidad - v_cantidad_base;

    update public.inventario_apartados
       set estado = 'consumido', motivo_liberacion = 'Surtido en ' || v_po.folio
     where id = v_apartado.id;

    if v_remanente_base > 0 then
      insert into public.inventario_apartados
        (producto_id, ubicacion_id, cantidad, pedido_folio, pedido_id, pedido_linea_id, po_partida_id, nivel,
         solicitante_id)
      values
        (v_apartado.producto_id, v_apartado.ubicacion_id, v_remanente_base, v_apartado.pedido_folio,
         v_apartado.pedido_id, v_apartado.pedido_linea_id, v_apartado.po_partida_id, 'compromiso', v_actor);
    end if;

    update public.ventas_po_partidas
       set cantidad_entregada = cantidad_entregada + v_item.cantidad
     where id = v_partida.id;
  end loop;

  perform public.ventas_po_recalcular_estado(p_po_id);

  foreach v_pedido_id in array v_pedidos_tocados loop
    select count(*) filter (where cantidad_entregada < cantidad)
      into v_pendientes
      from public.ventas_po_partidas where po_id = p_po_id and pedido_id = v_pedido_id;

    update public.ventas_pedidos
       set estado = (case when v_pendientes = 0 then 'entregado' else 'entregado_parcial' end)::public.pedido_estado,
           updated_at = now()
     where id = v_pedido_id;
  end loop;

  select count(*) filter (where cantidad_entregada < cantidad)
    into v_pendientes
    from public.ventas_po_partidas where po_id = p_po_id and tipo = 'compromiso';

  return jsonb_build_object(
    'success', true, 'po_folio', v_po.folio, 'movimientos_generados', v_movimientos, 'partidas_pendientes', v_pendientes
  );
end;
$function$;

-- ── Recalcula la NR afectada por el vínculo relic saneado en 047 ────────
do $$
declare
  v_nr_id uuid;
begin
  select nl.nr_id into v_nr_id
    from public.ventas_po_nr_vinculos v
    join public.ventas_nr_lineas nl on nl.id = v.nr_linea_id
   where v.id = 'e6d962f7-b86d-4a2a-9820-2c997b089a5a';
  if v_nr_id is not null then
    perform public.ventas_nr_recalcular_estado(v_nr_id);
  end if;
end;
$$;
