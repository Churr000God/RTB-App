-- ==========================================
-- RTB Sistema — 037: dos roles nuevos, gerente_comercial y cobranza
-- (auditoría de navegación de RTB-VEN-01, sesión 2026-08-07)
--
-- Contexto: la auditoría de navegación de Ventas pedía verificar 10 roles,
-- pero sólo existían 8 — gerente_comercial y cobranza no estaban en
-- profiles_role_check ni tenían usuario QA. El dueño del proyecto decidió
-- crearlos de verdad en vez de mapearlos a roles existentes.
--
-- ===== Semántica de los dos roles =====
-- gerente_comercial: equivalente a direccion, pero SÓLO dentro de Ventas.
--   Gana: enviar/aprobar/rechazar/cancelar cualquier cotización (no sólo
--   las propias), emitir NR, validar PO, cancelar vínculo PO↔NR, liberar
--   pedido a Almacén, despachar NR, resolver autorizaciones y excepciones,
--   congelar/liberar cartera, política comercial de clientes.
--   NO gana: administración de usuarios, autorización de ajustes de
--   inventario, fijar/revertir precio de venta de catálogo, cuentas
--   bancarias, ni responder la consulta de Compras-ligero (eso rompería la
--   separación deliberada de ROLES_RESPONDEN_CONSULTA: "'ventas' NUNCA
--   está ahí" — un gerente comercial respondiéndose su propia consulta de
--   costo es el mismo problema).
-- cobranza: sólo lectura. Su trabajo real —el reloj de cobranza de 90 días
--   sobre NR— llega con RTB-PRO-FAC-01 (módulo futuro, aún sin construir).
--   Por ahora: lee el módulo de Ventas y evidencias-ventas (storage). Cero
--   escritura, cero función SECURITY DEFINER.
--
-- ===== Por qué la mayoría de las políticas SELECT no se tocan =====
-- 43 de las 49 políticas SELECT de todo el sistema son role-agnostic
-- (`current_user_role() is not null`) — ambos roles nuevos las heredan en
-- cuanto exista su fila en profiles con is_active=true, sin cambiar una
-- sola línea de SQL. Eso incluye producto_costos y
-- producto_precios_referencia: decisión ya tomada por la casa (mismo
-- criterio que logistica/facturacion, no un descuido de este archivo).
-- Las 6 políticas SELECT que sí enumeran rol (audit_log,
-- inventario_ajustes, proveedor_cuentas_bancarias, proveedor_productos,
-- solicitudes_cambio, profiles) excluyen a propósito a los dos roles
-- nuevos: las cinco primeras caen fuera de Ventas, y profiles ya limita a
-- cada quien a su propia fila (incluida direccion hoy).
--
-- ===== El riesgo real de este archivo =====
-- ventas_cotizacion_aprobar y ventas_nr_despachar fueron reescritas por la
-- migración 035 (fix del hallazgo crítico #1 de la auditoría:
-- pedido_linea_id en inventario_apartados) y ventas_vinculo_cancelar por
-- la 036. Cada create or replace de abajo se copió de
-- pg_get_functiondef(oid) de la base VIVA (no del texto de 031/032/033) y
-- se editó una sola línea — el guard de rol — para no revertir esos fixes
-- en silencio.
--
-- ===== Anti-autoaprobación =====
-- ventas_autorizacion_resolver ya protege por identidad, no por rol: el
-- CHECK vaut_no_autoaprobacion_chk (033) y el
-- "if v_aut.solicitante_id = v_actor then raise" (033) siguen intactos.
-- Un gerente_comercial podrá solicitar y resolver —igual que direccion
-- hoy— pero nunca lo suyo. Verificado en la matriz de este mismo cambio,
-- no sólo asumido.
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

-- =========================================
-- 1. profiles_role_check: 8 -> 10 roles
-- =========================================
alter table public.profiles
  drop constraint profiles_role_check,
  add constraint profiles_role_check check (
    role in (
      'super_admin', 'direccion', 'ventas', 'compras',
      'almacen', 'logistica', 'facturacion', 'finanzas',
      'gerente_comercial', 'cobranza'
    )
  );

-- =========================================
-- 2. Storage: evidencias-ventas
--    gerente_comercial lee y escribe (necesita ver/subir la evidencia de
--    la cotización o el congelamiento que decide); cobranza sólo lee
--    (necesita ver la evidencia para dar seguimiento de cobro, nunca sube).
--    comprobantes-bancarios y soportes-inventario: sin cambio, fuera de
--    alcance de ambos roles.
-- =========================================
drop policy if exists evidencias_ventas_select on storage.objects;
create policy evidencias_ventas_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidencias-ventas'
    and public.current_user_role() = any (array[
      'super_admin', 'direccion', 'gerente_comercial',
      'ventas', 'facturacion', 'finanzas', 'cobranza'
    ])
  );

