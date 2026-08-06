-- ==========================================
-- RTB Sistema — 009: Catálogo de productos (unidades de medida, familias,
-- categorías, productos)
--
-- Origen: submódulo RTB-INV-01 (paquete RTB_Modulo_Productos_Costos.zip +
-- 01_analisis_funcional.md / 02_esquema_sql_productos_inventario.sql /
-- 03_flujo_conteos_fisicos.md, 2026-08-05). El paquete trae ~100 líneas: un
-- DDL de 6 tablas sin RLS/GRANT/auditoría, y se contradice con la realidad
-- operativa real de RTB (reporte "Existencias de Inventario RTB-INV-01",
-- Acta de Conteo Físico CIE-CON-01, Registro de Discrepancias CIE-DIS-01) —
-- ver contexto/AUDITORIA_RTB-INV-01.md para el detalle completo. Resumen de
-- lo que toca este archivo:
--   - El paquete propone `sku TEXT UNIQUE`. En producción hay SKU
--     duplicados legítimos (RTB-ILU-SL18B/SL18C comparten SKU y nombre) →
--     `sku` NO es único; la identidad de negocio es `codigo_interno`, único
--     sólo entre filas `estado = 'activo'` (la carga histórica de Notion
--     trae códigos truncados y duplicados, p. ej. "RTB-REFU-" en dos
--     productos, y unicidad simple habría bloqueado la migración).
--   - El paquete fija `unidad_medida CHECK IN ('Pz','Paquete','M Lineal')`
--     como "base inmutable". Es la causa #1 de pérdida medida por RTB: 14
--     de 27 folios de no conformidad, -2,811 piezas, -$37,919.77, por
--     "familia con unidad de medida mal definida: salidas de kit
--     descargadas contra un registro llevado por pieza" (Registro de
--     Discrepancias CIE-DIS-01). Un enum de 3 valores no lleva factor de
--     conversión ni audita un cambio → catálogo `unidades_medida` +
--     `contenido_por_unidad` en el producto, con el factor congelado por
--     movimiento en 011 y la redefinición autorizada en 013.
--   - Sin `stock_minimo = 0 por defecto`: RTB-PRO-COM-01 distingue "sin
--     definir" (⚪) de "definido en cero" (🔴 si el teórico es negativo) →
--     `stock_minimo` nulable, sin default.
--   - Sin `activo boolean`: se necesitan 5 estados (borrador/activo/
--     requiere_depuracion/descontinuado/fusionado) para poder recibir la
--     realidad sucia del catálogo (1,076 SKU sin existencia ni teórico,
--     73.9% sin ubicación) sin mentir con un booleano — mismo criterio que
--     "una sola fuente de estado" de contexto/AUDITORIA_RTB-ENT-01.md #14.
--   - Reutiliza public.set_updated_meta() y public.audit_row(), ambas de
--     002_entidades_core.sql; no se redefinen.
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

-- =========================================
-- 1. Tipos enumerados
-- =========================================
create type public.unidad_tipo as enum ('conteo', 'agrupacion', 'longitud', 'peso', 'volumen');

create type public.producto_estado as enum (
  'borrador',              -- capturado, sin validar
  'activo',                -- único estado con unicidad de codigo_interno
  'requiere_depuracion',   -- duplicado / código truncado / migrado sucio de Notion
  'descontinuado',
  'fusionado'               -- absorbido por producto_canonico_id
);

-- =========================================
-- 2. TABLA: unidades_medida
-- =========================================
create table public.unidades_medida (
  id uuid primary key default gen_random_uuid(),
  clave varchar(12) not null unique,       -- PZ, PAQ, ML, KIT, JGO, MTS
  nombre varchar(60) not null,
  tipo public.unidad_tipo not null,
  -- No es cosmético: PZ con decimales=0 impide capturar "2.5 piezas" como
  -- error de captura silencioso; el kardex (011) lo valida contra esto.
  decimales smallint not null default 0,
  activo boolean not null default true,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint um_clave_chk check (length(btrim(clave)) > 0),
  constraint um_decimales_chk check (decimales between 0 and 4)
);

comment on table public.unidades_medida is
  'Catálogo de unidades de medida con precisión decimal. Sustituye al enum '
  'cerrado del paquete original: la unidad de medida mal definida es la '
  'causa #1 de pérdida de inventario medida por RTB (ver cabecera).';

