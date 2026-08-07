-- ==========================================
-- RTB Sistema — 024: Ubicación geográfica en centros operativos
--
-- ubicaciones_internas (003_ubicaciones_internas.sql) no tenía ningún campo
-- de dirección ni coordenada. Para programar rutas y entregas
-- (contexto/RTB-PRO-RUT-01_Modulo_Rutas.md) hace falta capturar la
-- ubicación geográfica de los centros operativos de RTB (almacenes,
-- oficinas, sucursales) — la raíz del árbol, tipo = 'centro_operativo' —
-- igual que ya existe desde 002_entidades_core.sql para las direcciones de
-- clientes/proveedores (`direcciones.latitud`/`longitud`, sin UI que las
-- use hasta ahora).
--
-- No se reutiliza la tabla `direcciones`: su `entidad_id` es NOT NULL y un
-- centro operativo de RTB deliberadamente no es una entidad externa
-- (razonado en la cabecera de 003_ubicaciones_internas.sql). Se añaden
-- columnas propias, espejo de `direcciones`, restringidas por CHECK a sólo
-- centro_operativo — una zona/pasillo/rack/posición hereda la ubicación
-- geográfica de su centro, no tiene la suya propia.
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

alter table public.ubicaciones_internas
  add column calle varchar(200),
  add column numero_exterior varchar(20),
  add column numero_interior varchar(20),
  add column colonia varchar(120),
  add column ciudad varchar(120),
  add column entidad_federativa varchar(120),   -- no "estado": se confunde con el
                                                 -- estado del flujo (ver 002)
  add column pais varchar(120),
  add column codigo_postal varchar(10),
  add column referencia text,
  add column latitud numeric(10, 7),
  add column longitud numeric(10, 7);

alter table public.ubicaciones_internas
  add constraint ubicaciones_cp_chk check (codigo_postal is null or codigo_postal ~ '^[0-9]{5}$');

-- Espejo exacto de direcciones_geo_chk (002_entidades_core.sql): ambas
-- coordenadas o ninguna, y en rango geográfico válido.
alter table public.ubicaciones_internas
  add constraint ubicaciones_geo_chk check (
    (latitud is null and longitud is null) or
    (latitud between -90 and 90 and longitud between -180 and 180)
  );

-- Sólo el nivel raíz del árbol (centro_operativo) puede tener dirección:
-- una zona, pasillo, rack o posición hereda la ubicación de su centro
-- operativo, no captura la suya propia.
alter table public.ubicaciones_internas
  add constraint ubicaciones_geo_solo_centro_chk check (
    tipo = 'centro_operativo' or (
      calle is null and numero_exterior is null and numero_interior is null and
      colonia is null and ciudad is null and entidad_federativa is null and
      pais is null and codigo_postal is null and referencia is null and
      latitud is null and longitud is null
    )
  );

-- =========================================
-- Normalización de cadena vacía a NULL en ambos triggers (insert y update):
-- sin esto, un '' capturado desde un formulario (campo tocado y borrado)
-- no es NULL para Postgres y burlaría ubicaciones_geo_solo_centro_chk en
-- cuanto se intentara guardar una zona/rack con los campos "vacíos" en vez
-- de ausentes. Mismo patrón que entidades_before_insert/update
-- (020_entidades_siglas.sql) para `siglas`.
-- =========================================
create or replace function public.ubicaciones_before_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_parent_nivel smallint;
  v_parent_codigo varchar;
  v_parent_tipo public.ubicacion_tipo;
begin
  if new.segmento is null or btrim(new.segmento) = '' then
    raise exception 'El segmento es obligatorio';
  end if;
  new.segmento := upper(btrim(new.segmento));

  if new.parent_id is null then
    new.nivel := 1;
    new.codigo := new.segmento;
  else
    select nivel, codigo, tipo into v_parent_nivel, v_parent_codigo, v_parent_tipo
      from public.ubicaciones_internas where id = new.parent_id;
    if not found then
      raise exception 'La ubicación padre % no existe', new.parent_id;
    end if;
    if v_parent_nivel >= 5 then
      raise exception 'La jerarquía no admite más de 5 niveles';
    end if;
    if public.ubicacion_tipo_rango(new.tipo) <= public.ubicacion_tipo_rango(v_parent_tipo) then
      raise exception 'El tipo % no puede colgar de un padre de tipo % (retrocede en la jerarquía)',
        new.tipo, v_parent_tipo;
    end if;
    new.nivel := v_parent_nivel + 1;
    new.codigo := v_parent_codigo || '-' || new.segmento;
  end if;

  new.calle := nullif(btrim(new.calle), '');
  new.numero_exterior := nullif(btrim(new.numero_exterior), '');
  new.numero_interior := nullif(btrim(new.numero_interior), '');
  new.colonia := nullif(btrim(new.colonia), '');
  new.ciudad := nullif(btrim(new.ciudad), '');
  new.entidad_federativa := nullif(btrim(new.entidad_federativa), '');
  new.pais := nullif(btrim(new.pais), '');
  new.codigo_postal := nullif(btrim(new.codigo_postal), '');
  new.referencia := nullif(btrim(new.referencia), '');

  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

create or replace function public.ubicaciones_before_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.activo is distinct from old.activo and public.current_user_role() = 'almacen' then
    raise exception 'almacen no tiene permiso para activar/desactivar ubicaciones (P04)'
      using errcode = '42501';
  end if;
  new.parent_id := old.parent_id;
  new.segmento := old.segmento;
  new.codigo := old.codigo;
  new.nivel := old.nivel;
  new.tipo := old.tipo;

  new.calle := nullif(btrim(new.calle), '');
  new.numero_exterior := nullif(btrim(new.numero_exterior), '');
  new.numero_interior := nullif(btrim(new.numero_interior), '');
  new.colonia := nullif(btrim(new.colonia), '');
  new.ciudad := nullif(btrim(new.ciudad), '');
  new.entidad_federativa := nullif(btrim(new.entidad_federativa), '');
  new.pais := nullif(btrim(new.pais), '');
  new.codigo_postal := nullif(btrim(new.codigo_postal), '');
  new.referencia := nullif(btrim(new.referencia), '');

  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- =========================================
-- Privilegios: se reemite el GRANT UPDATE completo (columnas viejas +
-- nuevas), mismo patrón que 020_entidades_siglas.sql con `entidades`. Sin
-- esto la edición de dirección/coordenada falla con 42501 — y, por el
-- gotcha ya conocido de audit_log, en silencio desde el cliente si no se
-- revisa `error` en la respuesta.
-- =========================================
grant update (
  nombre, descripcion, responsable_id, capacidad_posiciones, clasificacion, uso_especial, activo,
  calle, numero_exterior, numero_interior, colonia, ciudad, entidad_federativa, pais,
  codigo_postal, referencia, latitud, longitud
) on public.ubicaciones_internas to authenticated;

-- =========================================
-- Índices parciales para el mapa global (Paso 6/7 del plan): sólo filas
-- con coordenada y activas, sin escanear el resto de cada tabla.
-- =========================================
create index idx_direcciones_geo on public.direcciones (latitud, longitud)
  where latitud is not null and activo = true;
create index idx_ubicaciones_geo on public.ubicaciones_internas (latitud, longitud)
  where latitud is not null and activo = true;
