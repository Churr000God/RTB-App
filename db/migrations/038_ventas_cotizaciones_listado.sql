-- ==========================================
-- RTB Sistema — 038: listado enriquecido de cotizaciones (búsqueda,
-- tablero por estado y filtros de RTB-VEN-01)
--
-- El listado de /dashboard/ventas/cotizaciones era el único de Ventas que
-- seguía con `.limit(50)` sin paginación real (quedó fuera de la migración
-- a "explorer" de la sesión de optimizaciones, §3.2 de
-- contexto/AUDITORIA_RTB-VEN-01.md). Para dar búsqueda por folio/siglas/
-- nombre/clave, un tablero de tarjetas agrupado por estado y filtros de
-- fecha, hace falta: (a) columnas planas del cliente (hoy sólo viven en
-- `entidades`, cruzada por `entidad_id`, sin `cliente_id`) para poder usar
-- un solo `.or()` de PostgREST, y (b) el monto total, que no existe en la
-- cabecera — es `sum(ventas_cotizacion_lineas.importe) where activo`.
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

-- =========================================
-- 1. Índices para ordenar/filtrar por fecha
-- =========================================
-- create index (sin concurrently): mismo criterio que el resto de
-- migraciones de este repo (030-037), aplicadas vía apply_migration
-- transaccional sobre una tabla con volumen mínimo (< 10 filas hoy).
create index idx_ventas_cot_created_at on public.ventas_cotizaciones (created_at desc);

create index idx_ventas_cot_resuelta_at on public.ventas_cotizaciones (resuelta_at desc)
  where resuelta_at is not null;

create index idx_ventas_cot_enviada_at on public.ventas_cotizaciones (enviada_at desc)
  where enviada_at is not null;

create index idx_ventas_cot_vigencia on public.ventas_cotizaciones (vigencia_hasta)
  where vigencia_hasta is not null;

-- =========================================
-- 2. Vista: public.ventas_cotizaciones_listado
-- =========================================
-- security_invoker = true (NO el patrón "función, no vista" de
-- public.usuarios_directorio(), 002_entidades_core.sql:496-501): ese
-- patrón existe para saltarse la RLS a propósito, lo que hace ERROR una
-- vista security_invoker=false en el advisor. Aquí es lo opuesto — se
-- quiere que la vista respete la RLS de ventas_cotizaciones/entidades/
-- ventas_cotizacion_lineas tal cual, así que security_invoker=true no
-- dispara ese advisor (confirmado: es la primera vista del repo). A
-- cambio da algo que una función SECURITY DEFINER no puede: PostgREST
-- puede hacer .or()/.range()/.order()/count:'exact' directo sobre sus
-- columnas, incluido un solo .or() cruzando folio (cabecera) y
-- siglas/nombre/clave (entidades) — imposible con .or() nativo si folio
-- y esas columnas vivieran en tablas distintas sin aplanar.
--
-- Verificado antes de crear la vista: ventas_cotizaciones_select,
-- entidades_select y ventas_cotizacion_lineas_select son las tres
-- exactamente `using (public.current_user_role() is not null)` — ningún
-- rol pierde filas ni ve totales en cero por el join/left join lateral.
--
-- LEFT JOIN a entidades (no INNER): entidad_id es NOT NULL con FK, así que
-- hoy nunca falta la fila. Pero con security_invoker=true un INNER JOIN
-- haría que la completitud del LISTADO DE COTIZACIONES dependiera de la
-- RLS de OTRA tabla — si algún día entidades_select se estrecha por rol,
-- cotizaciones enteras desaparecerían del listado en silencio (mismo modo
-- de fallo que audit_log sin GRANT, 008). Con LEFT JOIN, en ese escenario
-- se perdería el nombre del cliente, nunca la cotización.
--
-- Verificado con EXPLAIN (analyze, buffers, verbose): el left join lateral
-- de líneas se PODA por completo del plan cuando PostgREST pide sólo
-- count(*) (Postgres prueba que la lateral siempre da como máximo una fila
-- y sus columnas no se usan) — el conteo exacto de cada página/columna del
-- tablero no paga la agregación sobre ventas_cotizacion_lineas.
create view public.ventas_cotizaciones_listado
with (security_invoker = true) as
select
  c.id,
  c.folio,
  c.entidad_id,
  c.vendedor_id,
  c.canal_entrada,
  c.medio_seguimiento,
  c.moneda,
  c.vigencia_hasta,
  c.estado,
  c.enviada_at,
  c.enviada_por,
  c.resuelta_at,
  c.resuelta_por,
  c.motivo_resolucion,
  c.observaciones,
  c.created_by,
  c.created_at,
  c.updated_at,
  e.clave            as entidad_clave,
  e.siglas           as entidad_siglas,
  e.nombre_legal     as entidad_nombre_legal,
  e.nombre_comercial as entidad_nombre_comercial,
  coalesce(l.total, 0)::numeric(18, 4) as total,
  coalesce(l.lineas_count, 0)::integer as lineas_count,
  coalesce(l.en_consulta, 0)::integer  as lineas_en_consulta
from public.ventas_cotizaciones c
left join public.entidades e on e.id = c.entidad_id
left join lateral (
  select
    sum(li.importe) as total,
    count(*)        as lineas_count,
    count(*) filter (where li.en_consulta) as en_consulta
  from public.ventas_cotizacion_lineas li
  where li.cotizacion_id = c.id
    and li.activo
) l on true;

comment on view public.ventas_cotizaciones_listado is
  'Listado de cotizaciones para /dashboard/ventas/cotizaciones (búsqueda,
   tablero por estado, filtros de fecha). security_invoker=true: aplana
   entidades (clave/siglas/nombre) y agrega el total de líneas activas —
   respeta la RLS de las tres tablas base, no la sustituye. Sólo lectura;
   toda escritura sigue pasando por ventas_cotizaciones y sus funciones
   SECURITY DEFINER (031/032/033/034), esta vista no las reemplaza.';

-- GRANT explícito y separado de la RLS de las tablas base: el gotcha ya
-- documentado (RLS sin GRANT de tabla falla en silencio desde el
-- cliente, ver 008_audit_log_grant_select.sql) aplica igual a una vista
-- — sin este grant, PostgREST devuelve 42501, no "cero filas por RLS".
grant select on public.ventas_cotizaciones_listado to authenticated, service_role;