create trigger before_update_unidades_medida
  before update on public.unidades_medida
  for each row execute function public.set_updated_meta();

create trigger audit_unidades_medida after insert or update on public.unidades_medida
  for each row execute function public.audit_row();

-- =========================================
-- 3. TABLA: producto_familias
-- =========================================
-- La familia es la unidad de gobierno de la unidad de medida ("familia con
-- unidad de medida mal definida" — CIE-DIS-01). Se modela como tabla con FK
-- propia, no como un substring() de codigo_interno: el código a veces está
-- mal formado (truncado) y no es fuente confiable del prefijo.
create table public.producto_familias (
  id uuid primary key default gen_random_uuid(),
  clave varchar(10) not null unique,        -- GRIU, REFU, PLO, FER, CER, ILU, ETI, AHO, CON, HER
  nombre varchar(120) not null,
  unidad_medida_default_id uuid references public.unidades_medida(id) on delete restrict,
  -- Bandera de gobierno: se enciende cuando una familia entera necesita
  -- redefinición de unidad y reconteo (producto_unidad_redefiniciones, 013).
  requiere_recuento boolean not null default false,
  activo boolean not null default true,
  descripcion text,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint familias_clave_chk check (clave = upper(btrim(clave)) and length(btrim(clave)) > 0)
);

create index idx_familias_activo on public.producto_familias (activo);
create index idx_familias_unidad on public.producto_familias (unidad_medida_default_id);

create trigger before_update_producto_familias
  before update on public.producto_familias
  for each row execute function public.set_updated_meta();

create trigger audit_producto_familias after insert or update on public.producto_familias
  for each row execute function public.audit_row();

-- =========================================
-- 4. TABLA: producto_categorias
-- =========================================
-- Tabla, no enum: mismo criterio que profiles.role ("texto+CHECK para poder
-- agregar sin ALTER TYPE"). Nullable a propósito — exigirla bloquearía la
-- migración del 73.9% del catálogo que hoy no tiene ni ubicación.
create table public.producto_categorias (
  id uuid primary key default gen_random_uuid(),
  clave varchar(20) not null unique,
  nombre varchar(120) not null,
  descripcion text,
  activo boolean not null default true,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categorias_clave_chk check (clave = upper(btrim(clave)) and length(btrim(clave)) > 0)
);

create index idx_categorias_activo on public.producto_categorias (activo);

create trigger before_update_producto_categorias
  before update on public.producto_categorias
  for each row execute function public.set_updated_meta();

create trigger audit_producto_categorias after insert or update on public.producto_categorias
  for each row execute function public.audit_row();

-- =========================================
-- 5. TABLA: productos
-- =========================================
create table public.productos (
  id uuid primary key default gen_random_uuid(),

  -- === IDENTIDAD: dos identificadores reales, ninguno es la PK ===
  codigo_interno varchar(60) not null,      -- RTB-GRIU-25.2505.21 — clave de RTB
  familia_id uuid not null references public.producto_familias(id) on delete restrict,
  sku varchar(80),                           -- número de parte del fabricante. NO único.
  -- Normalizado para poder cruzar catálogo↔proveedor sin depender de
  -- guiones/mayúsculas (regexp_replace/upper son IMMUTABLE: válido en
  -- columna generada).
  sku_normalizado varchar(80) generated always as (
    nullif(upper(regexp_replace(coalesce(sku, ''), '[^A-Za-z0-9]', '', 'g')), '')
  ) stored,
  -- Fusión de duplicados detectados (p.ej. el par SL18B/SL18C): la fila
  -- duplicada pasa a estado 'fusionado' y apunta a la canónica en vez de
  -- borrarse (regla de negocio "no borrado físico").
  producto_canonico_id uuid references public.productos(id) on delete restrict,

  nombre varchar(200) not null,
  descripcion text,
  marca varchar(120),
  modelo varchar(120),
  categoria_id uuid references public.producto_categorias(id) on delete restrict,
  codigo_barras varchar(60),

  -- === UNIDAD DE MEDIDA: ver cabecera — causa #1 de pérdida medida ===
  unidad_medida_id uuid not null references public.unidades_medida(id) on delete restrict,
  contenido_por_unidad numeric(14, 4) not null default 1,
  unidad_contenido_id uuid references public.unidades_medida(id) on delete restrict,

  -- === PARÁMETROS COMERCIALES (RTB-PRO-COM-01 §III) ===
  stock_minimo numeric(16, 4),               -- NULL = sin definir (alerta ⚪), no 0 por default
  stock_maximo numeric(16, 4),
  es_estrategico boolean not null default false,
  requiere_ubicacion boolean not null default true,

  costo_catalogo numeric(14, 6),             -- materializado desde producto_costos (010)

  estado public.producto_estado not null default 'borrador',
  observaciones text,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint productos_codigo_chk check (length(btrim(codigo_interno)) > 0),
  constraint productos_contenido_chk check (contenido_por_unidad > 0),
  -- Si el registro se lleva en una unidad que agrupa (KIT/PAQ), hay que
  -- decir en qué unidad está el contenido; si contenido_por_unidad=1 no hace falta.
  constraint productos_unidad_contenido_chk check (
    contenido_por_unidad = 1 or unidad_contenido_id is not null
  ),
  constraint productos_stock_chk check (
    (stock_minimo is null or stock_minimo >= 0)
    and (stock_maximo is null or stock_minimo is null or stock_maximo >= stock_minimo)
  ),
  constraint productos_fusion_chk check (
    (estado = 'fusionado') = (producto_canonico_id is not null)
  ),
  constraint productos_no_autofusion_chk check (producto_canonico_id is distinct from id)
);

comment on table public.productos is
  'Catálogo maestro de productos. codigo_interno es la clave de RTB (única '
  'sólo entre filas estado=activo); sku es el número de parte del '
  'fabricante y NO es único (hay pares reales que lo comparten). La unidad '
  'de medida y el factor de conversión sólo cambian vía '
  'producto_unidad_redefiniciones (013) — nunca por UPDATE directo.';

-- Unicidad condicionada al estado: la carga histórica trae códigos
-- duplicados y truncados; un UNIQUE simple habría impedido migrar. Mismo
-- idioma que uq_entidades_rfc (002): la excepción real manda sobre la
-- regla teórica, y se hace explícita en un índice parcial.
create unique index uq_productos_codigo_activo on public.productos (codigo_interno)
  where estado = 'activo';
create index idx_productos_codigo on public.productos (codigo_interno);
create index idx_productos_sku_norm on public.productos (sku_normalizado) where sku_normalizado is not null;
create index idx_productos_familia on public.productos (familia_id);
create index idx_productos_categoria on public.productos (categoria_id);
create index idx_productos_unidad on public.productos (unidad_medida_id);
create index idx_productos_unidad_contenido on public.productos (unidad_contenido_id);
create index idx_productos_estado on public.productos (estado);
create index idx_productos_canonico on public.productos (producto_canonico_id);
create index idx_productos_codigo_trgm on public.productos using gin (codigo_interno gin_trgm_ops);
create index idx_productos_sku_trgm on public.productos using gin (sku gin_trgm_ops);
create index idx_productos_busqueda on public.productos using gin (
  to_tsvector('spanish', coalesce(nombre, '') || ' ' || coalesce(marca, '') || ' ' || coalesce(descripcion, ''))
);

-- Folio autogenerado por familia: RTB-<clave familia>-000123. SECURITY
-- DEFINER porque nextval() exige USAGE que authenticated no tiene por
-- defecto sobre secuencias nuevas — mismo motivo que entidades_before_insert()
-- en 002_entidades_core.sql.
create sequence public.productos_codigo_seq;

create or replace function public.productos_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clave_familia varchar;
begin
  if new.codigo_interno is null or btrim(new.codigo_interno) = '' then
    select clave into v_clave_familia from public.producto_familias where id = new.familia_id;
    if v_clave_familia is null then
      raise exception 'La familia % no existe', new.familia_id;
    end if;
    new.codigo_interno := 'RTB-' || v_clave_familia || '-' ||
                          lpad(nextval('public.productos_codigo_seq')::text, 6, '0');
  end if;
  new.codigo_interno := upper(btrim(new.codigo_interno));
  new.sku := nullif(upper(btrim(coalesce(new.sku, ''))), '');
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

create trigger before_insert_productos
  before insert on public.productos
  for each row execute function public.productos_before_insert();

-- Sólo debe dispararse por trigger, nunca invocarse directo como RPC de
-- PostgREST (mismo gotcha ya documentado para entidades_before_insert()).
revoke execute on function public.productos_before_insert() from public, anon, authenticated;

create trigger before_update_productos
  before update on public.productos
  for each row execute function public.set_updated_meta();

create trigger audit_productos after insert or update on public.productos
  for each row execute function public.audit_row();

-- =========================================
-- 6. Privilegios de tabla (barrera previa a RLS)
-- =========================================

revoke all on public.unidades_medida from anon, authenticated;
grant select, insert on public.unidades_medida to authenticated;
grant update (nombre, tipo, decimales, activo) on public.unidades_medida to authenticated;
grant all on public.unidades_medida to service_role;

revoke all on public.producto_familias from anon, authenticated;
grant select, insert on public.producto_familias to authenticated;
grant update (nombre, unidad_medida_default_id, requiere_recuento, activo, descripcion)
  on public.producto_familias to authenticated;
grant all on public.producto_familias to service_role;

revoke all on public.producto_categorias from anon, authenticated;
grant select, insert on public.producto_categorias to authenticated;
grant update (nombre, descripcion, activo) on public.producto_categorias to authenticated;
grant all on public.producto_categorias to service_role;

-- productos: identidad y ciclo de vida (codigo_interno/sku/familia_id/
-- producto_canonico_id/estado) y la unidad de medida (causa #1 de pérdida)
-- quedan FUERA del GRANT UPDATE a propósito — sólo se escriben vía API con
-- service_role (depuración/fusión auditada, redefinición autorizada en
-- 013). costo_catalogo lo materializa 010 desde producto_costos.
-- stock_minimo/stock_maximo/es_estrategico son de 'compras': un GRANT de
-- Postgres no distingue rol de negocio dentro de 'authenticated', así que
-- también salen del GRANT y se escriben por API — mismo criterio que
-- entidades.nombre_legal en 002.
revoke all on public.productos from anon, authenticated;
grant select, insert on public.productos to authenticated;
grant update (nombre, descripcion, marca, modelo, categoria_id, codigo_barras,
              requiere_ubicacion, observaciones)
  on public.productos to authenticated;
grant all on public.productos to service_role;

-- Ninguna tabla de este archivo tiene GRANT DELETE para authenticated:
-- regla de negocio "no borrado físico operativo" (un producto que ya no se
-- usa pasa a estado='descontinuado', no se elimina).

-- =========================================
-- 7. RLS
-- =========================================
alter table public.unidades_medida enable row level security;
alter table public.producto_familias enable row level security;
alter table public.producto_categorias enable row level security;
alter table public.productos enable row level security;

-- Catálogos de apoyo: los 8 roles consultan; super_admin/direccion/compras/
-- almacen administran (compras gobierna costos y unidades, almacen opera
-- el catálogo físico).
create policy unidades_medida_select on public.unidades_medida
  for select to authenticated
  using (public.current_user_role() is not null);
create policy unidades_medida_insert on public.unidades_medida
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras', 'almacen']));
create policy unidades_medida_update on public.unidades_medida
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'compras', 'almacen']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras', 'almacen']));

create policy producto_familias_select on public.producto_familias
  for select to authenticated
  using (public.current_user_role() is not null);
create policy producto_familias_insert on public.producto_familias
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras', 'almacen']));
create policy producto_familias_update on public.producto_familias
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'compras', 'almacen']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras', 'almacen']));

create policy producto_categorias_select on public.producto_categorias
  for select to authenticated
  using (public.current_user_role() is not null);
create policy producto_categorias_insert on public.producto_categorias
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras', 'almacen']));
create policy producto_categorias_update on public.producto_categorias
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'compras', 'almacen']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras', 'almacen']));

-- productos: los 8 roles consultan (todos operan alrededor del catálogo);
-- alta y edición libre para super_admin/direccion/compras/almacen.
create policy productos_select on public.productos
  for select to authenticated
  using (public.current_user_role() is not null);
create policy productos_insert on public.productos
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras', 'almacen']));
create policy productos_update on public.productos
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'compras', 'almacen']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras', 'almacen']));

-- Sin DELETE en ninguna tabla: regla de negocio "no borrado físico".