drop policy if exists evidencias_ventas_insert on storage.objects;
create policy evidencias_ventas_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidencias-ventas'
    and public.current_user_role() = any (array[
      'super_admin', 'direccion', 'gerente_comercial',
      'ventas', 'facturacion', 'finanzas'
    ])
  );

-- =========================================
-- 3. Políticas de escritura en public — gerente_comercial añadido
--    (cobranza no aparece en ninguna: sólo lectura por diseño, y el GRANT
--    de tabla ya deniega su escritura antes de que RLS se evalúe siquiera)
-- =========================================
drop policy if exists cliente_congelamientos_insert on public.cliente_congelamientos;
create policy cliente_congelamientos_insert on public.cliente_congelamientos
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'gerente_comercial']));

drop policy if exists cliente_congelamientos_update on public.cliente_congelamientos;
create policy cliente_congelamientos_update on public.cliente_congelamientos
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'gerente_comercial']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'gerente_comercial']));

drop policy if exists cliente_excepciones_insert on public.cliente_excepciones;
create policy cliente_excepciones_insert on public.cliente_excepciones
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'gerente_comercial', 'ventas']));

drop policy if exists ventas_aut_insert on public.ventas_autorizaciones;
create policy ventas_aut_insert on public.ventas_autorizaciones
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'gerente_comercial', 'ventas']));

drop policy if exists ventas_consultas_insert on public.ventas_consultas_compras;
create policy ventas_consultas_insert on public.ventas_consultas_compras
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'gerente_comercial', 'ventas']));

drop policy if exists ventas_nr_seg_insert on public.ventas_nr_seguimientos;
create policy ventas_nr_seg_insert on public.ventas_nr_seguimientos
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'gerente_comercial', 'ventas']));

drop policy if exists ventas_po_insert on public.ventas_ordenes_compra_cliente;
create policy ventas_po_insert on public.ventas_ordenes_compra_cliente
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'gerente_comercial', 'ventas']));

drop policy if exists ventas_po_partidas_insert on public.ventas_po_partidas;
create policy ventas_po_partidas_insert on public.ventas_po_partidas
  for insert to authenticated
  with check (
    exists (
      select 1 from public.ventas_ordenes_compra_cliente po
       where po.id = ventas_po_partidas.po_id
         and po.estado = any (array['recibida'::public.po_estado, 'en_validacion'::public.po_estado])
         and public.current_user_role() = any (array['super_admin', 'direccion', 'gerente_comercial', 'ventas'])
    )
  );

drop policy if exists ventas_cotizaciones_insert on public.ventas_cotizaciones;
create policy ventas_cotizaciones_insert on public.ventas_cotizaciones
  for insert to authenticated
  with check (
    public.current_user_role() = any (array['super_admin', 'direccion', 'gerente_comercial'])
    or (public.current_user_role() = 'ventas' and (vendedor_id is null or vendedor_id = (select auth.uid())))
  );

drop policy if exists ventas_cotizaciones_update on public.ventas_cotizaciones;
create policy ventas_cotizaciones_update on public.ventas_cotizaciones
  for update to authenticated
  using (
    public.current_user_role() = any (array['super_admin', 'direccion', 'gerente_comercial'])
    or (public.current_user_role() = 'ventas' and vendedor_id = (select auth.uid()))
  )
  with check (
    public.current_user_role() = any (array['super_admin', 'direccion', 'gerente_comercial'])
    or (public.current_user_role() = 'ventas' and vendedor_id = (select auth.uid()))
  );

drop policy if exists ventas_cotizacion_lineas_insert on public.ventas_cotizacion_lineas;
create policy ventas_cotizacion_lineas_insert on public.ventas_cotizacion_lineas
  for insert to authenticated
  with check (
    exists (
      select 1 from public.ventas_cotizaciones c
       where c.id = ventas_cotizacion_lineas.cotizacion_id
         and (
           public.current_user_role() = any (array['super_admin', 'direccion', 'gerente_comercial'])
           or (public.current_user_role() = 'ventas' and c.vendedor_id = (select auth.uid()))
         )
    )
  );

