-- ==========================================
-- RTB Sistema — 021: producto_imagenes + bucket público productos-imagenes
--
-- Motivación: el catálogo de refacciones no tiene fotos. Se necesitan para
-- identificar la pieza correcta en pantalla, para imprimir documentos y
-- para futuras cotizaciones — y para la vista de galería que se agrega a
-- /dashboard/productos junto a la de tabla.
--
-- PRIMER bucket PÚBLICO del repo, a diferencia de comprobantes-bancarios
-- (004_cuentas_bancarias.sql) y soportes-inventario
-- (013_inventario_discrepancias_ajustes.sql), ambos privados con URL
-- firmada de 60s. Justificación:
--   1. La foto de una refacción no es dato de un tercero ni evidencia
--      contable — es contenido de catálogo, a diferencia de un comprobante
--      bancario o un soporte de ajuste de inventario.
--   2. La URL tiene que seguir funcionando dentro de un PDF, una impresión
--      o un correo archivado, y una URL firmada caduca — rompería el
--      documento en cuanto se archiva.
-- Mitigaciones: rutas con UUID (impredecibles), file_size_limit y
-- allowed_mime_types en el bucket, y CERO políticas de escritura para
-- authenticated sobre storage.objects — sólo service_role escribe, siempre
-- tras requireApiRole() en la capa de API.
--
-- Regla derivada para el futuro: archivo con dato de un tercero
-- (comprobante, factura, identificación) → bucket privado + URL firmada.
-- Foto de catálogo → este bucket público.
--
-- Numeración: continúa 020_entidades_siglas.sql (ver su cabecera sobre el
-- desfase de numeración con trabajo concurrente de corrección de auditoría
-- QA sin commitear).
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

-- =========================================
-- 1. TABLA: producto_imagenes
-- =========================================
create table public.producto_imagenes (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on update cascade on delete restrict,
  path varchar(500) not null unique,        -- ruta DENTRO del bucket, nunca la URL completa
  miniatura_path varchar(500),
  es_principal boolean not null default false,
  orden integer not null default 0,
  descripcion varchar(300),                  -- texto alternativo (accesibilidad) / pie de foto
  mime varchar(100) not null,
  bytes integer not null,
  ancho integer,
  alto integer,
  activo boolean not null default true,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prod_img_mime_chk  check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  -- 5242880 (5MB) es el CUARTO espejo del límite: bucket file_size_limit
  -- (más abajo), este CHECK, IMAGEN_BYTES_MAX (lib/inventario/config.ts) y
  -- el propio bucket de Storage — si se cambia el límite hay que tocar los
  -- cuatro o quedan desincronizados.
  constraint prod_img_bytes_chk check (bytes > 0 and bytes <= 5242880),
  constraint prod_img_orden_chk check (orden >= 0)
);

comment on table public.producto_imagenes is
  'Fotos de catálogo de un producto, 0..N con una principal. El binario '
  'vive en el bucket público productos-imagenes (Storage); esta tabla sólo '
  'guarda la ruta y metadatos. "No borrado físico" protege el REGISTRO '
  '(motivo: se conserva como rastro de quién subió qué y cuándo, activo '
  '= false) — no protege el binario: al "quitar" una imagen la API sí '
  'borra el objeto del bucket, porque una foto pública y permanente que el '
  'usuario ya quitó del catálogo no debe seguir siendo accesible por su URL.';

create index idx_producto_imagenes_producto on public.producto_imagenes (producto_id, orden);

-- Invariante "como MÁXIMO una principal activa por producto" — mismo
-- patrón exacto que uq_contacto_principal_entidad /
-- uq_direccion_principal_entidad_tipo (002_entidades_core.sql). El índice
-- sólo cubre "como máximo una"; "al menos una si hay imágenes activas" lo
-- cubren los dos triggers de abajo.
create unique index uq_producto_imagen_principal on public.producto_imagenes (producto_id)
  where es_principal = true and activo = true;

-- =========================================
-- 2. Triggers del invariante "exactamente una principal si hay activas"
-- =========================================
-- BEFORE: (a) la primera imagen activa de un producto nace principal;
--         (b) promover una degrada a las hermanas del mismo producto;
--         (c) dar de baja (activo=false) nunca deja una imagen principal.
-- SECURITY DEFINER porque el UPDATE interno (degradar hermanas) escribe
-- es_principal, columna deliberadamente fuera del GRANT UPDATE de
-- authenticated (ver privilegios más abajo) — el invariante lo sostiene
-- el trigger, no el cliente.
-- Recursión: el UPDATE interno llega con es_principal ya en false para las
-- hermanas → no vuelve a entrar en la rama "promover" ni en la de
-- "primera imagen" (INSERT únicamente) → para en profundidad 2.
create or replace function public.producto_imagenes_principal_before()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' and not new.es_principal and new.activo then
    if not exists (
      select 1 from public.producto_imagenes
      where producto_id = new.producto_id and activo and es_principal
    ) then
      new.es_principal := true;
    end if;
  end if;

  if new.es_principal and new.activo then
    update public.producto_imagenes
       set es_principal = false
     where producto_id = new.producto_id and id <> new.id and es_principal;
  end if;

  if not new.activo then
    new.es_principal := false;
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger before_ins_upd_producto_imagenes
  before insert or update on public.producto_imagenes
  for each row execute function public.producto_imagenes_principal_before();

