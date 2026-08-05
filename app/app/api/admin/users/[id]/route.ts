export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { USER_ROLES } from '@/types/database';

const updateSchema = z
  .object({
    full_name: z.string().trim().min(3, 'El nombre completo es obligatorio').max(120).optional(),
    role: z.enum(USER_ROLES, { errorMap: () => ({ message: 'Rol inválido' }) }).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** ¿Queda algún otro super_admin activo si tocamos a `targetId`? */
async function otherActiveSuperAdmins(admin: Admin, targetId: string) {
  const { count } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'super_admin')
    .eq('is_active', true)
    .neq('id', targetId);

  return count ?? 0;
}

// PATCH - editar perfil (super_admin activo)
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin']);
    if (response) return response;

    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
        { status: 400 }
      );
    }
    const updates = parsed.data;

    const targetId = params?.id ?? '';
    const admin = createSupabaseAdminClient();

    const { data: target } = await admin
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', targetId)
      .maybeSingle();

    if (!target) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const demoting =
      updates.role !== undefined && updates.role !== 'super_admin' && target.role === 'super_admin';
    const deactivating = updates.is_active === false && target.is_active === true;

    // 1) Nadie se degrada ni se desactiva a sí mismo.
    if (targetId === auth.userId && (demoting || deactivating)) {
      return NextResponse.json(
        {
          error:
            'No puedes cambiar tu propio rol de super_admin ni desactivar tu propia cuenta. Pídeselo a otro super_admin.',
        },
        { status: 400 }
      );
    }

    // 2) Siempre debe quedar al menos un super_admin activo.
    if (demoting || deactivating) {
      if ((await otherActiveSuperAdmins(admin, targetId)) === 0) {
        return NextResponse.json(
          { error: 'Debe existir al menos un super_admin activo en el sistema.' },
          { status: 409 }
        );
      }
    }

    // updated_at lo pone el trigger set_updated_at.
    const { error } = await admin.from('profiles').update(updates).eq('id', targetId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
