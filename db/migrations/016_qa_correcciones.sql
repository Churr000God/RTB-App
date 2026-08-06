-- ==========================================
-- RTB Sistema — 016: Correcciones de la campaña de QA por rol
-- (contexto/AUDITORIA_QA_ROLES_2026-08-06.md)
--
-- Cierra E-01, E-03, E-05 del documento. La causa raíz real de los tres es
-- la misma: las rutas de congelar/aplicar un conteo usan
-- createSupabaseAdminClient() (service_role, SIN JWT) para saltarse el
-- GRANT restringido de inventario_conteo_detalles/inventario_congelamientos
-- — pero eso también deja auth.uid() en NULL, y varias columnas de
-- autoría dependen de auth.uid() (default o trigger). El documento de QA
-- diagnosticó bien el síntoma (violación NOT NULL en congelado_por) pero
-- el fix que insinúa para E-02 (GRANT SELECT de tabla completa sobre
-- inventario_conteo_detalles) habría destruido la vista ciega — ver
-- corrección de causa raíz en el propio AUDITORIA_QA_ROLES_2026-08-06.md.
--
-- La corrección de fondo aquí NO es "parchear auth.uid() con más
-- privilegio de service_role": es dejar de usar el cliente admin para
-- estas dos operaciones y hacerlas con funciones SECURITY DEFINER
-- invocadas por el cliente propio del usuario autenticado (mismo patrón
-- ya establecido por inventario_congelamiento_activo() y
-- conteo_conciliacion() en 012) — así la función gana el privilegio que
-- necesita sobre las tablas restringidas, sin perder el contexto de JWT
-- que hace que auth.uid() resuelva al actor real. E-02 (GRANT/SELECT *)
-- se corrige en la ruta (app/app/api/inventario/conteos/[id]/detalles/
-- route.ts), no aquí: no hay nada que tocar en SQL para ese hallazgo.
-- ==========================================

-- =========================================
-- 1. Autoría defensiva bajo un eventual caller sin JWT (coalesce).
--    Con el cambio de ruta (Fase 1) ningún camino real vuelve a llamar
--    estas funciones sin JWT, pero coalesce(new.<col>, auth.uid()) es
--    inofensivo hoy y evita que un futuro service_role client vuelva a
--    pisar un valor ya explícito en el payload — antes lo pisaba siempre
--    con auth.uid() (NULL bajo service_role).
-- =========================================
create or replace function public.inventario_conteos_before_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_permitidas public.conteo_estado[];
begin
  new.folio := old.folio;
  new.tipo := old.tipo;
  new.alcance := old.alcance;
  new.alcance_descripcion := old.alcance_descripcion;
  new.conteo_origen_id := old.conteo_origen_id;
  new.updated_at := now();
  new.updated_by := coalesce(new.updated_by, auth.uid());

  if new.estado is distinct from old.estado then
    v_permitidas := case old.estado
      when 'planificado' then array['congelado', 'cancelado']::public.conteo_estado[]
      when 'congelado' then array['en_captura', 'cancelado']::public.conteo_estado[]
      when 'en_captura' then array['en_conciliacion', 'cancelado']::public.conteo_estado[]
      when 'en_conciliacion' then array['cerrado', 'cancelado']::public.conteo_estado[]
      when 'cerrado' then array['aplicado']::public.conteo_estado[]
      else array[]::public.conteo_estado[]
    end;
    if not (new.estado = any (v_permitidas)) then
      raise exception 'Transición de conteo no permitida: % → %', old.estado, new.estado
        using errcode = '42501';
    end if;

    if new.estado = 'congelado' then
      new.corte_at := coalesce(new.corte_at, now());
      new.congelado_at := now();
      new.congelado_por := coalesce(new.congelado_por, auth.uid());
    end if;

    if new.estado = 'cancelado' then
      new.cancelado_at := now();
      new.cancelado_por := coalesce(new.cancelado_por, auth.uid());
    end if;

    -- Un conteo no se cierra sin firma de supervisor y de Gerencia de
    -- Operaciones (RTB-CIE-01, citado por el Acta real).
    if new.estado = 'cerrado' then
      if not exists (
        select 1 from public.inventario_conteo_firmas f
         where f.conteo_id = new.id and f.version = old.version and f.rol_firma = 'supervisor'
      ) or not exists (
        select 1 from public.inventario_conteo_firmas f
         where f.conteo_id = new.id and f.version = old.version and f.rol_firma = 'gerente_operaciones'
      ) then
        raise exception
          'Un conteo no se cierra sin firma de supervisor y de Gerencia de Operaciones (RTB-CIE-01)'
          using errcode = '42501';
      end if;
      new.cerrado_at := now();
      new.cerrado_por := coalesce(new.cerrado_por, auth.uid());
    end if;

    if new.estado = 'aplicado' then
      new.aplicado_at := now();
      new.aplicado_por := coalesce(new.aplicado_por, auth.uid());
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.congelamientos_before_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.conteo_id := old.conteo_id;
  new.ubicacion_id := old.ubicacion_id;
  new.producto_id := old.producto_id;
  new.incluye_descendientes := old.incluye_descendientes;
  new.updated_at := now();
  if new.motivo_liberacion is distinct from old.motivo_liberacion and old.liberado_at is null then
    new.liberado_at := now();
    new.liberado_por := coalesce(new.liberado_por, auth.uid());
  end if;
  return new;
