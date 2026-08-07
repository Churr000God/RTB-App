export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';

// GET - listado de pedidos (nace únicamente por ventas_cotizacion_aprobar()).
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado');
    const entidadId = searchParams.get('entidad_id');

    const supabase = createSupabaseServerClient();
    let query = supabase.from('ventas_pedidos').select('*').order('created_at', { ascending: false });
    if (estado) query = query.eq('estado', estado);
    if (entidadId) query = query.eq('entidad_id', entidadId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
