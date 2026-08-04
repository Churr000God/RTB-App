export const dynamic = 'force-dynamic';

import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET - list all profiles (super_admin only)
export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Check role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
    }

    // Get all profiles
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error?.message }, { status: 500 });
    }

    // Get emails from auth.users via admin client
    const adminClient = createSupabaseAdminClient();
    const { data: authUsers } = await adminClient.auth.admin.listUsers();
    const emailMap: Record<string, string> = {};
    (authUsers?.users ?? []).forEach((u: any) => {
      emailMap[u?.id ?? ''] = u?.email ?? '';
    });

    const enriched = (profiles ?? []).map((p: any) => ({
      ...(p ?? {}),
      email: emailMap[p?.id ?? ''] ?? '',
    }));

    return NextResponse.json(enriched);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - create new user (super_admin only)
export async function POST(request: Request) {
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
    const { email, password, full_name, role } = body ?? {};

    if (!email || !password || !full_name || !role) {
      return NextResponse.json({ error: 'Todos los campos son obligatorios' }, { status: 400 });
    }

    const validRoles = ['super_admin', 'direccion', 'ventas', 'compras', 'almacen', 'logistica', 'facturacion', 'finanzas'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
    }

    // Create user in Supabase Auth via admin
    const adminClient = createSupabaseAdminClient();
    const { data: newAuthUser, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return NextResponse.json({ error: authError?.message ?? 'Error al crear usuario' }, { status: 400 });
    }

    // Create profile
    const { error: profileError } = await supabase.from('profiles').insert({
      id: newAuthUser?.user?.id,
      full_name,
      role,
      is_active: true,
    });

    if (profileError) {
      // Rollback auth user
      await adminClient.auth.admin.deleteUser(newAuthUser?.user?.id ?? '');
      return NextResponse.json({ error: profileError?.message ?? 'Error al crear perfil' }, { status: 400 });
    }

    return NextResponse.json({ success: true, id: newAuthUser?.user?.id });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
