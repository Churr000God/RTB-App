-- ==========================================
-- RTB Sistema — 030: cotizaciones, líneas con snapshot de precio, consultas
-- a Compras-ligero y evidencia de aprobación (RTB-VEN-01)
--
-- El corazón de este archivo es ventas_cotizacion_lineas: el precio que el
-- vendedor ELIGE (Costo Refacción / Costo Ariba / Costo de Venta) se
-- FOTOGRAFÍA ahí y nunca vuelve a cambiar, sin importar qué pase después
-- con el costo o el margen (decisión confirmada con el dueño del proyecto,
-- 2026-08-07: una cotización de $7 expirada sigue diciendo $7; una
-- aprobada en $8 sigue en $8 aunque a otro cliente se le cotice $7.50
-- mañana). precio_unitario/costo_base_snapshot/margen_snapshot NUNCA están
-- en un GRANT — los escribe únicamente el trigger
-- ventas_cotizacion_linea_before_write(), que lanza si el precio elegido no
-- se puede calcular ("producto sin costo no se cotiza").
--
-- Compras-ligero es precondición dura, no un paso informal (decisión
-- confirmada): un producto sin costo no se cotiza. El vendedor levanta una
-- consulta de descripción libre (ventas_consultas_compras) SIN que el
-- producto exista todavía; Compras lo da de alta con sus rutas normales
-- (sin ampliar el permiso de 'ventas' sobre productos/producto_costos/
-- proveedor_productos) y responde con costo real — sólo entonces la línea
-- deja de estar "en consulta". Una cotización con alguna línea en consulta
-- NO se puede enviar (decisión confirmada, sin envío parcial).
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

-- =========================================
-- 1. TABLA: ventas_cotizaciones
-- =========================================
create type public.ventas_cotizacion_estado as enum (
  'borrador', 'enviada', 'aprobada', 'rechazada', 'expirada', 'cancelada'
);

create table public.ventas_cotizaciones (
  id uuid primary key default gen_random_uuid(),
  folio varchar(16) not null unique,
  entidad_id uuid not null references public.entidades(id) on delete restrict,
  vendedor_id uuid references public.profiles(id) default auth.uid(),
  canal_entrada public.canal_origen not null,
  medio_seguimiento public.canal_origen,
  moneda char(3) not null default 'MXN',
  vigencia_hasta date,
  estado public.ventas_cotizacion_estado not null default 'borrador',
  enviada_at timestamptz,
  enviada_por uuid references public.profiles(id),
  resuelta_at timestamptz,
  resuelta_por uuid references public.profiles(id),
  motivo_resolucion text,
  observaciones text,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cot_moneda_chk check (moneda ~ '^[A-Z]{3}$'),
  constraint cot_resolucion_motivo_chk check (
    estado not in ('rechazada', 'cancelada') or length(btrim(coalesce(motivo_resolucion, ''))) > 0
  )
);

comment on table public.ventas_cotizaciones is
  'Cabecera de cotización. estado nunca se escribe por GRANT — toda
   transición pasa por función SECURITY DEFINER (enviar/rechazar/cancelar
   aquí; aprobar en 031). vendedor_id se filtra por RLS: un vendedor sólo
   administra las suyas, dirección/super_admin cualquiera.';

create index idx_ventas_cot_entidad on public.ventas_cotizaciones (entidad_id);
create index idx_ventas_cot_vendedor on public.ventas_cotizaciones (vendedor_id);
create index idx_ventas_cot_estado on public.ventas_cotizaciones (estado);

create sequence public.ventas_cotizaciones_folio_seq;

