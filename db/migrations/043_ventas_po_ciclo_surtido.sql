-- 043_ventas_po_ciclo_surtido.sql
-- RTB-VEN-01 — Vía B: la PO del cliente nace al aprobar la cotización, ya
-- no se da de alta a mano. Ciclo de vida nuevo de po_estado (abierta →
-- parcialmente_surtida → surtida → facturada → pagada_cerrada, + cancelada)
-- en vez del ciclo de validación PO↔NR de 033 (recibida/en_validacion/
-- parcialmente_vinculada/vinculada/pendiente_de_confirmacion/rechazada/
-- corregida). La maquinaria de validación por partida
-- (ventas_po_validar()/ventas_vinculo_cancelar()) se retira porque deja de
-- tener sentido: la PO nace de datos ya consistentes (copiados 1:1 de las
-- líneas del pedido en la misma transacción de aprobación), no de una
-- recaptura manual que hay que auditar contra la NR.
--
-- La Vía A (una PO que llega DESPUÉS de una NR, sin que la cotización se
-- haya aprobado como PO) queda deliberadamente fuera de esta entrega — ver
-- CLAUDE.md TODO. Por eso se conservan intactas la tabla
-- ventas_po_nr_vinculos, el enum vinculo_estado, sus 2 constraint triggers
-- diferidos, y ventas_autorizaciones/ventas_autorizacion_resolver(): son
-- exactamente lo que la Vía A necesita de vuelta, y quedan inertes (sus dos
-- únicos escritores se retiran en este archivo; nunca hubo GRANT de
-- escritura para authenticated sobre ventas_po_nr_vinculos).
--
-- Este archivo es sólo esquema. Las funciones (ventas_kpis(),
-- tiene_operaciones_abiertas(), ventas_cotizacion_aprobar(), etc.) van en
-- 044 — DESPUÉS de que el enum ya haya cambiado, porque ventas_kpis()/
-- tiene_operaciones_abiertas() son "language sql" y Postgres valida sus
-- literales de enum en el CREATE, no al invocarlas (mismo gotcha ya
-- documentado para "language sql" vs "plpgsql", aplicado aquí a un swap de
-- enum en vez de a una tabla creada más abajo).

-- =========================================================================
-- 1. Retirar la maquinaria de validación PO↔NR (Vía A)
-- =========================================================================

drop function if exists public.ventas_po_validar(uuid, jsonb, uuid, boolean);
drop function if exists public.ventas_vinculo_cancelar(uuid, text);

comment on table public.ventas_po_nr_vinculos is
  'Tabla de asignación PO↔NR por partida (033). Sus dos escritores
   (ventas_po_validar()/ventas_vinculo_cancelar()) se retiraron en 043 al
   pasar la PO a nacer directamente de la cotización aprobada (Vía B) — no
   hay ningún GRANT de insert/update para authenticated, así que la tabla
   queda inerte, no borrada: es exactamente lo que necesita la Vía A (PO
   que llega DESPUÉS de una NR) cuando se construya en una entrega futura.
   Los 2 constraint triggers diferidos (vinculo_valida_cobertura_nr/
   _partida) siguen intactos.';

-- =========================================================================
-- 2. Cambio de enum po_estado
-- =========================================================================
-- Orden verificado contra pg_depend antes de escribir esto — dependencias
-- reales del tipo: el default de columna, la columna misma, el índice
-- único parcial uq_po_numero (su predicado usa el enum), el CHECK
-- po_rechazo_chk, y la policy ventas_po_partidas_insert. idx_po_estado NO
-- depende del tipo (btree simple sobre la columna) — sobrevive solo al
-- ALTER COLUMN TYPE, no hace falta tocarlo.

drop policy if exists ventas_po_partidas_insert on public.ventas_po_partidas;

alter table public.ventas_ordenes_compra_cliente
  drop constraint po_rechazo_chk;

drop index public.uq_po_numero;

alter table public.ventas_ordenes_compra_cliente
  alter column estado drop default;

alter type public.po_estado rename to po_estado_old;

