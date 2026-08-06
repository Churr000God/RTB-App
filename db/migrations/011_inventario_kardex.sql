-- ==========================================
-- RTB Sistema — 011: Existencias, apartados y kardex (inventario_movimientos)
--
-- Ver contexto/AUDITORIA_RTB-INV-01.md para el detalle completo. Lo que
-- toca este archivo:
--   - El paquete define "Real" = físico validado y "Teórico" = Real +
--     entradas/salidas pendientes (proyección de compromisos). Es lo
--     opuesto a como RTB-PRO-COM-01 §III y los reportes reales de RTB usan
--     los términos: TEÓRICA es el acumulador documental (suma del kardex),
--     FÍSICA es la medición del último conteo validado, y
--     físico − teórico es una señal de ERROR de conciliación, no una
--     proyección. Los compromisos abiertos (reservas/apartados) son un
--     TERCER concepto, ni teórico ni físico (ALM-01 §VIII regla 4: "piezas
--     separadas se marcan como reservadas en el sistema inmediatamente").
--   - El paquete propone `inventario_movimientos.tipo IN (ENTRADA_COMPRA,
--     SALIDA_VENTA, AJUSTE_NC, CONTEO_FISICO, TRANSFERENCIA)` y
--     `03_flujo_conteos_fisicos.md`: "si la diferencia es > 0, se genera un
--     movimiento CONTEO_FISICO de entrada" — un ajuste automático sin
--     autorización de tercero. El Registro de Discrepancias real
--     (CIE-DIS-01) lo prohíbe explícitamente: "una diferencia sin causa
--     identificada no se ajusta: se declara como hallazgo. Ajustar sin
--     entender es hacer que el problema desaparezca de la vista sin que
--     desaparezca del almacén." Aquí el ajuste vía conteo/discrepancia
--     exige inventario_ajustes autorizado (013); antes de que esa tabla
--     exista, ajuste_autorizado() (stub de este archivo) devuelve false —
--     fallo seguro, un ajuste es estructuralmente imposible hasta 013.
--   - Taxonomía de movimientos ampliada a lo que exige RTB-PRO-ALM-01 §V:
--     cross-dock (dos filas, la entrada "nunca se omite"), recolección por
--     chofer, devolución de cliente, sobrante de ruta, consumo interno
--     (causa real de no conformidad, no un tipo "ajuste" genérico).
--   - "Prohibición de stock negativo": el paquete la propone como regla
--     absoluta, pero producción tiene 18 teóricos negativos reales — un
--     CHECK simple habría bloqueado la migración de esa historia. Se
--     implementa como trigger con escotilla `permite_negativo`, con motivo
--     obligatorio y FUERA del GRANT INSERT (sólo service_role la activa).
--   - Kardex append-only más estricto que audit_log: sin GRANT UPDATE/
--     DELETE de ninguna columna, GRANT INSERT por columna, y además un
--     trigger que rechaza UPDATE/DELETE incluso para quien tenga
--     `service_role` — desviación deliberada del patrón de audit_log,
--     justificada por el hallazgo real "ajustes aplicados sin autorización
--     registrada: 34 de 34" (Registro de Discrepancias CIE-DIS-01).
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

-- =========================================
-- 1. TABLA: inventario_existencias (agregado almacenado)
-- =========================================
-- Almacenada, no derivada del kardex: cantidad_fisica es una MEDICIÓN del
-- estante (el resultado de un conteo validado), no un acumulado de
-- documentos — no es derivable del kardex ni en principio. Si esta tabla
-- fuera una función sobre el kardex, la señal central del módulo
-- (físico − teórico) desaparecería del modelo. El trigger del kardex es el
-- ÚNICO escritor (ver GRANT más abajo); inventario_verificar_consistencia()
-- (014) recalcula el teórico desde el kardex para detectar deriva en el
-- cierre diario.
create table public.inventario_existencias (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete restrict,
  -- NULL = sin ubicación asignada. Es el estado real del 73.9% del catálogo
  -- (limitación #2 del Acta de Conteo Físico real) y hay que poder
  -- representarlo sin mentir ni bloquear la carga.
  ubicacion_id uuid references public.ubicaciones_internas(id) on delete restrict,

  cantidad_teorica numeric(16, 4) not null default 0,
  -- NULL = nunca contada (≠ contada en cero). Sólo la escribe la aplicación
  -- de un conteo (012), nunca el kardex directamente.
  cantidad_fisica numeric(16, 4),
  cantidad_apartada numeric(16, 4) not null default 0,

  cantidad_disponible numeric(16, 4) generated always as (cantidad_teorica - cantidad_apartada) stored,
  diferencia_ultimo_conteo numeric(16, 4) generated always as (
    case when cantidad_fisica is null then null else cantidad_fisica - cantidad_teorica end
  ) stored,

  costo_promedio numeric(14, 6),
  valor_teorico numeric(20, 6) generated always as (cantidad_teorica * coalesce(costo_promedio, 0)) stored,

  fecha_ultimo_movimiento timestamptz,
  fecha_ultimo_conteo timestamptz,
  conteo_id_ultimo uuid,     -- FK añadida en 012_inventario_conteos.sql (punto de extensión)

  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Físico negativo es imposible (corrección #9 del Registro de
  -- Discrepancias real) → CHECK duro. Teórico negativo es un error real ya
  -- ocurrido (18 filas en producción) → sin CHECK; el bloqueo vive en el
  -- trigger del kardex, con escotilla auditada. Esa es toda la diferencia
  -- entre las dos columnas.
  constraint exi_apartada_chk check (cantidad_apartada >= 0),
  constraint exi_fisica_chk check (cantidad_fisica is null or cantidad_fisica >= 0)
);

comment on table public.inventario_existencias is
  'Agregado de existencias por producto+ubicación, mantenido EXCLUSIVAMENTE '
  'por el trigger del kardex (inventario_movimientos) y por la aplicación '
  'de un conteo (012). cantidad_teorica = acumulador documental; '
  'cantidad_fisica = medición del último conteo validado (NULL = nunca '
  'contada); cantidad_apartada = compromisos abiertos, tercer concepto '
  'independiente de los otros dos.';

-- NULL <> NULL en Postgres: "sin ubicación" necesita su propio índice
-- parcial, mismo idioma que uq_ubicaciones_segmento_raiz/_hijo (003).
create unique index uq_existencias_prod_ubi on public.inventario_existencias (producto_id, ubicacion_id)
  where ubicacion_id is not null;
create unique index uq_existencias_prod_sin_ubi on public.inventario_existencias (producto_id)
  where ubicacion_id is null;
create index idx_existencias_ubicacion on public.inventario_existencias (ubicacion_id);
create index idx_existencias_sin_costo on public.inventario_existencias (producto_id)
  where costo_promedio is null and cantidad_teorica <> 0;   -- limitación #3, consultable
create index idx_existencias_negativa on public.inventario_existencias (producto_id)
  where cantidad_teorica < 0;
create index idx_existencias_nunca_contada on public.inventario_existencias (producto_id)
  where cantidad_fisica is null;

-- Sin GRANT insert/update para authenticated: el ÚNICO escritor es el
-- trigger del kardex (SECURITY DEFINER, más abajo) y el de conteos (012).
revoke all on public.inventario_existencias from anon, authenticated;
grant select on public.inventario_existencias to authenticated;
grant all on public.inventario_existencias to service_role;

alter table public.inventario_existencias enable row level security;

-- Los 8 roles consultan: el dato de disponibilidad y alerta de stock lo
-- necesita todo el sistema, no sólo almacén/compras.
create policy inventario_existencias_select on public.inventario_existencias
  for select to authenticated
  using (public.current_user_role() is not null);

-- =========================================
-- 2. TABLA: inventario_apartados (reservas — ALM-01 §VIII regla 4)
-- =========================================
create type public.apartado_estado as enum ('activo', 'liberado', 'consumido');

create table public.inventario_apartados (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete restrict,
  ubicacion_id uuid references public.ubicaciones_internas(id) on delete restrict,
  cantidad numeric(16, 4) not null check (cantidad > 0),   -- en unidad base del producto
  pedido_folio varchar(40),   -- referencia a RTB-VEN-01 (no existe todavía: texto libre, punto de extensión)
  estado public.apartado_estado not null default 'activo',
  solicitante_id uuid not null references public.profiles(id) default auth.uid(),
  liberado_at timestamptz,
  liberado_por uuid references public.profiles(id),
  motivo_liberacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apartados_liberacion_chk check (
    (estado <> 'activo') = (liberado_at is not null and liberado_por is not null)
  ),
  constraint apartados_motivo_chk check (
    estado = 'activo' or length(btrim(coalesce(motivo_liberacion, ''))) > 0
  )
);

comment on table public.inventario_apartados is
  'Reservas de inventario (compromisos abiertos). No mueve stock — no es un '
  'movimiento de kardex. Sobre-reservar (cantidad_apartada > cantidad_teorica, '
  'cantidad_disponible negativa en existencias) NO se bloquea aquí a '
  'propósito: es la señal visible de que hay más comprometido que '
  'disponible, consultable en inventario_existencias, no un error oculto.';

create index idx_apartados_producto on public.inventario_apartados (producto_id);
create index idx_apartados_ubicacion on public.inventario_apartados (ubicacion_id);
create index idx_apartados_estado on public.inventario_apartados (estado) where estado = 'activo';
create index idx_apartados_solicitante on public.inventario_apartados (solicitante_id);

-- SECURITY DEFINER: incrementa inventario_existencias.cantidad_apartada,
-- tabla sobre la que 'authenticated' no tiene privilegio de escritura.
create or replace function public.apartados_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  loop
    update public.inventario_existencias
       set cantidad_apartada = cantidad_apartada + new.cantidad,
           updated_at = now(), updated_by = auth.uid()
     where producto_id = new.producto_id and ubicacion_id is not distinct from new.ubicacion_id;
    exit when found;
    begin
      insert into public.inventario_existencias (producto_id, ubicacion_id, cantidad_apartada, created_by)
      values (new.producto_id, new.ubicacion_id, new.cantidad, auth.uid());
      exit;
    exception when unique_violation then
      null;   -- otra transacción concurrente ya creó la fila: reintenta el UPDATE
    end;
  end loop;
  new.solicitante_id := coalesce(new.solicitante_id, auth.uid());
  return new;
end;
$$;

revoke execute on function public.apartados_before_insert() from public, anon, authenticated;

create trigger before_insert_apartados
  before insert on public.inventario_apartados
  for each row execute function public.apartados_before_insert();

-- Congela producto_id/ubicacion_id/cantidad (la reserva es inmutable en su
-- alcance: liberar y volver a reservar con otra cantidad es una fila
-- nueva) y decrementa cantidad_apartada al liberar/consumir.
create or replace function public.apartados_before_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.estado <> 'activo' then
    raise exception 'Un apartado % ya no está activo, no admite más cambios', old.id
      using errcode = '42501';
  end if;
  new.producto_id := old.producto_id;
  new.ubicacion_id := old.ubicacion_id;
  new.cantidad := old.cantidad;
  new.solicitante_id := old.solicitante_id;
  new.updated_at := now();

  if new.estado is distinct from old.estado then
    new.liberado_at := now();
    new.liberado_por := auth.uid();
    update public.inventario_existencias
       set cantidad_apartada = greatest(cantidad_apartada - old.cantidad, 0),
           updated_at = now(), updated_by = auth.uid()
     where producto_id = old.producto_id and ubicacion_id is not distinct from old.ubicacion_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.apartados_before_update() from public, anon, authenticated;

create trigger before_update_apartados
  before update on public.inventario_apartados
  for each row execute function public.apartados_before_update();

create trigger audit_apartados after insert or update on public.inventario_apartados
  for each row execute function public.audit_row();

revoke all on public.inventario_apartados from anon, authenticated;
grant select, insert on public.inventario_apartados to authenticated;
grant update (estado, motivo_liberacion) on public.inventario_apartados to authenticated;
grant all on public.inventario_apartados to service_role;

alter table public.inventario_apartados enable row level security;

create policy inventario_apartados_select on public.inventario_apartados
  for select to authenticated
  using (public.current_user_role() is not null);
create policy inventario_apartados_insert on public.inventario_apartados
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'ventas', 'almacen']));
create policy inventario_apartados_update on public.inventario_apartados
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion', 'ventas', 'almacen']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'ventas', 'almacen']));

