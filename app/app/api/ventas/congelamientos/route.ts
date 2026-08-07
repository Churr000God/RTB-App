export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { congelamientoCreateSchema } from '@/lib/ventas/schemas';
import { rolesQuePueden } from '@/lib/ventas/permisos';

// GET - historial de congelamientos (activos y liberados) de cartera.
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const entidadId = searchParams.get('entidad_id');
    const estado = searchParams.get('estado');

    const supabase = createSupabaseServerClient();
    let query = supabase.from('cliente_congelamientos').select('*').order('congelado_at', { ascending: false });
    if (entidadId) query = query.eq('entidad_id', entidadId);
    if (estado) query = query.eq('estado', estado);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - Dirección/super_admin registra el congelamiento a mano (no hay
// cálculo automático de saldo vencido en esta entrega — ver 029).
export async function POST(request: Request) {
  try {
    const { response } = await requireApiRole(rolesQuePueden('cliente_congelamientos', 'insert'));
    if (response) return response;

    const parsed = congelamientoCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('cliente_congelamientos').insert(parsed.data).select('*').single();
    if (error) {
      const yaCongelado = /uq_cliente_cong_activo|duplicate key/i.test(error.message);
      return NextResponse.json(
        { error: yaCongelado ? 'Esta entidad ya tiene un congelamiento activo.' : error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
