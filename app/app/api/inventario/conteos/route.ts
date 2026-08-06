export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { conteoCreateSchema } from '@/lib/inventario/schemas';

const PAGE_SIZE = 20;

// GET - listado de conteos + KPIs básicos.
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado');
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const supabase = createSupabaseServerClient();
    let query = supabase
      .from('inventario_conteos')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (estado) query = query.eq('estado', estado);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const [enCurso, pendientesCierre] = await Promise.all([
      supabase
        .from('inventario_conteos')
        .select('id', { count: 'exact', head: true })
        .in('estado', ['planificado', 'congelado', 'en_captura', 'en_conciliacion']),
      supabase.from('inventario_conteos').select('id', { count: 'exact', head: true }).eq('estado', 'cerrado'),
    ]);

    return NextResponse.json({
      data: data ?? [],
      count: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
      kpis: { enCurso: enCurso.count ?? 0, pendientesCierre: pendientesCierre.count ?? 0 },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - planifica un conteo. Nace en 'planificado' (estado no está en el
// GRANT INSERT de 012); recorre la máquina de estados sólo por UPDATE.
export async function POST(request: Request) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'almacen']);
    if (response) return response;

    const parsed = conteoCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('inventario_conteos').insert(parsed.data).select('id, folio').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true, id: data.id, folio: data.folio }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
