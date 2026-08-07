export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';

const PAGE_SIZE = 50;

// GET - existencias por producto/ubicación, con filtros para las vistas
// reales que RTB ya usa hoy (sin ubicación, sin costo, teórico negativo,
// nunca contada) — los mismos cuatro índices parciales de
// 011_inventario_kardex.sql. Paginado (antes `.limit(500)` truncaba en
// silencio, sin decirlo — con los 1,388 SKU reales pendientes de cargar
// eso deja de alcanzar). `q` busca por código/nombre/SKU: como esas
// columnas viven en `productos`, no en `inventario_existencias`, se
// resuelve primero a una lista de producto_id (mismo patrón que
// /api/solicitudes-cambio con sus IDs polimórficos) en vez de forzar un
// filtro cruzado sobre el recurso embebido.
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const productoId = searchParams.get('producto_id');
    const ubicacionId = searchParams.get('ubicacion_id');
    const filtro = searchParams.get('filtro'); // sin_ubicacion | sin_costo | negativa | nunca_contada
    const q = searchParams.get('q')?.trim();
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const supabase = createSupabaseServerClient();

    let productoIds: string[] | null = null;
    if (q) {
      const like = `%${q.replace(/[%_]/g, '')}%`;
      const { data: productos, error: productosError } = await supabase
        .from('productos')
        .select('id')
        .or(`codigo_interno.ilike.${like},nombre.ilike.${like},sku.ilike.${like}`)
        .limit(1000);
      if (productosError) return NextResponse.json({ error: productosError.message }, { status: 500 });
      productoIds = (productos ?? []).map((p) => p.id);
      if (productoIds.length === 0) {
        return NextResponse.json({ data: [], count: 0, page, pageSize: PAGE_SIZE });
      }
    }

    let query = supabase
      .from('inventario_existencias')
      .select('*, productos(codigo_interno, nombre, sku)', { count: 'exact' })
      .order('fecha_ultimo_movimiento', { ascending: false, nullsFirst: false })
      .range(from, to);

    if (productoId) query = query.eq('producto_id', productoId);
    if (ubicacionId) query = query.eq('ubicacion_id', ubicacionId);
    if (productoIds) query = query.in('producto_id', productoIds);
    if (filtro === 'sin_ubicacion') query = query.is('ubicacion_id', null).neq('cantidad_teorica', 0);
    if (filtro === 'sin_costo') query = query.is('costo_promedio', null).neq('cantidad_teorica', 0);
    if (filtro === 'negativa') query = query.lt('cantidad_teorica', 0);
    if (filtro === 'nunca_contada') query = query.is('cantidad_fisica', null);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [], count: count ?? 0, page, pageSize: PAGE_SIZE });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