-- =========================================
-- 3. Puntos de extensión — 012 y 013 los reemplazan con CREATE OR REPLACE.
--    El stub de ajuste devuelve FALSE, no TRUE: antes de que 013 exista,
--    un movimiento de ajuste es estructuralmente imposible. Fallo seguro.
--    (mismo idioma que tiene_operaciones_abiertas() en 002_entidades_core.sql)
-- =========================================
create or replace function public.inventario_congelamiento_activo(p_producto_id uuid, p_ubicacion_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- TODO(012_inventario_conteos.sql): resolver contra inventario_congelamientos.
  select null::uuid where p_producto_id is not null or p_ubicacion_id is not null or true;
$$;

revoke execute on function public.inventario_congelamiento_activo(uuid, uuid) from public, anon;
grant execute on function public.inventario_congelamiento_activo(uuid, uuid) to authenticated, service_role;

create or replace function public.ajuste_autorizado(p_ajuste_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- TODO(013_inventario_discrepancias_ajustes.sql): resolver contra inventario_ajustes.
  select false where p_ajuste_id is not null or true;
$$;

revoke execute on function public.ajuste_autorizado(uuid) from public, anon;
grant execute on function public.ajuste_autorizado(uuid) to authenticated, service_role;

-- =========================================
-- 4. TABLA: inventario_movimientos (kardex)
-- =========================================
create type public.movimiento_tipo as enum (
  -- entradas (signo +)
  'entrada_compra',               -- reposición de stock contra OC (ALM-01 §V)
  'entrada_crossdock',            -- pierna 1 del cross-dock. NUNCA se omite.
  'entrada_recoleccion',          -- recolección por chofer RTB
  'entrada_devolucion_cliente',   -- devolución de cliente, con nota
  'entrada_sobrante_ruta',        -- material sobrante de ruta al descargar
  'entrada_transferencia',        -- pierna de llegada de una transferencia
  'entrada_conteo',               -- sobrante detectado en conteo (exige conteo_id)
  'entrada_ajuste',               -- ajuste autorizado positivo (exige ajuste_id)
  -- salidas (signo −)
  'salida_venta',                 -- despacho a pedido de cliente
  'salida_crossdock',             -- pierna 2 del cross-dock
  'salida_devolucion_proveedor',
  'salida_consumo_interno',       -- causa real de no conformidad; se nombra, no se esconde
  'salida_merma',                 -- material dañado
  'salida_transferencia',
  'salida_conteo',
  'salida_ajuste'
);

-- Espejo del idioma de public.ubicacion_tipo_rango() (003).
create or replace function public.movimiento_signo(p_tipo public.movimiento_tipo)
returns smallint
language sql
immutable
security invoker
set search_path = public, pg_temp
as $$
  select case when p_tipo::text like 'entrada_%' then 1::smallint else -1::smallint end;
$$;

create sequence public.inventario_movimientos_folio_seq;

create table public.inventario_movimientos (
  id uuid primary key default gen_random_uuid(),
  folio varchar(20) not null unique,          -- MOV-00000123, lo asigna el trigger

  tipo public.movimiento_tipo not null,
  subtipo varchar(40),                        -- matiz operativo libre (folio NC, motivo de merma...)

  producto_id uuid not null references public.productos(id) on delete restrict,
  ubicacion_id uuid references public.ubicaciones_internas(id) on delete restrict,

  -- El operador captura en la unidad que tiene en la mano; el trigger
  -- resuelve el factor contra el producto y congela ambos valores.
  unidad_captura_id uuid not null references public.unidades_medida(id) on delete restrict,
  cantidad_capturada numeric(16, 4) not null check (cantidad_capturada > 0),
  factor_conversion numeric(16, 6) not null,           -- lo calcula el trigger
  unidad_base_id uuid not null references public.unidades_medida(id) on delete restrict,
  cantidad numeric(16, 4) not null,                    -- capturada * factor, signada por tipo

  costo_unitario numeric(14, 6),              -- resuelto/congelado por el trigger si llega NULL
  costo_promedio_posterior numeric(14, 6),    -- saldo del costo promedio tras este movimiento
  saldo_teorico_posterior numeric(16, 4),     -- saldo teórico tras este movimiento (trazabilidad)

  referencia_tipo varchar(40),    -- 'oc'/'factura'/'nota_credito'/'pedido'... texto libre: RTB-COM-01/
                                   -- RTB-VEN-01 no existen todavía (punto de extensión, idioma de
                                   -- tiene_operaciones_abiertas() en 002)
  referencia_folio varchar(80),
  entidad_id uuid references public.entidades(id) on delete restrict,   -- cliente/proveedor relacionado

  operacion_id uuid not null default gen_random_uuid(),   -- comparte las dos piernas de cross-dock/transferencia
  conteo_id uuid,       -- FK añadida en 012_inventario_conteos.sql
  ajuste_id uuid,       -- FK añadida en 013_inventario_discrepancias_ajustes.sql
  apartado_id uuid references public.inventario_apartados(id) on delete restrict,

  fecha_movimiento timestamptz not null default now(),

  -- Escotilla de saldo negativo: FUERA del GRANT INSERT (ver más abajo),
  -- sólo la usa la API con service_role — carga inicial con motivo
  -- explícito o ajuste autorizado.
  permite_negativo boolean not null default false,
  motivo_negativo text,

  observaciones text,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),   -- nunca se escribe: el kardex es append-only
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),     -- idem

  constraint mov_signo_chk check (sign(cantidad)::smallint = public.movimiento_signo(tipo)),
  constraint mov_cantidad_no_cero_chk check (cantidad <> 0),
  constraint mov_factor_chk check (factor_conversion > 0),
  constraint mov_conteo_chk check ((tipo in ('entrada_conteo', 'salida_conteo')) = (conteo_id is not null)),
  constraint mov_ajuste_chk check ((tipo in ('entrada_ajuste', 'salida_ajuste')) = (ajuste_id is not null)),
  constraint mov_negativo_chk check (
    permite_negativo = false or length(btrim(coalesce(motivo_negativo, ''))) > 0
  )
);

