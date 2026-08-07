-- ==========================================
-- RTB Sistema — 034: tablero de seguimiento de NR, KPIs y el cierre del
-- TODO de 002 (RTB-VEN-01)
--
-- Última migración del módulo a propósito: todas las funciones de aquí
-- son `language sql` y referencian tablas de 030-033 — el gotcha de
-- "language sql valida objetos referenciados en el CREATE" (ya documentado
-- en CLAUDE.md) exige que vayan después de que esas tablas existan.
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

-- =========================================
-- 1. tiene_operaciones_abiertas() — de stub a real
-- =========================================
-- 002_entidades_core.sql (línea ~475) la dejó con
-- `security invoker` y `select false where p_entidad_id is not null` —
-- un TODO(RTB-VEN-01/RTB-COM-01) literal. La preserva la forma
-- "where p_entidad_id is not null" (NULL → CERO FILAS, no `false`): el
-- invocador existente (POST /api/entidades/[id]/bloquear) hace
-- `if (abiertas)`, que trata null/undefined igual que false — cambiar a
-- `returns false` sin condición alteraría ese contrato sin necesidad.
-- Pasa a SECURITY DEFINER para no depender de la RLS de quien la invoque
-- (hoy siempre se llama con service_role, que ya ve todo, pero un futuro
-- invocador con el cliente del usuario debe obtener el mismo resultado).
--
-- 'po_vinculada' y 'facturada' NO cuentan como abiertas: en ese punto
-- Ventas ya hizo su handoff a Facturación. Si contaran, ninguna entidad
-- con historial de ventas volvería a ser bloqueable permanentemente,
-- nunca — Facturación no existe todavía en esta entrega, así que ninguna
-- NR llegará jamás a 'pagada_cerrada' por esta vía. Cuando exista
-- RTB-PRO-FAC-01, revisar este comentario junto con el nuevo módulo.
create or replace function public.tiene_operaciones_abiertas(p_entidad_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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
       and o.estado in ('recibida', 'en_validacion', 'parcialmente_vinculada', 'pendiente_de_confirmacion')
  )
  where p_entidad_id is not null;
$$;

revoke execute on function public.tiene_operaciones_abiertas(uuid) from public, anon;
grant execute on function public.tiene_operaciones_abiertas(uuid) to authenticated, service_role;

-- =========================================
-- 2. ventas_nr_cobertura() — cantidad/monto respaldado por PO, agregado
-- =========================================
create or replace function public.ventas_nr_cobertura(p_nr_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'cantidad_entregada', coalesce(sum(nl.cantidad_entregada), 0),
    'cantidad_respaldada', coalesce((
      select sum(v.cantidad_cubierta) from public.ventas_po_nr_vinculos v
       join public.ventas_nr_lineas l2 on l2.id = v.nr_linea_id
      where l2.nr_id = p_nr_id and v.estado in ('validado', 'aprobado_para_facturacion', 'facturado')
    ), 0),
    'monto_entregado', coalesce(sum(nl.cantidad_entregada * nl.precio_unitario), 0),
    'monto_respaldado', coalesce((
      select sum(v.monto_cubierto) from public.ventas_po_nr_vinculos v
       join public.ventas_nr_lineas l2 on l2.id = v.nr_linea_id
      where l2.nr_id = p_nr_id and v.estado in ('validado', 'aprobado_para_facturacion', 'facturado')
    ), 0)
  )
  from public.ventas_nr_lineas nl
  where nl.nr_id = p_nr_id;
$$;

revoke execute on function public.ventas_nr_cobertura(uuid) from public, anon;
grant execute on function public.ventas_nr_cobertura(uuid) to authenticated, service_role;