drop policy if exists ventas_cotizacion_lineas_update on public.ventas_cotizacion_lineas;
create policy ventas_cotizacion_lineas_update on public.ventas_cotizacion_lineas
  for update to authenticated
  using (
    exists (
      select 1 from public.ventas_cotizaciones c
       where c.id = ventas_cotizacion_lineas.cotizacion_id
         and (
           public.current_user_role() = any (array['super_admin', 'direccion', 'gerente_comercial'])
           or (public.current_user_role() = 'ventas' and c.vendedor_id = (select auth.uid()))
         )
    )
  )
  with check (
    exists (
      select 1 from public.ventas_cotizaciones c
       where c.id = ventas_cotizacion_lineas.cotizacion_id
         and (
           public.current_user_role() = any (array['super_admin', 'direccion', 'gerente_comercial'])
           or (public.current_user_role() = 'ventas' and c.vendedor_id = (select auth.uid()))
         )
    )
  );

-- clientes_update conlleva autoridad sobre limite_credito, descuento_maximo
-- y vendedor_id (ya expuestos por el GRANT de columna existente) — se
-- incluye porque 'ventas' ya la tiene y un gerente más débil que su propio
-- equipo es incoherente. Punto más probable de revisión si el dueño del
-- proyecto quiere separar esas columnas más adelante.
drop policy if exists clientes_insert on public.clientes;
create policy clientes_insert on public.clientes
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'gerente_comercial', 'ventas']));

drop policy if exists clientes_update on public.clientes;
create policy clientes_update on public.clientes
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'gerente_comercial', 'ventas']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'gerente_comercial', 'ventas']));

-- =========================================
-- 4. Funciones SECURITY DEFINER — gerente_comercial añadido tras
--    direccion en el guard. Cuerpo copiado de pg_get_functiondef() de la
--    base viva (no de las migraciones originales) para no revertir los
--    fixes de 035/036 — ver cabecera. Las ramas de propiedad
--    ("current_user_role() = 'ventas' and vendedor_id <> v_actor") no se
--    tocan: un solo valor de current_user_role() nunca es simultáneamente
--    'ventas' y 'gerente_comercial', así que un gerente nunca cae en esa
--    rama y opera sobre documentos de cualquier vendedor — la semántica
--    buscada, sin necesidad de editarla.
-- =========================================

create or replace function public.ventas_cotizacion_enviar(p_cotizacion_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_cot record;
  v_lineas integer;
  v_pendientes integer;
  v_estado_cliente jsonb;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'gerente_comercial', 'ventas') then
    raise exception 'Sin permisos para enviar una cotización.' using errcode = '42501';
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
    raise exception 'No puedes enviar la cotización de otro vendedor.' using errcode = '42501';
  end if;
  if v_cot.estado <> 'borrador' then
    raise exception 'Sólo se envía una cotización en borrador.' using errcode = '42501';
  end if;
  if v_cot.vigencia_hasta is null then
    raise exception 'Define la vigencia antes de enviar la cotización.' using errcode = '22023';
  end if;

  select count(*) into v_lineas from public.ventas_cotizacion_lineas
   where cotizacion_id = p_cotizacion_id and activo;
  if v_lineas = 0 then
    raise exception 'Agrega al menos una línea antes de enviar.' using errcode = '22023';
  end if;

  select count(*) into v_pendientes from public.ventas_cotizacion_lineas
   where cotizacion_id = p_cotizacion_id and activo and en_consulta;
  if v_pendientes > 0 then
    raise exception 'Hay % línea(s) en consulta con Compras: no se puede enviar hasta que todas tengan precio.', v_pendientes
      using errcode = '42501';
  end if;

  v_estado_cliente := public.cliente_puede_operar(v_cot.entidad_id);
  if not (v_estado_cliente->>'puede')::boolean then
    raise exception 'No se puede enviar: %', (v_estado_cliente->>'motivo') using errcode = '42501';
  end if;

  update public.ventas_cotizaciones
     set estado = 'enviada', enviada_at = now(), enviada_por = v_actor, updated_at = now()
   where id = p_cotizacion_id;

  return jsonb_build_object('success', true, 'folio', v_cot.folio);
end;
$function$;
revoke execute on function public.ventas_cotizacion_enviar(uuid) from public, anon;
grant execute on function public.ventas_cotizacion_enviar(uuid) to authenticated;

