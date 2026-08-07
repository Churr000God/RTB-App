export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { excepcionCreateSchema } from '@/lib/ventas/schemas';
import { rolesQuePueden } from '@/lib/ventas/permisos';

// GET - excepciones de cartera (pendientes/autorizadas/rechazadas).
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const entidadId = searchParams.get('entidad_id');
    const estado = searchParams.get('estado');

    const supabase = createSupabaseServerClient();
    let query = supabase.from('cliente_excepciones').select('*').order('created_at', { ascending: false });
    if (entidadId) query = query.eq('entidad_id', entidadId);
    if (estado) query = query.eq('estado', estado);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - 'ventas' puede SOLICITAR la excepción pese a estar la cuenta
// congelada (documento §12 del dueño del proyecto). estado/autorizador_id/
// autorizado_at quedan fuera del GRANT INSERT (029) — la resolución va por
// /api/ventas/excepciones/[id]/resolver con service_role.
export async function POST(request: Request) {
  try {
    const { response } = await requireApiRole(rolesQuePueden('cliente_excepciones', 'insert'));
    if (response) return response;

    const parsed = excepcionCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('cliente_excepciones').insert(parsed.data).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
