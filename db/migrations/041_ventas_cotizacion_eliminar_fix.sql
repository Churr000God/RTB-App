-- ==========================================
-- RTB Sistema — 041: corrección de ventas_cotizacion_eliminar() + mejoras
-- de ventas_devoluciones detectadas en la verificación de 039/040
-- (RTB-VEN-01)
--
-- Bug real encontrado antes de que hubiera datos reales en riesgo (mismo
-- criterio que otras correcciones same-day de este repo, ej. 022/023):
-- ventas_consultas_compras.cotizacion_id es `on delete restrict`
-- (verificado con pg_get_constraintdef) — un borrador creado con
-- "Consultar a Compras" (cotizacion-detalle.tsx) no se podía borrar sin
-- soltar antes esa liga; ventas_cotizacion_eliminar() (040) no lo hacía y
-- habría fallado con una violación de llave foránea cruda.
--
-- consulta_respuesta_chk es una EQUIVALENCIA (estado='respondida' ⟺
-- producto_id/costo_unitario/respondido_at no nulos) — una consulta ya
-- respondida no se puede forzar a 'cancelada' sin borrar esos datos, así
-- que sólo se DESLIGA (cotizacion_id=null), nunca se re-clasifica. Sólo
-- las 'abierta'/'en_proceso' (aún sin resolver) se cancelan Y se desligan.
--
-- De paso: ventas_devoluciones gana valor_entregado (informativo, para que
-- la bandeja nueva muestre un monto sin tener que unir contra NR/líneas
-- cada vez) y un índice único parcial que impide dos devoluciones
-- 'pendiente' simultáneas sobre el mismo pedido.
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

alter table public.ventas_devoluciones
  add column valor_entregado numeric(16, 4);

comment on column public.ventas_devoluciones.valor_entregado is
  'Informativo: sum(cantidad_entregada * precio_unitario) de las líneas de
   la NR al momento de abrir la devolución. NO es un monto a reembolsar —
   eso es RTB-PRO-FAC-01, todavía sin construir.';

create unique index uq_ventas_dev_pedido_pendiente on public.ventas_devoluciones (pedido_id)
  where estado = 'pendiente';

create or replace function public.ventas_cotizacion_eliminar(p_cotizacion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_actor uuid := auth.uid();
  v_cot record;
  v_lineas integer := 0;
  v_consultas_canceladas integer := 0;
  v_consultas_desligadas integer := 0;
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

  -- ventas_consultas_compras.cotizacion_id es `on delete restrict` — sin
  -- esto, el DELETE de la cabecera de abajo falla con una violación de
  -- llave foránea cruda si algún día se levantó una consulta a Compras
  -- desde esta cotización (bug encontrado en verificación, corregido antes
  -- de que hubiera datos reales afectados).
  --
  -- 'abierta'/'en_proceso' (aún sin resolver): se cancelan Y se desligan —
  -- Compras no debe seguir trabajando una consulta cuya cotización ya no
  -- existe.
  update public.ventas_consultas_compras
     set estado = 'cancelada',
         motivo_cancelacion = 'Cotización ' || v_cot.folio || ' eliminada en borrador.',
         cotizacion_id = null,
         updated_at = now(), updated_by = v_actor
   where cotizacion_id = p_cotizacion_id and estado in ('abierta', 'en_proceso');
  get diagnostics v_consultas_canceladas = row_count;

  -- El resto ('respondida'/'sin_disponibilidad'/'cancelada'): sólo se
  -- desligan, SIN tocar su estado — consulta_respuesta_chk es una
  -- equivalencia (estado='respondida' ⟺ producto_id/costo_unitario/
  -- respondido_at no nulos); forzar 'cancelada' ahí violaría el CHECK o
  -- exigiría borrar la respuesta ya capturada, que sigue siendo dato útil
  -- para Compras aunque esta cotización en particular desaparezca.
  update public.ventas_consultas_compras
     set cotizacion_id = null, updated_at = now(), updated_by = v_actor
   where cotizacion_id = p_cotizacion_id;
  get diagnostics v_consultas_desligadas = row_count;

  -- Una sola transacción — nunca dos llamadas sueltas desde el cliente
  -- (mismo criterio que el gotcha de 027_ajuste_aplicar_atomico.sql).
  delete from public.ventas_cotizacion_lineas where cotizacion_id = p_cotizacion_id;
  get diagnostics v_lineas = row_count;

  delete from public.ventas_cotizaciones where id = p_cotizacion_id;

  return jsonb_build_object(
    'success', true, 'folio', v_cot.folio,
    'lineas_eliminadas', v_lineas,
    'consultas_canceladas', v_consultas_canceladas,
    'consultas_desligadas', v_consultas_desligadas - v_consultas_canceladas
  );
end;
$$;

revoke execute on function public.ventas_cotizacion_eliminar(uuid) from public, anon;
grant execute on function public.ventas_cotizacion_eliminar(uuid) to authenticated;

-- ventas_cotizacion_cancelar(): agrega valor_entregado al abrir una
-- devolución (antes no lo calculaba porque la columna no existía).
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

  if v_pedido.estado in ('entregado', 'entregado_parcial') then
    select coalesce(sum(l.cantidad_entregada * l.precio_unitario), 0) into v_valor
      from public.ventas_nr_lineas l
     where l.nr_id = v_nr.id;

    insert into public.ventas_devoluciones
      (cotizacion_id, pedido_id, nr_id, entidad_id, motivo, registrado_por, valor_entregado)
    values
      (p_cotizacion_id, v_pedido.id, v_nr.id, v_cot.entidad_id, btrim(p_motivo), v_actor, round(v_valor, 4))
    returning folio into v_dev_folio;

    update public.ventas_cotizaciones
       set estado = 'en_devolucion', resuelta_at = now(), resuelta_por = v_actor,
           motivo_resolucion = btrim(p_motivo), updated_at = now()
     where id = p_cotizacion_id;

    update public.ventas_pedidos
       set estado = 'en_devolucion', updated_at = now()
     where id = v_pedido.id;

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
