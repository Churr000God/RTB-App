-- ==========================================
-- RTB Sistema — 014: KPIs de inventario (exactitud, alerta de stock,
-- consistencia)
--
-- Ver contexto/AUDITORIA_RTB-INV-01.md para el detalle completo. Cierra el
-- submódulo RTB-INV-01 con las tres funciones de lectura que consumen la
-- API y la UI:
--   - inventario_exactitud(): exactitud por registro/pieza/valor sobre TRES
--     bases, con cobertura como una cuarta fila explícita — el Acta de
--     Conteo Físico real mide "exactitud por registro 98.33% · por pieza
--     88.13% · por valor 98.83%" y la limitación #1 ("un 0 físico es
--     indistinguible de un renglón sin visitar") es precisamente lo que la
--     fila de cobertura hace imposible de ocultar: contar una línea
--     no_visitada como "exacta" es la mentira que produce el 100% ficticio
--     del proceso actual.
--   - inventario_alerta_stock(): alerta ⚪/🔴/🟢, bloqueo de compra y
--     acción sugerida de RTB-PRO-COM-01 §III, sobre el vocabulario
--     corregido (teórica/física, no el invertido del paquete original).
--   - inventario_verificar_consistencia(): la consola de auditoría del
--     diseño — 'ajuste_sin_autorizacion' debería devolver SIEMPRE cero
--     filas; si alguna vez no lo hace, el submódulo tiene un bug real, no
--     una sospecha.
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

-- =========================================
-- 1. Umbrales — espejo en app/lib/inventario/config.ts (mismo patrón que
--    UMBRAL_APROBACION_CREDITO en lib/entidades/config.ts).
-- =========================================
create or replace function public.umbral_exactitud()
returns numeric
language sql
immutable
security invoker
set search_path = public, pg_temp
as $$ select 95.0::numeric; $$;

create or replace function public.dias_sin_movimiento_umbral()
returns integer
language sql
immutable
security invoker
set search_path = public, pg_temp
as $$ select 180; $$;

revoke execute on function public.umbral_exactitud() from public, anon;
grant execute on function public.umbral_exactitud() to authenticated, service_role;
revoke execute on function public.dias_sin_movimiento_umbral() from public, anon;
grant execute on function public.dias_sin_movimiento_umbral() to authenticated, service_role;

