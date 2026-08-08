export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { cotizacionCancelarSchema } from '@/lib/ventas/schemas';
import { statusPorErrcode } from '@/lib/ventas/errores';
import { rolesQuePueden } from '@/lib/ventas/permisos';

// POST - cancela una cotización APROBADA (ventas_cotizacion_cancelar, 040).
// Ya no acepta borrador/enviada: un borrador se elimina
// (.../[id]/eliminar), una enviada se rechaza (.../[id]/rechazar). Si el
// pedido asociado ya muestra alguna entrega (total o parcial), la función
// NO cancela — abre una devolución y lo indica en `resultado`. El jsonb de
// la función se esparce directo en la respuesta (no anidado bajo `data`)
// para que el cliente lea `resultado`/`devolucion_folio`/`valor_entregado`
// sin un nivel extra.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(rolesQuePueden('cotizaciones', 'update'));
    if (response) return response;

    const parsed = cotizacionCancelarSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('ventas_cotizacion_cancelar', {
      p_cotizacion_id: params.id,
      p_motivo: parsed.data.motivo,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusPorErrcode(error.code) });

    return NextResponse.json({ ...data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