revoke execute on function public.producto_imagenes_principal_before() from public, anon, authenticated;

-- AFTER: si tras un UPDATE el producto quedó con imágenes activas pero sin
-- ninguna principal (se dio de baja o se despromovió la principal sin
-- promover otra en el mismo UPDATE), promueve la de menor orden. Va en
-- AFTER porque toca OTRA fila, no la que disparó el trigger.
-- Recursión: la segunda pasada (disparada por este mismo UPDATE) ya
-- encuentra una principal → la condición es falsa → no hace nada.
create or replace function public.producto_imagenes_principal_after()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.producto_imagenes
    where producto_id = new.producto_id and activo and es_principal
  ) then
    update public.producto_imagenes set es_principal = true
     where id = (
       select id from public.producto_imagenes
       where producto_id = new.producto_id and activo
       order by orden, created_at
       limit 1
     );
  end if;
  return null;
end;
$$;

create trigger after_upd_producto_imagenes
  after update of es_principal, activo on public.producto_imagenes
  for each row execute function public.producto_imagenes_principal_after();

revoke execute on function public.producto_imagenes_principal_after() from public, anon, authenticated;

create trigger audit_producto_imagenes after insert or update on public.producto_imagenes
  for each row execute function public.audit_row();

-- =========================================
-- 3. Privilegios — restringido por columna en INSERT y en UPDATE (gotcha
--    de inventario_conteos, 012_inventario_conteos.sql: GRANT INSERT sin
--    restringir + máquina de estados que sólo valida en UPDATE = forjar el
--    estado inicial).
-- =========================================
revoke all on public.producto_imagenes from anon, authenticated;
grant select on public.producto_imagenes to authenticated;

-- es_principal/activo/created_by fuera a propósito: el invariante de
-- "exactamente una principal" lo sostiene el trigger BEFORE, no el
-- cliente; created_by lo fija auth.uid() vía DEFAULT, no el INSERT.
grant insert (producto_id, path, miniatura_path, descripcion, mime, bytes, ancho, alto, orden)
  on public.producto_imagenes to authenticated;

-- Sólo metadatos editables directo. es_principal se cambia por API con
-- service_role (POST .../imagenes/[imagenId] con {es_principal:true} —
-- rechaza {es_principal:false} explícito: despromover sin promover otra
-- dejaría al producto sin principal). activo se cambia por API con
-- service_role al "quitar" una imagen (borra también el objeto del bucket).
grant update (descripcion, orden) on public.producto_imagenes to authenticated;

grant all on public.producto_imagenes to service_role;
-- Sin GRANT DELETE: la baja es activo=false (ver comment on table).

-- =========================================
-- 4. RLS — espejo de productos (009_inventario_catalogo.sql)
-- =========================================
alter table public.producto_imagenes enable row level security;

create policy producto_imagenes_select on public.producto_imagenes
  for select to authenticated
  using (public.current_user_role() is not null);
create policy producto_imagenes_insert on public.producto_imagenes
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras', 'almacen']));
create policy producto_imagenes_update on public.producto_imagenes
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'compras', 'almacen']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'compras', 'almacen']));

-- =========================================
-- 5. Bucket de Storage — público, a diferencia de los dos existentes
-- =========================================
-- do update (no el "do nothing" de 004/013) a propósito: si el bucket ya
-- existiera creado a mano en el dashboard como privado, "do nothing" lo
-- dejaría privado y la app fallaría de forma confusa (URLs públicas 400).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'productos-imagenes', 'productos-imagenes', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Deliberadamente CERO políticas sobre storage.objects para este bucket —
-- no es un olvido:
--   · LECTURA: el bucket es público — la ruta /storage/v1/object/public/...
--     no evalúa RLS, así que una policy "for select" sería decorativa.
--   · ESCRITURA: storage.objects tiene RLS habilitada por Supabase y, sin
--     una policy permisiva que case con bucket_id='productos-imagenes',
--     authenticated no puede insert/update/delete ahí. Sólo service_role
--     (que salta RLS) escribe, y siempre detrás de requireApiRole() en
--     POST/DELETE /api/productos/[id]/imagenes.