-- =========================================
-- 2. inventario_exactitud() — exactitud por registro/pieza/valor + cobertura.
--    SECURITY DEFINER: necesita cantidad_teorica/diferencia, que ningún rol
--    puede leer de la tabla base (regla de vista ciega, ver
--    conteo_conciliacion() en 012). Devuelve CERO FILAS para un rol no
--    autorizado — filtro aplicado al resultado final, no sólo a la CTE
--    base, para que "sin permiso" sea "sin filas", no "filas en null".
-- =========================================
create or replace function public.inventario_exactitud(p_conteo_id uuid)
returns table (base text, universo numeric, exactos numeric, exactitud numeric, cumple boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with base as (
    select d.*, coalesce(d.costo_unitario_snapshot, 0) as costo
      from public.inventario_conteo_detalles d
     where d.conteo_id = p_conteo_id
  ),
  contadas as (
    select * from base where estado_conteo in ('contada', 'recontada', 'no_localizada')
  ),
  agg as (
    select
      (select count(*) from base) as universo_registros,
      (select count(*) from contadas) as contadas_registros,
      (select count(*) filter (where diferencia = 0) from contadas) as exactas_registros,
      (select coalesce(sum(abs(cantidad_teorica)), 0) from contadas) as universo_piezas,
      (select coalesce(sum(abs(diferencia)), 0) from contadas) as dif_piezas,
      (select coalesce(sum(abs(cantidad_teorica * costo)), 0) from contadas) as universo_valor,
      (select coalesce(sum(abs((cantidad_fisica - cantidad_teorica) * costo)), 0) from contadas) as dif_valor
  ),
  filas as (
    select 'cobertura' as base, universo_registros::numeric as universo, contadas_registros::numeric as exactos,
           round(100.0 * contadas_registros / nullif(universo_registros, 0), 2) as exactitud,
           null::boolean as cumple
      from agg
    union all
    select 'registro', contadas_registros::numeric, exactas_registros::numeric,
           round(100.0 * exactas_registros / nullif(contadas_registros, 0), 2),
           round(100.0 * exactas_registros / nullif(contadas_registros, 0), 2) >= public.umbral_exactitud()
      from agg
    union all
    select 'pieza', universo_piezas, universo_piezas - dif_piezas,
           round(100.0 * (1 - dif_piezas / nullif(universo_piezas, 0)), 2),
           round(100.0 * (1 - dif_piezas / nullif(universo_piezas, 0)), 2) >= public.umbral_exactitud()
      from agg
    union all
    select 'valor', universo_valor, universo_valor - dif_valor,
           round(100.0 * (1 - dif_valor / nullif(universo_valor, 0)), 2),
           round(100.0 * (1 - dif_valor / nullif(universo_valor, 0)), 2) >= public.umbral_exactitud()
      from agg
  )
  select * from filas
   where public.current_user_role() = any (array['super_admin', 'direccion', 'almacen', 'compras', 'finanzas']);
$$;

revoke execute on function public.inventario_exactitud(uuid) from public, anon;
grant execute on function public.inventario_exactitud(uuid) to authenticated, service_role;

-- =========================================
-- 3. inventario_alerta_stock() — RTB-PRO-COM-01 §III, sobre el vocabulario
--    corregido. SECURITY INVOKER: sólo lee tablas que 'authenticated' ya
--    puede leer (productos, inventario_existencias) — menos funciones
--    DEFINER es menos superficie WARN en el advisor.
-- =========================================
create or replace function public.inventario_alerta_stock(p_producto_id uuid default null)
returns table (
  producto_id uuid, codigo_interno varchar, nombre varchar,
  cantidad_teorica numeric, cantidad_fisica numeric, cantidad_apartada numeric,
  stock_minimo numeric, stock_maximo numeric, dias_sin_movimiento integer,
  alerta text, bloqueo_compra boolean, cantidad_sugerida numeric, accion_sugerida text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with agg as (
    select p.id, p.codigo_interno, p.nombre, p.stock_minimo, p.stock_maximo, p.es_estrategico,
           coalesce(sum(e.cantidad_teorica), 0) as teorica,
           sum(e.cantidad_fisica) as fisica,
           coalesce(sum(e.cantidad_apartada), 0) as apartada,
           (current_date - max(e.fecha_ultimo_movimiento)::date) as dias
      from public.productos p
      left join public.inventario_existencias e on e.producto_id = p.id
     where (p_producto_id is null or p.id = p_producto_id)
       and p.estado = 'activo'
       and public.current_user_role() is not null
     group by p.id
  )
  select
    id, codigo_interno, nombre, teorica, fisica, apartada, stock_minimo, stock_maximo, dias,
    -- Sin stock mínimo no hay alerta (⚪); mínimo en cero con teórico negativo SÍ alerta (🔴).
    case
      when stock_minimo is null then 'sin_definir'
      when teorica < stock_minimo then 'bajo_minimo'
      when stock_minimo = 0 and teorica < 0 then 'bajo_minimo'
      else 'ok'
    end as alerta,
    -- "Stock real > 0 y > 180 días sin movimiento" (COM-01). 'Real' = físico
    -- bajo el vocabulario corregido. Un producto nunca contado (fisica IS
    -- NULL) NO se bloquea: no se bloquea una compra sobre un dato que no existe.
    coalesce(fisica, 0) > 0 and coalesce(dias, 0) > public.dias_sin_movimiento_umbral() as bloqueo_compra,
    case when stock_minimo is null then null else greatest(stock_minimo - teorica, 0) end as cantidad_sugerida,
    case
      when stock_minimo is null then 'revisar'
      when coalesce(fisica, 0) > 0 and coalesce(dias, 0) > public.dias_sin_movimiento_umbral()
        then case when es_estrategico then 'revisar' else 'bloquear_compra' end
      when teorica < stock_minimo then 'reabastecer'
      when coalesce(fisica, 0) = 0 and coalesce(dias, 0) > 365 then 'depurar'
      when stock_maximo is not null and teorica > stock_maximo then 'liquidar'
      else 'mantener'
    end as accion_sugerida
  from agg;
$$;

revoke execute on function public.inventario_alerta_stock(uuid) from public, anon;
grant execute on function public.inventario_alerta_stock(uuid) to authenticated, service_role;

-- =========================================
-- 4. inventario_verificar_consistencia() — consola de auditoría, sólo
--    super_admin/direccion (filtro dentro del propio WHERE, mismo criterio
--    que inventario_exactitud()). 'ajuste_sin_autorizacion' debería ser
--    SIEMPRE cero filas: es la prueba viva de que el submódulo funciona.
-- =========================================
create or replace function public.inventario_verificar_consistencia()
returns table (categoria text, referencia_id uuid, detalle text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with autorizado as (
    select public.current_user_role() = any (array['super_admin', 'direccion']) as ok
  ),
  kardex_por_celda as (
    select producto_id, ubicacion_id, sum(cantidad) as saldo
      from public.inventario_movimientos
     group by producto_id, ubicacion_id
  )
  select 'deriva_existencias', e.id,
         format(
           'producto %s ubicación %s: existencias.cantidad_teorica=%s, suma del kardex=%s',
           e.producto_id, coalesce(e.ubicacion_id::text, 'sin ubicación'), e.cantidad_teorica, coalesce(k.saldo, 0)
         )
    from public.inventario_existencias e
    left join kardex_por_celda k
      on k.producto_id = e.producto_id and k.ubicacion_id is not distinct from e.ubicacion_id
   where (select ok from autorizado) and e.cantidad_teorica <> coalesce(k.saldo, 0)

  union all
  select 'crossdock_sin_par', m.id, format('movimiento %s (operación %s) sin su pareja de cross-dock', m.folio, m.operacion_id)
    from public.inventario_movimientos m
   where (select ok from autorizado)
     and m.tipo in ('entrada_crossdock', 'salida_crossdock')
     and not exists (
       select 1 from public.inventario_movimientos m2
        where m2.operacion_id = m.operacion_id
          and m2.tipo in ('entrada_crossdock', 'salida_crossdock') and m2.tipo <> m.tipo
     )

  union all
  select 'transferencia_sin_par', m.id, format('movimiento %s (operación %s) sin su pareja de transferencia', m.folio, m.operacion_id)
    from public.inventario_movimientos m
   where (select ok from autorizado)
     and m.tipo in ('entrada_transferencia', 'salida_transferencia')
     and not exists (
       select 1 from public.inventario_movimientos m2
        where m2.operacion_id = m.operacion_id
          and m2.tipo in ('entrada_transferencia', 'salida_transferencia') and m2.tipo <> m.tipo
     )

  union all
  select 'sin_costo', e.id, format('producto %s: existencia de %s unidades sin costo promedio', e.producto_id, e.cantidad_teorica)
    from public.inventario_existencias e
   where (select ok from autorizado) and e.costo_promedio is null and e.cantidad_teorica <> 0

  union all
  select 'sin_ubicacion', e.id, format('producto %s: existencia de %s unidades sin ubicación asignada', e.producto_id, e.cantidad_teorica)
    from public.inventario_existencias e
   where (select ok from autorizado) and e.ubicacion_id is null and e.cantidad_teorica <> 0

  union all
  select 'teorico_negativo', e.id, format('producto %s: teórico negativo (%s)', e.producto_id, e.cantidad_teorica)
    from public.inventario_existencias e
   where (select ok from autorizado) and e.cantidad_teorica < 0

  union all
  -- Debería ser SIEMPRE cero filas. Si alguna vez no lo es, hay un bug real
  -- en la cadena mov_ajuste_chk + GRANT restringido + ajuste_autorizado().
  select 'ajuste_sin_autorizacion', m.id, format('movimiento %s referencia un ajuste no autorizado', m.folio)
    from public.inventario_movimientos m
   where (select ok from autorizado)
     and m.tipo in ('entrada_ajuste', 'salida_ajuste', 'entrada_conteo', 'salida_conteo')
     and not public.ajuste_autorizado(m.ajuste_id)

  union all
  select 'discrepancia_abierta_vencida', d.id, format('discrepancia %s abierta desde %s sin resolución', d.folio, d.created_at::date)
    from public.inventario_discrepancias d
   where (select ok from autorizado)
     and d.estado in ('abierta', 'en_investigacion')
     and d.created_at < now() - interval '30 days';
$$;

revoke execute on function public.inventario_verificar_consistencia() from public, anon;
grant execute on function public.inventario_verificar_consistencia() to authenticated, service_role;
