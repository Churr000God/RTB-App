export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';

// GET - detalle de una NR: líneas, cobertura de PO agregada
// (ventas_nr_cobertura, 034) e historial de seguimiento.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data: nr, error } = await supabase
      .from('ventas_notas_remision')
      .select('*')
      .eq('id', params.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!nr) return NextResponse.json({ error: 'NR no encontrada' }, { status: 404 });

    const [{ data: lineas, error: errorLineas }, { data: cobertura }, { data: seguimientos }] = await Promise.all([
      supabase.from('ventas_nr_lineas').select('*, productos(codigo_interno, nombre)').eq('nr_id', params.id),
      supabase.rpc('ventas_nr_cobertura', { p_nr_id: params.id }),
      supabase
        .from('ventas_nr_seguimientos')
        .select('*')
        .eq('nr_id', params.id)
        .order('created_at', { ascending: false }),
    ]);
    if (errorLineas) return NextResponse.json({ error: errorLineas.message }, { status: 500 });

    return NextResponse.json({
      data: { ...nr, lineas: lineas ?? [], cobertura: cobertura ?? null, seguimientos: seguimientos ?? [] },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
