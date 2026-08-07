export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { cotizacionAprobarSchema } from '@/lib/ventas/schemas';
import { statusPorErrcode } from '@/lib/ventas/errores';

// POST - aprueba la cotización: evidencia + pedido + N líneas + N
// apartados de reserva, TODO en una sola transacción
// (ventas_cotizacion_aprobar(), 031). El body es la evidencia de
// aprobación (canal/adjunto/datos faltantes) — nunca precios ni cantidades.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'ventas']);
    if (response) return response;

    const parsed = cotizacionAprobarSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('ventas_cotizacion_aprobar', {
      p_cotizacion_id: params.id,
      p_aprobacion: parsed.data,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusPorErrcode(error.code) });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
