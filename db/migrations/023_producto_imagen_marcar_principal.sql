-- ==========================================
-- RTB Sistema — 023: función producto_imagen_marcar_principal()
--
-- La API (PATCH /api/productos/[id]/imagenes/[imagenId] con
-- {es_principal:true}) necesita promover una imagen ya existente a
-- principal. Un UPDATE directo de una sola sentencia
-- (`update producto_imagenes set es_principal=true where id=...`) SÍ
-- degrada correctamente a la hermana gracias al BEFORE trigger de 021,
-- pero choca con uq_producto_imagen_principal (23505) por el mismo detalle
-- de visibilidad que forzó la corrección de 022: un UPDATE anidado
-- disparado DESDE el BEFORE trigger de la MISMA fila que se está
-- escribiendo no es visible para la comprobación de unicidad de esa
-- propia fila hasta que la sentencia externa ya terminó.
--
-- La solución general (022) fue limitar el AFTER trigger a sólo "activo".
-- Pero el UPDATE de promoción en sí SIGUE siendo una sola sentencia que
-- dispara la degradación anidada desde el BEFORE trigger de la misma fila
-- — el defecto de visibilidad de origen (curcid de la sentencia externa,
-- fijado antes de que la sentencia anidada corra) sigue presente para esa
-- combinación específica. La solución robusta, verificada en la
-- conversación de implementación, es hacer el swap con DOS sentencias
-- TOP-LEVEL separadas (no una anidada dentro del BEFORE trigger de la
-- otra): demover primero, promover después. Dentro de una función
-- plpgsql cada sentencia del cuerpo SÍ es top-level para ese propósito.
--
-- SECURITY DEFINER porque escribe es_principal, columna deliberadamente
-- fuera del GRANT UPDATE de authenticated (021) — sólo se invoca desde la
-- API con el cliente admin (service_role), nunca por RLS directa.
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

create or replace function public.producto_imagen_marcar_principal(p_imagen_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_producto_id uuid;
  v_activo boolean;
begin
  select producto_id, activo into v_producto_id, v_activo
  from public.producto_imagenes
  where id = p_imagen_id;

  if v_producto_id is null then
    raise exception 'La imagen % no existe', p_imagen_id;
  end if;
  if not v_activo then
    raise exception 'No se puede marcar como principal una imagen dada de baja';
  end if;

  -- Statement 1, top-level: demueve a quien sea principal hoy. Si
  -- p_imagen_id ya era la principal, esto no le afecta (id <> p_imagen_id).
  update public.producto_imagenes
     set es_principal = false
   where producto_id = v_producto_id and id <> p_imagen_id and es_principal;

  -- Statement 2, top-level y POSTERIOR: promueve. Al ejecutarse como
  -- sentencia separada (no anidada dentro del BEFORE trigger de la
  -- sentencia 1), su propia comprobación de unicidad sí ve la democión de
  -- arriba ya resuelta.
  update public.producto_imagenes set es_principal = true where id = p_imagen_id;
end;
$$;

revoke execute on function public.producto_imagen_marcar_principal(uuid) from public, anon, authenticated;
grant execute on function public.producto_imagen_marcar_principal(uuid) to service_role;
