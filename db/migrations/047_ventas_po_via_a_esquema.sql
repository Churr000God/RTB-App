-- 047_ventas_po_via_a_esquema.sql
-- RTB-VEN-01 — Vía A: esquema. Continúa 046 (ya en commit: po_estado y
-- ventas_autorizacion_tipo ya tienen sus valores nuevos).

-- ── 1. Origen de la PO y tipo de partida ────────────────────────────────
-- origen distingue si la PO nació dentro de ventas_cotizacion_aprobar()
-- (Vía B, 043) o desde el tablero de NR (Vía A, esta entrega). Es
-- derivable de pedido_id/tipo de partida, pero se hace explícito porque lo
-- consumen la vista de listado, el badge de la pantalla y las guardas de
-- las funciones de 048.
create type public.po_origen as enum ('cotizacion_aprobada', 'posterior_a_entrega');

alter table public.ventas_ordenes_compra_cliente
  add column origen public.po_origen not null default 'cotizacion_aprobada';

comment on column public.ventas_ordenes_compra_cliente.origen is
  'cotizacion_aprobada = Vía B (043, nace dentro de ventas_cotizacion_aprobar()). '
  'posterior_a_entrega = Vía A (047/048, nace desde el tablero de NR cuando llega '
  'la PO física después de una o varias NR ya emitidas). Default deliberado: no '
  'requiere tocar el INSERT de ventas_cotizacion_aprobar() para las PO de Vía B.';

-- tipo distingue las dos clases de partida que puede traer una PO de Vía A
-- (una PO de Vía B sólo produce 'compromiso', de ahí el default):
--   'respaldo'   — mercancía YA ENTREGADA por una NR previa. pedido_linea_id
--                  queda NULL (no hay apartado que crear: la salida de
--                  kardex ya la hizo ventas_nr_despachar()) y
--                  cantidad_entregada nace igual a cantidad — es la verdad,
--                  esa mercancía ya salió del almacén, y de paso hace que
--                  el conteo de pendientes que ya usa ventas_po_despachar()
--                  (count(*) filter (where cantidad_entregada < cantidad))
--                  la ignore sin ningún condicional nuevo.
--   'compromiso' — mercancía POR ENTREGAR, se surte después contra la PO
--                  con kardex real (igual que ya hace Vía B).
-- Regla de negocio derivada, documentada aquí porque no es obvia: si la PO
-- del cliente pide 10 de una parte y sólo se entregaron 7, eso son DOS
-- partidas (una 'respaldo' de 7 + una 'compromiso' de 3), nunca una sola
-- partida de 10 parcialmente cubierta — es lo único que mantiene coherentes
-- a la vez po_partida_respaldo_chk (abajo), el trigger diferido
-- vinculo_valida_cobertura_partida() (033, compara contra `cantidad`) y
-- ese mismo conteo de pendientes.
create type public.po_partida_tipo as enum ('compromiso', 'respaldo');

alter table public.ventas_po_partidas
  add column tipo public.po_partida_tipo not null default 'compromiso';

alter table public.ventas_po_partidas
  add constraint po_partida_respaldo_chk check (
    tipo <> 'respaldo'
    or (pedido_linea_id is null and cantidad_entregada = cantidad and producto_id is not null)
  );

comment on column public.ventas_po_partidas.tipo is
  'compromiso (default) = por entregar, se surte contra la PO (Vía A y Vía B). '
  'respaldo = ya entregado por una NR previa (sólo Vía A) — ver po_partida_respaldo_chk '
  'y el comentario de esta migración para la regla "10 pedidos / 7 entregados = 2 partidas".';

create index idx_po_origen on public.ventas_ordenes_compra_cliente (origen);
create index idx_po_partidas_tipo on public.ventas_po_partidas (tipo) where tipo = 'respaldo';

-- ── 2. La colisión real: FK compuesta que hace imposible una PO multi-pedido ──
-- ventas_po_partidas_po_pedido_fkey (po_id, pedido_id) → ventas_ordenes_
-- compra_cliente (id, pedido_id), MATCH SIMPLE (default), obliga a que toda
-- partida con pedido_id no nulo comparta el pedido_id de su PO. Una PO de
-- Vía A respalda/compromete NR de PEDIDOS DISTINTOS, con po.pedido_id =
-- NULL — la FK rechazaría cualquier partida suya con pedido_id poblado
-- (caso C, ver 048). Se sustituye por un trigger que conserva la garantía
-- real que la FK daba a Vía B (si la PO sí tiene un único pedido, toda
-- partida suya con pedido_id debe coincidir) sin bloquear el caso
-- multi-pedido de Vía A.
alter table public.ventas_po_partidas drop constraint ventas_po_partidas_po_pedido_fkey;

