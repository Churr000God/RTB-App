export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { ACCESO_PANTALLA } from '@/lib/ventas/permisos';

const PAGE_SIZE = 20;

// GET - listado de pedidos (nace únicamente por ventas_cotizacion_aprobar()),
// paginado. Embed de entidades: aditivo, ver mismo criterio en ordenes-compra.
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole(ACCESO_PANTALLA.pedidos);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado');
    const entidadId = searchParams.get('entidad_id');
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const supabase = createSupabaseServerClient();
    let query = supabase
      .from('ventas_pedidos')
      .select('*, entidades(nombre_comercial, nombre_legal)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (estado) query = query.eq('estado', estado);
    if (entidadId) query = query.eq('entidad_id', entidadId);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [], count: count ?? 0, page, pageSize: PAGE_SIZE });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