comment on table public.inventario_movimientos is
  'Kardex append-only. Sin GRANT UPDATE/DELETE de ninguna columna para '
  'nadie, ni siquiera service_role (trigger inventario_movimientos_no_update): '
  'una corrección se registra como movimiento nuevo con su ajuste '
  'autorizado, nunca editando el original. "Ajustes aplicados sin '
  'autorización registrada: 34 de 34" fue el hallazgo real que exige esto.';

create index idx_movimientos_producto on public.inventario_movimientos (producto_id, fecha_movimiento desc);
create index idx_movimientos_ubicacion on public.inventario_movimientos (ubicacion_id);
create index idx_movimientos_tipo on public.inventario_movimientos (tipo);
create index idx_movimientos_conteo on public.inventario_movimientos (conteo_id) where conteo_id is not null;
create index idx_movimientos_ajuste on public.inventario_movimientos (ajuste_id) where ajuste_id is not null;
create index idx_movimientos_apartado on public.inventario_movimientos (apartado_id) where apartado_id is not null;
create index idx_movimientos_operacion on public.inventario_movimientos (operacion_id);
create index idx_movimientos_entidad on public.inventario_movimientos (entidad_id);
create index idx_movimientos_referencia on public.inventario_movimientos (referencia_tipo, referencia_folio);
create index idx_movimientos_fecha on public.inventario_movimientos (fecha_movimiento desc);
create index idx_movimientos_unidad_captura on public.inventario_movimientos (unidad_captura_id);
create index idx_movimientos_unidad_base on public.inventario_movimientos (unidad_base_id);

