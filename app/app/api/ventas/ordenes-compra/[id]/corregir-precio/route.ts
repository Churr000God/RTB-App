export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { poCorregirPrecioSchema } from '@/lib/ventas/schemas';
import { statusPorErrcode } from '@/lib/ventas/errores';
import { ROLES_REGISTRAN_PO } from '@/lib/ventas/permisos';

// POST - único camino de salida cuando una autorización de
// precio_po_divergente fue RECHAZADA (ventas_po_corregir_precio(), 048).
// Si tras corregir ya no hay divergencia, descongela sola; si la sigue
// habiendo, crea otra autorización de precio y la PO se queda congelada.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(ROLES_REGISTRAN_PO);
    if (response) return response;

    const parsed = poCorregirPrecioSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('ventas_po_corregir_precio', {
      p_po_id: params.id,
      p_partidas: parsed.data.partidas,
      p_motivo: parsed.data.motivo,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusPorErrcode(error.code) });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
