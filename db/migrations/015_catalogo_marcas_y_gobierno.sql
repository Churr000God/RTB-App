-- ==========================================
-- RTB Sistema — 015: Catálogo de marcas + gobierno de familias/unidades +
-- semilla mínima de unidades de medida y familias
--
-- Motivación: al revisar RTB-INV-01 con el dueño del proyecto (2026-08-06)
-- aparecieron dos huecos:
--   1. `productos.marca` es texto libre (varchar(120), 009:172) sin FK ni
--      normalización — "BOSCH"/"Bosch"/"bosch " conviven como tres marcas
--      distintas. familias/categorías/unidades ya eran tablas reales con
--      RLS y GRANT; marca no. Se corrige creando `producto_marcas` con el
--      mismo patrón que `producto_categorias` (009:127-150) y sustituyendo
--      `productos.marca` por `productos.marca_id` (nullable — mismo
--      criterio que `categoria_id`: exigirla bloquearía la carga de los
--      1,388 SKU pendientes).
--   2. La base estaba completamente vacía (0 productos, 0 familias, 0
--      categorías, 0 unidades — verificado por SQL) y no existía pantalla
--      de administración de catálogos, así que no se podía dar de alta ni
--      un producto: los tres <select> del formulario no tenían nada que
--      ofrecer. Se siembra un mínimo de unidades y familias (las claves ya
--      documentadas en el comentario de 009) para desbloquear el alta; los
--      nombres largos son una propuesta a confirmar por el dueño del
--      proyecto y son baratos de corregir después desde la pantalla nueva
--      (nombre sí está en el GRANT UPDATE; clave no).
--
-- De paso se estrecha el gobierno de unidades_medida/producto_familias:
-- 'almacen' sale del INSERT/UPDATE de ambas. La unidad de medida mal
-- definida es la causa #1 de pérdida medida por RTB (ver cabecera de 009:
-- 14/27 folios de no conformidad, -$37,919.77) y la familia es su unidad de
-- gobierno — quien las define no debe ser quien opera el conteo contra
-- ellas. producto_categorias no se toca: sigue con los 4 roles.
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

-- =========================================
-- 1. TABLA: producto_marcas (calcada de producto_categorias, 009:127-150)
-- =========================================
create table public.producto_marcas (
  id uuid primary key default gen_random_uuid(),
  clave varchar(20) not null unique,
  nombre varchar(120) not null,
  descripcion text,
  activo boolean not null default true,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marcas_clave_chk check (clave = upper(btrim(clave)) and length(btrim(clave)) > 0)
);

comment on table public.producto_marcas is
  'Catálogo de marcas de producto. Sustituye a productos.marca (texto '
  'libre, varchar(120), eliminado en esta misma migración): sin tabla, '
  '"BOSCH"/"Bosch"/"bosch " convivían como tres marcas distintas.';

create index idx_marcas_activo on public.producto_marcas (activo);

create trigger before_update_producto_marcas
  before update on public.producto_marcas
  for each row execute function public.set_updated_meta();

create trigger audit_producto_marcas after insert or update on public.producto_marcas
  for each row execute function public.audit_row();

-- =========================================
-- 2. productos.marca_id (FK nullable — mismo criterio que categoria_id)
-- =========================================
alter table public.productos
  add column marca_id uuid references public.producto_marcas(id) on delete restrict;

create index idx_productos_marca on public.productos (marca_id);

-- =========================================
-- 3. Eliminar productos.marca y rehacer el índice de búsqueda
-- =========================================
-- idx_productos_busqueda (009:237-239) incluye marca en su to_tsvector:
-- un DROP COLUMN directo lo habría eliminado en cascada EN SILENCIO. Se
-- hace explícito. Verificado antes de escribir esto: ningún tsvector/
-- tsquery/textSearch se emite desde app/ — la búsqueda real de productos es
-- .or('nombre.ilike…,codigo_interno.ilike…,sku.ilike…')
-- (app/app/api/productos/route.ts). Coste de este cambio: cero. La
-- búsqueda por marca se recupera resolviendo IDs contra producto_marcas
-- en esa misma ruta, antes de tocar productos (mejor que antes: exacta por
-- nombre o clave, no ILIKE contra texto sucio).
--
-- No se denormaliza un productos.marca_nombre: exigiría un trigger que
-- reescriba todas las filas de una marca al renombrarla, y cada UPDATE
-- dispararía audit_row() — renombrar una marca con 300 SKU escribiría 300
-- filas de auditoría por un cambio cosmético, y reintroduciría la copia
-- desincronizable que el FK viene a eliminar.
--
-- 'modelo' entra en el lugar de 'marca' en el índice: sigue siendo texto
-- libre en la fila y hasta hoy no era buscable por nada.
drop index if exists public.idx_productos_busqueda;

alter table public.productos drop column marca;

