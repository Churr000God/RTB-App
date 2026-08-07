-- ==========================================
-- RTB Sistema — 028: los tres niveles de precio de venta (RTB-VEN-01)
--
-- Punto de partida del módulo de Ventas (contexto/RTB-PRO-VEN-01_Modulo_Ventas.md
-- + reglas de negocio ampliadas confirmadas con el dueño del proyecto,
-- 2026-08-07). Un vendedor elige entre tres precios al cotizar:
--   1. "Costo Refacción" / "Costo Ariba" — ya existen como canales de
--      producto_precios_referencia (010), sin cambio de estructura.
--   2. "Costo de Venta" — NUEVO. Fórmula viva: costo base ponderado de
--      TODAS las ubicaciones × (1 + margen_porcentaje de la FAMILIA del
--      producto, no de la categoría). Si entra una compra más cara, sube
--      solo. Admite un override manual que lo CONGELA (con quién/cuándo);
--      el override nunca se pierde, sólo se desactiva (historial completo).
--
-- Deliberadamente NO se toca public.costo_unitario_vigente() (011:690): esa
-- función sigue siendo la que usa el trigger del kardex para valuar
-- inventario (toma el costo_promedio de la ubicación con más existencia).
-- Ventas necesita un número distinto — el promedio ponderado de TODO el
-- inventario del producto, sin importar en cuántas ubicaciones esté
-- repartido — así que se crea costo_promedio_global() aparte.
--
-- El precio elegido por el vendedor se FOTOGRAFÍA en la línea de cotización
-- (030) y nunca vuelve a cambiar; lo que este archivo resuelve es sólo qué
-- número se propone en el momento de agregar la línea.
--
-- De paso: producto_precios_referencia (010) tenía a 'ventas' en su GRANT de
-- insert/update — dos de los tres precios que el vendedor ELIGE vivían en
-- una tabla que el propio vendedor podía EDITAR. Se estrecha a
-- compras/direccion/super_admin, mismo criterio con el que
-- 015_catalogo_marcas_y_gobierno.sql le quitó a 'almacen' el alta de
-- unidades/familias (quien decide el precio no debe ser quien lo cotiza).
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

-- =========================================
-- 1. producto_familias: margen de venta (política de Dirección, no de Compras)
-- =========================================
-- Fuera del GRANT UPDATE de 009 (que ya tiene compras/almacen sobre otras
-- columnas de esta tabla): margen_porcentaje sólo se escribe por API con
-- service_role tras validar rol. Una familia sin margen (NULL) no es un
-- bug: es la señal de "Dirección todavía no configuró esta familia" que se
-- muestra en rojo en /dashboard/catalogos, y por diseño hace que ningún
-- producto de esa familia tenga "Costo de Venta" calculable (decisión
-- explícita del dueño del proyecto: Compras-ligero garantiza el costo, así
-- que la única forma de que falte un precio es un margen sin configurar).
alter table public.producto_familias
  add column margen_porcentaje numeric(6, 3),
  add constraint familias_margen_chk check (
    margen_porcentaje is null or (margen_porcentaje >= 0 and margen_porcentaje <= 1000)
  );

comment on column public.producto_familias.margen_porcentaje is
  'Porcentaje de ganancia sobre el costo base para calcular "Costo de Venta" '
  '(028). NULL = familia sin margen configurado todavía; ningún producto de '
  'esa familia tiene precio de venta calculable hasta que Dirección lo '
  'defina. Sólo escribible por API con service_role (fuera del GRANT UPDATE '
  'de 009) — es política comercial, no parámetro de catálogo.';

-- El GRANT INSERT original de 009 es de TABLA completa, sin lista de
-- columnas (`grant select, insert on ... to authenticated`) — eso concede
-- INSERT sobre cualquier columna nueva por defecto, incluida esta. 'compras'
-- sí puede insertar filas de producto_familias (RLS, 015) y sin este ajuste
-- heredaría la capacidad de fijar el margen AL CREAR la familia, aunque no
-- pueda tocarlo después (fuera del GRANT UPDATE de 009). Se cierra
-- explícitamente: mismo idioma que "GRANT INSERT sin restricción de columna
-- = forjar el estado inicial" ya documentado en CLAUDE.md.
revoke insert on public.producto_familias from authenticated;
grant insert (clave, nombre, unidad_medida_default_id, requiere_recuento, activo, descripcion)
  on public.producto_familias to authenticated;

