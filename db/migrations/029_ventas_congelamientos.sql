-- ==========================================
-- RTB Sistema — 029: congelamiento de cartera y política de facturación
-- del cliente (RTB-VEN-01)
--
-- Reglas confirmadas con el dueño del proyecto (2026-08-07, documento de
-- reglas de negocio ampliado sobre contexto/RTB-PRO-VEN-01_Modulo_Ventas.md):
-- el congelamiento por saldo vencido >90 días es un bloqueo GLOBAL de la
-- Entidad Cliente, pero es un concepto DISTINTO del bloqueo administrativo
-- que ya vive en entidades.estado (RFC inválido, reactivación aprobada por
-- super_admin, etc. — 002_entidades_core.sql). Colapsarlos mezclaría "tu
-- RFC está mal" con "me debes dinero", y el flujo de desbloqueo de cada uno
-- es distinto (pagar lo vencido vs. aprobación administrativa). Por eso:
--   - entidades.estado NO se toca — sigue siendo sólo el bloqueo
--     administrativo, con las mismas reglas de siempre.
--   - cliente_congelamientos/cliente_excepciones son tablas NUEVAS,
--     independientes, que cliente_puede_operar() consulta junto con
--     entidades.estado para dar el veredicto único que Ventas necesita.
--
-- Esta entrega NO calcula el saldo vencido automáticamente (no hay CFDI ni
-- pagos todavía — eso es RTB-PRO-FAC-01, fuera de alcance): el congelamiento
-- se REGISTRA a mano por Dirección con el saldo que lo originó como dato
-- informativo, no como cómputo en vivo. Cuando exista Facturación/Cobranza,
-- ese módulo puede llamar a la misma función para congelar automáticamente
-- sin cambiar el contrato de cliente_puede_operar().
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

-- =========================================
-- 1. clientes: política de facturación (requiere_po, tipo_cliente)
-- =========================================
create type public.cliente_tipo as enum ('credito', 'contado', 'pago_anticipado', 'facturacion_inmediata');

alter table public.clientes
  add column requiere_po boolean not null default false,
  add column tipo_cliente public.cliente_tipo not null default 'contado';

comment on column public.clientes.requiere_po is
  'Si esta entidad exige PO para facturar (RTB-PRO-VEN-01 regla 6 con '
  'excepción documentada). Determina si una NR puede seguir el flujo de '
  'seguimiento activo o si el vendedor puede tratarla sin perseguir PO.';
comment on column public.clientes.tipo_cliente is
  'Política de facturación del cliente. NO calcula el reloj de cobranza '
  'todavía (eso es RTB-PRO-FAC-01, fuera de esta entrega) — sólo queda '
  'registrado para cuando ese módulo exista.';

-- Mismo idioma de columnas que dias_credito/canal_origen (002): 'ventas' ya
-- administra clientes por RLS (clientes_update), sólo faltaba el GRANT de
-- columna para estos dos campos nuevos (el GRANT INSERT de la tabla es de
-- tabla completa desde 002, así que el alta ya los cubre).
grant update (requiere_po, tipo_cliente) on public.clientes to authenticated;

-- =========================================
-- 2. TABLA: cliente_congelamientos
-- =========================================
create type public.cliente_congelamiento_estado as enum ('activo', 'liberado');

create table public.cliente_congelamientos (
  id uuid primary key default gen_random_uuid(),
  entidad_id uuid not null references public.entidades(id) on delete restrict,
  motivo text not null,
  saldo_origen numeric(14, 2),        -- informativo: no hay cómputo automático todavía
  autorizado_por uuid not null references public.profiles(id) default auth.uid(),
  evidencia_path text,
  estado public.cliente_congelamiento_estado not null default 'activo',
  congelado_at timestamptz not null default now(),
  liberado_at timestamptz,
  liberado_por uuid references public.profiles(id),
  motivo_liberacion text,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cliente_cong_motivo_chk check (length(btrim(motivo)) > 0),
  -- Calco de apartados_liberacion_chk/apartados_motivo_chk (011): mismo
  -- idioma para "liberar exige timestamp+autor+motivo, no sólo cambiar el estado".
  constraint cliente_cong_liberacion_chk check (
    (estado <> 'activo') = (liberado_at is not null and liberado_por is not null)
  ),
  constraint cliente_cong_motivo_liberacion_chk check (
    estado = 'activo' or length(btrim(coalesce(motivo_liberacion, ''))) > 0
  )
);

