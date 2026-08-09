export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { vinculoCancelarSchema } from '@/lib/ventas/schemas';
import { statusPorErrcode } from '@/lib/ventas/errores';
import { ROLES_CANCELAN_VINCULO } from '@/lib/ventas/permisos';

// POST - cancela un vínculo PO↔NR de respaldo (ventas_vinculo_cancelar(),
// restaurada en 048 — existía antes de 043, dropeada con el resto de la Vía
// A original). Nunca borra la fila; recalcula PO y NR hacia atrás. [id] de
// la PO no se usa en la RPC (el vínculo ya sabe a qué PO/NR pertenece) pero
// se conserva en la ruta para que el detalle de la PO llame con su propio
// contexto, igual que antes de 043.
export async function POST(
  request: Request,
  { params }: { params: { id: string; vinculoId: string } }
) {
  try {
    const { response } = await requireApiRole(ROLES_CANCELAN_VINCULO);
    if (response) return response;

    const parsed = vinculoCancelarSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('ventas_vinculo_cancelar', {
      p_vinculo_id: params.vinculoId,
      p_motivo: parsed.data.motivo,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusPorErrcode(error.code) });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