-- =========================================
-- 2. TABLA: producto_precio_venta (override manual que congela la fórmula)
-- =========================================
create table public.producto_precio_venta (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete restrict,
  precio_manual numeric(14, 4) not null check (precio_manual >= 0),
  motivo text not null,
  activo boolean not null default true,
  definido_por uuid references public.profiles(id) default auth.uid(),
  definido_at timestamptz not null default now(),
  desactivado_at timestamptz,
  desactivado_por uuid references public.profiles(id),
  desactivado_motivo text,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ppv_motivo_chk check (length(btrim(motivo)) > 0),
  constraint ppv_desactivacion_chk check (
    (activo = false) = (desactivado_at is not null and desactivado_por is not null)
  )
);

comment on table public.producto_precio_venta is
  'Override manual del "Costo de Venta" calculado. Nunca se borra ni se '
  'edita en sitio — desactivar y fijar uno nuevo son filas distintas '
  '(historial completo, mismo criterio que producto_costos en 010). Sólo '
  'una fila activa por producto (índice único parcial). Se escribe '
  'EXCLUSIVAMENTE por las funciones producto_precio_venta_fijar()/'
  '_revertir() — sin GRANT INSERT/UPDATE para authenticated, para no tener '
  'que repetir en dos lugares la regla "quien solicita no siempre es quien '
  'firma" si en el futuro se le pide evidencia a este override.';

create unique index uq_precio_venta_activo on public.producto_precio_venta (producto_id)
  where activo;
create index idx_precio_venta_producto on public.producto_precio_venta (producto_id);

create trigger before_update_producto_precio_venta
  before update on public.producto_precio_venta
  for each row execute function public.set_updated_meta();

create trigger audit_producto_precio_venta after insert or update on public.producto_precio_venta
  for each row execute function public.audit_row();

revoke all on public.producto_precio_venta from anon, authenticated;
grant select on public.producto_precio_venta to authenticated;
grant all on public.producto_precio_venta to service_role;

alter table public.producto_precio_venta enable row level security;

-- Todos los roles pueden ver si un producto tiene override activo (útil
-- para explicar por qué un precio no se movió); sólo las funciones
-- SECURITY DEFINER (más abajo) escriben la tabla.
create policy producto_precio_venta_select on public.producto_precio_venta
  for select to authenticated
  using (public.current_user_role() is not null);

-- =========================================
-- 3. Funciones de costo/precio — orden importa: cada una referencia sólo
--    tablas ya creadas arriba en este archivo o en migraciones previas.
-- =========================================

-- NUEVA. Pondera TODAS las ubicaciones del producto (a diferencia de
-- costo_unitario_vigente(), 011:690, que toma sólo la de mayor existencia).
-- No se toca esa función: el kardex depende de su comportamiento actual
-- para valuar inventario. Misma cascada de respaldo cuando no hay
-- existencia física: costo de catálogo vigente → proveedor preferente.
create or replace function public.costo_promedio_global(p_producto_id uuid, p_fecha timestamptz default now())
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select sum(e.cantidad_teorica * e.costo_promedio) / nullif(sum(e.cantidad_teorica), 0)
       from public.inventario_existencias e
      where e.producto_id = p_producto_id
        and e.costo_promedio is not null
        and e.cantidad_teorica > 0),
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

comment on function public.costo_promedio_global(uuid, timestamptz) is
  'Costo base para Ventas: promedio ponderado por cantidad de TODAS las '
  'ubicaciones del producto (sum(cantidad·costo)/sum(cantidad)), no sólo la '
  'de mayor existencia. SECURITY DEFINER: "ventas" no tiene SELECT sobre '
  'proveedor_productos (lib/inventario/permisos.ts) y esta función cae en '
  'esa cascada cuando no hay existencia física.';

revoke execute on function public.costo_promedio_global(uuid, timestamptz) from public, anon;
grant execute on function public.costo_promedio_global(uuid, timestamptz) to authenticated, service_role;

-- coalesce(override activo, fórmula). NULL si la familia no tiene margen y
-- no hay override — "producto sin precio calculable", decisión explícita:
-- no hay margen global de respaldo, para que la familia sin configurar sea
-- visible, no se esconda.
create or replace function public.costo_venta_vigente(p_producto_id uuid, p_fecha timestamptz default now())
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select v.precio_manual from public.producto_precio_venta v
      where v.producto_id = p_producto_id and v.activo),
    (select public.costo_promedio_global(p_producto_id, p_fecha) * (1 + f.margen_porcentaje / 100.0)
       from public.productos p
       join public.producto_familias f on f.id = p.familia_id
      where p.id = p_producto_id and f.margen_porcentaje is not null
        and public.costo_promedio_global(p_producto_id, p_fecha) is not null)
  );
