export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { USER_ROLES } from '@/types/database';

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo electrónico inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  full_name: z.string().trim().min(3, 'El nombre completo es obligatorio').max(120),
  role: z.enum(USER_ROLES, { errorMap: () => ({ message: 'Rol inválido' }) }),
});

/** listUsers() pagina de 50 en 50 por defecto: hay que recorrerlo entero. */
async function fetchEmailMap(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const emails = new Map<string, string>();
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users ?? [];
    users.forEach((u) => emails.set(u.id, u.email ?? ''));
    if (users.length < perPage) break;
  }

  return emails;
}

// GET - listado (super_admin activo)
export async function GET() {
  try {
    const { response } = await requireApiRole(['super_admin']);
    if (response) return response;

    // Cliente de usuario a propósito: la lectura pasa por RLS (is_super_admin()).
    const supabase = createSupabaseServerClient();
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const emails = await fetchEmailMap(createSupabaseAdminClient());

    return NextResponse.json(
      (profiles ?? []).map((p: any) => ({ ...p, email: emails.get(p.id) ?? '' }))
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - alta (super_admin activo)
export async function POST(request: Request) {
  try {
    const { response } = await requireApiRole(['super_admin']);
    if (response) return response;

    const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
        { status: 400 }
      );
    }
    const { email, password, full_name, role } = parsed.data;

    const admin = createSupabaseAdminClient();

    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !created?.user) {
      const duplicate = /already (been )?registered|already exists/i.test(authError?.message ?? '');
      return NextResponse.json(
        {
          error: duplicate
            ? 'Ya existe un usuario con ese correo.'
            : authError?.message ?? 'Error al crear usuario',
        },
        { status: 400 }
      );
    }

    // Única creación del perfil: no existe trigger on_auth_user_created (ver
    // migración 001). Va con el cliente admin porque `authenticated` no tiene
    // GRANT INSERT sobre profiles.
    const { error: profileError } = await admin
      .from('profiles')
      .insert({ id: created.user.id, full_name, role, is_active: true });

    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id); // rollback
      return NextResponse.json(
        { error: 'No se pudo crear el perfil; la operación fue revertida.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, id: created.user.id }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
