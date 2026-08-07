export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { ventasAutorizacionResolverSchema } from '@/lib/ventas/schemas';
import { statusPorErrcode } from '@/lib/ventas/errores';
import { ROLES_AUTORIZAN } from '@/lib/ventas/permisos';

// POST - aprueba/rechaza. ventas_autorizacion_resolver() (033) exige que
// el aprobador no sea el propio solicitante (CHECK + comprobación en la
// función) — mismo patrón que /api/solicitudes-cambio/[id]/resolver.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(ROLES_AUTORIZAN);
    if (response) return response;

    const parsed = ventasAutorizacionResolverSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('ventas_autorizacion_resolver', {
      p_id: params.id,
      p_aprobar: parsed.data.decision === 'aprobar',
      p_comentario: parsed.data.comentario_resolucion ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusPorErrcode(error.code) });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
