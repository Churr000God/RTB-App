export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { devolucionResolverSchema } from '@/lib/ventas/schemas';
import { statusPorErrcode } from '@/lib/ventas/errores';
import { rolesQuePueden } from '@/lib/ventas/permisos';

// POST - marca una devolución como resuelta (ventas_devolucion_resolver,
// 040). Sin GRANT UPDATE para authenticated sobre ventas_devoluciones —
// sólo esta función la escribe. No devuelve la cotización/pedido a
// 'cancelada'/'cancelado': 'en_devolucion' es su estado final mientras no
// exista Facturación (RTB-PRO-FAC-01).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(rolesQuePueden('devoluciones', 'update'));
    if (response) return response;

    const parsed = devolucionResolverSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('ventas_devolucion_resolver', {
      p_devolucion_id: params.id,
      p_notas: parsed.data.notas,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusPorErrcode(error.code) });

    return NextResponse.json({ ...data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
