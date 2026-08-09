export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { statusPorErrcode } from '@/lib/ventas/errores';
import { ROLES_LIBERAN_ALMACEN } from '@/lib/ventas/permisos';

// POST - libera una PO a Almacén (ventas_po_liberar_almacen(), Vía A —
// 048): promueve reserva→compromiso los apartados propios de la PO (caso N,
// sin pedido) y, para cada pedido distinto que sus partidas de compromiso
// referencien (caso C), reutiliza ventas_pedido_liberar_almacen() — un solo
// botón para la PO mixta. Sin cuerpo.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(ROLES_LIBERAN_ALMACEN);
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('ventas_po_liberar_almacen', { p_po_id: params.id });
    if (error) return NextResponse.json({ error: error.message }, { status: statusPorErrcode(error.code) });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