create type public.po_estado as enum (
  'abierta', 'parcialmente_surtida', 'surtida', 'facturada', 'pagada_cerrada', 'cancelada'
);

alter table public.ventas_ordenes_compra_cliente
  alter column estado type public.po_estado
  using (
    case estado::text
      when 'cancelada' then 'cancelada'
      when 'rechazada' then 'cancelada'
      else 'abierta'
    end
  )::public.po_estado;

alter table public.ventas_ordenes_compra_cliente
  alter column estado set default 'abierta'::public.po_estado;

drop type public.po_estado_old;

create unique index uq_po_numero on public.ventas_ordenes_compra_cliente (entidad_id, numero_po_normalizado)
  where estado <> 'cancelada' and numero_po_normalizado is not null;

comment on type public.po_estado is
  'Ciclo de surtido de la Vía B (043): abierta → parcialmente_surtida →
   surtida → facturada → pagada_cerrada, + cancelada. Sustituye al ciclo de
   validación por partida de 033 (recibida/en_validacion/
   parcialmente_vinculada/vinculada/pendiente_de_confirmacion/rechazada/
   corregida), retirado porque la PO ya nace de datos consistentes — ver
   comentario de cabecera de este archivo.';

-- =========================================================================
-- 3. Columnas nuevas — ventas_ordenes_compra_cliente
-- =========================================================================

alter table public.ventas_ordenes_compra_cliente
  add column cotizacion_id uuid references public.ventas_cotizaciones(id) on delete restrict,
  add column surtida_at timestamptz,
  add column cancelada_at timestamptz,
  add column cancelada_por uuid references public.profiles(id),
  add column motivo_cancelacion text;

create index idx_po_cotizacion on public.ventas_ordenes_compra_cliente (cotizacion_id)
  where cotizacion_id is not null;

-- Relics de QA (2 PO de la campaña de Vía A, sin cotizacion_id ni ninguna
-- forma de encajar en el ciclo nuevo): se marcan cancelada explícitamente
-- para que no aparezcan como "abierta" en el tablero nuevo sin que nadie
-- vaya a surtirlas jamás. Actor = el super_admin más antiguo del proyecto
-- (cuenta real de sistema, no una cuenta QA), igual que exige
-- po_cancelacion_chk (creado más abajo, después de este UPDATE).
update public.ventas_ordenes_compra_cliente
   set estado = 'cancelada',
       cancelada_at = now(),
       cancelada_por = (select id from public.profiles where role = 'super_admin' order by created_at limit 1),
       motivo_cancelacion = 'Relic de QA de Vía A (043) — ciclo de validación por partida retirado, sin cotización de origen.'
 where estado <> 'cancelada';

alter table public.ventas_ordenes_compra_cliente
  add constraint po_cancelacion_chk check (
    (estado = 'cancelada') = (
      cancelada_at is not null and cancelada_por is not null
      and length(btrim(coalesce(motivo_cancelacion, ''))) > 0
    )
  );

alter table public.ventas_ordenes_compra_cliente
  add constraint uq_po_id_pedido unique (id, pedido_id);

comment on column public.ventas_ordenes_compra_cliente.validada_at is
  'Vestigial de la Vía A (033) — sin escritor desde 043 (ventas_po_validar()
   se retiró). Se conserva por el histórico de audit_log, no por uso activo.';
comment on column public.ventas_ordenes_compra_cliente.validada_por is
  'Vestigial de la Vía A (033) — sin escritor desde 043.';
comment on column public.ventas_ordenes_compra_cliente.motivo_rechazo is
  'Vestigial de la Vía A (033) — sin escritor desde 043 (el enum ya no tiene
   ''rechazada''; las filas viejas con ese estado se remapearon a
   ''cancelada'' arriba).';
comment on column public.ventas_ordenes_compra_cliente.duplicada_de is
  'Vestigial de la Vía A (033) — sin escritor desde 043.';
comment on column public.ventas_ordenes_compra_cliente.recibida_por is
  'En Vía B (043) pasa a significar "quién aprobó la cotización que generó
   esta PO" — lo sigue rellenando ventas_po_before_insert() con auth.uid().';

