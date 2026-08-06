export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';

// GET - líneas de captura, VISTA CIEGA REAL: usa el cliente del propio
// usuario (RLS + GRANT SELECT por columna), así que select('*') aquí
// simplemente NO trae cantidad_teorica/diferencia/valor_diferencia/
// costo_unitario_snapshot/costo_origen para un capturista — no es un
// filtro de esta ruta, es un privilegio de Postgres (012). Para la
// conciliación con teórico visible usar /conciliacion.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const ubicacionId = searchParams.get('ubicacion_id');
    const estadoConteo = searchParams.get('estado_conteo');

    const supabase = createSupabaseServerClient();
    let query = supabase
      .from('inventario_conteo_detalles')
      .select('*, productos(codigo_interno, nombre, sku)')
      .eq('conteo_id', params.id)
      .order('created_at', { ascending: true });
    if (ubicacionId) query = query.eq('ubicacion_id', ubicacionId);
    if (estadoConteo) query = query.eq('estado_conteo', estadoConteo);

    const { data, error } = await query.limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