comment on constraint uq_po_id_pedido on public.ventas_ordenes_compra_cliente is
  'Sostenía ventas_po_partidas_po_pedido_fkey (043), dropeada en 047 por ser '
  'incompatible con una PO de Vía A que cubre NR de pedidos distintos '
  '(po.pedido_id = NULL). Se conserva inerte — id ya es PK, así que este '
  'índice no cuesta nada — por si una PO de Vía B futura vuelve a necesitar '
  'la FK compuesta. La coherencia real hoy la da po_partida_coherencia_pedido().';

create or replace function public.po_partida_coherencia_pedido()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_po_pedido_id uuid;
begin
  select pedido_id into v_po_pedido_id from public.ventas_ordenes_compra_cliente where id = new.po_id;
  if v_po_pedido_id is not null and new.pedido_id is distinct from v_po_pedido_id then
    raise exception 'La partida % debe pertenecer al mismo pedido que su PO (%).', new.id, v_po_pedido_id
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

comment on function public.po_partida_coherencia_pedido() is
  'Sustituye a ventas_po_partidas_po_pedido_fkey (dropeada en 047): si la PO '
  'tiene un único pedido (Vía B), toda partida suya con pedido_id debe '
  'coincidir. Si la PO no tiene pedido único (po.pedido_id NULL, Vía A '
  'multi-pedido), no se exige nada — cada partida trae el pedido_id que le '
  'corresponda por su propia línea de origen.';

create trigger before_write_po_partidas_coherencia
  before insert or update on public.ventas_po_partidas
  for each row execute function public.po_partida_coherencia_pedido();

-- ── 3. inventario_apartados: origen de apartado de primera clase por PO ─
-- Resuelve la tensión ventas_pedidos.cotizacion_id NOT NULL (verificada
-- por SQL) contra partidas nuevas capturadas directo en la PO (caso N,
-- sin cotización ni pedido) que igual deben poder apartar inventario y
-- surtirse con kardex real (requisito 5 del dueño del proyecto). Barato
-- porque pedido_id/pedido_linea_id YA son nullable desde 035, y
-- ventas_po_despachar() ya no usa el pedido para el movimiento de kardex
-- (referencia_tipo='orden_compra_cliente', sin CHECK). Se descartaron:
-- inyectar la partida nueva en la cotización del caso C (reescribiría un
-- documento ya enviado al cliente por correo, 042); relajar
-- ventas_pedidos.cotizacion_id (ventas_tablero_nr() y varias funciones
-- asumen la relación con INNER JOIN — alto riesgo para un problema local);
-- cotización de respaldo autogenerada (ensucia el explorer de Cotizaciones
-- con documentos que nadie pidió).
alter table public.inventario_apartados
  add column po_partida_id uuid references public.ventas_po_partidas(id) on delete restrict;

alter table public.inventario_apartados
  add constraint apartados_origen_chk check (pedido_linea_id is null or po_partida_id is null);

comment on column public.inventario_apartados.po_partida_id is
  'Origen de apartado de la Vía A (047) cuando la partida NO tiene pedido '
  '(caso N: producto nuevo capturado directo en la PO, sin cotización '
  'detrás). Mutuamente excluyente con pedido_linea_id (apartados_origen_chk) '
  '— un apartado nace de un pedido O de una partida de PO sin pedido, nunca '
  'de ambos.';

-- apartados_nivel_pedido_chk (011) exigía pedido_id para cualquier apartado
-- en nivel='compromiso' — correcto mientras el único origen sin 'reserva'
-- previa era un pedido. Se amplía para admitir también el origen por
-- po_partida_id (caso N): un apartado nace 'reserva' igual que los de
-- pedido, y ventas_po_liberar_almacen() (048) lo promueve a 'compromiso'
-- exactamente igual que ventas_pedido_liberar_almacen() ya hace con los de
-- pedido — sólo cambia qué columna prueba que el apartado tiene un dueño.
alter table public.inventario_apartados drop constraint apartados_nivel_pedido_chk;
alter table public.inventario_apartados add constraint apartados_nivel_pedido_chk
  check (nivel = 'reserva' or pedido_id is not null or po_partida_id is not null);

create unique index uq_apartados_po_partida_activo
  on public.inventario_apartados (po_partida_id)
  where po_partida_id is not null and estado = 'activo';

