export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { redefinicionResolverSchema } from '@/lib/inventario/schemas';
import { clientIp, clientUserAgent } from '@/lib/entidades/http';

// POST - autorizar/rechazar una redefinición de unidad. estado/
// autorizador_id/autorizado_at están fuera del GRANT UPDATE (013): la
// resolución SIEMPRE pasa por aquí, con service_role.
// rum_no_autoaprobacion_chk hace estructuralmente imposible que el propio
// solicitante se autorice — este endpoint lo comprueba también en la API
// para devolver un mensaje de negocio claro antes del round-trip.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin', 'direccion']);
    if (response) return response;

    const parsed = redefinicionResolverSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    const { decision, motivo_rechazo } = parsed.data;

    const admin = createSupabaseAdminClient();
    const { data: redefinicion } = await admin
      .from('producto_unidad_redefiniciones')
      .select('*')
      .eq('id', params.id)
      .maybeSingle();

    if (!redefinicion) return NextResponse.json({ error: 'Redefinición no encontrada' }, { status: 404 });
    if (redefinicion.estado !== 'pendiente_autorizacion') {
      return NextResponse.json({ error: 'Esta redefinición ya fue resuelta.' }, { status: 409 });
    }
    if (redefinicion.solicitante_id === auth.userId) {
      return NextResponse.json({ error: 'No puedes autorizar tu propia solicitud.' }, { status: 403 });
    }

    const { error } = await admin
      .from('producto_unidad_redefiniciones')
      .update(
        decision === 'autorizar'
          ? { estado: 'autorizado', autorizador_id: auth.userId, autorizado_at: new Date().toISOString() }
          : { estado: 'rechazado' }
      )
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await admin.from('audit_log').insert({
      tabla: 'producto_unidad_redefiniciones',
      registro_id: params.id,
      accion: decision === 'autorizar' ? 'autorizacion' : 'rechazo',
      motivo: motivo_rechazo ?? redefinicion.motivo,
      usuario_id: auth.userId,
      ip: clientIp(request),
      user_agent: clientUserAgent(request),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
