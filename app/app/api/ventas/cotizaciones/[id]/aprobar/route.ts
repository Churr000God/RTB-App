export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { cotizacionAprobarSchema } from '@/lib/ventas/schemas';
import { statusPorErrcode, mensajeErrorPo } from '@/lib/ventas/errores';

// POST - aprueba la cotización: evidencia + pedido + N líneas + N
// apartados de reserva, TODO en una sola transacción
// (ventas_cotizacion_aprobar(), 031/043/044). El body es la evidencia de
// aprobación (canal/adjunto/datos faltantes) más, si `via==='orden_compra'`
// (Vía B, 043), los datos de la PO del cliente — nunca precios ni
// cantidades, esos ya vienen de la cotización.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    // gerente_comercial faltaba aquí (bug preexistente, 037): la función
    // SQL ya lo acepta desde esa migración, la ruta se había quedado atrás.
    const { response } = await requireApiRole(['super_admin', 'direccion', 'gerente_comercial', 'ventas']);
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
    if (error) {
      // El precheck de duplicado dentro de ventas_cotizacion_aprobar() ya da
      // un 22023 legible; mensajeErrorPo() es sólo la red de seguridad ante
      // una carrera real contra uq_po_numero (23505 crudo).
      return NextResponse.json({ error: mensajeErrorPo(error.message) }, { status: statusPorErrcode(error.code) });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
