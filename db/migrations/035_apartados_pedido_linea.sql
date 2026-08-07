-- ==========================================
-- RTB Sistema — 035: liga cada apartado a su línea de pedido de origen
-- (RTB-VEN-01 — corrige el hallazgo crítico #1 de
-- contexto/AUDITORIA_RTB-VEN-01.md §1/§7.2)
--
-- Causa raíz que se cierra aquí: inventario_apartados (011, extendida en
-- 031 con nivel/pedido_id) nunca guardó qué LÍNEA de pedido originó cada
-- reserva, sólo el producto y el pedido. Cuando un pedido tiene 2+ líneas
-- del mismo producto —caso legítimo, nada lo impedía—
-- ventas_nr_despachar() (032) no tenía forma de saber cuál apartado
-- corresponde a cuál línea de NR y elegía con
-- "order by created_at limit 1". Esto no desempata nada en la práctica:
-- ventas_cotizacion_aprobar() (031) inserta todas las reservas de un
-- pedido dentro del mismo INSERT ... SELECT, y dentro de una misma
-- transacción now() es constante — las filas hermanas comparten
-- created_at al microsegundo (confirmado en PED-000019: los dos apartados
-- originales tienen el mismo timestamp exacto). El resultado, reproducido
-- dos veces (SQL con ROLLBACK y clic a clic con datos reales — NR-000014):
-- un despacho puede consumir la reserva de OTRA línea y luego rechazar en
-- falso un despacho legítimo por "la reserva no alcanza", aunque el total
-- reservado sí alcance.
--
-- Se liga por pedido_linea_id (no nr_linea_id): la reserva nace en
-- ventas_cotizacion_aprobar(), antes de que exista ninguna NR — no hay
-- nr_linea_id que poblar en ese momento, y apartados_before_update() (011,
-- 031) congela la fila una vez creada, así que no se puede rellenar
-- después con un UPDATE. ventas_nr_lineas.pedido_linea_id (032) ya es
-- NOT NULL, así que cualquier línea de NR resuelve su línea de pedido en
-- un solo salto — no hace falta una segunda columna redundante.
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

-- =========================================
-- 1. Columna nueva (nullable: el apartado libre de Almacén, POST
--    /api/inventario/apartados sin pedido, nunca tiene línea de origen).
-- =========================================
alter table public.inventario_apartados
  add column pedido_linea_id uuid;

comment on column public.inventario_apartados.pedido_linea_id is
  'Línea de ventas_pedido_lineas que originó esta reserva — la clave que
   ventas_nr_despachar() (032, reemplazada aquí) usa para emparejar el
   apartado exacto de cada línea de NR, en vez de adivinar por producto_id
   con "order by created_at limit 1" (hallazgo crítico #1,
   contexto/AUDITORIA_RTB-VEN-01.md). NULL para las reservas libres de
   Almacén que no vienen de un pedido de Ventas.';

-- =========================================
-- 2. FK compuesta declarativa: garantiza que la línea SÍ pertenece al
--    pedido del propio apartado (una FK simple a ventas_pedido_lineas.id
--    no lo comprobaría). MATCH SIMPLE (el default) no evalúa la FK si
--    alguna columna es NULL, así que el apartado libre de Almacén
--    (pedido_id y pedido_linea_id ambos NULL) sigue sin verse afectado.
-- =========================================
alter table public.ventas_pedido_lineas
  add constraint uq_pedido_lineas_id_pedido unique (id, pedido_id);

alter table public.inventario_apartados
  add constraint apartados_pedido_linea_fk
  foreign key (pedido_linea_id, pedido_id)
  references public.ventas_pedido_lineas (id, pedido_id)
  on delete restrict;

-- =========================================
-- 3. Backfill de los apartados históricos ya ligados a un pedido (hoy: los
--    3 de PED-000019 — QA, 2026-08-07). Dos pasos deterministas, sin IDs
--    hardcodeados: sirven igual si aparecieran más filas históricas antes
--    de aplicar esta migración.
--
--    before_update_apartados se desactiva sólo durante este backfill: el
--    trigger vigente (011/031) rechaza CUALQUIER UPDATE sobre un apartado
--    ya no-activo ("ya no admite más cambios"), y el apartado de 5 piezas
--    del caso real ya está 'consumido' — es exactamente el registro que
--    hay que backfillear. authenticated no tiene GRANT UPDATE sobre
--    pedido_linea_id (sólo estado/motivo_liberacion, 011), así que
--    reactivar el trigger inmediatamente después dejar cerrada la misma
--    puerta para cualquier UPDATE futuro que no sea este backfill.
-- =========================================
alter table public.inventario_apartados disable trigger before_update_apartados;

-- 3a) Emparejamiento directo: un apartado cuyo (pedido_id, producto_id,
--     cantidad) coincide con EXACTAMENTE una línea de ese pedido con el
--     mismo perfil — cubre toda reserva que nunca se partió por un
--     despacho parcial (aquí: los apartados originales de 5 y 3 piezas).
with candidatos as (
  select a.id as apartado_id, pl.id as pedido_linea_id,
         count(*) over (partition by a.pedido_id, a.producto_id, a.cantidad) as apartados_mismo_perfil,
         (select count(*) from public.ventas_pedido_lineas pl2
            where pl2.pedido_id = a.pedido_id and pl2.producto_id = a.producto_id and pl2.cantidad = a.cantidad
         ) as lineas_mismo_perfil
    from public.inventario_apartados a
    join public.ventas_pedido_lineas pl
      on pl.pedido_id = a.pedido_id and pl.producto_id = a.producto_id and pl.cantidad = a.cantidad
   where a.pedido_id is not null and a.pedido_linea_id is null
)
update public.inventario_apartados a
   set pedido_linea_id = c.pedido_linea_id
  from candidatos c
 where a.id = c.apartado_id
   and c.apartados_mismo_perfil = 1
   and c.lineas_mismo_perfil = 1;

