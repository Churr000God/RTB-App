export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { poValidarSchema } from '@/lib/ventas/schemas';
import { statusPorErrcode } from '@/lib/ventas/errores';

// POST - el cruce de precios (ventas_po_validar(), 033): moneda → RFC →
// costo unitario (una sola partida divergente bloquea TODA la PO, sin
// excepción) → subtotal coincidente (requiere autorizacion_id vigente) →
// código divergente (aceptar_codigo_divergente) → duplicidad. La
// respuesta puede ser {success:false, motivo, mensaje} sin que sea un
// error HTTP — es un resultado de negocio válido (PO bloqueada/rechazada).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'ventas']);
    if (response) return response;

    const parsed = poValidarSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('ventas_po_validar', {
      p_po_id: params.id,
      p_vinculos: parsed.data.vinculos,
      p_autorizacion_id: parsed.data.autorizacion_id ?? null,
      p_aceptar_codigo_divergente: parsed.data.aceptar_codigo_divergente,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusPorErrcode(error.code) });

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