comment on index public.uq_apartados_po_partida_activo is
  'Como máximo una reserva activa por partida de PO sin pedido (caso N) — '
  'mismo invariante que uq_apartados_pedido_linea_activo (035), es lo que '
  'permite a ventas_po_despachar() (048) resolver el apartado con una sola '
  'fila sin order by/limit arbitrario.';

-- apartados_before_update() (cuerpo vivo, verificado por pg_get_functiondef()
-- antes de escribir esta migración): se le agrega la congelación de
-- po_partida_id junto a las que ya hace de producto_id/ubicacion_id/
-- cantidad/solicitante_id/pedido_id/pedido_linea_id — el origen de un
-- apartado no cambia después de creado, sólo su estado/nivel.
create or replace function public.apartados_before_update()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if old.estado <> 'activo' then
    raise exception 'Un apartado % ya no está activo, no admite más cambios', old.id
      using errcode = '42501';
  end if;
  new.producto_id := old.producto_id;
  new.ubicacion_id := old.ubicacion_id;
  new.cantidad := old.cantidad;
  new.solicitante_id := old.solicitante_id;
  new.pedido_id := old.pedido_id;
  new.pedido_linea_id := old.pedido_linea_id;
  new.po_partida_id := old.po_partida_id;
  new.updated_at := now();

  if old.nivel = 'compromiso' and new.nivel = 'reserva' then
    raise exception 'Un apartado comprometido no regresa a reserva; libéralo y crea uno nuevo si hace falta.'
      using errcode = '42501';
  end if;

  if new.estado is distinct from old.estado then
    new.liberado_at := now();
    new.liberado_por := auth.uid();
    update public.inventario_existencias
       set cantidad_apartada = greatest(cantidad_apartada - old.cantidad, 0),
           updated_at = now(), updated_by = auth.uid()
     where producto_id = old.producto_id and ubicacion_id is not distinct from old.ubicacion_id;
  end if;
  return new;
end;
$function$;

-- ── 4. ventas_devoluciones: cotizacion_id nullable ──────────────────────
-- po_id ya existe (043, FK a ventas_ordenes_compra_cliente) — la otra
-- sesión ya lo dejó listo para una devolución nacida de un pedido de Vía B.
-- Verificado por SQL: cotizacion_id sigue NOT NULL. Una PO de Vía A
-- compuesta SÓLO de partidas nuevas (caso N puro, sin cotización) no
-- podría abrir devolución sin este cambio. Consecuencia irreconciliable
-- aceptada y documentada en el plan: no existe todavía una función que
-- abra esa devolución (ventas_po_devolver() — TODO, fuera de esta
-- entrega); esta migración sólo deja el hueco de esquema cerrado para
-- cuando se escriba.
alter table public.ventas_devoluciones alter column cotizacion_id drop not null;

alter table public.ventas_devoluciones
  add constraint dev_origen_chk check (cotizacion_id is not null or po_id is not null);

comment on column public.ventas_devoluciones.cotizacion_id is
  'Nullable desde 047: una devolución de una PO de Vía A compuesta sólo de '
  'partidas nuevas (caso N) no tiene cotización de origen. dev_origen_chk '
  'exige al menos cotizacion_id o po_id.';

-- ── 5. Vista ventas_ordenes_compra_listado: columnas nuevas al final ────
-- create or replace view sólo admite agregar columnas, nunca reordenar ni
-- quitar — así las 4 pantallas de Vía B (ordenes-compra-{explorer,filtros,
-- tabla,tablero}.tsx) siguen funcionando sin tocarlas. Cuerpo base
-- reproducido tal cual desde pg_get_viewdef() (verificado antes de
-- escribir esta migración), con 6 columnas nuevas al final:
--   origen                    — de la PO (§1).
--   respaldo_partidas         — cuántas partidas 'respaldo' tiene.
--   compromiso_partidas       — cuántas partidas 'compromiso' tiene.
--   nr_folios                 — folios de NR que respalda (vía vínculos activos).
--   diferencia_precio_total   — Σ cantidad_cubierta·(precio_po - precio_nr) de
--                                sus vínculos activos; 0 si no hay divergencia.
--   autorizacion_pendiente_id — id de la autorización pendiente más reciente
--                                sobre esta PO (precio_po_divergente/
--                                ampliacion_po), NULL si no hay ninguna.
create or replace view public.ventas_ordenes_compra_listado
with (security_invoker = true) as
select
  po.id, po.folio, po.numero_po, po.entidad_id, po.pedido_id, po.cotizacion_id, po.moneda,
  po.subtotal_declarado, po.total_declarado, po.fecha_po, po.canal_entrega, po.evidencia_path,
  po.razon_social_declarada, po.rfc_declarado, po.estado, po.surtida_at, po.cancelada_at,
  po.cancelada_por, po.motivo_cancelacion, po.recibida_por, po.created_by, po.created_at, po.updated_at,
  e.clave as entidad_clave, e.siglas as entidad_siglas, e.nombre_legal as entidad_nombre_legal,
  e.nombre_comercial as entidad_nombre_comercial,
  ped.folio as pedido_folio, cot.folio as cotizacion_folio,
  coalesce(part.partidas_count, 0)::integer as partidas_count,
  coalesce(part.total, 0)::numeric(18, 4) as total,
  coalesce(part.cantidad_total, 0)::numeric(18, 4) as cantidad_total,
  coalesce(part.cantidad_entregada_total, 0)::numeric(18, 4) as cantidad_entregada_total,
  po.origen,
  coalesce(part.respaldo_partidas, 0)::integer as respaldo_partidas,
  coalesce(part.compromiso_partidas, 0)::integer as compromiso_partidas,
  vin.nr_folios,
  coalesce(vin.diferencia_precio_total, 0)::numeric(18, 4) as diferencia_precio_total,
  aut.autorizacion_pendiente_id
