export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';

// GET - cola de redefiniciones de unidad, opcionalmente filtrada por
// producto o estado. Vista centralizada para autorización (POST/creación
// contextual vive en /api/productos/[id]/redefinir-unidad).
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const productoId = searchParams.get('producto_id');
    const estado = searchParams.get('estado');

    const supabase = createSupabaseServerClient();
    let query = supabase
      .from('producto_unidad_redefiniciones')
      .select('*, productos(codigo_interno, nombre)')
      .order('created_at', { ascending: false });
    if (productoId) query = query.eq('producto_id', productoId);
    if (estado) query = query.eq('estado', estado);
    else query = query.eq('estado', 'pendiente_autorizacion');

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
