export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { conteoDetalleCapturaSchema } from '@/lib/inventario/schemas';

// PATCH - captura de una línea (vista ciega: el payload no incluye
// cantidad_teorica porque conteoDetalleCapturaSchema ni lo modela).
// contado_por/contado_at los estampa conteo_detalles_before_update() (012).
// La RLS real sólo deja escribir a 'almacen' dentro de su propia
// asignación activa y con el conteo en 'en_captura' — el error de Postgres
// para eso es un 42501/0 filas afectadas, sin mensaje propio, así que se
// traduce aquí.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; detalleId: string } }
) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'almacen']);
    if (response) return response;

    const parsed = conteoDetalleCapturaSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const payload: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.estado_conteo === 'no_localizada') payload.cantidad_capturada = 0;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('inventario_conteo_detalles')
      .update(payload)
      .eq('id', params.detalleId)
      .eq('conteo_id', params.id)
      .select('id');

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'No puedes capturar esta línea: no está en tu asignación activa o el conteo no está en captura.' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
