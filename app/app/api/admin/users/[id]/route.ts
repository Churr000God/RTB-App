export const dynamic = 'force-dynamic';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// PATCH - update user profile (super_admin only)
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (adminProfile?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
    }

    const body = await request.json();
    const updates: Record<string, any> = {};

    if (body?.full_name !== undefined) updates.full_name = body.full_name;
    if (body?.role !== undefined) {
      const validRoles = ['super_admin', 'direccion', 'ventas', 'compras', 'almacen', 'logistica', 'facturacion', 'finanzas'];
      if (!validRoles.includes(body.role)) {
        return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
      }
      updates.role = body.role;
    }
    if (body?.is_active !== undefined) updates.is_active = body.is_active;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', params?.id ?? '');

    if (error) {
      return NextResponse.json({ error: error?.message ?? 'Error al actualizar' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
