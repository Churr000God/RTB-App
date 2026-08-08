export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { ACCESO_PANTALLA } from '@/lib/ventas/permisos';

// GET - detalle de un pedido con sus líneas (copia inmutable del snapshot).
// Trae la NR (Vía A) o la PO con sus partidas (Vía B, 043) según
// `pedido.via` — nunca ambas: sólo una existe por diseño. La PO viaja con
// sus partidas para que pedido-detalle.tsx pueda ofrecer el despacho de
// Vía B sin una segunda petición.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(ACCESO_PANTALLA.pedidos);
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

    const [{ data: notaRemision }, { data: ordenCompra }] = await Promise.all([
      pedido.via === 'orden_compra'
        ? Promise.resolve({ data: null })
        : supabase.from('ventas_notas_remision').select('id, folio, estado').eq('pedido_id', params.id).maybeSingle(),
      pedido.via === 'orden_compra'
        ? supabase
            .from('ventas_ordenes_compra_cliente')
            // Hint de FK explícito obligatorio desde 043 (segunda FK
            // compuesta po_id+pedido_id entre estas tablas — ver mismo
            // comentario en pedidos/[id]/page.tsx).
            .select(
              '*, partidas:ventas_po_partidas!ventas_po_partidas_po_id_fkey(*, productos(codigo_interno, nombre))'
            )
            .eq('pedido_id', params.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return NextResponse.json({
      data: { ...pedido, lineas: lineas ?? [], nota_remision: notaRemision ?? null, orden_compra: ordenCompra ?? null },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
