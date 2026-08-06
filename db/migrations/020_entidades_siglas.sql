-- ==========================================
-- RTB Sistema — 020: entidades.siglas
--
-- Motivación: el dueño del proyecto pidió poder localizar clientes por
-- siglas ("TMEX", "AT&T") — la razón social completa o el folio ENT-000123
-- no son cómo ventas identifica a un cliente en la práctica. Se añade un
-- campo opcional, único, normalizado a MAYÚSCULAS (mismo patrón que rfc/
-- curp de entidades_before_insert/update, 002), que entra al buscador
-- ILIKE junto a nombre_legal/nombre_comercial/rfc/clave.
--
-- 'siglas' es modificación LIBRE, no controlada: no se toca el enum
-- cambio_controlado ni CAMPOS_SENSIBLES de la API — entra directo al
-- GRANT UPDATE por columna, igual que nombre_comercial/correo_principal/
-- telefono_principal/sitio_web/observaciones.
--
-- Numeración: aplicada a Supabase con el nombre "018_entidades_siglas"
-- (apply_migration se llamó antes de notar que 018_clientes_limite_credito_grant
-- ya estaba tomado en el repo local por trabajo concurrente sin commitear
-- de la corrección de auditoría QA — ver 019_clientes_limite_credito_grant.sql,
-- cuyo nombre aplicado en Supabase también es "018_..."). El archivo local
-- se renombró a 020 para no romper la secuencia en disco; el nombre
-- registrado en supabase_migrations.schema_migrations sigue siendo
-- "018_entidades_siglas" — es sólo una etiqueta, no afecta su aplicación.
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

-- =========================================
-- 1. Columna + CHECK
-- =========================================
alter table public.entidades add column siglas varchar(12);

-- El BEFORE trigger normaliza antes de que se evalúe este CHECK (ver más
-- abajo). Se prohíbe el espacio interno: unas siglas con espacio no sirven
-- como identificador corto. Se permiten & . - porque las razones sociales
-- mexicanas los usan de forma legítima (AT&T, S.A. DE C.V.).
alter table public.entidades add constraint entidades_siglas_chk
  check (siglas is null or siglas ~ '^[A-Z0-9&.-]{2,12}$');

comment on column public.entidades.siglas is
  'Identificador corto de la entidad (RTB, BOSCH, TMEX...). Opcional, '
  'normalizado a MAYÚSCULAS por entidades_before_insert/update() '
  '(nullif(upper(btrim(...)), '''') — sin el nullif, un '''' capturado y '
  'borrado en el formulario chocaría contra uq_entidades_siglas), único '
  'cuando no es nulo. Alimenta el avatar del detalle y el buscador ILIKE '
  'junto a nombre_legal/nombre_comercial/rfc/clave. Modificación libre, no '
  'controlada — va en el GRANT UPDATE por columna, no en CAMPOS_SENSIBLES.';

-- =========================================
-- 2. Índices
-- =========================================
-- Único parcial: mismo criterio que uq_entidades_rfc, sin lista de
-- excepciones (no hay "siglas genéricas" equivalentes a los RFC del SAT).
create unique index uq_entidades_siglas on public.entidades (siglas)
  where siglas is not null;

-- Consistencia con idx_entidades_clave_trgm/idx_entidades_rfc_trgm. El
-- índice único de arriba ya cubre la igualdad; el trigram ayuda al
-- ILIKE '%...%' del buscador para siglas de 3+ caracteres.
create index idx_entidades_siglas_trgm on public.entidades using gin (siglas gin_trgm_ops);

-- =========================================
-- 3. Normalización — CREATE OR REPLACE con el cuerpo COMPLETO de ambas
--    funciones (no se puede "añadir" a una función existente).
-- =========================================
create or replace function public.entidades_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.clave is null then
    new.clave := 'ENT-' || lpad(nextval('public.entidades_clave_seq')::text, 6, '0');
  end if;
  if new.rfc is not null then
    new.rfc := upper(btrim(new.rfc));
  end if;
  if new.curp is not null then
    new.curp := upper(btrim(new.curp));
  end if;
  -- nullif: btrim('') es '', que NO es NULL y por tanto sí entra al índice
  -- único parcial de arriba — dos entidades capturadas con el campo vacío
  -- chocarían con 23505. A diferencia de rfc/curp (sin índice único
  -- parcial, así que un '' repetido ahí es inofensivo), aquí es obligatorio.
  new.siglas := nullif(upper(btrim(new.siglas)), '');
  return new;
end;
$$;

-- El trigger before_insert_entidades ya existe (002) y sigue apuntando a
-- esta función por nombre — CREATE OR REPLACE FUNCTION basta para que
-- adopte el nuevo cuerpo, sin tocar el trigger.

-- Reemitido a propósito (CREATE OR REPLACE conserva la ACL, pero declarar
-- el REVOKE aquí también hace este archivo autocontenido — mismo criterio
-- con que 015 reafirma GRANTs completos en vez de asumir que ya están).
revoke execute on function public.entidades_before_insert() from public, anon, authenticated;

create or replace function public.entidades_before_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.clave := old.clave;
  if new.rfc is not null then
    new.rfc := upper(btrim(new.rfc));
  end if;
  if new.curp is not null then
    new.curp := upper(btrim(new.curp));
  end if;
  new.siglas := nullif(upper(btrim(new.siglas)), '');
  return new;
end;
$$;

-- Ídem para before_update_entidades: el trigger ya existe (002).

-- =========================================
-- 4. Privilegios — patrón "revoke + lista completa" de 015: se reafirma el
--    conjunto real del GRANT UPDATE, no sólo se añade siglas, para que este
--    archivo documente el conjunto completo sin obligar a leer 002.
-- =========================================
revoke update on public.entidades from authenticated;
grant update (nombre_comercial, correo_principal, telefono_principal,
              sitio_web, observaciones, siglas)
  on public.entidades to authenticated;

-- GRANT INSERT de entidades no está restringido por columna (002) — siglas
-- entra al alta sin tocar nada más. audit_entidades usa audit_row() con
-- to_jsonb(new): se audita sola.
