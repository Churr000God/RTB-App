-- ==========================================
-- RTB Sistema — Migración de Base de Datos
-- Ejecutar en el SQL Editor de Supabase
-- ==========================================

-- 1. Tabla de perfiles (extiende auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (
    role IN (
      'super_admin', 'direccion', 'ventas', 'compras',
      'almacen', 'logistica', 'facturacion', 'finanzas'
    )
  ),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles(is_active);

-- 3. Trigger para updated_at automático
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON public.profiles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 4. Habilitar RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 5. Políticas RLS

-- super_admin puede leer todos los perfiles
CREATE POLICY "super_admin_read_all" ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- super_admin puede actualizar todos los perfiles
CREATE POLICY "super_admin_update_all" ON public.profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- super_admin puede insertar perfiles
CREATE POLICY "super_admin_insert" ON public.profiles
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- Cada usuario puede leer su propio perfil
CREATE POLICY "users_read_own" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Cada usuario puede actualizar su propio nombre (pero NO su rol ni is_active)
CREATE POLICY "users_update_own_name" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    AND is_active = (SELECT is_active FROM public.profiles WHERE id = auth.uid())
  );

-- 6. Trigger para crear perfil automáticamente al registrar usuario
-- (Opcional: solo si se quiere automatizar desde auth)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Sin nombre'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'ventas'),
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- SEED: Usuario super_admin inicial
-- ==========================================
-- NOTA: Primero crea el usuario manualmente en:
-- Supabase Dashboard > Authentication > Users > Add User
--   Email: admin@rtb.com (o el correo que prefieras)
--   Password: (tu contraseña segura)
--   Auto Confirm: YES
--
-- Después, copia el UUID del usuario creado y ejecuta:
--
-- INSERT INTO public.profiles (id, full_name, role, is_active)
-- VALUES (
--   'PEGAR-UUID-AQUI',
--   'Administrador RTB',
--   'super_admin',
--   true
-- );
-- ==========================================