-- =========================================
-- 5. El trigger que hace todo: resuelve unidad/factor, valida
--    congelamiento y autorización de ajuste, bloquea/actualiza el saldo de
--    existencias con lock de fila, calcula costo promedio ponderado móvil,
--    y bloquea saldo negativo salvo escotilla auditada.
--
--    SECURITY DEFINER: escribe en inventario_existencias, tabla sobre la
--    que 'authenticated' no tiene privilegio alguno.
-- =========================================
create or replace function public.inventario_movimientos_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unidad_base uuid;
  v_contenido numeric;
  v_unidad_contenido uuid;
  v_decimales smallint;
  v_saldo_anterior numeric;
  v_costo_promedio_anterior numeric;
  v_saldo_nuevo numeric;
  v_costo_promedio_nuevo numeric;
  v_congelamiento uuid;
begin
  -- 1) Resolver la unidad base y el factor de conversión del producto.
  select p.unidad_medida_id, p.contenido_por_unidad, p.unidad_contenido_id
    into v_unidad_base, v_contenido, v_unidad_contenido
    from public.productos p where p.id = new.producto_id;
  if not found then
    raise exception 'El producto % no existe', new.producto_id;
  end if;

  select decimales into v_decimales from public.unidades_medida where id = new.unidad_captura_id;
  if not found then
    raise exception 'La unidad de captura % no existe', new.unidad_captura_id;
  end if;
  if round(new.cantidad_capturada, v_decimales) <> new.cantidad_capturada then
    raise exception 'La cantidad % no respeta los % decimales permitidos por la unidad capturada',
      new.cantidad_capturada, v_decimales using errcode = '22003';
  end if;

  if new.unidad_captura_id = v_unidad_base then
    new.factor_conversion := 1;
  elsif new.unidad_captura_id = v_unidad_contenido then
    new.factor_conversion := 1 / v_contenido;    -- capturó en la unidad de contenido (p.ej. piezas de un kit)
  else
    raise exception
      'Unidad de captura % incompatible con el producto % (base %, contenido %). '
      'Corregir la unidad del producto vía redefinición autorizada, no forzar el movimiento.',
      new.unidad_captura_id, new.producto_id, v_unidad_base, v_unidad_contenido
      using errcode = '22023';
  end if;
  new.unidad_base_id := v_unidad_base;
  new.cantidad := public.movimiento_signo(new.tipo) * (new.cantidad_capturada * new.factor_conversion);

  -- 2) Ajuste: sin autorización, imposible (mov_ajuste_chk ya exige
  --    ajuste_id not null para estos tipos; aquí se valida que esté autorizado).
  if new.tipo in ('entrada_ajuste', 'salida_ajuste') and not public.ajuste_autorizado(new.ajuste_id) then
    raise exception
      'No se puede mover inventario con un ajuste no autorizado (%). RTB-CIE-01 exige '
      'autorización de Gerencia de Operaciones para todo cambio que mueva inventario.',
      new.ajuste_id using errcode = '42501';
  end if;

  -- 3) Congelamiento: bloquea todo movimiento salvo el propio conteo que congeló.
  v_congelamiento := public.inventario_congelamiento_activo(new.producto_id, new.ubicacion_id);
  if v_congelamiento is not null
     and not (new.tipo in ('entrada_conteo', 'salida_conteo') and new.conteo_id = v_congelamiento) then
    raise exception
      'Producto/ubicación congelado por el conteo % — no se puede mover inventario mientras dura el conteo',
      v_congelamiento using errcode = '55006';
  end if;

  -- 4) Lock de la fila de existencias (upsert-then-lock: si no existe, se
  --    crea en cero y se reintenta el SELECT ... FOR UPDATE).
  loop
    select cantidad_teorica, costo_promedio into v_saldo_anterior, v_costo_promedio_anterior
      from public.inventario_existencias
     where producto_id = new.producto_id and ubicacion_id is not distinct from new.ubicacion_id
     for update;
    exit when found;
    begin
      insert into public.inventario_existencias (producto_id, ubicacion_id, created_by)
      values (new.producto_id, new.ubicacion_id, auth.uid());
    exception when unique_violation then
      null;   -- otra transacción concurrente ya la creó: reintenta el SELECT
    end;
  end loop;

  v_saldo_nuevo := coalesce(v_saldo_anterior, 0) + new.cantidad;

  -- 5) Costo: entradas recalculan el promedio ponderado móvil; salidas lo
  --    conservan y sólo estampan el costo de salida.
  if new.cantidad > 0 then
    if new.costo_unitario is null then
      new.costo_unitario := coalesce(public.costo_unitario_vigente(new.producto_id, new.fecha_movimiento), 0);
    end if;
    if v_saldo_nuevo = 0 then
      v_costo_promedio_nuevo := coalesce(v_costo_promedio_anterior, new.costo_unitario);
    else
      v_costo_promedio_nuevo := (
        greatest(coalesce(v_saldo_anterior, 0), 0) * coalesce(v_costo_promedio_anterior, 0)
        + new.cantidad * new.costo_unitario
      ) / (greatest(coalesce(v_saldo_anterior, 0), 0) + new.cantidad);
    end if;
  else
    if new.costo_unitario is null then
      new.costo_unitario := coalesce(
        v_costo_promedio_anterior,
        public.costo_unitario_vigente(new.producto_id, new.fecha_movimiento),
        0
      );
    end if;
    v_costo_promedio_nuevo := v_costo_promedio_anterior;
  end if;

  new.costo_promedio_posterior := v_costo_promedio_nuevo;
  new.saldo_teorico_posterior := v_saldo_nuevo;

  -- 6) Bloqueo de saldo negativo, con escotilla auditada.
  if v_saldo_nuevo < 0 and not coalesce(new.permite_negativo, false) then
    raise exception
      'Saldo negativo no permitido: el producto % quedaría en % unidades base con este movimiento (%). '
      'Un faltante se registra como discrepancia, no como salida directa.',
      new.producto_id, v_saldo_nuevo, new.tipo
      using errcode = 'P0001';
  end if;

  -- 7) Aplicar el nuevo saldo.
  update public.inventario_existencias
     set cantidad_teorica = v_saldo_nuevo,
         costo_promedio = v_costo_promedio_nuevo,
         fecha_ultimo_movimiento = new.fecha_movimiento,
         updated_at = now(), updated_by = auth.uid()
   where producto_id = new.producto_id and ubicacion_id is not distinct from new.ubicacion_id;

  -- 8) Folio y autoría.
  if new.folio is null then
    new.folio := 'MOV-' || lpad(nextval('public.inventario_movimientos_folio_seq')::text, 8, '0');
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());

  return new;
