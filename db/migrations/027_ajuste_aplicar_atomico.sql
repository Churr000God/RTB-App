-- ==========================================
-- RTB Sistema — 027: "Aplicar al kardex" de un ajuste, hecho atómico.
--
-- Encontrado verificando el circuito completo de 025 en la app real (dos
-- usuarios, ajuste QA autorizado, "Aplicar al kardex"): la ruta
-- app/app/api/inventario/ajustes/[id]/aplicar/route.ts hace un for-loop de
-- llamadas sueltas al cliente admin — un INSERT en inventario_movimientos
-- por línea, seguido de un UPDATE que enlaza movimiento_id — sin
-- transacción. 026 corrigió que ese UPDATE fallara siempre (trigger
-- genérico exigiendo una columna updated_by que la tabla no tiene), pero
-- corregir el error hizo evidente el problema real: como el movimiento ya
-- se había insertado (inventario_movimientos es append-only,
-- inventario_movimientos_no_update lo hace irreversible incluso para
-- service_role, 011:644-646) y la llamada siguiente falla, la ruta
-- devuelve 500 con el movimiento ya aplicado al kardex pero sin enlazar.
-- Un reintento del usuario —comportamiento normal ante un error— vuelve a
-- procesar la MISMA línea (el filtro `movimiento_id is null` sigue viendo
-- null, porque el enlace nunca se escribió) y duplica el movimiento.
--
-- La corrección de fondo es la misma que ya se aplicó a conteos (016) y al
-- puente (025): una función SECURITY DEFINER que hace todo dentro de una
-- sola transacción real — si cualquier parte falla, Postgres revierte el
-- INSERT en inventario_movimientos también, así que nunca puede quedar un
-- movimiento huérfano. Se invoca con el cliente del propio usuario (no
-- service_role) para que auth.uid() resuelva en aplicado_por, igual que
-- inventario_aplicar_conteo().
-- ==========================================

create or replace function public.inventario_ajuste_aplicar(p_ajuste_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ajuste          public.inventario_ajustes%rowtype;
  v_actor           uuid := auth.uid();
  v_linea           record;
  v_movimiento_id   uuid;
  v_costo_unitario  numeric(14, 6);
  v_impacto_piezas  numeric(16, 4) := 0;
  v_impacto_valor   numeric(20, 6) := 0;
  v_lineas_aplicadas integer := 0;
begin
  if public.current_user_role() not in ('super_admin', 'direccion') then
    raise exception 'Sólo super_admin/direccion aplican un ajuste al kardex.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;

  select * into v_ajuste from public.inventario_ajustes where id = p_ajuste_id for update;
  if not found then
    raise exception 'Ajuste % no encontrado', p_ajuste_id using errcode = 'P0002';
  end if;
  if v_ajuste.estado <> 'autorizado' then
    raise exception 'Este ajuste no está autorizado.' using errcode = '42501';
  end if;

  -- El filtro `movimiento_id is null` es defensivo (idempotencia ante una
  -- repetición legítima), no la protección real contra duplicados — esa es
  -- la transacción única: o se aplican todas las líneas pendientes y el
  -- ajuste pasa a 'aplicado', o no se aplica ninguna.
  for v_linea in
    select l.id, l.producto_id, l.ubicacion_id, l.cantidad_ajuste, l.costo_unitario, p.unidad_medida_id
      from public.inventario_ajuste_lineas l
      join public.productos p on p.id = l.producto_id
     where l.ajuste_id = p_ajuste_id
       and l.movimiento_id is null
  loop
    insert into public.inventario_movimientos (
      tipo, producto_id, ubicacion_id, unidad_captura_id, cantidad_capturada,
      costo_unitario, referencia_tipo, referencia_folio, ajuste_id
    ) values (
      (case when v_linea.cantidad_ajuste > 0 then 'entrada_ajuste' else 'salida_ajuste' end)::public.movimiento_tipo,
      v_linea.producto_id, v_linea.ubicacion_id, v_linea.unidad_medida_id, abs(v_linea.cantidad_ajuste),
      v_linea.costo_unitario, 'ajuste', v_ajuste.folio, p_ajuste_id
    )
    returning id, costo_unitario into v_movimiento_id, v_costo_unitario;

    update public.inventario_ajuste_lineas set movimiento_id = v_movimiento_id where id = v_linea.id;

    v_lineas_aplicadas := v_lineas_aplicadas + 1;
    v_impacto_piezas := v_impacto_piezas + abs(v_linea.cantidad_ajuste);
    v_impacto_valor := v_impacto_valor + abs(v_linea.cantidad_ajuste) * coalesce(v_costo_unitario, 0);
  end loop;

  if v_lineas_aplicadas = 0 then
    raise exception 'El ajuste no tiene líneas pendientes de aplicar.' using errcode = '22023';
  end if;

  update public.inventario_ajustes
     set estado = 'aplicado', aplicado_at = now(), aplicado_por = v_actor,
         impacto_piezas = v_impacto_piezas, impacto_valor = v_impacto_valor
   where id = p_ajuste_id;

  return jsonb_build_object(
    'lineas_aplicadas', v_lineas_aplicadas,
    'impacto_piezas', v_impacto_piezas,
    'impacto_valor', v_impacto_valor
  );
end;
$$;

comment on function public.inventario_ajuste_aplicar(uuid) is
  'Aplica un ajuste autorizado al kardex: un inventario_movimientos por '
  'línea pendiente + enlace de movimiento_id + estado=aplicado, todo en '
  'una sola transacción (027) — antes era un for-loop de llamadas sueltas '
  'sin transacción que podía dejar movimientos huérfanos o duplicados '
  'ante un fallo a medio camino.';

revoke execute on function public.inventario_ajuste_aplicar(uuid) from public, anon;
grant execute on function public.inventario_ajuste_aplicar(uuid) to authenticated;
