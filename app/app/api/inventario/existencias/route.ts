export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';

// GET - existencias por producto/ubicación, con filtros para las vistas
// reales que RTB ya usa hoy (sin ubicación, sin costo, teórico negativo,
// nunca contada) — los mismos cuatro índices parciales de
// 011_inventario_kardex.sql.
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const productoId = searchParams.get('producto_id');
    const ubicacionId = searchParams.get('ubicacion_id');
    const filtro = searchParams.get('filtro'); // sin_ubicacion | sin_costo | negativa | nunca_contada

    const supabase = createSupabaseServerClient();
    let query = supabase
      .from('inventario_existencias')
      .select('*, productos(codigo_interno, nombre, sku)', { count: 'exact' })
      .order('fecha_ultimo_movimiento', { ascending: false, nullsFirst: false });

    if (productoId) query = query.eq('producto_id', productoId);
    if (ubicacionId) query = query.eq('ubicacion_id', ubicacionId);
    if (filtro === 'sin_ubicacion') query = query.is('ubicacion_id', null).neq('cantidad_teorica', 0);
    if (filtro === 'sin_costo') query = query.is('costo_promedio', null).neq('cantidad_teorica', 0);
    if (filtro === 'negativa') query = query.lt('cantidad_teorica', 0);
    if (filtro === 'nunca_contada') query = query.is('cantidad_fisica', null);

    const { data, error, count } = await query.limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [], count: count ?? 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
