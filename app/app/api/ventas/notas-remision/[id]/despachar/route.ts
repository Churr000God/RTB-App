export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { nrDespacharSchema } from '@/lib/ventas/schemas';
import { statusPorErrcode } from '@/lib/ventas/errores';
import { ROLES_DESPACHAN } from '@/lib/ventas/permisos';

// POST - despacha una o varias líneas: inserta el movimiento de kardex
// (salida_venta) y consume/parte el apartado comprometido, todo en una
// transacción (ventas_nr_despachar(), 032). Un despacho parcial deja el
// remanente como apartado nuevo — nunca se pierde cobertura.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(ROLES_DESPACHAN);
    if (response) return response;

    const parsed = nrDespacharSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('ventas_nr_despachar', {
      p_nr_id: params.id,
      p_lineas: parsed.data.lineas,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusPorErrcode(error.code) });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
