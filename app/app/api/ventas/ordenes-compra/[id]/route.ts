export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { ACCESO_PANTALLA } from '@/lib/ventas/permisos';

// GET - detalle de una PO con sus partidas y los vínculos ya creados
// (para la tabla comparativa snapshot vs. PO en la pantalla de validación).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(ACCESO_PANTALLA.ordenes_compra);
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data: po, error } = await supabase
      .from('ventas_ordenes_compra_cliente')
      .select('*')
      .eq('id', params.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!po) return NextResponse.json({ error: 'PO no encontrada' }, { status: 404 });

    const { data: partidas, error: errorPartidas } = await supabase
      .from('ventas_po_partidas')
      .select('*')
      .eq('po_id', params.id)
      .order('linea_numero', { ascending: true });
    if (errorPartidas) return NextResponse.json({ error: errorPartidas.message }, { status: 500 });

    const partidaIds = (partidas ?? []).map((p) => p.id);
    const { data: vinculos } = partidaIds.length
      ? await supabase.from('ventas_po_nr_vinculos').select('*').in('po_partida_id', partidaIds)
      : { data: [] as any[] };

    return NextResponse.json({ data: { ...po, partidas: partidas ?? [], vinculos: vinculos ?? [] } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