-- =========================================================================
-- 4. Columnas nuevas — ventas_po_partidas (pasa a ser la tabla de líneas
--    de la PO, espejo de ventas_nr_lineas)
-- =========================================================================

alter table public.ventas_po_partidas
  add column pedido_id uuid,
  add column pedido_linea_id uuid,
  add column unidad_medida_id uuid references public.unidades_medida(id) on delete restrict,
  add column cantidad_entregada numeric(18, 4) not null default 0;

alter table public.ventas_po_partidas
  add constraint po_partida_entregada_chk check (cantidad_entregada >= 0 and cantidad_entregada <= cantidad),
  add constraint ventas_po_partidas_pedido_linea_fkey
    foreign key (pedido_linea_id, pedido_id) references public.ventas_pedido_lineas (id, pedido_id),
  add constraint ventas_po_partidas_po_pedido_fkey
    foreign key (po_id, pedido_id) references public.ventas_ordenes_compra_cliente (id, pedido_id);

comment on constraint ventas_po_partidas_pedido_linea_fkey on public.ventas_po_partidas is
  'FK compuesta MATCH SIMPLE: no se evalúa si pedido_id es NULL, así que las
   3 partidas relic de QA (sin pedido_id) no la violan. Tras 043 nadie puede
   insertar en esta tabla salvo ventas_cotizacion_aprobar() (044), que
   siempre puebla ambas columnas — esta FK es defensa en profundidad para
   cuando vuelva la captura manual de partidas de la Vía A.';

create index idx_po_partidas_pedido_linea on public.ventas_po_partidas (pedido_linea_id)
  where pedido_linea_id is not null;

create trigger audit_ventas_po_partidas after insert or update on public.ventas_po_partidas
  for each row execute function public.audit_row();

comment on column public.ventas_po_partidas.codigo_cliente is
  'Vestigial de la Vía A (033) — en Vía B (043) las partidas se copian de
   nuestras propias líneas de pedido, así que siempre queda NULL.';
comment on column public.ventas_po_partidas.codigo_divergente is
  'Vestigial de la Vía A (033) — en Vía B (043) siempre false (ver
   codigo_cliente).';

-- =========================================================================
-- 5. Cerrar el alta manual de PO y partidas
-- =========================================================================
-- Quedan como ventas_pedidos: sólo SELECT de tabla para authenticated,
-- toda escritura pasa por funciones SECURITY DEFINER (dueño postgres, no
-- necesita GRANT ni pasa por RLS — verificado).

revoke insert on public.ventas_ordenes_compra_cliente from authenticated;
revoke insert on public.ventas_po_partidas from authenticated;
drop policy if exists ventas_po_insert on public.ventas_ordenes_compra_cliente;

