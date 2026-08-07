export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { excepcionResolverSchema } from '@/lib/ventas/schemas';
import { clientIp, clientUserAgent } from '@/lib/entidades/http';

// POST - resuelve una excepción de cartera. Sin GRANT UPDATE para
// authenticated sobre cliente_excepciones (029): la resolución pasa
// siempre por aquí, con service_role, mismo patrón que
// /api/solicitudes-cambio/[id]/resolver — quien aprueba NUNCA puede ser
// quien solicitó.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin', 'direccion']);
    if (response) return response;

    const parsed = excepcionResolverSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    const { decision, comentario_resolucion } = parsed.data;

    const admin = createSupabaseAdminClient();
    const { data: excepcion } = await admin.from('cliente_excepciones').select('*').eq('id', params.id).maybeSingle();
    if (!excepcion) return NextResponse.json({ error: 'Excepción no encontrada' }, { status: 404 });
    if (excepcion.estado !== 'pendiente') {
      return NextResponse.json({ error: 'Esta excepción ya fue resuelta.' }, { status: 409 });
    }
    if (excepcion.solicitante_id === auth.userId) {
      return NextResponse.json({ error: 'No puedes resolver tu propia solicitud.' }, { status: 403 });
    }

    const { error } = await admin
      .from('cliente_excepciones')
      .update({
        estado: decision === 'aprobar' ? 'autorizada' : 'rechazada',
        autorizador_id: auth.userId,
        autorizado_at: new Date().toISOString(),
        comentario_resolucion: comentario_resolucion ?? null,
      })
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await admin.from('audit_log').insert({
      tabla: 'cliente_excepciones',
      registro_id: params.id,
      accion: decision === 'aprobar' ? 'aprobacion' : 'rechazo',
      motivo: comentario_resolucion ?? excepcion.motivo,
      usuario_id: auth.userId,
      ip: clientIp(request),
      user_agent: clientUserAgent(request),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
