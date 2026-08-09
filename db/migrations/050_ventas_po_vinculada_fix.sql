-- 050_ventas_po_vinculada_fix.sql
-- RTB-VEN-01 — corrige un defecto real encontrado en la verificación SQL de
-- 048, antes de que hubiera datos reales en riesgo: ventas_po_recalcular_
-- estado() promovía a 'vinculada' en cuanto compromiso_pendientes=0 y
-- respaldo_pendiente=0 — pero "no hay ninguna partida de respaldo" también
-- hace `respaldo_pendiente=0` (verdad vacía sobre un conjunto vacío), así
-- que TODA PO de Vía B (que nunca tiene partidas de respaldo) llegaba a
-- 'vinculada' en vez de quedarse en 'surtida' al terminar de surtirse —
-- 'vinculada' debe significar "había algo que vincular y ya se vinculó
-- todo", no aplicar quien nunca tuvo nada que vincular.
--
-- Reproducido con un escenario mixto real (caso C + caso N, sin ninguna
-- partida de respaldo): tras despachar ambas partidas por completo, la PO
-- quedó en 'vinculada' en vez de 'surtida'.
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
  v_tiene_respaldo boolean;
  v_nuevo public.po_estado;
begin
  select * into v_po from public.ventas_ordenes_compra_cliente where id = p_po_id;
  if v_po.estado in ('pendiente_de_autorizacion', 'cancelada', 'facturada', 'pagada_cerrada') then
    return;
  end if;

  select
    count(*) filter (where cantidad_entregada < cantidad),
    bool_or(cantidad_entregada > 0)
  into v_compromiso_pendientes, v_compromiso_iniciado
  from public.ventas_po_partidas where po_id = p_po_id and tipo = 'compromiso';

  select exists(select 1 from public.ventas_po_partidas where po_id = p_po_id and tipo = 'respaldo')
    into v_tiene_respaldo;

  select count(*) into v_respaldo_pendiente
    from public.ventas_po_partidas pp
   where pp.po_id = p_po_id and pp.tipo = 'respaldo'
     and not exists (
       select 1 from public.ventas_po_nr_vinculos v
        where v.po_partida_id = pp.id and v.estado in ('validado', 'aprobado_para_facturacion', 'facturado')
     );

  -- 'vinculada' sólo si HABÍA partidas de respaldo y ya quedaron todas
  -- vinculadas (además de que el compromiso, si lo hay, ya se surtió). Una
  -- PO sin ninguna partida de respaldo (todo Vía B, o Vía A puramente de
  -- compromiso) nunca pasa de 'surtida' — no hay nada que "vincular".
  if coalesce(v_compromiso_pendientes, 0) = 0 and v_respaldo_pendiente = 0 and v_tiene_respaldo then
    v_nuevo := 'vinculada';
  elsif coalesce(v_compromiso_pendientes, 0) = 0 and v_respaldo_pendiente = 0 and not v_tiene_respaldo then
    v_nuevo := 'surtida';
  elsif coalesce(v_compromiso_pendientes, 0) > 0 and coalesce(v_compromiso_iniciado, false) then
    v_nuevo := 'parcialmente_surtida';
  else
    v_nuevo := 'abierta';
  end if;

  if v_nuevo is distinct from v_po.estado then
    update public.ventas_ordenes_compra_cliente
       set estado = v_nuevo,
           surtida_at = case when v_nuevo in ('surtida', 'vinculada') and surtida_at is null then now() else surtida_at end,
           updated_at = now()
     where id = p_po_id;
  end if;
end;
$function$;