$$;

revoke execute on function public.costo_venta_vigente(uuid, timestamptz) from public, anon;
grant execute on function public.costo_venta_vigente(uuid, timestamptz) to authenticated, service_role;

-- Detalle para la UI (tarjeta de precio en /dashboard/productos/[id]) y
-- para el trigger de líneas de cotización (030), que necesita saber tanto
-- el número final como el desglose que va a fotografiar.
create or replace function public.costo_venta_detalle(p_producto_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'producto_id', p_producto_id,
    'costo_base', public.costo_promedio_global(p_producto_id),
    'familia_id', p.familia_id,
    'margen_porcentaje', f.margen_porcentaje,
    'familia_sin_margen', f.margen_porcentaje is null,
    'es_manual', v.id is not null,
    'precio_manual', v.precio_manual,
    'definido_por', v.definido_por,
    'definido_at', v.definido_at,
    'calculado', case
      when f.margen_porcentaje is not null and public.costo_promedio_global(p_producto_id) is not null
      then round(public.costo_promedio_global(p_producto_id) * (1 + f.margen_porcentaje / 100.0), 4)
      else null
    end,
    'costo_venta', public.costo_venta_vigente(p_producto_id),
    'calculable', public.costo_venta_vigente(p_producto_id) is not null
  )
  from public.productos p
  join public.producto_familias f on f.id = p.familia_id
  left join public.producto_precio_venta v on v.producto_id = p.id and v.activo
  where p.id = p_producto_id;
$$;

revoke execute on function public.costo_venta_detalle(uuid) from public, anon;
grant execute on function public.costo_venta_detalle(uuid) to authenticated, service_role;

-- =========================================
-- 4. Fijar / revertir el override manual — únicas escritoras de
--    producto_precio_venta. Patrón de 016/025/027: rol dentro de la
--    función, guarda de auth.uid() NULL, set search_path fijo.
-- =========================================
create or replace function public.producto_precio_venta_fijar(
  p_producto_id uuid, p_precio numeric, p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if public.current_user_role() not in ('super_admin', 'direccion') then
    raise exception 'Sin permisos para fijar un precio de venta manual.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;
  if p_precio is null or p_precio < 0 then
    raise exception 'El precio manual debe ser mayor o igual a cero.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'El motivo es obligatorio para fijar un precio manual.' using errcode = '23514';
  end if;

  update public.producto_precio_venta
     set activo = false, desactivado_at = now(), desactivado_por = v_actor,
         desactivado_motivo = 'Reemplazado por un nuevo precio manual'
   where producto_id = p_producto_id and activo;

  insert into public.producto_precio_venta (producto_id, precio_manual, motivo, definido_por)
  values (p_producto_id, p_precio, btrim(p_motivo), v_actor)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.producto_precio_venta_fijar(uuid, numeric, text) from public, anon;
grant execute on function public.producto_precio_venta_fijar(uuid, numeric, text) to authenticated;

create or replace function public.producto_precio_venta_revertir(p_producto_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if public.current_user_role() not in ('super_admin', 'direccion') then
    raise exception 'Sin permisos para volver a la fórmula.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;

  update public.producto_precio_venta
     set activo = false, desactivado_at = now(), desactivado_por = v_actor,
         desactivado_motivo = coalesce(nullif(btrim(p_motivo), ''), 'Vuelta a la fórmula')
   where producto_id = p_producto_id and activo;

  if not found then
    raise exception 'Este producto no tiene un precio manual activo.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.producto_precio_venta_revertir(uuid, text) from public, anon;
grant execute on function public.producto_precio_venta_revertir(uuid, text) to authenticated;

-- =========================================
-- 5. Estrechar producto_precios_referencia (010): 'ventas' pasa a sólo
--    lectura. Compras/Dirección/super_admin son quienes mantienen "Costo
--    Refacción"/"Costo Ariba" — el vendedor los elige, no los edita.
-- =========================================
drop policy if exists precios_referencia_insert on public.producto_precios_referencia;
create policy precios_referencia_insert on public.producto_precios_referencia
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras']));

drop policy if exists precios_referencia_update on public.producto_precios_referencia;
create policy precios_referencia_update on public.producto_precios_referencia
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'compras']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras']));