create or replace function public.ventas_cotizacion_rechazar(p_cotizacion_id uuid, p_motivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_cot record;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'gerente_comercial', 'ventas') then
    raise exception 'Sin permisos para rechazar una cotización.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'El motivo es obligatorio para rechazar una cotización.' using errcode = '23514';
  end if;

  select * into v_cot from public.ventas_cotizaciones where id = p_cotizacion_id for update;
  if not found then
    raise exception 'Cotización % no encontrada', p_cotizacion_id using errcode = 'P0002';
  end if;
  if public.current_user_role() = 'ventas' and v_cot.vendedor_id <> v_actor then
    raise exception 'No puedes resolver la cotización de otro vendedor.' using errcode = '42501';
  end if;
  if v_cot.estado <> 'enviada' then
    raise exception 'Sólo se rechaza una cotización enviada.' using errcode = '42501';
  end if;

  update public.ventas_cotizaciones
     set estado = 'rechazada', resuelta_at = now(), resuelta_por = v_actor,
         motivo_resolucion = btrim(p_motivo), updated_at = now()
   where id = p_cotizacion_id;

  return jsonb_build_object('success', true);
end;
$function$;
revoke execute on function public.ventas_cotizacion_rechazar(uuid, text) from public, anon;
grant execute on function public.ventas_cotizacion_rechazar(uuid, text) to authenticated;

