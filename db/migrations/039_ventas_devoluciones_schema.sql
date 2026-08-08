-- ==========================================
-- RTB Sistema — 039: esquema de devoluciones + borrado real de borradores
-- (RTB-VEN-01)
--
-- Primera mitad de un cambio en dos migraciones (039/040) por un límite de
-- Postgres: ALTER TYPE ... ADD VALUE no se puede referenciar en la misma
-- transacción en la que se agrega. Esta migración SÓLO agrega los valores
-- de enum + la tabla nueva + columnas + GRANT/RLS de DELETE de líneas —
-- nada aquí escribe literalmente 'en_devolucion' en una función/CHECK.
-- 040_ventas_cotizacion_transiciones.sql (después de que ésta haga commit)
-- reescribe las funciones que sí lo referencian.
--
-- Contexto de negocio: hasta ahora "cancelar" una cotización cubría dos
-- casos distintos sin distinguirlos (arrepentirse antes de enviar / el
-- cliente se retracta después de aprobar). El vocabulario nuevo: rechazada
-- = cliente dijo que no a una ENVIADA; cancelada = cliente se retractó de
-- una APROBADA sin que se haya entregado nada; si ya se entregó algo
-- (total o parcial), en vez de cancelar se abre un proceso de devolución
-- — de ahí la tabla ventas_devoluciones (alcance básico: sólo seguimiento,
-- sin reembolso/factura real porque Facturación/RTB-PRO-FAC-01 no existe
-- todavía).
--
-- De paso: no existía ninguna vía de cancelación de pedido/NR ni de
-- liberación de apartados por evento (pedido_estado.'cancelado' y
-- nr_estado.'cancelada' eran valores muertos del enum, verificado contra
-- Supabase real antes de escribir esto) — se agregan las columnas de
-- cancelación que le faltaban a ambas tablas, mismo idioma que
-- ventas_po_nr_vinculos (036).
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

-- =========================================
-- 1. Valores de enum nuevos
-- =========================================
alter type public.ventas_cotizacion_estado add value 'en_devolucion';
alter type public.pedido_estado add value 'en_devolucion';

-- =========================================
-- 2. ventas_devoluciones — tabla de seguimiento básica
-- =========================================
create type public.devolucion_estado as enum ('pendiente', 'resuelta');

create sequence public.ventas_devoluciones_folio_seq;

create table public.ventas_devoluciones (
  id uuid primary key default gen_random_uuid(),
  folio varchar(16) not null unique,                 -- 'DEV-000000'
  cotizacion_id uuid not null references public.ventas_cotizaciones(id) on delete restrict,
  pedido_id uuid not null references public.ventas_pedidos(id) on delete restrict,
  nr_id uuid references public.ventas_notas_remision(id) on delete restrict,
  entidad_id uuid not null references public.entidades(id) on delete restrict,
  motivo text not null,
  estado public.devolucion_estado not null default 'pendiente',
  registrado_por uuid references public.profiles(id) default auth.uid(),
  resuelta_at timestamptz,
  resuelta_por uuid references public.profiles(id),
  notas_resolucion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- mismo idioma que apartados_liberacion_chk (011) y vpnv_cancelacion_chk (036)
  constraint dev_resolucion_chk check (
    (estado = 'resuelta') = (resuelta_at is not null and resuelta_por is not null)
  )
);

comment on table public.ventas_devoluciones is
  'Seguimiento básico de devoluciones (039) — abierta automáticamente por
   ventas_cotizacion_cancelar() (040) cuando se intenta cancelar una
   cotización aprobada cuyo pedido ya tiene entrega (total o parcial).
   Alcance deliberadamente limitado: NO registra reembolso ni nota de
   crédito real — Facturación (RTB-PRO-FAC-01) no existe todavía. El
   gancho para "recibir la mercancía física de vuelta" es el tipo de
   movimiento de kardex entrada_devolucion_cliente (011), sin ningún
   escritor todavía — trabajo futuro, no de esta migración.';

create index idx_ventas_dev_cotizacion on public.ventas_devoluciones (cotizacion_id);
create index idx_ventas_dev_pedido on public.ventas_devoluciones (pedido_id);
create index idx_ventas_dev_estado on public.ventas_devoluciones (estado);

