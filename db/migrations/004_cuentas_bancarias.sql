-- ==========================================
-- RTB Sistema — 004: Cuentas bancarias de proveedor
--
-- El procedimiento P03 del paquete RTB-ENT-01 es explícito y es el que
-- manda aquí, no el DDL del documento maestro (que le daba a 'compras'
-- CRUD completo sobre esta tabla): "solo finanzas inicia; solo super_admin
-- aprueba; nadie más ve ni modifica". El fraude por cambio de CLABE es el
-- más común en B2B mexicano — ver contexto/AUDITORIA_RTB-ENT-01.md.
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

create type public.cuenta_bancaria_estado as enum (
  'pendiente_aprobacion', 'activa', 'pendiente_reemplazo', 'inactiva', 'rechazada'
);

-- Algoritmo de P03 §V: 18 dígitos, pesos [3,7,1] cíclicos sobre los
-- primeros 17, suma de (dígito × peso) mód 10, verificador
-- (10 − suma mód 10) mód 10, debe coincidir con el dígito 18. Con espejo
-- exacto en TypeScript (app/lib/entidades/validaciones.ts) para no hacer
-- un round-trip a la DB sólo para validar en captura.
create or replace function public.clabe_valida(p_clabe text)
returns boolean
language plpgsql
immutable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_pesos int[] := array[3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7];
  v_suma int := 0;
  i int;
begin
  if p_clabe is null or p_clabe !~ '^[0-9]{18}$' then
    return false;
  end if;
  for i in 1..17 loop
    v_suma := v_suma + (substring(p_clabe from i for 1)::int * v_pesos[i]) % 10;
  end loop;
  return ((10 - (v_suma % 10)) % 10) = substring(p_clabe from 18 for 1)::int;
end;
$$;

create table public.proveedor_cuentas_bancarias (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores(id) on update cascade on delete restrict,
  banco varchar(120) not null,
  clabe char(18) not null,
  cuenta varchar(20),
  titular varchar(200) not null,
  rfc_beneficiario varchar(13) not null,
  moneda char(3) not null default 'MXN',
  comprobante_path text not null,   -- ruta en el bucket privado 'comprobantes-bancarios',
                                     -- nunca una URL pública
  estado public.cuenta_bancaria_estado not null default 'pendiente_aprobacion',
  motivo_cambio text,               -- obligatorio cuando reemplaza una cuenta activa (P03 §IV)
  motivo_rechazo text,
  aprobada_por uuid references public.profiles(id),
  aprobada_at timestamptz,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pcb_clabe_valida_chk check (public.clabe_valida(clabe)),
  constraint pcb_moneda_chk check (moneda ~ '^[A-Z]{3}$'),
  constraint pcb_rfc_len_chk check (length(rfc_beneficiario) in (12, 13)),
  constraint pcb_aprobacion_chk check (
    (estado = 'activa') = (aprobada_por is not null and aprobada_at is not null)
  ),
  constraint pcb_rechazo_chk check (
    (estado = 'rechazada') = (motivo_rechazo is not null)
  )
);

comment on table public.proveedor_cuentas_bancarias is
  'Acceso restringido a finanzas/super_admin (P03 §II). direccion sólo ve '
  'el estado, enmascarado, a través de public.proveedor_cuentas_resumen().';

-- Regla base de P03 §IV: sólo puede existir una cuenta 'activa' por
-- proveedor en todo momento.
create unique index uq_pcb_activa_por_proveedor on public.proveedor_cuentas_bancarias (proveedor_id)
  where estado = 'activa';
create index idx_pcb_proveedor on public.proveedor_cuentas_bancarias (proveedor_id);
create index idx_pcb_estado on public.proveedor_cuentas_bancarias (estado);

-- La CLABE es inmutable tras el alta: el "cambio de cuenta" de P03 es una
-- fila nueva que reemplaza a la anterior (que pasa a inactiva), nunca una
-- edición en sitio — así es como P03 exige conservar el histórico de pagos.
create or replace function public.pcb_before_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.clabe := old.clabe;
  new.proveedor_id := old.proveedor_id;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger before_update_pcb
  before update on public.proveedor_cuentas_bancarias
  for each row execute function public.pcb_before_update();

