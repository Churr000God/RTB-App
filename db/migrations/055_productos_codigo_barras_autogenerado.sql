-- 055_productos_codigo_barras_autogenerado.sql
-- productos.codigo_barras deja de ser texto libre capturado por el usuario
-- en el alta — se autogenera igual a codigo_interno (decisión confirmada
-- con el dueño del proyecto: Code128 acepta alfanumérico directo, no hace
-- falta un checksum EAN-13 aparte) y queda fijo para siempre — ni siquiera
-- super_admin lo edita después, para que una etiqueta ya impresa nunca
-- deje de coincidir con el sistema.

-- Backfill: los productos existentes (todos de prueba, ninguno con
-- etiqueta impresa real) quedan con codigo_barras = codigo_interno.
update public.productos set codigo_barras = codigo_interno where codigo_barras is null;

alter table public.productos alter column codigo_barras set not null;

create or replace function public.productos_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clave_familia varchar;
begin
  if new.codigo_interno is null or btrim(new.codigo_interno) = '' then
    select clave into v_clave_familia from public.producto_familias where id = new.familia_id;
    if v_clave_familia is null then
      raise exception 'La familia % no existe', new.familia_id;
    end if;
    new.codigo_interno := 'RTB-' || v_clave_familia || '-' ||
                          lpad(nextval('public.productos_codigo_seq')::text, 6, '0');
  end if;
  new.codigo_interno := upper(btrim(new.codigo_interno));
  -- Código de barras = código interno, siempre — nunca lo que mande el
  -- cliente en el payload del alta (el GRANT INSERT no restringe columnas,
  -- así que sin esto un POST directo podría forjarlo).
  new.codigo_barras := new.codigo_interno;
  new.sku := nullif(upper(btrim(coalesce(new.sku, ''))), '');
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

revoke update (codigo_barras) on public.productos from authenticated;
