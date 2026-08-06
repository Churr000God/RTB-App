-- ==========================================
-- RTB Sistema — 010: Costos de producto, proveedor↔producto y precios de
-- referencia
--
-- Ver contexto/AUDITORIA_RTB-INV-01.md para el detalle completo. Lo que
-- toca este archivo:
--   - El paquete original habla de "Bolsa de Ahorro" como "el promedio de
--     compras en Proveedores y Productos" y de "Costo Refacción"/"Costo
--     Ariba" como precios de selección rápida. Ninguno de los tres términos
--     aparece en ningún documento de contexto/ — es vocabulario de Notion
--     sin respaldo. No se inventa un KPI de "ahorro"; se modela el costo
--     promedio ponderado real (011) y los tres conceptos de costo se
--     separan explícitamente (ver abajo), porque el Acta de Conteo Físico
--     real es literal: "el costo es un atributo del catálogo, no un evento
--     del periodo, así que cargarlo de forma retroactiva corrige la
--     valuación de julio sin alterar lo que pasó en julio" — con un solo
--     campo mutable eso es imposible.
--   - "Costo Refacción"/"Costo Ariba" se preservan como datos de
--     referencia sin semántica de negocio (producto_precios_referencia),
--     no como columnas de productos: son precios de VENTA (RTB-VEN-01),
--     no costos, y no hay lista de precios real todavía.
--   - proveedores_productos (fuera de alcance en RTB-ENT-01: "aún no existe
--     un maestro de productos al que referenciar") se implementa aquí como
--     proveedor_productos (singular, como proveedor_cuentas_bancarias de
--     004) y cierra ese pendiente.
--
-- Tres conceptos de costo, deliberadamente separados (colapsarlos es lo
-- que hoy produce "SKU con existencia sin costo unitario" en el acta real):
--   1. Costo de la transacción   → inventario_movimientos.costo_unitario (011, inmutable)
--   2. Costo promedio operativo  → inventario_existencias.costo_promedio (011, sólo el trigger)
--   3. Costo de catálogo         → producto_costos de este archivo (cargable retroactivamente)
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

create type public.costo_origen as enum ('compra', 'catalogo_manual', 'proveedor_preferente', 'carga_inicial');
create type public.precio_canal as enum ('refaccion', 'ariba', 'mostrador', 'lista_general');

-- =========================================
-- 1. TABLA: proveedor_productos (va primero: producto_costos la referencia)
-- =========================================
create table public.proveedor_productos (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores(id) on update cascade on delete restrict,
  producto_id uuid not null references public.productos(id) on delete restrict,
  codigo_proveedor varchar(80),                 -- casi siempre = productos.sku
  costo_unitario numeric(14, 6) not null check (costo_unitario >= 0),
  moneda char(3) not null default 'MXN' check (moneda ~ '^[A-Z]{3}$'),
  -- El proveedor puede vender en una unidad distinta a la que RTB registra
  -- (p.ej. vende por KIT aunque RTB lleve PZ): sin esto el costo entra con
  -- el mismo defecto de factor que causó la pérdida medida en el kardex.
  unidad_medida_id uuid not null references public.unidades_medida(id) on delete restrict,
  contenido_por_unidad numeric(14, 4) not null default 1 check (contenido_por_unidad > 0),
  plazo_entrega_dias integer check (plazo_entrega_dias is null or plazo_entrega_dias >= 0),
  minimo_compra numeric(16, 4),
  es_preferente boolean not null default false,
  vigente_desde date not null default current_date,
  vigente_hasta date,
  activo boolean not null default true,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pp_vigencia_chk check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

comment on table public.proveedor_productos is
  'Lista de precios de compra por proveedor. Cierra el pendiente '
  '"proveedores_productos fuera de alcance" de contexto/AUDITORIA_RTB-ENT-01.md '
  '— antes no existía un maestro de productos al que referenciar.';

create unique index uq_prov_prod_vigencia on public.proveedor_productos (proveedor_id, producto_id, vigente_desde);
create unique index uq_prov_prod_preferente on public.proveedor_productos (producto_id)
  where es_preferente = true and activo = true;
create index idx_prov_prod_proveedor on public.proveedor_productos (proveedor_id);
create index idx_prov_prod_producto on public.proveedor_productos (producto_id);
create index idx_prov_prod_codigo on public.proveedor_productos (codigo_proveedor);
create index idx_prov_prod_unidad on public.proveedor_productos (unidad_medida_id);

create trigger before_update_proveedor_productos
  before update on public.proveedor_productos
  for each row execute function public.set_updated_meta();

create trigger audit_proveedor_productos after insert or update on public.proveedor_productos
  for each row execute function public.audit_row();

-- =========================================
-- 2. TABLA: producto_costos (histórico con vigencia)
-- =========================================
create table public.producto_costos (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete restrict,
  costo_unitario numeric(14, 6) not null check (costo_unitario >= 0),
  moneda char(3) not null default 'MXN' check (moneda ~ '^[A-Z]{3}$'),
  origen public.costo_origen not null,
  proveedor_producto_id uuid references public.proveedor_productos(id) on delete restrict,
  vigente_desde date not null default current_date,
  vigente_hasta date,
  soporte_referencia varchar(80),        -- factura / OC que lo respalda
  motivo text,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pc_vigencia_chk check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  -- Carga retroactiva permitida SÓLO con motivo escrito — el acta real lo exige explícito.
  constraint pc_retroactivo_chk check (
    vigente_desde >= current_date or length(btrim(coalesce(motivo, ''))) > 0
  )
);

comment on table public.producto_costos is
  'Costo de catálogo con vigencia. Cargar un costo retroactivo (vigente_desde '
  'en el pasado) corrige la valuación histórica sin tocar el kardex — el '
  'costo es un atributo del catálogo, no un evento del periodo.';

create index idx_producto_costos_vigencia on public.producto_costos (producto_id, vigente_desde desc);
create unique index uq_producto_costos_abierto on public.producto_costos (producto_id)
  where vigente_hasta is null;
create index idx_producto_costos_proveedor_producto on public.producto_costos (proveedor_producto_id);

create trigger before_update_producto_costos
  before update on public.producto_costos
  for each row execute function public.set_updated_meta();

create trigger audit_producto_costos after insert or update on public.producto_costos
  for each row execute function public.audit_row();

-- =========================================
-- 3. TABLA: producto_precios_referencia
-- =========================================
create table public.producto_precios_referencia (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete restrict,
  canal public.precio_canal not null,
  precio numeric(14, 4) not null check (precio >= 0),
  moneda char(3) not null default 'MXN' check (moneda ~ '^[A-Z]{3}$'),
  vigente_desde date not null default current_date,
  vigente_hasta date,
  fuente varchar(120),           -- de dónde salió el número (Notion, portal Ariba, etc.)
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ppr_vigencia_chk check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

comment on table public.producto_precios_referencia is
  '"refaccion" y "ariba" son vocabulario de Notion sin respaldo en ningún '
  'documento de contexto/. Se conservan como dato de referencia; la lista '
  'de precios real es responsabilidad de RTB-VEN-01.';

create unique index uq_precio_ref_abierto on public.producto_precios_referencia (producto_id, canal)
  where vigente_hasta is null;
create index idx_precio_ref_producto on public.producto_precios_referencia (producto_id);

create trigger before_update_precios_referencia
  before update on public.producto_precios_referencia
  for each row execute function public.set_updated_meta();

create trigger audit_precios_referencia after insert or update on public.producto_precios_referencia
  for each row execute function public.audit_row();

-- =========================================
-- 4. Resolución de costo — cascada catálogo vigente → proveedor preferente
--    (limitaciones #3/#4 del Acta: "SKU con existencia sin costo unitario"
--    y "discrepancias sin costo"). 011 la vuelve a crear (create or
--    replace) añadiendo el costo promedio operativo de
--    inventario_existencias como primer eslabón de la cascada, una vez que
--    esa tabla existe.
--
--    SECURITY DEFINER: cae en cascada hasta proveedor_productos, que
--    'almacen' no puede leer (es la lista de precios de compras — RLS más
--    abajo). 'almacen' necesita UN costo para valuar una discrepancia, no
--    la lista de precios del proveedor. Mismo criterio que
--    proveedor_cuentas_resumen() en 004_cuentas_bancarias.sql.
-- =========================================
create or replace function public.costo_unitario_vigente(p_producto_id uuid, p_fecha timestamptz default now())
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select c.costo_unitario from public.producto_costos c
      where c.producto_id = p_producto_id and c.vigente_desde <= p_fecha::date
        and (c.vigente_hasta is null or c.vigente_hasta >= p_fecha::date)
      order by c.vigente_desde desc limit 1),
    (select pp.costo_unitario / nullif(pp.contenido_por_unidad, 0)
       from public.proveedor_productos pp
      where pp.producto_id = p_producto_id and pp.activo and pp.es_preferente
      limit 1)
  );
$$;

revoke execute on function public.costo_unitario_vigente(uuid, timestamptz) from public, anon;
grant execute on function public.costo_unitario_vigente(uuid, timestamptz) to authenticated, service_role;

-- =========================================
-- 5. Privilegios y RLS
-- =========================================

revoke all on public.proveedor_productos from anon, authenticated;
grant select, insert on public.proveedor_productos to authenticated;
grant update (codigo_proveedor, costo_unitario, moneda, unidad_medida_id, contenido_por_unidad,
              plazo_entrega_dias, minimo_compra, es_preferente, vigente_hasta, activo)
  on public.proveedor_productos to authenticated;
grant all on public.proveedor_productos to service_role;

-- producto_costos: alta libre (con motivo si es retroactivo, exigido por
-- CHECK); nada de UPDATE directo — una corrección es una fila nueva que
-- cierra la vigencia anterior (mismo patrón que proveedor_cuentas_bancarias
-- en 004: "el cambio es una fila nueva, nunca una edición en sitio").
revoke all on public.producto_costos from anon, authenticated;
grant select, insert on public.producto_costos to authenticated;
grant all on public.producto_costos to service_role;

revoke all on public.producto_precios_referencia from anon, authenticated;
grant select, insert on public.producto_precios_referencia to authenticated;
grant update (precio, vigente_hasta, fuente) on public.producto_precios_referencia to authenticated;
grant all on public.producto_precios_referencia to service_role;

alter table public.proveedor_productos enable row level security;
alter table public.producto_costos enable row level security;
alter table public.producto_precios_referencia enable row level security;

-- proveedor_productos: lista de precios de compra. 'almacen' NO lee esta
-- tabla — llega al costo por costo_unitario_vigente(), igual que la RLS de
-- cuentas_bancarias en 004 excluye a direccion de la tabla base.
create policy proveedor_productos_select on public.proveedor_productos
  for select to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'compras', 'finanzas']));
create policy proveedor_productos_insert on public.proveedor_productos
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras']));
create policy proveedor_productos_update on public.proveedor_productos
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'compras']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras']));

-- producto_costos: catálogo de costo. Todos los roles que necesitan valuar
-- consultan; sólo compras/direccion/super_admin/finanzas lo alimentan.
create policy producto_costos_select on public.producto_costos
  for select to authenticated
  using (public.current_user_role() is not null);
create policy producto_costos_insert on public.producto_costos
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras', 'finanzas']));

-- producto_precios_referencia: dato de referencia de venta; todos consultan,
-- ventas/compras/direccion/super_admin lo capturan.
create policy precios_referencia_select on public.producto_precios_referencia
  for select to authenticated
  using (public.current_user_role() is not null);
create policy precios_referencia_insert on public.producto_precios_referencia
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'ventas', 'compras']));
create policy precios_referencia_update on public.producto_precios_referencia
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'ventas', 'compras']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'ventas', 'compras']));

-- Sin DELETE en ninguna tabla: regla de negocio "no borrado físico".