end;
$$;

revoke execute on function public.inventario_movimientos_before_insert() from public, anon, authenticated;

create trigger before_insert_movimientos
  before insert on public.inventario_movimientos
  for each row execute function public.inventario_movimientos_before_insert();

-- =========================================
-- 6. Constraint trigger diferido: cross-dock y transferencia exigen sus
--    dos piernas en la misma transacción. "El registro de entrada en
--    cross-dock nunca se omite" (ALM-01 §V) deja de depender de la
--    disciplina del operador y se vuelve una invariante de base de datos.
--    SECURITY INVOKER: sólo hace SELECT sobre una tabla que 'authenticated'
--    ya puede leer.
-- =========================================
create or replace function public.movimiento_valida_par()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.tipo in ('entrada_crossdock', 'salida_crossdock') then
    if not exists (
      select 1 from public.inventario_movimientos m
       where m.operacion_id = new.operacion_id and m.tipo = 'entrada_crossdock'
    ) or not exists (
      select 1 from public.inventario_movimientos m
       where m.operacion_id = new.operacion_id and m.tipo = 'salida_crossdock'
    ) then
      raise exception
        'Cross-dock exige las dos piernas en la misma operación: la entrada nunca se omite (ALM-01 §V)'
        using errcode = '23514';
    end if;
  end if;

  if new.tipo in ('entrada_transferencia', 'salida_transferencia') then
    if not exists (
      select 1 from public.inventario_movimientos m
       where m.operacion_id = new.operacion_id and m.tipo = 'entrada_transferencia'
    ) or not exists (
      select 1 from public.inventario_movimientos m
       where m.operacion_id = new.operacion_id and m.tipo = 'salida_transferencia'
    ) then
      raise exception 'Una transferencia exige las dos piernas en la misma operación'
        using errcode = '23514';
    end if;
    if (
      select coalesce(sum(cantidad), 0) from public.inventario_movimientos m
       where m.operacion_id = new.operacion_id and m.tipo in ('entrada_transferencia', 'salida_transferencia')
    ) <> 0 then
      raise exception
        'La transferencia no está balanceada: las piezas que salen deben igualar a las que entran'
        using errcode = '23514';
    end if;
  end if;

  return null;   -- constraint trigger AFTER: el valor de retorno se ignora