end;
$$;

-- =========================================
-- 2. inventario_congelamientos: el GRANT INSERT era de tabla completa —
--    un authenticated podía forjar congelado_por/congelado_at por la ruta
--    del alta manual de congelamiento (POST .../congelamientos, que sí usa
--    el cliente del propio usuario). Se restringe a las columnas del
--    alcance (conteoCongelamientoCreateSchema); congelado_at/congelado_por
--    siguen su DEFAULT (now()/auth.uid()), que ya funciona correctamente
--    para esa ruta porque nunca usó el cliente admin.
-- =========================================
revoke insert on public.inventario_congelamientos from authenticated;
grant insert (conteo_id, ubicacion_id, incluye_descendientes, producto_id)
  on public.inventario_congelamientos to authenticated;

-- =========================================
-- 3. inventario_congelar_conteo() — reemplaza las 4 escrituras sueltas de
--    congelar/route.ts por una sola función SECURITY DEFINER, atómica
--    (todo o nada dentro de la misma llamada RPC) e invocada por el
--    cliente del propio usuario (no admin): auth.uid() resuelve al actor
--    real durante todo el flujo, incluidos los triggers que dispara.
--    `language plpgsql` a propósito (no `sql`): referencia tablas ya
--    creadas arriba en este mismo archivo lógico (012), así que no hay
--    problema de orden, pero además su cuerpo tiene control de flujo.
-- =========================================
create or replace function public.inventario_congelar_conteo(p_conteo_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conteo public.inventario_conteos%rowtype;
  v_alcance jsonb;
  v_ubicacion_id uuid;
  v_incluye_desc boolean;
  v_familia_id uuid;
  v_producto_ids uuid[];
  v_raiz_codigo varchar;
  v_ubicacion_ids uuid[];
  v_lineas integer;
begin
  if public.current_user_role() not in ('super_admin', 'direccion', 'almacen') then
    raise exception 'Sin permisos para congelar un conteo.' using errcode = '42501';
  end if;

  select * into v_conteo from public.inventario_conteos where id = p_conteo_id for update;
  if not found then
    raise exception 'Conteo % no encontrado', p_conteo_id using errcode = 'P0002';
  end if;
  if v_conteo.estado <> 'planificado' then
    raise exception 'Sólo se congela un conteo en estado planificado.' using errcode = '42501';
  end if;

  v_alcance := coalesce(v_conteo.alcance, '{}'::jsonb);
  v_ubicacion_id := nullif(v_alcance ->> 'ubicacion_id', '')::uuid;
  v_incluye_desc := coalesce((v_alcance ->> 'incluye_descendientes')::boolean, true);
  v_familia_id := nullif(v_alcance ->> 'familia_id', '')::uuid;
  if jsonb_typeof(v_alcance -> 'producto_ids') = 'array' then
    select array_agg(value::text::uuid) into v_producto_ids
      from jsonb_array_elements_text(v_alcance -> 'producto_ids');
  end if;

  -- Reintento seguro: un intento previo que falló a medio camino (mismo
  -- conteo, todavía 'planificado') no debe dejar líneas huérfanas ni
  -- chocar con las constraints únicas al reintentar.
  delete from public.inventario_conteo_detalles where conteo_id = p_conteo_id;

  if v_ubicacion_id is not null then
    select codigo into v_raiz_codigo from public.ubicaciones_internas where id = v_ubicacion_id;
    if v_raiz_codigo is null then
      raise exception 'La ubicación del alcance no existe.' using errcode = '22023';
    end if;
    if v_incluye_desc then
      select array_agg(id) into v_ubicacion_ids
        from public.ubicaciones_internas
       where id = v_ubicacion_id or codigo like v_raiz_codigo || '-%';
    else
      v_ubicacion_ids := array[v_ubicacion_id];
    end if;
  end if;

  if v_familia_id is not null then
    select array_agg(id) into v_producto_ids
      from public.productos
     where familia_id = v_familia_id
       and (v_producto_ids is null or id = any (v_producto_ids));
  end if;

  insert into public.inventario_conteo_detalles (
    conteo_id, producto_id, ubicacion_id, cantidad_teorica, unidad_base_id,
    contenido_por_unidad_snapshot, costo_unitario_snapshot, costo_origen
  )
  select p_conteo_id, e.producto_id, e.ubicacion_id, e.cantidad_teorica, p.unidad_medida_id,
         p.contenido_por_unidad, e.costo_promedio,
         case when e.costo_promedio is not null then 'promedio' else 'sin_costo' end
    from public.inventario_existencias e
    join public.productos p on p.id = e.producto_id
   where (v_ubicacion_ids is null or e.ubicacion_id = any (v_ubicacion_ids))
     and (v_producto_ids is null or e.producto_id = any (v_producto_ids));

  get diagnostics v_lineas = row_count;
  if v_lineas = 0 then
    raise exception 'El alcance no encontró existencias que congelar.' using errcode = '22023';
  end if;

  if v_ubicacion_id is not null then
    insert into public.inventario_congelamientos (conteo_id, ubicacion_id, incluye_descendientes, congelado_por)
    values (p_conteo_id, v_ubicacion_id, v_incluye_desc, auth.uid());
  else
    insert into public.inventario_congelamientos (conteo_id, producto_id, congelado_por)
    select p_conteo_id, d.producto_id, auth.uid()
      from (select distinct producto_id from public.inventario_conteo_detalles where conteo_id = p_conteo_id) d;
  end if;

  update public.inventario_conteos
     set estado = 'congelado', congelado_por = auth.uid()
   where id = p_conteo_id;

  return v_lineas;
end;
$$;

revoke execute on function public.inventario_congelar_conteo(uuid) from public, anon;
grant execute on function public.inventario_congelar_conteo(uuid) to authenticated;

-- =========================================
-- 4. inventario_aplicar_conteo() — reemplaza el for-loop de aplicar/
--    route.ts (que se tragaba errores individuales con `if (!error)
--    aplicadas += 1`) por un solo UPDATE ... FROM set-based, y corrige la
--    causa raíz de E-03/E-04 igual que el punto 3: invocada por el
--    cliente del propio usuario, auth.uid() resuelve, y el chequeo de rol
--    vive en la función — ya no depende de qué ruta HTTP se use para
--    llegar a ella (cierra E-04: /estado no puede evadir la restricción
--    porque la función, no la ruta, es la única puerta real).
-- =========================================
create or replace function public.inventario_aplicar_conteo(p_conteo_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado public.conteo_estado;
  v_aplicadas integer;
begin
  if public.current_user_role() not in ('super_admin', 'direccion') then
    raise exception 'Sólo super_admin/direccion aplican un conteo al inventario.' using errcode = '42501';
  end if;

  select estado into v_estado from public.inventario_conteos where id = p_conteo_id for update;
  if not found then
    raise exception 'Conteo % no encontrado', p_conteo_id using errcode = 'P0002';
  end if;
  if v_estado <> 'cerrado' then
    raise exception 'Sólo se aplica un conteo en estado cerrado.' using errcode = '42501';
  end if;

  update public.inventario_existencias e
     set cantidad_fisica = d.cantidad_fisica,
         fecha_ultimo_conteo = now(),
         conteo_id_ultimo = p_conteo_id
    from public.inventario_conteo_detalles d
   where d.conteo_id = p_conteo_id
     and d.estado_conteo in ('contada', 'recontada', 'no_localizada')
     and e.producto_id = d.producto_id
     and e.ubicacion_id is not distinct from d.ubicacion_id;

  get diagnostics v_aplicadas = row_count;

  update public.inventario_conteos
     set estado = 'aplicado', aplicado_por = auth.uid()
   where id = p_conteo_id;

  return v_aplicadas;
end;
$$;

revoke execute on function public.inventario_aplicar_conteo(uuid) from public, anon;
grant execute on function public.inventario_aplicar_conteo(uuid) to authenticated;

-- =========================================
-- 5. Liberación automática de congelamientos al terminar un conteo
--    (E-05/M-09 de fondo): un conteo que llega a 'aplicado' o 'cancelado'
--    ya no tiene motivo para seguir bloqueando el kardex. AFTER UPDATE
--    porque necesita ver el estado ya validado por el trigger BEFORE
--    (inventario_conteos_before_update) — si la transición fuera
--    rechazada, este trigger ni se dispara con el estado nuevo.
--    No sustituye la pantalla de liberación manual (Fase 1): un
--    congelamiento también puede necesitar liberarse antes de que el
--    conteo termine (p.ej. se amplió el alcance por error).
-- =========================================
create or replace function public.inventario_conteos_after_update_liberar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.estado is distinct from old.estado and new.estado in ('aplicado', 'cancelado') then
    update public.inventario_congelamientos
       set motivo_liberacion = case new.estado
             when 'aplicado' then 'Liberado automáticamente: conteo ' || new.folio || ' aplicado al inventario.'
             else 'Liberado automáticamente: conteo ' || new.folio || ' cancelado.'
           end
     where conteo_id = new.id
       and liberado_at is null;
  end if;
  return new;
end;
$$;

create trigger after_update_conteos_liberar
  after update on public.inventario_conteos
  for each row execute function public.inventario_conteos_after_update_liberar();
