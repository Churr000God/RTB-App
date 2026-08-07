export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';

// GET - detalle de un pedido con sus líneas (copia inmutable del snapshot).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data: pedido, error } = await supabase.from('ventas_pedidos').select('*').eq('id', params.id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });

    const { data: lineas, error: errorLineas } = await supabase
      .from('ventas_pedido_lineas')
      .select('*, productos(codigo_interno, nombre)')
      .eq('pedido_id', params.id);
    if (errorLineas) return NextResponse.json({ error: errorLineas.message }, { status: 500 });

    const { data: notaRemision } = await supabase
      .from('ventas_notas_remision')
      .select('id, folio, estado')
      .eq('pedido_id', params.id)
      .maybeSingle();

    return NextResponse.json({ data: { ...pedido, lineas: lineas ?? [], nota_remision: notaRemision ?? null } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
