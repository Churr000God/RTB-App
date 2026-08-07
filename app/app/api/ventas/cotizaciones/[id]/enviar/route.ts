export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { statusPorErrcode } from '@/lib/ventas/errores';

// POST - envía la cotización al cliente. rpc ventas_cotizacion_enviar()
// (030) valida: dueño de la cotización (si eres 'ventas'), vigencia
// definida, al menos una línea activa, ninguna línea en consulta con
// Compras, y que el cliente pueda operar. Cliente del USUARIO, nunca
// admin — auth.uid() debe resolver al actor real.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'ventas']);
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('ventas_cotizacion_enviar', { p_cotizacion_id: params.id });
    if (error) return NextResponse.json({ error: error.message }, { status: statusPorErrcode(error.code) });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