comment on table public.cliente_congelamientos is
  'Congelamiento de cartera de la Entidad Cliente completa (bloqueo global,
   independiente por diseño de entidades.estado — ver cabecera). Un solo
   congelamiento activo por entidad (índice único parcial). Se registra a
   mano por Dirección/super_admin; el saldo es informativo hasta que exista
   RTB-PRO-FAC-01.';

create unique index uq_cliente_cong_activo on public.cliente_congelamientos (entidad_id)
  where estado = 'activo';
create index idx_cliente_cong_entidad on public.cliente_congelamientos (entidad_id);
create index idx_cliente_cong_estado on public.cliente_congelamientos (estado) where estado = 'activo';

-- Congela entidad_id/motivo/saldo_origen/autorizado_por/congelado_at (el
-- congelamiento es inmutable en su alcance, mismo criterio que un apartado
-- de inventario) y estampa liberado_at/liberado_por al cambiar el estado.
create or replace function public.cliente_congelamiento_before_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.estado <> 'activo' then
    raise exception 'Este congelamiento ya no está activo, no admite más cambios' using errcode = '42501';
  end if;
  new.entidad_id := old.entidad_id;
  new.motivo := old.motivo;
  new.saldo_origen := old.saldo_origen;
  new.autorizado_por := old.autorizado_por;
  new.congelado_at := old.congelado_at;
  new.evidencia_path := old.evidencia_path;
  new.updated_at := now();
  if new.estado is distinct from old.estado then
    new.liberado_at := now();
    new.liberado_por := auth.uid();
  end if;
  return new;
end;
$$;

revoke execute on function public.cliente_congelamiento_before_update() from public, anon, authenticated;

create trigger before_update_cliente_congelamientos
  before update on public.cliente_congelamientos
  for each row execute function public.cliente_congelamiento_before_update();

create trigger audit_cliente_congelamientos after insert or update on public.cliente_congelamientos
  for each row execute function public.audit_row();

revoke all on public.cliente_congelamientos from anon, authenticated;
grant select on public.cliente_congelamientos to authenticated;
grant insert (entidad_id, motivo, saldo_origen, evidencia_path) on public.cliente_congelamientos to authenticated;
grant update (estado, motivo_liberacion) on public.cliente_congelamientos to authenticated;
grant all on public.cliente_congelamientos to service_role;

alter table public.cliente_congelamientos enable row level security;

-- Visibilidad amplia: cualquier rol operativo necesita saber si un cliente
-- está congelado (Ventas para no cotizar, Almacén para no liberar, etc.).
create policy cliente_congelamientos_select on public.cliente_congelamientos
  for select to authenticated
  using (public.current_user_role() is not null);
create policy cliente_congelamientos_insert on public.cliente_congelamientos
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion']));
create policy cliente_congelamientos_update on public.cliente_congelamientos
  for update to authenticated
  using (public.current_user_role() = any (array['super_admin', 'direccion']))
  with check (public.current_user_role() = any (array['super_admin', 'direccion']));

-- =========================================
-- 3. TABLA: cliente_excepciones (autorización temporal de Dirección)
-- =========================================
create type public.cliente_excepcion_estado as enum ('pendiente', 'autorizada', 'rechazada', 'cancelada');

