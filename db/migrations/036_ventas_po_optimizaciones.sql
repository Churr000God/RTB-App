-- ==========================================
-- RTB Sistema — 036: cancelar un vínculo PO↔NR + optimización de
-- costo_venta_detalle() (RTB-VEN-01, §3 de contexto/AUDITORIA_RTB-VEN-01.md)
--
-- Nota de numeración: la migración 035 ya está en uso por otra sesión
-- concurrente sobre este mismo repositorio (035_apartados_pedido_linea.sql,
-- el fix del hallazgo #1 de la auditoría — pedido_linea_id en
-- inventario_apartados). No es tema de esta migración; se salta a 036 para
-- no chocar con trabajo ya en curso (mismo criterio que
-- contexto/rtb-sesiones-concurrentes.md).
--
-- ===== 1. Cancelar un vínculo PO↔NR (§3.5) =====
-- vinculo_estado ya incluía 'cancelado' desde 033 pero ninguna función lo
-- escribía — un vínculo capturado por error sólo se podía deshacer por SQL
-- directo. Reglas confirmadas con el dueño del proyecto: cancela quien
-- valida (ventas/direccion/super_admin, simétrico con ventas_po_validar());
-- nunca si el vínculo ya tiene consecuencia de facturación
-- (aprobado_para_facturacion/facturado); nunca se borra la fila (histórico
-- completo, mismo criterio que producto_precio_venta, 028); cancelar no
-- evade ninguna de las 6 reglas de ventas_po_validar() — el índice
-- uq_vinculo_par (033:305, `where estado <> 'cancelado'`) ya estaba
-- diseñado para permitir re-vincular el mismo par tras cancelar.
--
-- El estado de PO/NR que dejó ventas_po_validar() sólo AVANZA (033:575-614)
-- — una cancelación reduce cobertura, así que necesita el recálculo en
-- sentido contrario que este archivo agrega en ventas_vinculo_cancelar().
--
-- ===== 2. Auditoría de ventas_po_nr_vinculos =====
-- Única tabla del módulo (junto con ventas_po_partidas, fuera de alcance
-- aquí) sin trigger audit_row() — se cierra para que la cancelación (y
-- cualquier escritura futura) quede en audit_log.
--
-- ===== 3. costo_venta_detalle()/costo_venta_vigente() — una sola
-- evaluación de costo_promedio_global() (§3.3) =====
-- Confirmado en 028: una sola llamada a costo_venta_detalle() evalúa
-- costo_promedio_global() hasta 7 veces en el caso común (3 directas +
-- 2×2 vía las dos invocaciones de costo_venta_vigente(), que a su vez la
-- llama 2 veces cada una) — Postgres no memoiza una función STABLE entre
-- llamadas repetidas dentro del mismo SELECT. Se resuelve con
-- `cross join lateral` para calcular el costo base una sola vez; misma
-- semántica exacta (incluido el caso "override activo + familia sin
-- margen", donde el coalesce corta antes de necesitar el margen).
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

-- =========================================
-- 1. Esquema: cancelación auditable del vínculo
-- =========================================
alter table public.ventas_po_nr_vinculos
  add column cancelado_at timestamptz,
  add column cancelado_por uuid references public.profiles(id),
  add column motivo_cancelacion text,
  add constraint vpnv_cancelacion_chk check (
    (estado = 'cancelado') = (
      cancelado_at is not null and cancelado_por is not null and motivo_cancelacion is not null
    )
  );

comment on column public.ventas_po_nr_vinculos.cancelado_at is
  'Sólo la escribe ventas_vinculo_cancelar() (036). Nunca se borra la fila '
  '— el histórico completo (cantidad_cubierta, monto_cubierto, '
  'autorizacion_id, created_by/at originales) sobrevive intacto.';

-- =========================================
-- 2. Auditoría — cerraba el hueco desde 033
-- =========================================
create trigger audit_ventas_po_nr_vinculos after insert or update on public.ventas_po_nr_vinculos
  for each row execute function public.audit_row();

-- =========================================
-- 3. ventas_vinculo_cancelar() — misma plantilla de guardas que
--    ventas_po_validar() (033): rol → 42501, auth.uid() NULL → 28000.
-- =========================================
create or replace function public.ventas_vinculo_cancelar(p_vinculo_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  if public.current_user_role() not in ('super_admin', 'direccion', 'ventas') then
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
$$;

comment on function public.ventas_vinculo_cancelar(uuid, text) is
  'Cancela un vínculo PO↔NR capturado por error — nunca borra la fila.
   Bloqueada si el vínculo ya está en aprobado_para_facturacion/facturado
   (consecuencia de facturación ya en curso). Recalcula PO/NR en sentido
   contrario a ventas_po_validar() (033), que sólo avanza estados.';

revoke execute on function public.ventas_vinculo_cancelar(uuid, text) from public, anon;
grant execute on function public.ventas_vinculo_cancelar(uuid, text) to authenticated;

-- =========================================
-- 4. costo_venta_vigente()/costo_venta_detalle() — costo_promedio_global()
--    se evalúa una sola vez por invocación (antes: 2 y hasta 7
--    respectivamente). Mismos GRANT/REVOKE de 028 — create or replace no
--    los toca ni los borra.
-- =========================================
create or replace function public.costo_venta_vigente(p_producto_id uuid, p_fecha timestamptz default now())
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select v.precio_manual from public.producto_precio_venta v
      where v.producto_id = p_producto_id and v.activo),
    (select c.base * (1 + f.margen_porcentaje / 100.0)
       from public.productos p
       join public.producto_familias f on f.id = p.familia_id
       cross join lateral (select public.costo_promedio_global(p_producto_id, p_fecha) as base) c
      where p.id = p_producto_id and f.margen_porcentaje is not null and c.base is not null)
  );
$$;

create or replace function public.costo_venta_detalle(p_producto_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'producto_id', p_producto_id,
    'costo_base', c.base,
    'familia_id', p.familia_id,
    'margen_porcentaje', f.margen_porcentaje,
    'familia_sin_margen', f.margen_porcentaje is null,
    'es_manual', v.id is not null,
    'precio_manual', v.precio_manual,
    'definido_por', v.definido_por,
    'definido_at', v.definido_at,
    'calculado', case
      when f.margen_porcentaje is not null and c.base is not null
      then round(c.base * (1 + f.margen_porcentaje / 100.0), 4)
      else null
    end,
    'costo_venta', cv.venta,
    'calculable', cv.venta is not null
  )
  from public.productos p
  join public.producto_familias f on f.id = p.familia_id
  left join public.producto_precio_venta v on v.producto_id = p.id and v.activo
  cross join lateral (select public.costo_promedio_global(p_producto_id) as base) c
  cross join lateral (
    select coalesce(
      v.precio_manual,
      case when f.margen_porcentaje is not null and c.base is not null
           then c.base * (1 + f.margen_porcentaje / 100.0) else null end
    ) as venta
  ) cv
  where p.id = p_producto_id;
$$;