-- Nota: "adjuntar evidencia" (evidencia_path) se hace por función
-- (ventas_po_adjuntar_evidencia(), 044), no por GRANT UPDATE + policy —
-- coherente con "la PO sólo transiciona por función" que este paso acaba
-- de instaurar, y evita el patrón de riesgo ya documentado en CLAUDE.md
-- (.update() sin .select() no distingue "0 filas por RLS" de "1 fila
-- actualizada").

-- =========================================================================
-- 6. Vía de aprobación del pedido
-- =========================================================================

create type public.pedido_via as enum ('nota_remision', 'orden_compra');

alter table public.ventas_pedidos
  add column via public.pedido_via not null default 'nota_remision';

comment on column public.ventas_pedidos.via is
  'Vía elegida al aprobar la cotización (043). nota_remision = ciclo NR
   (032/035), sin cambios. orden_compra = Vía B: la PO nace junto con el
   pedido en ventas_cotizacion_aprobar() y el despacho va por
   ventas_po_despachar() (044), sin NR — ventas_nr_emitir() la rechaza.
   Los 3 pedidos previos a 043 son de la Vía A/NR y quedan en el default.
   Sin GRANT para nadie: sólo la función la escribe.';

-- =========================================================================
-- 7. Devoluciones: enlace a la PO de origen (Vía B)
-- =========================================================================

alter table public.ventas_devoluciones
  add column po_id uuid references public.ventas_ordenes_compra_cliente(id);

comment on column public.ventas_devoluciones.po_id is
  'Poblado por ventas_cotizacion_cancelar() (044) cuando la devolución nace
   de un pedido de Vía B (via=''orden_compra'') — nr_id queda NULL en ese
   caso. Nullable: una devolución de Vía A/NR sigue enlazando por nr_id.';

-- =========================================================================
-- 8. Vista ventas_ordenes_compra_listado — patrón "explorer" (038)
-- =========================================================================

create view public.ventas_ordenes_compra_listado
with (security_invoker = true) as
select
  po.id, po.folio, po.numero_po, po.entidad_id, po.pedido_id, po.cotizacion_id,
  po.moneda, po.subtotal_declarado, po.total_declarado, po.fecha_po, po.canal_entrega,
  po.evidencia_path, po.razon_social_declarada, po.rfc_declarado, po.estado,
  po.surtida_at, po.cancelada_at, po.cancelada_por, po.motivo_cancelacion,
  po.recibida_por, po.created_by, po.created_at, po.updated_at,
  e.clave as entidad_clave,
  e.siglas as entidad_siglas,
  e.nombre_legal as entidad_nombre_legal,
  e.nombre_comercial as entidad_nombre_comercial,
  ped.folio as pedido_folio,
  cot.folio as cotizacion_folio,
  coalesce(part.partidas_count, 0)::integer as partidas_count,
  coalesce(part.total, 0)::numeric(18, 4) as total,
  coalesce(part.cantidad_total, 0)::numeric(18, 4) as cantidad_total,
  coalesce(part.cantidad_entregada_total, 0)::numeric(18, 4) as cantidad_entregada_total
from public.ventas_ordenes_compra_cliente po
left join public.entidades e on e.id = po.entidad_id
left join public.ventas_pedidos ped on ped.id = po.pedido_id
left join public.ventas_cotizaciones cot on cot.id = po.cotizacion_id
left join lateral (
  select count(*) as partidas_count,
         sum(pp.subtotal) as total,
         sum(pp.cantidad) as cantidad_total,
         sum(pp.cantidad_entregada) as cantidad_entregada_total
    from public.ventas_po_partidas pp
   where pp.po_id = po.id
) part on true;

comment on view public.ventas_ordenes_compra_listado is
  'Listado de PO para /dashboard/ventas/ordenes-compra (búsqueda, tablero
   por estado, filtros de fecha) — mismo patrón que
   ventas_cotizaciones_listado (038). security_invoker=true: aplana
   entidades/pedido/cotización y agrega las partidas, respeta la RLS de las
   tablas base, no la sustituye. LEFT JOIN a propósito en las cuatro tablas
   (igual que 038): si la RLS de alguna se estrechara algún día, se pierde
   el dato aplanado, nunca la fila de PO. Sólo lectura; toda escritura sigue
   pasando por ventas_ordenes_compra_cliente/ventas_po_partidas y sus
   funciones SECURITY DEFINER (044).';

revoke all on public.ventas_ordenes_compra_listado from anon, authenticated;
grant select on public.ventas_ordenes_compra_listado to authenticated;

-- Mismo estrechamiento para la vista de 038: quedó con ALL para anon por el
-- GRANT por default de Supabase sobre vistas creadas por postgres — inocuo
-- (security_invoker=true dejaría a anon sin filas de todas formas), pero no
-- hay razón para dejarlo así de ahora en adelante.
revoke all on public.ventas_cotizaciones_listado from anon, authenticated, service_role;
grant select on public.ventas_cotizaciones_listado to authenticated, service_role;

-- =========================================================================
-- 9. Índices por campo de fecha filtrable
-- =========================================================================

create index idx_po_created_at on public.ventas_ordenes_compra_cliente (created_at desc);
create index idx_po_fecha_po on public.ventas_ordenes_compra_cliente (fecha_po desc) where fecha_po is not null;
create index idx_po_surtida_at on public.ventas_ordenes_compra_cliente (surtida_at desc) where surtida_at is not null;
