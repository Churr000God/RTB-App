export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { ajusteResolverSchema } from '@/lib/inventario/schemas';
import { clientIp, clientUserAgent } from '@/lib/entidades/http';

// POST - autoriza/rechaza un ajuste pendiente. "Ajustes aplicados sin
// autorización registrada: 34 de 34" (Registro de Discrepancias real) es
// el hallazgo que este endpoint existe para cerrar: aju_no_autoaprobacion_chk
// (013) hace estructuralmente imposible que autorizador_id = solicitante_id,
// y este mismo chequeo se hace aquí primero para un mensaje de negocio claro.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin', 'direccion']);
    if (response) return response;

    const parsed = ajusteResolverSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    const { decision, comentario_autorizacion, motivo_rechazo } = parsed.data;

    const admin = createSupabaseAdminClient();
    const { data: ajuste } = await admin.from('inventario_ajustes').select('*').eq('id', params.id).maybeSingle();
    if (!ajuste) return NextResponse.json({ error: 'Ajuste no encontrado' }, { status: 404 });
    if (ajuste.estado !== 'pendiente_autorizacion') {
      return NextResponse.json({ error: 'Este ajuste no está pendiente de autorización.' }, { status: 409 });
    }
    if (ajuste.solicitante_id === auth.userId) {
      return NextResponse.json({ error: 'No puedes autorizar tu propio ajuste.' }, { status: 403 });
    }

    const { error } = await admin
      .from('inventario_ajustes')
      .update(
        decision === 'autorizar'
          ? {
              estado: 'autorizado',
              autorizador_id: auth.userId,
              autorizado_at: new Date().toISOString(),
              comentario_autorizacion: comentario_autorizacion ?? null,
            }
          : { estado: 'rechazado', motivo_rechazo }
      )
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await admin.from('audit_log').insert({
      tabla: 'inventario_ajustes',
      registro_id: params.id,
      accion: decision === 'autorizar' ? 'autorizacion' : 'rechazo',
      motivo: decision === 'autorizar' ? comentario_autorizacion ?? ajuste.motivo : motivo_rechazo,
      usuario_id: auth.userId,
      ip: clientIp(request),
      user_agent: clientUserAgent(request),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
