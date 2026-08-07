export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { ventasAutorizacionCreateSchema } from '@/lib/ventas/schemas';
import { rolesQuePueden } from '@/lib/ventas/permisos';

// GET - bandeja de autorizaciones (excepción de subtotal, código
// divergente, duplicidad confirmada, corrección de documento).
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado');

    const supabase = createSupabaseServerClient();
    let query = supabase.from('ventas_autorizaciones').select('*').order('created_at', { ascending: false });
    if (estado) query = query.eq('estado', estado);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - solicita una autorización. estado/autorizador_id/autorizado_at
// quedan fuera del GRANT INSERT (033) — sólo ventas_autorizacion_resolver()
// los escribe.
export async function POST(request: Request) {
  try {
    const { response } = await requireApiRole(rolesQuePueden('ventas_autorizaciones', 'insert'));
    if (response) return response;

    const parsed = ventasAutorizacionCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('ventas_autorizaciones').insert(parsed.data).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
