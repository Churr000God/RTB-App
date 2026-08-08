export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { statusPorErrcode } from '@/lib/ventas/errores';
import { rolesQuePueden } from '@/lib/ventas/permisos';

// POST - borra una cotización en borrador de verdad (DELETE real, 040):
// ventas_cotizacion_eliminar() borra sus líneas y desliga/cancela
// cualquier consulta a Compras ligada, todo en una sola transacción — el
// cliente nunca hace estos pasos por separado. Verbo POST (no DELETE HTTP)
// por consistencia con el resto de acciones de este recurso
// (enviar/rechazar/cancelar/aprobar son todas POST subrutas).
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(rolesQuePueden('cotizaciones', 'delete'));
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('ventas_cotizacion_eliminar', { p_cotizacion_id: params.id });
    if (error) return NextResponse.json({ error: error.message }, { status: statusPorErrcode(error.code) });

    return NextResponse.json({ ...data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
