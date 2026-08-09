export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { poAmpliarSchema } from '@/lib/ventas/schemas';
import { statusPorErrcode } from '@/lib/ventas/errores';
import { ROLES_REGISTRAN_PO } from '@/lib/ventas/permisos';

// POST - solicita agregar más NR/partidas a una PO ya creada
// (ventas_po_ampliar(), Vía A — 048). No materializa nada: congela la PO en
// 'pendiente_de_autorizacion' hasta que Dirección resuelva la autorización
// desde /dashboard/ventas/autorizaciones (mismo flujo genérico que ya
// existe, sin pantalla nueva).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(ROLES_REGISTRAN_PO);
    if (response) return response;

    const parsed = poAmpliarSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const { motivo, ...payload } = parsed.data;
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('ventas_po_ampliar', {
      p_po_id: params.id,
      p_payload: payload,
      p_motivo: motivo,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusPorErrcode(error.code) });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
