-- 049_ventas_nr_listado.sql
-- RTB-VEN-01 — explorer de Notas de Remisión: mismos filtros/búsqueda/
-- tablero que ya recibió Cotizaciones (038). Vista con security_invoker
-- (todos los joins LEFT a propósito — ventas_tablero_nr() usaba INNER y
-- perdía filas en silencio si RLS tapaba pedido/cotización).
--
-- NOTA: ventas_tablero_nr() (034) NO se dropea todavía en este archivo —
-- tiene 3 consumidores reales (api/ventas/notas-remision/route.ts,
-- dashboard/ventas/page.tsx, dashboard/ventas/remisiones/page.tsx) que se
-- migran en la capa TypeScript de esta misma entrega; se retira en una
-- migración de cierre una vez confirmado que ninguno la sigue llamando.

create index idx_ventas_nr_emitida_at on public.ventas_notas_remision (emitida_at desc);
create index idx_ventas_nr_entregada_at on public.ventas_notas_remision (entregada_at desc) where entregada_at is not null;
create index idx_ventas_nr_created_at on public.ventas_notas_remision (created_at desc);
create index idx_ventas_nr_valor_total on public.ventas_notas_remision (valor_total desc) where valor_total is not null;

create view public.ventas_notas_remision_listado
with (security_invoker = true) as
select
  n.id, n.folio, n.pedido_id, n.entidad_id, n.vendedor_id, n.moneda, n.estado, n.emitida_at, n.entregada_at,
  n.valor_total, n.ultimo_contacto_at, n.nota_ultimo_contacto, n.cancelado_at, n.motivo_cancelacion,
  n.created_at, n.updated_at,
  e.clave as entidad_clave, e.siglas as entidad_siglas, e.nombre_legal as entidad_nombre_legal,
  e.nombre_comercial as entidad_nombre_comercial,
  ped.folio as pedido_folio, ped.estado as pedido_estado,
  cot.id as cotizacion_id, cot.folio as cotizacion_folio, cot.canal_entrada as canal_origen,
  extract(day from now() - n.emitida_at)::integer as antiguedad_dias,
  coalesce(lin.lineas_count, 0)::integer as lineas_count,
  coalesce(lin.cantidad_total, 0)::numeric(18, 4) as cantidad_total,
  coalesce(lin.cantidad_entregada_total, 0)::numeric(18, 4) as cantidad_entregada_total,
  coalesce(lin.monto_entregado, 0)::numeric(18, 4) as monto_entregado,
  -- Respaldo real (excluye vínculos de una PO pendiente_de_autorizacion,
  -- 048 — congelada por precio divergente no cuenta como respaldo).
  coalesce(vin.monto_respaldado, 0)::numeric(18, 4) as monto_respaldado,
  coalesce(lin.monto_entregado, 0)::numeric(18, 4) - coalesce(vin.monto_respaldado, 0)::numeric(18, 4)
    as monto_pendiente_po,
  vin.po_folios
from public.ventas_notas_remision n
left join public.entidades e on e.id = n.entidad_id
left join public.ventas_pedidos ped on ped.id = n.pedido_id
left join public.ventas_cotizaciones cot on cot.id = ped.cotizacion_id
left join lateral (
  select
    count(*) as lineas_count,
    sum(nl.cantidad) as cantidad_total,
    sum(nl.cantidad_entregada) as cantidad_entregada_total,
    sum(nl.cantidad_entregada * nl.precio_unitario) as monto_entregado
  from public.ventas_nr_lineas nl
  where nl.nr_id = n.id
) lin on true
left join lateral (
  select
    sum(v.monto_cubierto) as monto_respaldado,
    string_agg(distinct po.folio, ', ' order by po.folio) as po_folios
  from public.ventas_po_nr_vinculos v
  join public.ventas_nr_lineas nl2 on nl2.id = v.nr_linea_id
  join public.ventas_po_partidas pp on pp.id = v.po_partida_id
  join public.ventas_ordenes_compra_cliente po on po.id = pp.po_id
  where nl2.nr_id = n.id and v.estado in ('validado', 'aprobado_para_facturacion', 'facturado')
    and po.estado <> 'pendiente_de_autorizacion'
) vin on true;

comment on view public.ventas_notas_remision_listado is
  'Explorer de Notas de Remisión (049), mismo patrón que ventas_cotizaciones_listado '
  '(038): security_invoker=true, todos los joins LEFT a propósito. canal_origen sale '
  'del pedido/cotización — la NR no tiene esa columna. monto_respaldado ya excluye '
  'vínculos de una PO congelada (048) — ver ventas_nr_cobertura() para el detalle '
  '"en autorización" por línea.';

revoke all on public.ventas_notas_remision_listado from anon, authenticated;
grant select on public.ventas_notas_remision_listado to authenticated, service_role;
