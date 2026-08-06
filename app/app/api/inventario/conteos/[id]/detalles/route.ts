export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { CONTEO_DETALLE_COLUMNAS_CAPTURA } from '@/lib/inventario/config';

// GET - líneas de captura, VISTA CIEGA REAL: usa el cliente del propio
// usuario (RLS + GRANT SELECT por columna). `select('*')` exige SELECT
// sobre TODAS las columnas de la tabla y por eso fallaba con
// `permission denied for table` para cualquier rol (E-02,
// contexto/AUDITORIA_QA_ROLES_2026-08-06.md) — el GRANT sí existe, sólo
// que restringido a 21 de 28 columnas (CONTEO_DETALLE_COLUMNAS_CAPTURA,
// espejo exacto de 012). Pedir esa lista explícita, en vez de `*`, es la
// corrección: NO se amplía el GRANT, porque eso expondría
// cantidad_teorica/diferencia al capturista y rompería la vista ciega.
// Para la conciliación con teórico visible usar /conciliacion.
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
      .select(`${CONTEO_DETALLE_COLUMNAS_CAPTURA}, productos(codigo_interno, nombre, sku, unidad_contenido_id)`)
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
