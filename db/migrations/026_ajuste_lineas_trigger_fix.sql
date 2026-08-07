-- ==========================================
-- RTB Sistema — 026: inventario_ajuste_lineas.updated_by no existe, pero su
-- trigger BEFORE UPDATE intentaba escribirlo — todo UPDATE a esta tabla
-- fallaba con "record 'new' has no field 'updated_by'".
--
-- Descubierto verificando el circuito completo de 025 en la app real: al
-- aplicar un ajuste ya autorizado, POST /api/inventario/ajustes/[id]/aplicar
-- enlaza movimiento_id en cada línea (`update inventario_ajuste_lineas set
-- movimiento_id = ... where id = ...`, aplicar/route.ts). Ese UPDATE
-- reventaba contra este trigger desde siempre — 013_inventario_discrepancias_ajustes.sql:579-581
-- lo dio de alta apuntando a la función genérica public.set_updated_meta()
-- (compartida con clientes/contactos/direcciones/productos/... — todas SÍ
-- tienen updated_by, ver grep abajo) sin notar que inventario_ajuste_lineas
-- nunca la tuvo: por diseño no rastrea autoría por línea, eso vive en el
-- ajuste padre (solicitante_id/autorizador_id/aplicado_por, 013:174-181).
--
-- El bug estaba enmascarado: la sesión original de aplicar/route.ts
-- (antes de esta sesión) no capturaba el `error` de ese UPDATE concreto —
-- el ajuste quedaba "aplicado" con impacto_piezas/impacto_valor correctos
-- (esos sí se calculan en memoria) pero CADA línea se quedaba con
-- movimiento_id NULL para siempre, sin que nada lo avisara. La corrección
-- de B-01 de esta misma sesión (capturar ese error) es lo que lo hizo
-- visible por primera vez, en un circuito de prueba real.
--
-- Verificado que NINGUNA otra tabla que usa set_updated_meta() tiene este
-- problema:
--   select t.event_object_table, bool_or(c.column_name = 'updated_by')
--     from information_schema.triggers t
--     join information_schema.columns c
--       on c.table_name = t.event_object_table and c.table_schema = 'public'
--    where t.action_statement ilike '%set_updated_meta%'
--    group by 1;
-- → inventario_ajuste_lineas es la única fila con tiene_updated_by = false.
-- ==========================================

create or replace function public.ajuste_lineas_before_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.ajuste_lineas_before_update() is
  'Reemplaza set_updated_meta() para inventario_ajuste_lineas (026): esta '
  'tabla no tiene updated_by por diseño (la autoría vive en el ajuste '
  'padre) — set_updated_meta() la rompía con "record new has no field '
  'updated_by" en cada UPDATE, incluido el que enlaza movimiento_id al '
  'aplicar un ajuste.';

drop trigger if exists before_update_ajuste_lineas on public.inventario_ajuste_lineas;
create trigger before_update_ajuste_lineas
  before update on public.inventario_ajuste_lineas
  for each row execute function public.ajuste_lineas_before_update();