create or replace function public.ventas_cotizacion_cancelar(p_cotizacion_id uuid, p_motivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_cot record;
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
  if v_cot.estado not in ('borrador', 'enviada') then
    raise exception 'Sólo se cancela una cotización en borrador o enviada.' using errcode = '42501';
  end if;

  update public.ventas_cotizaciones
     set estado = 'cancelada', resuelta_at = now(), resuelta_por = v_actor,
         motivo_resolucion = btrim(p_motivo), updated_at = now()
   where id = p_cotizacion_id;

  return jsonb_build_object('success', true);
end;
$function$;
revoke execute on function public.ventas_cotizacion_cancelar(uuid, text) from public, anon;
grant execute on function public.ventas_cotizacion_cancelar(uuid, text) to authenticated;

-- Baseline: 035 (hallazgo crítico #1 — pedido_linea_id en inventario_apartados)
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
$function$;
revoke execute on function public.ventas_cotizacion_aprobar(uuid, jsonb) from public, anon;
grant execute on function public.ventas_cotizacion_aprobar(uuid, jsonb) to authenticated;

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
revoke execute on function public.ventas_nr_emitir(uuid) from public, anon;
grant execute on function public.ventas_nr_emitir(uuid) to authenticated;

create or replace function public.ventas_pedido_liberar_almacen(p_pedido_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_pedido record;
  v_estado_cliente jsonb;
  v_filas integer;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'gerente_comercial', 'ventas', 'almacen') then
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

  update public.inventario_apartados
     set nivel = 'compromiso'
   where pedido_id = p_pedido_id and estado = 'activo' and nivel = 'reserva';
  get diagnostics v_filas = row_count;

  update public.ventas_pedidos
     set estado = 'liberado', liberado_at = now(), liberado_por = v_actor, updated_at = now()
   where id = p_pedido_id;

  return jsonb_build_object('success', true, 'apartados_promovidos', v_filas);
end;
$function$;
revoke execute on function public.ventas_pedido_liberar_almacen(uuid) from public, anon;
grant execute on function public.ventas_pedido_liberar_almacen(uuid) to authenticated;

-- Baseline: 035 (hallazgo crítico #1 — emparejamiento exacto por pedido_linea_id)
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
  if public.current_user_role() not in ('super_admin', 'direccion', 'gerente_comercial', 'almacen', 'ventas') then
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
revoke execute on function public.ventas_nr_despachar(uuid, jsonb) from public, anon;
grant execute on function public.ventas_nr_despachar(uuid, jsonb) to authenticated;

create or replace function public.ventas_po_validar(
  p_po_id uuid, p_vinculos jsonb, p_autorizacion_id uuid default null::uuid, p_aceptar_codigo_divergente boolean default false
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
  if public.current_user_role() not in ('super_admin', 'direccion', 'gerente_comercial', 'ventas') then
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
$function$;
revoke execute on function public.ventas_po_validar(uuid, jsonb, uuid, boolean) from public, anon;
grant execute on function public.ventas_po_validar(uuid, jsonb, uuid, boolean) to authenticated;

-- Baseline: 036
create or replace function public.ventas_vinculo_cancelar(p_vinculo_id uuid, p_motivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_vinculo record;
  v_po_id uuid;
  v_nr_id uuid;
  v_estado_po public.po_estado;
  v_estado_nr public.nr_estado;
  v_entregada numeric;
  v_cubierta numeric;
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

  -- Resuelve a qué PO/NR pertenece el vínculo SIN bloquear nada todavía,
  -- para poder bloquear en el mismo orden que ventas_po_validar() (la PO
  -- primero, 033:442) y no abrir un ciclo de deadlock con una validación
  -- concurrente sobre la misma PO.
  select p.po_id, l.nr_id into v_po_id, v_nr_id
    from public.ventas_po_nr_vinculos v
    join public.ventas_po_partidas p on p.id = v.po_partida_id
    join public.ventas_nr_lineas l on l.id = v.nr_linea_id
   where v.id = p_vinculo_id;
  if v_po_id is null then
    raise exception 'Vínculo % no encontrado.', p_vinculo_id using errcode = 'P0002';
  end if;

  perform 1 from public.ventas_ordenes_compra_cliente where id = v_po_id for update;
  select * into v_vinculo from public.ventas_po_nr_vinculos where id = p_vinculo_id for update;

  if v_vinculo.estado = 'cancelado' then
    raise exception 'Este vínculo ya está cancelado.' using errcode = '42501';
  end if;
  if v_vinculo.estado in ('aprobado_para_facturacion', 'facturado') then
    raise exception
      'Este vínculo ya tiene consecuencias de facturación (estado %): no se puede cancelar aquí — '
      'corrígelo por el proceso de corrección de documento.', v_vinculo.estado using errcode = '42501';
  end if;

  update public.ventas_po_nr_vinculos
     set estado = 'cancelado', cancelado_at = now(), cancelado_por = v_actor, motivo_cancelacion = btrim(p_motivo)
   where id = p_vinculo_id;

  -- Recalcular el estado de la PO por la misma agregación que
  -- ventas_po_validar() (033:575-588), en sentido contrario: cancelar sólo
  -- puede QUITAR cobertura, nunca crear una duplicidad nueva, así que no
  -- hace falta repetir esa rama. Si no queda ningún vínculo activo en toda
  -- la PO, 'parcialmente_vinculada' sería engañoso (cero cobertura) — vuelve
  -- a 'en_validacion'.
  select (case
    when not exists (
      select 1 from public.ventas_po_nr_vinculos v
        join public.ventas_po_partidas p on p.id = v.po_partida_id
       where p.po_id = v_po_id and v.estado in ('validado', 'aprobado_para_facturacion', 'facturado')
    ) then 'en_validacion'
    when exists (
      select 1 from public.ventas_po_partidas p
       where p.po_id = v_po_id
         and coalesce((select sum(v.cantidad_cubierta) from public.ventas_po_nr_vinculos v
                        where v.po_partida_id = p.id
                          and v.estado in ('validado', 'aprobado_para_facturacion', 'facturado')), 0) < p.cantidad
    ) then 'parcialmente_vinculada'
    else 'vinculada'
  end)::public.po_estado into v_estado_po;

  update public.ventas_ordenes_compra_cliente set estado = v_estado_po, updated_at = now() where id = v_po_id;

  -- Recalcular el estado de la NR sólo si sigue en un estado que
  -- ventas_po_validar() pudo haber tocado — nunca facturada/pagada_cerrada/
  -- cancelada/con_incidencia/abierta/en_preparacion/parcialmente_entregada.
  select estado into v_estado_nr from public.ventas_notas_remision where id = v_nr_id;
  if v_estado_nr in ('parcialmente_respaldada', 'po_vinculada') then
    select coalesce(sum(nl.cantidad_entregada), 0) into v_entregada
      from public.ventas_nr_lineas nl where nl.nr_id = v_nr_id;
    select coalesce(sum(v.cantidad_cubierta), 0) into v_cubierta
      from public.ventas_po_nr_vinculos v
      join public.ventas_nr_lineas nl on nl.id = v.nr_linea_id
     where nl.nr_id = v_nr_id and v.estado in ('validado', 'aprobado_para_facturacion', 'facturado');

    update public.ventas_notas_remision
       set estado = (case
             when v_cubierta = 0 then 'entregada_sin_po'
             when v_cubierta < v_entregada then 'parcialmente_respaldada'
             else 'po_vinculada'
           end)::public.nr_estado,
           updated_at = now()
     where id = v_nr_id;
  end if;

  return jsonb_build_object('success', true, 'estado_po', v_estado_po, 'vinculo_id', p_vinculo_id);
end;
$function$;
revoke execute on function public.ventas_vinculo_cancelar(uuid, text) from public, anon;
grant execute on function public.ventas_vinculo_cancelar(uuid, text) to authenticated;

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

  return jsonb_build_object('success', true);
end;
$function$;
revoke execute on function public.ventas_autorizacion_resolver(uuid, boolean, text) from public, anon;
grant execute on function public.ventas_autorizacion_resolver(uuid, boolean, text) to authenticated;