-- Mismo patrón exacto que ventas_pedido_before_insert() (031).
create or replace function public.ventas_devolucion_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.folio is null then
    new.folio := 'DEV-' || lpad(nextval('public.ventas_devoluciones_folio_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

revoke execute on function public.ventas_devolucion_before_insert() from public, anon, authenticated;

create trigger before_insert_ventas_devoluciones
  before insert on public.ventas_devoluciones
  for each row execute function public.ventas_devolucion_before_insert();

-- Sin GRANT INSERT/UPDATE para authenticated: sólo la escriben las
-- funciones SECURITY DEFINER de 040 (ventas_cotizacion_cancelar(),
-- ventas_devolucion_resolver()), corriendo como su dueño.
revoke all on public.ventas_devoluciones from anon, authenticated;
grant select on public.ventas_devoluciones to authenticated;
grant all on public.ventas_devoluciones to service_role;
alter table public.ventas_devoluciones enable row level security;

create policy ventas_devoluciones_select on public.ventas_devoluciones
  for select to authenticated using (public.current_user_role() is not null);

create trigger audit_ventas_devoluciones after insert or update on public.ventas_devoluciones
  for each row execute function public.audit_row();

-- =========================================
-- 3. Columnas de cancelación en ventas_pedidos / ventas_notas_remision
-- =========================================
-- Verificado contra Supabase real antes de escribir esto: ninguna función
-- del repo escribe pedido_estado.'cancelado' ni nr_estado.'cancelada' —
-- son valores muertos del enum desde que se crearon (031/032). 040 les da
-- ruta de escritura; aquí sólo se agregan las columnas que necesitan.
alter table public.ventas_pedidos
  add column cancelado_at timestamptz,
  add column cancelado_por uuid references public.profiles(id),
  add column motivo_cancelacion text;

alter table public.ventas_pedidos add constraint ped_cancelacion_chk check (
  (estado = 'cancelado') = (
    cancelado_at is not null and cancelado_por is not null
    and length(btrim(coalesce(motivo_cancelacion, ''))) > 0
  )
);

alter table public.ventas_notas_remision
  add column cancelado_at timestamptz,
  add column cancelado_por uuid references public.profiles(id),
  add column motivo_cancelacion text;

alter table public.ventas_notas_remision add constraint nr_cancelacion_chk check (
  (estado = 'cancelada') = (
    cancelado_at is not null and cancelado_por is not null
    and length(btrim(coalesce(motivo_cancelacion, ''))) > 0
  )
);

-- =========================================
-- 4. DELETE real de una línea individual (sólo si la cotización sigue en
--    borrador — decisión confirmada: en 'enviada' sigue siendo activo:false)
-- =========================================
-- Mismo criterio de rol/dueño que las políticas insert/update ya vigentes
-- (037:176-212): super_admin/direccion/gerente_comercial sin restricción,
-- ventas sólo si vendedor_id = su propio uid.
grant delete on public.ventas_cotizacion_lineas to authenticated;

create policy ventas_cotizacion_lineas_delete on public.ventas_cotizacion_lineas
  for delete to authenticated
  using (
    exists (
      select 1 from public.ventas_cotizaciones c
       where c.id = cotizacion_id and c.estado = 'borrador'
         and (
           public.current_user_role() = any (array['super_admin', 'direccion', 'gerente_comercial'])
           or (public.current_user_role() = 'ventas' and c.vendedor_id = (select auth.uid()))
         )
    )
  );

-- No se agrega GRANT DELETE sobre ventas_cotizaciones: el borrado de la
-- cabecera pasa exclusivamente por ventas_cotizacion_eliminar() (040), que
-- corre como su dueño y no lo necesita.

-- =========================================
-- 5. Auditoría de DELETE — sin rastro hasta ahora en todo el esquema
-- =========================================
-- audit_row() (002) SÍ maneja tg_op='DELETE' en su cuerpo, pero NINGÚN
-- trigger del repo la registraba para DELETE (todos eran "after insert or
-- update"), porque hasta ahora nada se borraba de verdad. Cerrarlo antes
-- de permitir el primer DELETE real del esquema.
drop trigger audit_ventas_cotizaciones on public.ventas_cotizaciones;
create trigger audit_ventas_cotizaciones after insert or update or delete on public.ventas_cotizaciones
  for each row execute function public.audit_row();

drop trigger audit_ventas_cotizacion_lineas on public.ventas_cotizacion_lineas;
create trigger audit_ventas_cotizacion_lineas after insert or update or delete on public.ventas_cotizacion_lineas
  for each row execute function public.audit_row();
