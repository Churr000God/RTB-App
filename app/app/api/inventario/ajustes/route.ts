export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { ajusteCreateSchema } from '@/lib/inventario/schemas';

const PAGE_SIZE = 30;

// GET - bandeja de ajustes. RLS real: el solicitante ve los suyos;
// super_admin/direccion/almacen/compras ven todos (013).
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
      .from('inventario_ajustes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (estado) query = query.eq('estado', estado);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const pendientes = await supabase
      .from('inventario_ajustes')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'pendiente_autorizacion');

    return NextResponse.json({
      data: data ?? [],
      count: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
      kpis: { pendientes: pendientes.count ?? 0 },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - crea un ajuste en 'borrador' (CIE-AJU-01). Ni siquiera este
// endpoint puede nombrar estado/autorizador_id en el INSERT — el GRANT lo
// impide (013) — así que la fila nace en 'borrador' pase lo que pase.
export async function POST(request: Request) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'almacen', 'compras']);
    if (response) return response;

    const parsed = ajusteCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('inventario_ajustes').insert(parsed.data).select('id, folio').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true, id: data.id, folio: data.folio }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