-- =========================================
-- 3. ventas_tablero_nr() — el tablero de seguimiento (RTB-PRO-VEN-01 §III)
-- =========================================
create or replace function public.ventas_tablero_nr(
  p_estado public.nr_estado default null, p_vendedor uuid default null,
  p_limit integer default 50, p_offset integer default 0
)
returns table (
  nr_id uuid, folio varchar, entidad_id uuid, entidad_nombre varchar, vendedor_id uuid,
  canal_origen public.canal_origen, estado public.nr_estado, emitida_at timestamptz,
  antiguedad_dias integer, valor_total numeric, monto_respaldado numeric, monto_pendiente numeric,
  po_folios text, ultimo_contacto_at timestamptz, nota_ultimo_contacto text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    n.id, n.folio, n.entidad_id, e.nombre_comercial, n.vendedor_id,
    c.canal_entrada, n.estado, n.emitida_at,
    extract(day from now() - n.emitida_at)::integer as antiguedad_dias,
    n.valor_total,
    coalesce((
      select sum(v.monto_cubierto) from public.ventas_po_nr_vinculos v
       join public.ventas_nr_lineas l on l.id = v.nr_linea_id
      where l.nr_id = n.id and v.estado in ('validado', 'aprobado_para_facturacion', 'facturado')
    ), 0) as monto_respaldado,
    coalesce(n.valor_total, 0) - coalesce((
      select sum(v.monto_cubierto) from public.ventas_po_nr_vinculos v
       join public.ventas_nr_lineas l on l.id = v.nr_linea_id
      where l.nr_id = n.id and v.estado in ('validado', 'aprobado_para_facturacion', 'facturado')
    ), 0) as monto_pendiente,
    (
      select string_agg(distinct po.numero_po, ', ')
        from public.ventas_po_nr_vinculos v
        join public.ventas_po_partidas pp on pp.id = v.po_partida_id
        join public.ventas_ordenes_compra_cliente po on po.id = pp.po_id
        join public.ventas_nr_lineas l on l.id = v.nr_linea_id
       where l.nr_id = n.id and v.estado <> 'cancelado'
    ) as po_folios,
    n.ultimo_contacto_at, n.nota_ultimo_contacto
  from public.ventas_notas_remision n
  join public.ventas_pedidos ped on ped.id = n.pedido_id
  join public.ventas_cotizaciones c on c.id = ped.cotizacion_id
  left join public.entidades e on e.id = n.entidad_id
  where (p_estado is null or n.estado = p_estado)
    and (p_vendedor is null or n.vendedor_id = p_vendedor)
  order by n.emitida_at desc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

revoke execute on function public.ventas_tablero_nr(public.nr_estado, uuid, integer, integer) from public, anon;
grant execute on function public.ventas_tablero_nr(public.nr_estado, uuid, integer, integer) to authenticated, service_role;

-- =========================================
-- 4. ventas_kpis() — tarjetas del tablero
-- =========================================
create or replace function public.ventas_kpis()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'cotizaciones_borrador', (select count(*) from public.ventas_cotizaciones where estado = 'borrador'),
    'cotizaciones_enviadas', (select count(*) from public.ventas_cotizaciones where estado = 'enviada'),
    'nr_entregadas_sin_po', (select count(*) from public.ventas_notas_remision where estado = 'entregada_sin_po'),
    'nr_parcialmente_respaldadas', (
      select count(*) from public.ventas_notas_remision where estado = 'parcialmente_respaldada'
    ),
    'nr_con_incidencia', (select count(*) from public.ventas_notas_remision where estado = 'con_incidencia'),
    'po_pendiente_confirmacion', (
      select count(*) from public.ventas_ordenes_compra_cliente where estado = 'pendiente_de_confirmacion'
    ),
    'valor_entregado_sin_po', (
      select coalesce(sum(n.valor_total), 0) from public.ventas_notas_remision n
       where n.estado in ('entregada_sin_po', 'parcialmente_respaldada')
    ),
    'autorizaciones_pendientes', (select count(*) from public.ventas_autorizaciones where estado = 'pendiente'),
    'clientes_congelados', (select count(*) from public.cliente_congelamientos where estado = 'activo')
  );
$$;

revoke execute on function public.ventas_kpis() from public, anon;
grant execute on function public.ventas_kpis() to authenticated, service_role;

-- =========================================
-- 5. ventas_cotizaciones_expirar() — barrido oportunista (sin cron)
-- =========================================
-- No hay scheduler en el proyecto: se invoca al cargar el listado de
-- cotizaciones (y con botón manual para Dirección). Documentado:
-- ventas_cotizacion_aprobar() (031) ya valida vigencia por FECHA, no por
-- estado, así que aprobar una cotización recién expirada es imposible
-- aunque la pantalla todavía la muestre como 'enviada'.
create or replace function public.ventas_cotizaciones_expirar()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_filas integer;
begin
  if public.current_user_role() is null then
    raise exception 'Sesión inválida.' using errcode = '42501';
  end if;

  update public.ventas_cotizaciones
     set estado = 'expirada', updated_at = now()
   where estado = 'enviada' and vigencia_hasta is not null and vigencia_hasta < current_date;
  get diagnostics v_filas = row_count;

  return v_filas;
end;
$$;

revoke execute on function public.ventas_cotizaciones_expirar() from public, anon;
grant execute on function public.ventas_cotizaciones_expirar() to authenticated;