create table public.cliente_excepciones (
  id uuid primary key default gen_random_uuid(),
  entidad_id uuid not null references public.entidades(id) on delete restrict,
  congelamiento_id uuid references public.cliente_congelamientos(id) on delete restrict,
  monto_maximo numeric(14, 2) not null check (monto_maximo > 0),
  vigente_desde date not null default current_date,
  vigente_hasta date not null,
  evidencia_path text not null,
  motivo text not null,
  solicitante_id uuid not null references public.profiles(id) default auth.uid(),
  autorizador_id uuid references public.profiles(id),
  autorizado_at timestamptz,
  comentario_resolucion text,
  estado public.cliente_excepcion_estado not null default 'pendiente',
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cliente_exc_motivo_chk check (length(btrim(motivo)) > 0),
  constraint cliente_exc_evidencia_chk check (length(btrim(evidencia_path)) > 0),
  constraint cliente_exc_vigencia_chk check (vigente_hasta >= vigente_desde),
  -- "Una excepción no debe cambiar silenciosamente el estado de la cuenta a
  -- normal. Debe conservarse como una autorización temporal sobre una
  -- cuenta que continúa teniendo saldo vencido" — el dueño del proyecto,
  -- documento de reglas §11. Nadie autoriza su propia solicitud: mismo
  -- CHECK estructural que aju_no_autoaprobacion_chk (013) y
  -- vaut_no_autoaprobacion_chk (033, más adelante).
  constraint cliente_exc_no_autoaprobacion_chk check (autorizador_id is null or autorizador_id <> solicitante_id),
  constraint cliente_exc_resolucion_chk check (
    (estado = 'pendiente') = (autorizador_id is null and autorizado_at is null)
  )
);

comment on table public.cliente_excepciones is
  'Autorización temporal para operar pese a un congelamiento activo (monto
   máximo + vigencia). La resolución (autorizar/rechazar) va SIEMPRE por
   API con service_role, que valida que el aprobador no sea el propio
   solicitante — mismo patrón que solicitudes_cambio (002). Sin GRANT
   UPDATE para authenticated: ni siquiera Dirección resuelve por RLS
   directa, para no tener dos caminos distintos hacia el mismo efecto.';

create index idx_cliente_exc_entidad on public.cliente_excepciones (entidad_id);
create index idx_cliente_exc_congelamiento on public.cliente_excepciones (congelamiento_id);
create index idx_cliente_exc_pendientes on public.cliente_excepciones (estado) where estado = 'pendiente';
create index idx_cliente_exc_vigencia on public.cliente_excepciones (vigente_desde, vigente_hasta);

create trigger before_update_cliente_excepciones
  before update on public.cliente_excepciones
  for each row execute function public.set_updated_meta();

create trigger audit_cliente_excepciones after insert or update on public.cliente_excepciones
  for each row execute function public.audit_row();

-- Sin GRANT UPDATE: la resolución (estado/autorizador_id/autorizado_at/
-- comentario_resolucion) es exclusiva de service_role, tras
-- requireApiRole(['super_admin','direccion']) + comprobación de que el
-- aprobador no sea el solicitante (defensa en profundidad sobre el CHECK).
revoke all on public.cliente_excepciones from anon, authenticated;
grant select on public.cliente_excepciones to authenticated;
grant insert (entidad_id, congelamiento_id, monto_maximo, vigente_desde, vigente_hasta, evidencia_path, motivo)
  on public.cliente_excepciones to authenticated;
grant all on public.cliente_excepciones to service_role;

alter table public.cliente_excepciones enable row level security;

create policy cliente_excepciones_select on public.cliente_excepciones
  for select to authenticated
  using (public.current_user_role() is not null);
