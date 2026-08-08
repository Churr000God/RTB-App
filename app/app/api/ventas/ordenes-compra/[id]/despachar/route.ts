export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { poDespacharSchema } from '@/lib/ventas/schemas';
import { statusPorErrcode } from '@/lib/ventas/errores';
import { ROLES_DESPACHAN } from '@/lib/ventas/permisos';

// POST - surte partidas de la PO al kardex (ventas_po_despachar(), 044) —
// espejo de POST /api/ventas/notas-remision/[id]/despachar para la Vía B.
// El pedido debe estar liberado a Almacén primero (mismo requisito que la
// NR). ROLES_DESPACHAN es el mismo conjunto que gatea ventas_nr_despachar()
// — Almacén llega aquí desde el detalle del pedido, no desde esta pantalla.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(ROLES_DESPACHAN);
    if (response) return response;

    const parsed = poDespacharSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('ventas_po_despachar', {
      p_po_id: params.id,
      p_lineas: parsed.data.lineas,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusPorErrcode(error.code) });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
