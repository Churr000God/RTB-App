export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';

// GET - el veredicto único de cartera (cliente_puede_operar(), 029):
// normal | descongelada | excepcion_autorizada | en_revision | congelada
// | bloqueada. Se consulta antes de cotizar/aprobar/liberar, y la UI lo
// usa para pintar la alerta de cartera en la ficha de entidad.
export async function GET(_request: Request, { params }: { params: { entidadId: string } }) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('cliente_puede_operar', { p_entidad_id: params.entidadId });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
