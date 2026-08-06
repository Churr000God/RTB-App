export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { discrepanciaCreateSchema } from '@/lib/inventario/schemas';

const PAGE_SIZE = 30;

// GET - registro de discrepancias (CIE-DIS-01), filtrable por estado/producto/conteo.
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado');
    const productoId = searchParams.get('producto_id');
    const conteoId = searchParams.get('conteo_id');
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const supabase = createSupabaseServerClient();
    let query = supabase
      .from('inventario_discrepancias')
      .select('*, productos(codigo_interno, nombre)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (estado) query = query.eq('estado', estado);
    else query = query.in('estado', ['abierta', 'en_investigacion', 'con_causa']);
    if (productoId) query = query.eq('producto_id', productoId);
    if (conteoId) query = query.eq('conteo_id', conteoId);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const [abiertas] = await Promise.all([
      supabase.from('inventario_discrepancias').select('id', { count: 'exact', head: true }).in('estado', ['abierta', 'en_investigacion']),
    ]);

    return NextResponse.json({
      data: data ?? [],
      count: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
      kpis: { abiertas: abiertas.count ?? 0 },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - registra una discrepancia (habitualmente generada al conciliar un
// conteo, pero también capturable a mano — p.ej. hallazgo en piso sin
// conteo formal). Nace 'abierta' y sin resolución (estado/salida/ajuste_id/
// hallazgo_id/resuelto_*/par_confirmado_* fuera del GRANT INSERT, 013).
export async function POST(request: Request) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'almacen', 'compras']);
    if (response) return response;

    const parsed = discrepanciaCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('inventario_discrepancias').insert(parsed.data).select('id, folio').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true, id: data.id, folio: data.folio }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
