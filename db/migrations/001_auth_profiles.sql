-- ==========================================
-- RTB Sistema — 001: Perfiles, RLS y permisos
-- Aplicado vía MCP apply_migration sobre DB virgen (dgafffpbhktxadiqmmwl).
-- ==========================================

-- 1. Tabla de perfiles (extiende auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL CHECK (length(btrim(full_name)) > 0),
  role TEXT NOT NULL CHECK (
    role IN (
      'super_admin', 'direccion', 'ventas', 'compras',
      'almacen', 'logistica', 'facturacion', 'finanzas'
    )
  ),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS
  'Perfil de aplicación 1:1 con auth.users. El rol NUNCA se toma de raw_user_meta_data.';

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
-- Parcial: sólo interesa localizar rápido a los desactivados (minoría).
CREATE INDEX IF NOT EXISTS idx_profiles_inactive
  ON public.profiles(id) WHERE is_active = false;

-- 3. updated_at automático
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.profiles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 4. Helpers de rol (rompen la recursión de RLS)
--
--    SECURITY DEFINER  -> el cuerpo corre como el owner de la función (postgres),
--                         que es owner de public.profiles; Postgres NO aplica RLS al
--                         owner de la tabla (salvo FORCE RLS, que aquí jamás se activa),
--                         así que el SELECT interno no re-evalúa las políticas → sin 42P17.
--    STABLE            -> el planner lo evalúa una vez por sentencia (InitPlan),
--                         no una vez por fila.
--    SET search_path   -> impide que el llamante anteponga un esquema (o una tabla en
--                         pg_temp) llamado "profiles" y engañe a una función que corre
--                         con privilegios de postgres. pg_temp va al final a propósito.
--
--    Quedan expuestas via RPC a `authenticated` (advisor las marca WARN) a propósito:
--    cada una solo revela información sobre el PROPIO usuario que llama (auth.uid()),
--    nada que ese usuario no pudiera ya inferir leyendo su propia fila de profiles.

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'super_admin'
      AND p.is_active
  );
$$;

-- Reutilizable por las políticas de TODOS los módulos futuros:
-- un usuario con is_active=false no opera ninguna tabla, ni con sesión viva.
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.is_active
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.role
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid()) AND p.is_active;
$$;

REVOKE EXECUTE ON FUNCTION public.is_super_admin()    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_active_user()    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_super_admin()    TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.is_active_user()    TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;

-- 5. Privilegios de tabla (primera barrera, previa a RLS)
--    Supabase concede ALL por defecto a anon/authenticated: hay que revocarlo.
REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT  SELECT               ON public.profiles TO authenticated;
GRANT  UPDATE (full_name)   ON public.profiles TO authenticated;
GRANT  ALL                  ON public.profiles TO service_role;
-- Sin GRANT INSERT/DELETE: altas y bajas SÓLO por service_role (rutas /api/admin).
-- Sin GRANT UPDATE(role) ni UPDATE(is_active): la escalada de privilegios es
-- imposible a nivel de privilegio, no hace falta comprobarla dentro de la política.

-- 6. RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- NO añadir FORCE ROW LEVEL SECURITY: reactivaría RLS para el owner y volvería la recursión.

DROP POLICY IF EXISTS "super_admin_read_all"    ON public.profiles;
DROP POLICY IF EXISTS "super_admin_update_all"  ON public.profiles;
DROP POLICY IF EXISTS "super_admin_insert"      ON public.profiles;
DROP POLICY IF EXISTS "users_read_own"          ON public.profiles;
DROP POLICY IF EXISTS "users_update_own_name"   ON public.profiles;

-- SELECT: el propio perfil, o todos si eres super_admin activo.
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR public.is_super_admin()
  );

-- UPDATE: sólo tu fila (y por grants, sólo la columna full_name), o super_admin.
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR public.is_super_admin()
  )
  WITH CHECK (
    id = (SELECT auth.uid())
    OR public.is_super_admin()
  );

-- INSERT: defensa en profundidad. Hoy authenticated no tiene GRANT INSERT,
-- así que esta política no llega a evaluarse; queda para que un GRANT futuro
-- no abra un agujero.
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

-- DELETE: sin política → nadie borra vía anon/authenticated.
-- Las bajas van por service_role (auth.admin.deleteUser) y el perfil cae por
-- ON DELETE CASCADE, que la integridad referencial ejecuta sin evaluar RLS.

-- 7. Limpieza del trigger de alta automática (decisión: NO existe)
--    El rol lo fija SIEMPRE un super_admin desde POST /api/admin/users con
--    service_role. Nada lo deriva de raw_user_meta_data, que es controlable por
--    quien se registra. Un usuario creado a mano en el Dashboard queda sin perfil
--    y el guard del servidor (app/lib/supabase/guards.ts) lo trata como denegado.
DROP TRIGGER  IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- ==========================================
-- SEED: primer super_admin (paso manual, una sola vez)
-- ==========================================
-- 1) Supabase Dashboard > Authentication > Users > Add User
--      Email: admin@rtb.com   Password: (segura)   Auto Confirm: YES
-- 2) Copiar el UUID y ejecutar (SQL Editor, corre como postgres → sin RLS):
--
-- INSERT INTO public.profiles (id, full_name, role, is_active)
-- VALUES ('PEGAR-UUID-AQUI', 'Administrador RTB', 'super_admin', true);
--
-- 3) Authentication > Providers > Email: desactivar "Enable Sign Ups".
-- ==========================================