-- SECURITY DEFINER: nextval() + cliente_puede_operar() (ya SECURITY
-- DEFINER, pero el chequeo de que la entidad SEA cliente lee `clientes`,
-- que 'ventas' sí puede leer por RLS — no es estrictamente necesario aquí,
-- pero se deja definer por el patrón uniforme de "todo before_insert que
-- toca una secuencia es definer", igual que entidades_before_insert (002).
create or replace function public.ventas_cotizacion_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado jsonb;
begin
  if not exists (select 1 from public.clientes where entidad_id = new.entidad_id) then
    raise exception 'La entidad no tiene datos comerciales de cliente registrados.' using errcode = '22023';
  end if;

  v_estado := public.cliente_puede_operar(new.entidad_id);
  if not (v_estado->>'puede')::boolean then
    raise exception 'No se puede crear una cotización para este cliente: %', (v_estado->>'motivo')
      using errcode = '42501';
  end if;

  if new.folio is null then
    new.folio := 'COT-' || lpad(nextval('public.ventas_cotizaciones_folio_seq')::text, 6, '0');
  end if;
  new.vendedor_id := coalesce(new.vendedor_id, auth.uid());
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

revoke execute on function public.ventas_cotizacion_before_insert() from public, anon, authenticated;

create trigger before_insert_ventas_cotizaciones
  before insert on public.ventas_cotizaciones
  for each row execute function public.ventas_cotizacion_before_insert();

-- Los datos de cabecera (entidad_id/canal_entrada/medio_seguimiento/moneda/
-- vigencia_hasta) sólo son editables mientras estado='borrador' — una vez
-- enviada, la PO se validará contra lo que el cliente vio, no contra una
-- edición posterior. NO se congela folio/estado/vendedor_id/*_at/*_por/
-- motivo_resolucion aquí con un `new.col := old.col` incondicional: esas
-- columnas ya están fuera de todo GRANT UPDATE (la barrera real), y un
-- freeze incondicional en el trigger revertiría también las escrituras
-- legítimas de ventas_cotizacion_enviar()/_rechazar()/_cancelar() —bug real
-- encontrado en verificación: enviar() devolvía {success:true} pero el
-- UPDATE interno quedaba silenciosamente revertido por este mismo trigger,
-- porque el trigger no distingue "vino del cliente" de "vino de la función".
create or replace function public.ventas_cotizacion_before_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.estado <> 'borrador' and (
    new.entidad_id is distinct from old.entidad_id or
    new.canal_entrada is distinct from old.canal_entrada or
    new.medio_seguimiento is distinct from old.medio_seguimiento or
    new.moneda is distinct from old.moneda or
    new.vigencia_hasta is distinct from old.vigencia_hasta
  ) then
    raise exception 'La cotización ya salió de borrador: estos datos ya no se pueden editar.'
      using errcode = '42501';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke execute on function public.ventas_cotizacion_before_update() from public, anon, authenticated;

create trigger before_update_ventas_cotizaciones
  before update on public.ventas_cotizaciones
  for each row execute function public.ventas_cotizacion_before_update();

create trigger audit_ventas_cotizaciones after insert or update on public.ventas_cotizaciones
  for each row execute function public.audit_row();

revoke all on public.ventas_cotizaciones from anon, authenticated;
grant select on public.ventas_cotizaciones to authenticated;
grant insert (entidad_id, vendedor_id, canal_entrada, medio_seguimiento, moneda, vigencia_hasta, observaciones)
  on public.ventas_cotizaciones to authenticated;
grant update (entidad_id, canal_entrada, medio_seguimiento, moneda, vigencia_hasta, observaciones)
  on public.ventas_cotizaciones to authenticated;
grant all on public.ventas_cotizaciones to service_role;

alter table public.ventas_cotizaciones enable row level security;

-- Visibilidad amplia (mismo criterio que entidades/productos): los 8 roles
-- consultan, porque una PO consolidada puede involucrar NR de otro
-- vendedor del mismo cliente y Facturación/Almacén necesitan ver el
-- estado. Alta y edición: dirección/super_admin sin restricción; 'ventas'
-- sólo sobre sus propias cotizaciones (condición de fila que
-- lib/ventas/permisos.ts documentará como no expresable en su matriz).
create policy ventas_cotizaciones_select on public.ventas_cotizaciones
  for select to authenticated
  using (public.current_user_role() is not null);

create policy ventas_cotizaciones_insert on public.ventas_cotizaciones
  for insert to authenticated
  with check (
    public.current_user_role() = any (array['super_admin', 'direccion'])
    or (public.current_user_role() = 'ventas' and (vendedor_id is null or vendedor_id = (select auth.uid())))
  );

create policy ventas_cotizaciones_update on public.ventas_cotizaciones
  for update to authenticated
  using (
    public.current_user_role() = any (array['super_admin', 'direccion'])
    or (public.current_user_role() = 'ventas' and vendedor_id = (select auth.uid()))
  )
  with check (
    public.current_user_role() = any (array['super_admin', 'direccion'])
    or (public.current_user_role() = 'ventas' and vendedor_id = (select auth.uid()))
  );

-- =========================================
-- 2. TABLA: ventas_consultas_compras (Compras-ligero, formalizado)
-- =========================================
create type public.consulta_estado as enum ('abierta', 'en_proceso', 'respondida', 'sin_disponibilidad', 'cancelada');
create type public.consulta_urgencia as enum ('normal', 'alta', 'critica');

create table public.ventas_consultas_compras (
  id uuid primary key default gen_random_uuid(),
  folio varchar(16) not null unique,
  cotizacion_id uuid references public.ventas_cotizaciones(id) on delete restrict,
  entidad_id uuid references public.entidades(id) on delete restrict,
  descripcion text not null,
  marca_texto varchar(120),
  modelo_texto varchar(120),
  numero_parte varchar(120),
  cantidad numeric(16, 4) check (cantidad is null or cantidad > 0),
  unidad_texto varchar(60),
  urgencia public.consulta_urgencia not null default 'normal',
  estado public.consulta_estado not null default 'abierta',
  solicitante_id uuid not null references public.profiles(id) default auth.uid(),
  -- Bloque de respuesta — sólo Compras/Dirección/super_admin lo escriben,
  -- vía ventas_consulta_responder(). 'ventas' NO gana acceso de facto a dar
  -- de alta productos: sigue sin GRANT sobre productos/producto_costos.
  producto_id uuid references public.productos(id) on delete restrict,
  costo_unitario numeric(14, 6),
  moneda char(3) default 'MXN' check (moneda is null or moneda ~ '^[A-Z]{3}$'),
  plazo_entrega_dias integer check (plazo_entrega_dias is null or plazo_entrega_dias >= 0),
  disponibilidad text,
  proveedor_id uuid references public.proveedores(id) on delete restrict,
  notas_respuesta text,
  atendido_por uuid references public.profiles(id),
  respondido_at timestamptz,
  motivo_cancelacion text,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consulta_descripcion_chk check (length(btrim(descripcion)) > 0),
  constraint consulta_respuesta_chk check (
    (estado = 'respondida') = (producto_id is not null and costo_unitario is not null and respondido_at is not null)
  ),
  constraint consulta_cancelacion_chk check ((estado = 'cancelada') = (motivo_cancelacion is not null))
);

comment on table public.ventas_consultas_compras is
  'Compras-ligero formalizado: el vendedor levanta la consulta con
   descripción libre SIN que el producto exista todavía (decisión
   confirmada 2026-08-07); Compras lo da de alta con sus rutas normales y
   responde con costo real. Sin GRANT UPDATE para authenticated — la
   resolución/cancelación pasan siempre por función.';

create index idx_ventas_consultas_estado on public.ventas_consultas_compras (estado);
create index idx_ventas_consultas_cotizacion on public.ventas_consultas_compras (cotizacion_id);
create index idx_ventas_consultas_solicitante on public.ventas_consultas_compras (solicitante_id);

create sequence public.ventas_consultas_folio_seq;

create or replace function public.ventas_consulta_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.folio is null then
    new.folio := 'CVC-' || lpad(nextval('public.ventas_consultas_folio_seq')::text, 6, '0');
  end if;
  new.solicitante_id := coalesce(new.solicitante_id, auth.uid());
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

revoke execute on function public.ventas_consulta_before_insert() from public, anon, authenticated;

create trigger before_insert_ventas_consultas
  before insert on public.ventas_consultas_compras
  for each row execute function public.ventas_consulta_before_insert();

create trigger audit_ventas_consultas after insert or update on public.ventas_consultas_compras
  for each row execute function public.audit_row();

revoke all on public.ventas_consultas_compras from anon, authenticated;
grant select on public.ventas_consultas_compras to authenticated;
grant insert (cotizacion_id, entidad_id, descripcion, marca_texto, modelo_texto, numero_parte,
              cantidad, unidad_texto, urgencia)
  on public.ventas_consultas_compras to authenticated;
grant all on public.ventas_consultas_compras to service_role;

alter table public.ventas_consultas_compras enable row level security;

create policy ventas_consultas_select on public.ventas_consultas_compras
  for select to authenticated
  using (public.current_user_role() is not null);
create policy ventas_consultas_insert on public.ventas_consultas_compras
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'ventas']));

-- =========================================
-- 3. TABLA: ventas_cotizacion_lineas — el snapshot
-- =========================================
create type public.precio_origen_venta as enum ('refaccion', 'ariba', 'costo_venta');

create table public.ventas_cotizacion_lineas (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references public.ventas_cotizaciones(id) on delete restrict,
  producto_id uuid references public.productos(id) on delete restrict,      -- NULL mientras está en consulta
  consulta_id uuid references public.ventas_consultas_compras(id) on delete restrict,
  descripcion_libre text,
  cantidad numeric(16, 4) not null check (cantidad > 0),
  unidad_medida_id uuid references public.unidades_medida(id) on delete restrict,
  en_consulta boolean not null default false,     -- SIEMPRE calculado por el trigger, nunca por GRANT
  precio_origen public.precio_origen_venta,
  precio_unitario numeric(14, 4),                 -- snapshot — sólo el trigger lo escribe
  costo_base_snapshot numeric(14, 6),
  margen_snapshot numeric(6, 3),
  descuento_porcentaje numeric(5, 2) not null default 0,
  importe numeric(18, 4) generated always as (
    round(cantidad * coalesce(precio_unitario, 0) * (1 - descuento_porcentaje / 100.0), 4)
  ) stored,
  activo boolean not null default true,           -- "quitar una línea" = desactivar, no borrado físico
  observaciones text,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cot_linea_descuento_chk check (descuento_porcentaje >= 0 and descuento_porcentaje <= 100),
  constraint cot_linea_descripcion_chk check (
    producto_id is not null or length(btrim(coalesce(descripcion_libre, ''))) > 0
  ),
  -- La única combinación prohibida: precio resuelto sin producto, o
  -- "resuelta" (no en_consulta) sin precio/producto/origen completos.
  constraint cot_linea_precio_chk check (
    en_consulta or (producto_id is not null and precio_unitario is not null and precio_origen is not null)
  ),
  constraint cot_linea_precio_sin_producto_chk check (precio_unitario is null or producto_id is not null)
);

comment on table public.ventas_cotizacion_lineas is
  'precio_unitario/costo_base_snapshot/margen_snapshot son el snapshot que
   NUNCA cambia una vez congelado — ver cabecera del archivo. en_consulta es
   enteramente calculado por el trigger (no está en ningún GRANT): true
   mientras falte producto O falte precio_origen; el trigger la apaga sólo
   cuando logra resolver un precio real. "Quitar una línea" = activo=false,
   nunca DELETE (regla de negocio de todo el esquema).';

create index idx_cot_lineas_cotizacion on public.ventas_cotizacion_lineas (cotizacion_id);
create index idx_cot_lineas_producto on public.ventas_cotizacion_lineas (producto_id);
create index idx_cot_lineas_consulta on public.ventas_cotizacion_lineas (consulta_id);
create index idx_cot_lineas_en_consulta on public.ventas_cotizacion_lineas (cotizacion_id) where en_consulta;

-- El trigger que resuelve el precio. Corre en INSERT y en UPDATE:
--   - producto_id NULL              -> en_consulta=true, sin precio (consulta abierta)
--   - producto_id presente,
--     precio_origen NULL            -> en_consulta=true, sin precio (Compras ya respondió,
--                                       falta que Ventas elija precio — estado intermedio)
--   - producto_id + precio_origen   -> resuelve precio_unitario (o lanza si no hay costo),
--                                       en_consulta=false
-- Sólo recalcula si cambió producto_id/precio_origen (o es INSERT) — así
-- cambiar sólo cantidad/descuento nunca reabre el precio ya fotografiado.
create or replace function public.ventas_cotizacion_linea_before_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_debe_resolver boolean;
  v_detalle jsonb;
  v_precio numeric;
begin
  if tg_op = 'UPDATE' then
    if exists (
      select 1 from public.ventas_cotizaciones c
       where c.id = old.cotizacion_id and c.estado <> 'borrador'
    ) and (
      new.precio_unitario is distinct from old.precio_unitario or
      new.precio_origen is distinct from old.precio_origen or
      new.producto_id is distinct from old.producto_id or
      new.costo_base_snapshot is distinct from old.costo_base_snapshot or
      new.margen_snapshot is distinct from old.margen_snapshot
    ) then
      raise exception 'La cotización ya no está en borrador: el precio de esta línea quedó fijo.'
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();

  if new.producto_id is null then
    new.en_consulta := true;
    new.precio_origen := null;
    new.precio_unitario := null;
    new.costo_base_snapshot := null;
    new.margen_snapshot := null;
    return new;
  end if;

  if new.unidad_medida_id is null then
    select unidad_medida_id into new.unidad_medida_id from public.productos where id = new.producto_id;
  end if;

  if new.precio_origen is null then
    -- Producto ya conocido (Compras respondió), pero Ventas aún no elige precio.
    new.en_consulta := true;
    new.precio_unitario := null;
    new.costo_base_snapshot := null;
    new.margen_snapshot := null;
    return new;
  end if;

  v_debe_resolver := (tg_op = 'INSERT')
    or (new.producto_id is distinct from old.producto_id)
    or (new.precio_origen is distinct from old.precio_origen);

  if not v_debe_resolver then
    return new;   -- sólo cambió cantidad/descuento/observaciones: no reabrir el snapshot
  end if;

  if new.precio_origen = 'costo_venta' then
    v_detalle := public.costo_venta_detalle(new.producto_id);
    v_precio := (v_detalle->>'costo_venta')::numeric;
    new.costo_base_snapshot := (v_detalle->>'costo_base')::numeric;
    new.margen_snapshot := (v_detalle->>'margen_porcentaje')::numeric;
  else
    select precio into v_precio
      from public.producto_precios_referencia
     where producto_id = new.producto_id
       and canal = new.precio_origen::text::public.precio_canal
       and vigente_hasta is null
     limit 1;
    new.costo_base_snapshot := null;
    new.margen_snapshot := null;
  end if;

  if v_precio is null then
    raise exception 'Este producto no tiene el precio "%" disponible: no se puede cotizar sin costo.', new.precio_origen
      using errcode = '22023';
  end if;

  new.precio_unitario := v_precio;
  new.en_consulta := false;
  return new;
end;
$$;

revoke execute on function public.ventas_cotizacion_linea_before_write() from public, anon, authenticated;

create trigger before_write_ventas_cotizacion_lineas
  before insert or update on public.ventas_cotizacion_lineas
  for each row execute function public.ventas_cotizacion_linea_before_write();

create trigger audit_ventas_cotizacion_lineas after insert or update on public.ventas_cotizacion_lineas
  for each row execute function public.audit_row();

-- precio_unitario/costo_base_snapshot/margen_snapshot/en_consulta NUNCA en
-- un GRANT: si precio_unitario estuviera aquí, un vendedor tecleraría
-- cualquier número y toda la validación de PO (que se cruza contra este
-- snapshot) quedaría vacía.
revoke all on public.ventas_cotizacion_lineas from anon, authenticated;
grant select on public.ventas_cotizacion_lineas to authenticated;
grant insert (cotizacion_id, producto_id, consulta_id, descripcion_libre, cantidad, unidad_medida_id,
              precio_origen, descuento_porcentaje, observaciones)
  on public.ventas_cotizacion_lineas to authenticated;
grant update (producto_id, descripcion_libre, cantidad, unidad_medida_id, precio_origen,
              descuento_porcentaje, activo, observaciones)
  on public.ventas_cotizacion_lineas to authenticated;
grant all on public.ventas_cotizacion_lineas to service_role;

alter table public.ventas_cotizacion_lineas enable row level security;

create policy ventas_cotizacion_lineas_select on public.ventas_cotizacion_lineas
  for select to authenticated
  using (public.current_user_role() is not null);

create policy ventas_cotizacion_lineas_insert on public.ventas_cotizacion_lineas
  for insert to authenticated
  with check (
    exists (
      select 1 from public.ventas_cotizaciones c
       where c.id = cotizacion_id
         and (
           public.current_user_role() = any (array['super_admin', 'direccion'])
           or (public.current_user_role() = 'ventas' and c.vendedor_id = (select auth.uid()))
         )
    )
  );

create policy ventas_cotizacion_lineas_update on public.ventas_cotizacion_lineas
  for update to authenticated
  using (
    exists (
      select 1 from public.ventas_cotizaciones c
       where c.id = cotizacion_id
         and (
           public.current_user_role() = any (array['super_admin', 'direccion'])
           or (public.current_user_role() = 'ventas' and c.vendedor_id = (select auth.uid()))
         )
    )
  )
  with check (
    exists (
      select 1 from public.ventas_cotizaciones c
       where c.id = cotizacion_id
         and (
           public.current_user_role() = any (array['super_admin', 'direccion'])
           or (public.current_user_role() = 'ventas' and c.vendedor_id = (select auth.uid()))
         )
    )
  );

-- =========================================
-- 4. TABLA: ventas_aprobaciones (evidencia de aprobación del cliente)
-- =========================================
create table public.ventas_aprobaciones (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references public.ventas_cotizaciones(id) on delete restrict,
  canal public.canal_origen not null,
  evidencia_path text,
  referencia text,
  contacto_id uuid references public.contactos(id) on delete restrict,
  datos_faltantes text[] not null default '{}',
  registrado_por uuid not null references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  constraint aprob_faltantes_chk check (
    datos_faltantes <@ array[
      'contacto_no_identificado', 'monto_no_confirmado', 'fecha_entrega_no_confirmada',
      'condicion_pago_no_confirmada', 'po_pendiente', 'datos_fiscales_pendientes'
    ]::text[]
  )
);

comment on table public.ventas_aprobaciones is
  'Evidencia de que el cliente aprobó (documento §7 del dueño del
   proyecto): separa canal/evidencia de los datos formales que pudieran
   faltar. Append-only, escrita únicamente por ventas_cotizacion_aprobar()
   (031) dentro de la misma transacción que crea el pedido y las reservas
   — sin GRANT INSERT para authenticated.';

create index idx_ventas_aprobaciones_cotizacion on public.ventas_aprobaciones (cotizacion_id);

revoke all on public.ventas_aprobaciones from anon, authenticated;
grant select on public.ventas_aprobaciones to authenticated;
grant all on public.ventas_aprobaciones to service_role;

alter table public.ventas_aprobaciones enable row level security;

create policy ventas_aprobaciones_select on public.ventas_aprobaciones
  for select to authenticated
  using (public.current_user_role() is not null);

-- =========================================
-- 5. Funciones de transición — enviar/rechazar/cancelar cotización,
--    responder/cancelar consulta. Patrón uniforme de 016/025/027.
-- =========================================
create or replace function public.ventas_cotizacion_enviar(p_cotizacion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_cot record;
  v_lineas integer;
  v_pendientes integer;
  v_estado_cliente jsonb;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'ventas') then
    raise exception 'Sin permisos para enviar una cotización.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;

  select * into v_cot from public.ventas_cotizaciones where id = p_cotizacion_id for update;
  if not found then
    raise exception 'Cotización % no encontrada', p_cotizacion_id using errcode = 'P0002';
  end if;
  if public.current_user_role() = 'ventas' and v_cot.vendedor_id <> v_actor then
    raise exception 'No puedes enviar la cotización de otro vendedor.' using errcode = '42501';
  end if;
  if v_cot.estado <> 'borrador' then
    raise exception 'Sólo se envía una cotización en borrador.' using errcode = '42501';
  end if;
  if v_cot.vigencia_hasta is null then
    raise exception 'Define la vigencia antes de enviar la cotización.' using errcode = '22023';
  end if;

  select count(*) into v_lineas from public.ventas_cotizacion_lineas
   where cotizacion_id = p_cotizacion_id and activo;
  if v_lineas = 0 then
    raise exception 'Agrega al menos una línea antes de enviar.' using errcode = '22023';
  end if;

  select count(*) into v_pendientes from public.ventas_cotizacion_lineas
   where cotizacion_id = p_cotizacion_id and activo and en_consulta;
  if v_pendientes > 0 then
    raise exception 'Hay % línea(s) en consulta con Compras: no se puede enviar hasta que todas tengan precio.', v_pendientes
      using errcode = '42501';
  end if;

  v_estado_cliente := public.cliente_puede_operar(v_cot.entidad_id);
  if not (v_estado_cliente->>'puede')::boolean then
    raise exception 'No se puede enviar: %', (v_estado_cliente->>'motivo') using errcode = '42501';
  end if;

  update public.ventas_cotizaciones
     set estado = 'enviada', enviada_at = now(), enviada_por = v_actor, updated_at = now()
   where id = p_cotizacion_id;

  return jsonb_build_object('success', true, 'folio', v_cot.folio);
end;
$$;

revoke execute on function public.ventas_cotizacion_enviar(uuid) from public, anon;
grant execute on function public.ventas_cotizacion_enviar(uuid) to authenticated;

create or replace function public.ventas_cotizacion_rechazar(p_cotizacion_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_cot record;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'ventas') then
    raise exception 'Sin permisos para rechazar una cotización.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'El motivo es obligatorio para rechazar una cotización.' using errcode = '23514';
  end if;

  select * into v_cot from public.ventas_cotizaciones where id = p_cotizacion_id for update;
  if not found then
    raise exception 'Cotización % no encontrada', p_cotizacion_id using errcode = 'P0002';
  end if;
  if public.current_user_role() = 'ventas' and v_cot.vendedor_id <> v_actor then
    raise exception 'No puedes resolver la cotización de otro vendedor.' using errcode = '42501';
  end if;
  if v_cot.estado <> 'enviada' then
    raise exception 'Sólo se rechaza una cotización enviada.' using errcode = '42501';
  end if;

  update public.ventas_cotizaciones
     set estado = 'rechazada', resuelta_at = now(), resuelta_por = v_actor,
         motivo_resolucion = btrim(p_motivo), updated_at = now()
   where id = p_cotizacion_id;

  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.ventas_cotizacion_rechazar(uuid, text) from public, anon;
grant execute on function public.ventas_cotizacion_rechazar(uuid, text) to authenticated;

create or replace function public.ventas_cotizacion_cancelar(p_cotizacion_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_cot record;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'ventas') then
    raise exception 'Sin permisos para cancelar una cotización.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'El motivo es obligatorio para cancelar una cotización.' using errcode = '23514';
  end if;

  select * into v_cot from public.ventas_cotizaciones where id = p_cotizacion_id for update;
  if not found then
    raise exception 'Cotización % no encontrada', p_cotizacion_id using errcode = 'P0002';
  end if;
  if public.current_user_role() = 'ventas' and v_cot.vendedor_id <> v_actor then
    raise exception 'No puedes cancelar la cotización de otro vendedor.' using errcode = '42501';
  end if;
  if v_cot.estado not in ('borrador', 'enviada') then
    raise exception 'Sólo se cancela una cotización en borrador o enviada.' using errcode = '42501';
  end if;

  update public.ventas_cotizaciones
     set estado = 'cancelada', resuelta_at = now(), resuelta_por = v_actor,
         motivo_resolucion = btrim(p_motivo), updated_at = now()
   where id = p_cotizacion_id;

  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.ventas_cotizacion_cancelar(uuid, text) from public, anon;
grant execute on function public.ventas_cotizacion_cancelar(uuid, text) to authenticated;

create or replace function public.ventas_consulta_responder(
  p_consulta_id uuid, p_producto_id uuid, p_costo_unitario numeric, p_moneda char(3) default 'MXN',
  p_plazo_entrega_dias integer default null, p_disponibilidad text default null,
  p_proveedor_id uuid default null, p_notas_respuesta text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_consulta record;
  v_lineas integer;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'compras') then
    raise exception 'Sin permisos para responder una consulta de Compras-ligero.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;
  if p_producto_id is null or p_costo_unitario is null then
    raise exception 'Falta el producto o el costo dado de alta por Compras.' using errcode = '22023';
  end if;

  select * into v_consulta from public.ventas_consultas_compras where id = p_consulta_id for update;
  if not found then
    raise exception 'Consulta % no encontrada', p_consulta_id using errcode = 'P0002';
  end if;
  if v_consulta.estado not in ('abierta', 'en_proceso') then
    raise exception 'Esta consulta ya fue resuelta o cancelada.' using errcode = '42501';
  end if;

  update public.ventas_consultas_compras
     set estado = 'respondida', producto_id = p_producto_id, costo_unitario = p_costo_unitario,
         moneda = coalesce(p_moneda, 'MXN'), plazo_entrega_dias = p_plazo_entrega_dias,
         disponibilidad = p_disponibilidad, proveedor_id = p_proveedor_id,
         notas_respuesta = p_notas_respuesta, atendido_por = v_actor, respondido_at = now(),
         updated_at = now()
   where id = p_consulta_id;

  -- Propaga el producto a la(s) línea(s) que esperaban esta consulta. El
  -- trigger de la línea las deja "en_consulta=true" todavía (falta que
  -- Ventas elija precio_origen) — ver comentario de la tabla.
  update public.ventas_cotizacion_lineas
     set producto_id = p_producto_id
   where consulta_id = p_consulta_id and producto_id is null;
  get diagnostics v_lineas = row_count;

  return jsonb_build_object('success', true, 'lineas_actualizadas', v_lineas);
end;
$$;

revoke execute on function public.ventas_consulta_responder(uuid, uuid, numeric, char, integer, text, uuid, text)
  from public, anon;
grant execute on function public.ventas_consulta_responder(uuid, uuid, numeric, char, integer, text, uuid, text)
  to authenticated;

create or replace function public.ventas_consulta_cancelar(p_consulta_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_consulta record;
begin
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'El motivo es obligatorio para cancelar una consulta.' using errcode = '23514';
  end if;

  select * into v_consulta from public.ventas_consultas_compras where id = p_consulta_id for update;
  if not found then
    raise exception 'Consulta % no encontrada', p_consulta_id using errcode = 'P0002';
  end if;
  if public.current_user_role() not in ('super_admin', 'direccion', 'compras')
     and v_consulta.solicitante_id <> v_actor then
    raise exception 'Sin permisos para cancelar esta consulta.' using errcode = '42501';
  end if;
  if v_consulta.estado not in ('abierta', 'en_proceso') then
    raise exception 'Esta consulta ya fue resuelta o cancelada.' using errcode = '42501';
  end if;

  update public.ventas_consultas_compras
     set estado = 'cancelada', motivo_cancelacion = btrim(p_motivo), updated_at = now()
   where id = p_consulta_id;

  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.ventas_consulta_cancelar(uuid, text) from public, anon;
grant execute on function public.ventas_consulta_cancelar(uuid, text) to authenticated;