end;
$$;

create constraint trigger check_movimiento_par
  after insert on public.inventario_movimientos
  deferrable initially deferred
  for each row execute function public.movimiento_valida_par();

revoke execute on function public.movimiento_valida_par() from public, anon, authenticated;

-- =========================================
-- 7. Append-only real: ni siquiera service_role reescribe el kardex.
-- =========================================
create or replace function public.inventario_movimientos_inmutable()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  raise exception
    'El kardex es append-only: una corrección se registra como movimiento nuevo '
    'con su ajuste autorizado, nunca editando o borrando el original'
    using errcode = '42501';
end;
$$;

create trigger inventario_movimientos_no_update
  before update or delete on public.inventario_movimientos
  for each row execute function public.inventario_movimientos_inmutable();

revoke execute on function public.inventario_movimientos_inmutable() from public, anon, authenticated;

-- =========================================
-- 8. Privilegios y RLS
-- =========================================

-- GRANT INSERT por columna: lo que no aparece aquí, el cliente no puede ni
-- nombrarlo en el INSERT. folio/factor_conversion/unidad_base_id/cantidad/
-- costo_promedio_posterior/saldo_teorico_posterior los calcula el trigger;
-- permite_negativo/motivo_negativo/ajuste_id son sólo de service_role.
revoke all on public.inventario_movimientos from anon, authenticated;
grant insert (
  tipo, subtipo, producto_id, ubicacion_id, unidad_captura_id, cantidad_capturada,
  costo_unitario, referencia_tipo, referencia_folio, entidad_id, operacion_id,
  conteo_id, apartado_id, fecha_movimiento, observaciones
) on public.inventario_movimientos to authenticated;
grant select on public.inventario_movimientos to authenticated;
-- Sin GRANT UPDATE de ninguna columna. Sin GRANT DELETE. El trigger de la
-- sección 7 refuerza esto incluso frente a service_role.
grant all on public.inventario_movimientos to service_role;

alter table public.inventario_movimientos enable row level security;

create policy inventario_movimientos_select on public.inventario_movimientos
  for select to authenticated
  using (public.current_user_role() is not null);

create policy inventario_movimientos_insert on public.inventario_movimientos
  for insert to authenticated
  with check (
    public.current_user_role() = any (array['super_admin', 'direccion', 'almacen', 'compras', 'logistica'])
  );

-- Sin política de UPDATE/DELETE: no hay GRANT que las respalde, y el
-- trigger de inmutabilidad las rechaza de todos modos.

-- =========================================
-- 9. Re-declarar costo_unitario_vigente() (010) con el costo promedio
--    operativo como primer eslabón de la cascada, ahora que
--    inventario_existencias existe. Mismo cuerpo salvo el nuevo primer
--    SELECT.
-- =========================================
create or replace function public.costo_unitario_vigente(p_producto_id uuid, p_fecha timestamptz default now())
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select e.costo_promedio from public.inventario_existencias e
      where e.producto_id = p_producto_id and e.costo_promedio is not null
      order by e.cantidad_teorica desc nulls last limit 1),
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