-- Ventas puede SOLICITAR la excepción (documento §12: "puede solicitar una
-- excepción" pese a estar congelada); sólo Dirección/super_admin resuelven,
-- y eso pasa por el API con service_role, no por esta política.
create policy cliente_excepciones_insert on public.cliente_excepciones
  for insert to authenticated
  with check (public.current_user_role() = any (array['super_admin', 'direccion', 'ventas']));

-- =========================================
-- 4. cliente_puede_operar() — el veredicto único que consulta Ventas
-- =========================================
create or replace function public.cliente_puede_operar(p_entidad_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado_entidad public.entidad_estado;
  v_bloqueo_motivo text;
  v_congelamiento record;
  v_excepcion record;
  v_ultimo_liberado record;
begin
  select estado, bloqueo_motivo into v_estado_entidad, v_bloqueo_motivo
    from public.entidades where id = p_entidad_id;

  if v_estado_entidad is null then
    return jsonb_build_object(
      'puede', false, 'estado', 'bloqueada', 'motivo', 'Entidad no encontrada.',
      'congelamiento_id', null, 'monto_maximo', null
    );
  end if;

  -- entidades.estado sigue siendo SÓLO el bloqueo administrativo (ver
  -- cabecera) — se comprueba primero porque es más restrictivo: una
  -- entidad bloqueada administrativamente no opera aunque no tenga
  -- congelamiento de cartera.
  if v_estado_entidad in ('borrador', 'bloqueado_temporal', 'bloqueado_permanente', 'inactivo') then
    return jsonb_build_object(
      'puede', false, 'estado', 'bloqueada',
      'motivo', coalesce(v_bloqueo_motivo, 'La entidad está en estado ' || v_estado_entidad::text || '.'),
      'congelamiento_id', null, 'monto_maximo', null
    );
  end if;

  select * into v_congelamiento
    from public.cliente_congelamientos
   where entidad_id = p_entidad_id and estado = 'activo'
   limit 1;

  if v_congelamiento.id is null then
    select * into v_ultimo_liberado
      from public.cliente_congelamientos
     where entidad_id = p_entidad_id and estado = 'liberado'
     order by liberado_at desc
     limit 1;

    if v_ultimo_liberado.id is not null and v_ultimo_liberado.liberado_at > now() - interval '30 days' then
      return jsonb_build_object(
        'puede', true, 'estado', 'descongelada',
        'motivo', 'Congelamiento liberado el ' || to_char(v_ultimo_liberado.liberado_at, 'YYYY-MM-DD') || '.',
        'congelamiento_id', v_ultimo_liberado.id, 'monto_maximo', null
      );
    end if;

    return jsonb_build_object(
      'puede', true, 'estado', 'normal', 'motivo', null,
      'congelamiento_id', null, 'monto_maximo', null
    );
  end if;

  -- Excepción autorizada y vigente hoy: opera, pero con tope de monto.
  select * into v_excepcion
    from public.cliente_excepciones
   where congelamiento_id = v_congelamiento.id and estado = 'autorizada'
     and current_date between vigente_desde and vigente_hasta
   order by autorizado_at desc
   limit 1;

  if v_excepcion.id is not null then
    return jsonb_build_object(
      'puede', true, 'estado', 'excepcion_autorizada',
      'motivo', v_excepcion.motivo, 'congelamiento_id', v_congelamiento.id,
      'monto_maximo', v_excepcion.monto_maximo
    );
  end if;

  if exists (
    select 1 from public.cliente_excepciones
     where congelamiento_id = v_congelamiento.id and estado = 'pendiente'
  ) then
    return jsonb_build_object(
      'puede', false, 'estado', 'en_revision',
      'motivo', 'Hay una excepción pendiente de autorización de Dirección.',
      'congelamiento_id', v_congelamiento.id, 'monto_maximo', null
    );
  end if;

  return jsonb_build_object(
    'puede', false, 'estado', 'congelada', 'motivo', v_congelamiento.motivo,
    'congelamiento_id', v_congelamiento.id, 'monto_maximo', null
  );
end;
$$;

comment on function public.cliente_puede_operar(uuid) is
  'Veredicto único de cartera+bloqueo administrativo para una entidad
   cliente. SECURITY DEFINER para no depender de la RLS del invocador —
   "ventas" necesita este resultado para cualquier cliente, no sólo el
   suyo. Estados: normal | descongelada | excepcion_autorizada |
   en_revision | congelada | bloqueada. entidades.estado nunca se modifica
   desde aquí.';

revoke execute on function public.cliente_puede_operar(uuid) from public, anon;
grant execute on function public.cliente_puede_operar(uuid) to authenticated, service_role;

-- =========================================
-- 5. Bucket privado 'evidencias-ventas' — evidencia de aprobación del
--    cliente, congelamiento y excepción (todas piezas de un tercero:
--    correo, PO, comprobante). Mismo criterio de CLAUDE.md: documento con
--    dato de un tercero → bucket privado + URL firmada, nunca público.
-- =========================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidencias-ventas', 'evidencias-ventas', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

create policy evidencias_ventas_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidencias-ventas'
    and public.current_user_role() = any (array['super_admin', 'direccion', 'ventas', 'facturacion', 'finanzas'])
  );

create policy evidencias_ventas_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidencias-ventas'
    and public.current_user_role() = any (array['super_admin', 'direccion', 'ventas', 'facturacion', 'finanzas'])
  );

-- Sin UPDATE/DELETE: una evidencia subida es un hecho, no se reemplaza en sitio.