from public.ventas_ordenes_compra_cliente po
left join public.entidades e on e.id = po.entidad_id
left join public.ventas_pedidos ped on ped.id = po.pedido_id
left join public.ventas_cotizaciones cot on cot.id = po.cotizacion_id
left join lateral (
  select
    count(*) as partidas_count,
    sum(pp.subtotal) as total,
    sum(pp.cantidad) as cantidad_total,
    sum(pp.cantidad_entregada) as cantidad_entregada_total,
    count(*) filter (where pp.tipo = 'respaldo') as respaldo_partidas,
    count(*) filter (where pp.tipo = 'compromiso') as compromiso_partidas
  from public.ventas_po_partidas pp
  where pp.po_id = po.id
) part on true
left join lateral (
  select
    string_agg(distinct nr.folio, ', ' order by nr.folio) as nr_folios,
    sum(v.cantidad_cubierta * (pp.precio_unitario - nl.precio_unitario)) as diferencia_precio_total
  from public.ventas_po_nr_vinculos v
  join public.ventas_po_partidas pp on pp.id = v.po_partida_id
  join public.ventas_nr_lineas nl on nl.id = v.nr_linea_id
  join public.ventas_notas_remision nr on nr.id = nl.nr_id
  where pp.po_id = po.id and v.estado <> 'cancelado'
) vin on true
left join lateral (
  select a.id as autorizacion_pendiente_id
  from public.ventas_autorizaciones a
  where a.documento_tipo = 'orden_compra_cliente' and a.documento_id = po.id and a.estado = 'pendiente'
  order by a.created_at desc
  limit 1
) aut on true;

comment on view public.ventas_ordenes_compra_listado is
  'Explorer de Órdenes de Compra (043/047), security_invoker=true — respeta '
  'la RLS de las 4 tablas base, todos los joins LEFT a propósito (una PO no '
  'debe desaparecer del listado si RLS tapa su cliente/pedido/cotización). '
  'Columnas de origen/respaldo/compromiso/nr_folios/diferencia_precio_total/ '
  'autorizacion_pendiente_id (047) se agregaron al final — create or replace '
  'view no permite reordenar.';

grant select on public.ventas_ordenes_compra_listado to authenticated, service_role;

-- ── 6. Saneamiento del vínculo relic de la campaña de QA de 043 ─────────
-- Un vínculo 'validado' quedó colgando de una partida perteneciente a una
-- PO ya 'cancelada' (POC-000016, verificado por SQL antes de escribir esta
-- migración) — relic de cuando 043 remapeó las PO existentes a 'cancelada'.
-- Se cancela con las 3 columnas que exige vpnv_cancelacion_chk (036), igual
-- que cualquier cancelación real; la NR que ese vínculo "respaldaba" se
-- recalcula al final de 048 (necesita los helpers que aún no existen en
-- este archivo).
update public.ventas_po_nr_vinculos
   set estado = 'cancelado',
       cancelado_at = now(),
       cancelado_por = (select id from public.profiles where role = 'super_admin' order by created_at asc limit 1),
       motivo_cancelacion = 'Relic de QA de 043: vínculo activo sobre una PO ya cancelada — saneado en 047 antes de reconstruir la Vía A.'
 where id = 'e6d962f7-b86d-4a2a-9820-2c997b089a5a'
   and estado = 'validado';
