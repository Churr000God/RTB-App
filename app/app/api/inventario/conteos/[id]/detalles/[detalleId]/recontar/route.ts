export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { conteoRecuentoSchema } from '@/lib/inventario/schemas';

// PATCH - registra un recuento sobre una línea ya contada. Marca
// estado_conteo='recontada'; recontado_por/recontado_at los estampa el
// trigger (012).
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; detalleId: string } }
) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'almacen']);
    if (response) return response;

    const parsed = conteoRecuentoSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('inventario_conteo_detalles')
      .update({
        estado_conteo: 'recontada',
        cantidad_fisica_recuento: parsed.data.cantidad_fisica_recuento,
        cantidad_fisica: parsed.data.cantidad_fisica_recuento,
      })
      .eq('id', params.detalleId)
      .eq('conteo_id', params.id)
      .select('id');

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'No puedes recontar esta línea.' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