create index idx_productos_busqueda on public.productos using gin (
  to_tsvector('spanish', coalesce(nombre, '') || ' ' || coalesce(modelo, '') || ' ' || coalesce(descripcion, ''))
);

-- =========================================
-- 4. Privilegios de tabla
-- =========================================
revoke all on public.producto_marcas from anon, authenticated;
grant select, insert on public.producto_marcas to authenticated;
grant update (nombre, descripcion, activo) on public.producto_marcas to authenticated;
grant all on public.producto_marcas to service_role;
-- Sin DELETE: baja lógica con activo=false, igual que los otros tres
-- catálogos. 'clave' fuera del GRANT UPDATE: inmutable tras el alta, ídem.

-- El GRANT por columna es aditivo: se reafirma la lista completa de
-- productos (no sólo se añade marca_id) para que este archivo documente el
-- conjunto real sin obligar a leer 009 para saberlo.
revoke update on public.productos from authenticated;
grant update (nombre, descripcion, marca_id, modelo, categoria_id, codigo_barras,
              requiere_ubicacion, observaciones)
  on public.productos to authenticated;

-- =========================================
-- 5. RLS
-- =========================================
alter table public.producto_marcas enable row level security;

create policy producto_marcas_select on public.producto_marcas
  for select to authenticated
  using (public.current_user_role() is not null);
create policy producto_marcas_insert on public.producto_marcas
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras', 'almacen']));
create policy producto_marcas_update on public.producto_marcas
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'compras', 'almacen']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras', 'almacen']));

-- Estrechar gobierno de unidades_medida y producto_familias: 'almacen' sale
-- del INSERT/UPDATE (ver cabecera). Las políticas _select quedan intactas
-- (8 roles) — no se tocan.
drop policy if exists unidades_medida_insert on public.unidades_medida;
create policy unidades_medida_insert on public.unidades_medida
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras']));

drop policy if exists unidades_medida_update on public.unidades_medida;
create policy unidades_medida_update on public.unidades_medida
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'compras']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras']));

drop policy if exists producto_familias_insert on public.producto_familias;
create policy producto_familias_insert on public.producto_familias
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras']));

drop policy if exists producto_familias_update on public.producto_familias;
create policy producto_familias_update on public.producto_familias
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'compras']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras']));

-- producto_categorias no se toca: sigue con super_admin/direccion/compras/
-- almacen — almacen es quien recibe mercancía nueva y clasifica.

-- =========================================
-- 6. Semilla mínima: unidades de medida y familias
-- =========================================
-- Unidades primero: las familias las referencian por clave. decimales=0 en
-- conteo/agrupación no es cosmético (ver 009:63-64): impide capturar
-- "2.5 piezas" como error de captura silencioso; el kardex (011) valida
-- contra este campo. ML y MTS son ambas 'longitud' y quedan redundantes a
-- propósito — ambas están documentadas en el comentario de 009 (rollo vs.
-- corte); si el dueño del proyecto confirma que sobra una, se desactiva
-- con activo=false desde la pantalla nueva, no se borra.
--
-- created_by queda NULL: auth.uid() es NULL bajo apply_migration (no hay
-- sesión de usuario) y la columna es nullable — los triggers de auditoría
-- igual disparan, con usuario_id NULL.
insert into public.unidades_medida (clave, nombre, tipo, decimales) values
  ('PZ',  'Pieza',        'conteo',     0),
  ('PAQ', 'Paquete',      'agrupacion', 0),
  ('KIT', 'Kit',          'agrupacion', 0),
  ('JGO', 'Juego',        'agrupacion', 0),
  ('ML',  'Metro lineal', 'longitud',   2),
  ('MTS', 'Metros',       'longitud',   2)
on conflict (clave) do nothing;

-- Las 10 CLAVES son las documentadas en el comentario de 009:96. Los
-- NOMBRES largos son una propuesta a confirmar por el dueño del proyecto —
-- se editan después desde la pestaña Familias (nombre sí está en el GRANT
-- UPDATE); la clave no, así que ésa hay que acertarla hoy.
insert into public.producto_familias (clave, nombre, unidad_medida_default_id)
select v.clave, v.nombre, u.id
from (values
  ('GRIU', 'Griferías y urinarios'),
  ('REFU', 'Refacciones de fluxómetro'),
  ('PLO',  'Plomería'),
  ('FER',  'Ferretería'),
  ('CER',  'Cerámica sanitaria'),
  ('ILU',  'Iluminación'),
  ('ETI',  'Etiquetado e identificación'),
  ('AHO',  'Ahorradores de agua'),
  ('CON',  'Conexiones'),
  ('HER',  'Herramientas')
) as v(clave, nombre)
left join public.unidades_medida u on u.clave = 'PZ'
on conflict (clave) do nothing;
