export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { statusPorErrcode } from '@/lib/ventas/errores';

// POST - emite la NR (Vía A, RTB-PRO-VEN-01 §II Paso 5-A.1). Sólo antes
// de liberar el pedido a Almacén (ventas_nr_emitir(), 032). Una NR por
// pedido — llamar dos veces devuelve 42501.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'ventas']);
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('ventas_nr_emitir', { p_pedido_id: params.id });
    if (error) return NextResponse.json({ error: error.message }, { status: statusPorErrcode(error.code) });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