create trigger audit_pcb after insert or update on public.proveedor_cuentas_bancarias
  for each row execute function public.audit_row();

-- =========================================
-- Vista enmascarada para direccion — función, no vista SECURITY DEFINER
-- (mismo motivo que public.usuarios_directorio() en 002_entidades_core.sql:
-- el linter marca ERROR una vista definer, WARN una función definer).
-- Filtra por rol dentro del propio SELECT en vez de con RLS: para un rol no
-- autorizado devuelve cero filas, el mismo comportamiento "seguro por
-- defecto" que ya usan las políticas de este módulo.
-- =========================================
create or replace function public.proveedor_cuentas_resumen(p_proveedor_id uuid default null)
returns table (
  id uuid,
  proveedor_id uuid,
  banco varchar,
  clabe_enmascarada text,
  titular varchar,
  estado public.cuenta_bancaria_estado,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.proveedor_id, c.banco, ('****' || right(c.clabe, 4)) as clabe_enmascarada,
         c.titular, c.estado, c.created_at
  from public.proveedor_cuentas_bancarias c
  where public.current_user_role() = any (array['direccion', 'finanzas', 'super_admin'])
    and (p_proveedor_id is null or c.proveedor_id = p_proveedor_id);
$$;

revoke execute on function public.proveedor_cuentas_resumen(uuid) from public, anon;
grant execute on function public.proveedor_cuentas_resumen(uuid) to authenticated, service_role;

-- =========================================
-- Privilegios y RLS de la tabla base
-- =========================================

-- estado/aprobada_por/aprobada_at/motivo_rechazo NO son de escritura
-- directa: la aprobación/rechazo la resuelve el API con service_role
-- (super_admin no puede aprobar su propia captura si finanzas no la
-- solicitó primero — esa secuencia vive en la lógica de negocio, no en SQL).
revoke all on public.proveedor_cuentas_bancarias from anon, authenticated;
grant select, insert on public.proveedor_cuentas_bancarias to authenticated;
grant update (banco, cuenta, titular, rfc_beneficiario, comprobante_path, motivo_cambio)
  on public.proveedor_cuentas_bancarias to authenticated;
grant all on public.proveedor_cuentas_bancarias to service_role;
-- Sin GRANT DELETE: "no se puede eliminar una cuenta con pagos históricos
-- — únicamente se puede inactivar" (P03 §IV, regla crítica).

alter table public.proveedor_cuentas_bancarias enable row level security;

create policy pcb_select on public.proveedor_cuentas_bancarias
  for select to authenticated
  using (public.current_user_role() = any (array['finanzas', 'super_admin']));

create policy pcb_insert on public.proveedor_cuentas_bancarias
  for insert to authenticated
  with check (public.current_user_role() = any (array['finanzas', 'super_admin']));

create policy pcb_update on public.proveedor_cuentas_bancarias
  for update to authenticated
  using (public.current_user_role() = any (array['finanzas', 'super_admin']))
  with check (public.current_user_role() = any (array['finanzas', 'super_admin']));

-- Sin DELETE: regla de negocio "no borrado físico".

-- =========================================
-- Storage: bucket privado para comprobantes bancarios (PDF/JPG/PNG del
-- estado de cuenta o carta del banco, P03 §VI). Se sirven siempre por URL
-- firmada de corta duración generada en el servidor — nunca por URL
-- pública. Las políticas de storage.objects son defensa en profundidad
-- (la ruta normal ya pasa por el API con service_role, que evalúa
-- requireApiRole antes de generar cualquier URL firmada o subir el
-- archivo).
-- =========================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes-bancarios', 'comprobantes-bancarios', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

create policy comprobantes_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'comprobantes-bancarios'
    and public.current_user_role() = any (array['finanzas', 'super_admin'])
  );

create policy comprobantes_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'comprobantes-bancarios'
    and public.current_user_role() = any (array['finanzas', 'super_admin'])
  );

-- Sin UPDATE/DELETE: un comprobante ya subido es evidencia, no se
-- reemplaza en sitio (se sube uno nuevo junto con la fila de reemplazo).