-- 3b) Remanentes de un despacho parcial (ventas_nr_despachar(), 032, los
--     reinserta como fila NUEVA con una cantidad que ya no coincide con
--     ninguna línea): se heredan del apartado padre que el propio
--     despacho consumió en la misma transacción — mismo pedido/producto,
--     mismo created_at exacto que el inventario_movimientos.salida_venta
--     que lo originó (aquí: el remanente de 2 piezas hereda la línea de
--     5 piezas vía el movimiento que despachó 3 de esas 5).
with remanentes as (
  select child.id as apartado_id, parent.pedido_linea_id
    from public.inventario_apartados child
    join public.inventario_movimientos mv
      on mv.tipo = 'salida_venta'
     and mv.producto_id = child.producto_id
     and mv.created_at = child.created_at
    join public.inventario_apartados parent on parent.id = mv.apartado_id
   where child.pedido_id is not null
     and child.pedido_linea_id is null
     and parent.pedido_id = child.pedido_id
     and parent.pedido_linea_id is not null
     and child.id <> parent.id
)
update public.inventario_apartados a
   set pedido_linea_id = r.pedido_linea_id
  from remanentes r
 where a.id = r.apartado_id;

-- 3c) Guarda dura: si algo queda sin ligar (dato histórico genuinamente
--     ambiguo — p.ej. dos líneas con el mismo producto Y la misma
--     cantidad, sin ningún movimiento que las distinga), la migración
--     aborta con un error explícito en vez de dejar una fila huérfana que
--     el CHECK del paso 4 rechazaría de todos modos con un mensaje menos
--     útil. No hay ninguna fila así hoy (verificado antes de escribir
--     esta migración) — este bloque es la red de seguridad para el resto
--     de la campaña QA, no un caso que se espere disparar.
do $$
declare
  v_huerfanos integer;
begin
  select count(*) into v_huerfanos
    from public.inventario_apartados
   where pedido_id is not null and pedido_linea_id is null;
  if v_huerfanos > 0 then
    raise exception
      '% apartado(s) con pedido_id pero sin línea de origen inferible — '
      'resolver a mano antes de aplicar esta migración (ver 035, §3c).',
      v_huerfanos
      using errcode = 'P0001';
  end if;
end;
$$;

alter table public.inventario_apartados enable trigger before_update_apartados;

-- =========================================
-- 4. CHECK: toda reserva de pedido declara su línea de origen; ninguna
--    reserva libre puede inventar una.
-- =========================================
alter table public.inventario_apartados
  add constraint apartados_pedido_linea_chk
  check ((pedido_id is null) = (pedido_linea_id is null));

-- =========================================
-- 5. Índice único parcial: como máximo una reserva ACTIVA por línea de
--    pedido. Es el invariante que permite que el despacho resuelva con
--    una sola fila sin ambigüedad — antes de esto, "una línea, un
--    apartado activo" era una expectativa implícita del código, no una
--    garantía de la base. Compatible con el despacho parcial porque
--    ventas_nr_despachar() (reemplazada abajo) ya marca 'consumido' el
--    apartado viejo y luego inserta el remanente como una sentencia
--    aparte (mismo patrón que ya exigió 023_producto_imagen_marcar_principal.sql
--    para "exactamente una fila marcada por grupo").
-- =========================================
create unique index uq_apartados_pedido_linea_activo
  on public.inventario_apartados (pedido_linea_id)
  where pedido_linea_id is not null and estado = 'activo';

create index idx_apartados_pedido_linea on public.inventario_apartados (pedido_linea_id)
  where pedido_linea_id is not null;

-- =========================================
-- 6. apartados_before_update() (011, reemplazada en 031): congela también
--    pedido_linea_id, mismo alcance inmutable que pedido_id/producto_id/
--    ubicacion_id/cantidad/solicitante_id.
-- =========================================
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
  new.pedido_linea_id := old.pedido_linea_id;
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
-- 7. ventas_cotizacion_aprobar() (031): sólo cambia el INSERT final del
--    loop de reservas para propagar pedido_linea_id — ya lo trae el
--    propio cursor (v_linea.pedido_linea_id, sin cambios en el SELECT).
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
  -- siempre está en unidad base, sin excepción. pedido_linea_id (035) es
  -- lo que permite a ventas_nr_despachar() emparejar sin ambigüedad
  -- cuando dos líneas comparten producto.
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
-- 8. ventas_nr_despachar() (032) — el fix real: emparejar por
--    pedido_linea_id, no por producto_id + "el primero que aparezca".
--    pedido_id se conserva en el WHERE como cinturón redundante barato
--    (la FK compuesta del paso 2 ya lo garantiza, pero no cuesta nada
--    repetirlo aquí).
-- =========================================
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
$$;

revoke execute on function public.ventas_nr_despachar(uuid, jsonb) from public, anon;
grant execute on function public.ventas_nr_despachar(uuid, jsonb) to authenticated;

-- =========================================
-- 9. Nota sobre privilegios: el GRANT INSERT por columna de
--    inventario_apartados ya viene restringido desde 031
--    (producto_id, ubicacion_id, cantidad, pedido_folio) — pedido_linea_id
--    NO se agrega a esa lista. 'authenticated' sigue sin poder escribir
--    esta columna por INSERT directo, y apartados_before_update() (paso 6)
--    la congela en UPDATE. Sólo las funciones SECURITY DEFINER de este
--    archivo la escriben. Sin cambios de RLS, sin uso de service_role.
-- =========================================
