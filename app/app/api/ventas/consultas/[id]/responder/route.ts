export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { consultaResponderSchema } from '@/lib/ventas/schemas';
import { statusPorErrcode } from '@/lib/ventas/errores';
import { ROLES_RESPONDEN_CONSULTA } from '@/lib/ventas/permisos';

// POST - Compras responde con el producto (ya dado de alta por sus rutas
// normales) y el costo real. rpc ventas_consulta_responder() (030)
// propaga el producto a la(s) línea(s) que esperaban esta consulta, que
// quedan "en_consulta=true" todavía hasta que Ventas elija precio_origen.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(ROLES_RESPONDEN_CONSULTA);
    if (response) return response;

    const parsed = consultaResponderSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('ventas_consulta_responder', {
      p_consulta_id: params.id,
      p_producto_id: parsed.data.producto_id,
      p_costo_unitario: parsed.data.costo_unitario,
      p_moneda: parsed.data.moneda,
      p_plazo_entrega_dias: parsed.data.plazo_entrega_dias ?? null,
      p_disponibilidad: parsed.data.disponibilidad ?? null,
      p_proveedor_id: parsed.data.proveedor_id ?? null,
      p_notas_respuesta: parsed.data.notas_respuesta ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusPorErrcode(error.code) });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
