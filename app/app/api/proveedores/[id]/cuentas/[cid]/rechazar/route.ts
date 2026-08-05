export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { clientIp, clientUserAgent } from '@/lib/entidades/http';

const schema = z.object({ motivo_rechazo: z.string().trim().min(5, 'El motivo de rechazo es obligatorio').max(2000) });

// POST - rechazo (P03 §III: "regresa a finanzas con el motivo documentado").
export async function POST(request: Request, { params }: { params: { id: string; cid: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin']);
    if (response) return response;

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: cuenta } = await admin
      .from('proveedor_cuentas_bancarias')
      .select('id, proveedor_id, estado')
      .eq('id', params.cid)
      .maybeSingle();

    if (!cuenta || cuenta.proveedor_id !== params.id) {
      return NextResponse.json({ error: 'Cuenta bancaria no encontrada' }, { status: 404 });
    }
    if (cuenta.estado !== 'pendiente_aprobacion') {
      return NextResponse.json({ error: 'Sólo se pueden rechazar cuentas pendientes de aprobación' }, { status: 409 });
    }

    const { error } = await admin
      .from('proveedor_cuentas_bancarias')
      .update({ estado: 'rechazada', motivo_rechazo: parsed.data.motivo_rechazo })
      .eq('id', params.cid);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await admin.from('audit_log').insert({
      tabla: 'proveedor_cuentas_bancarias',
      registro_id: params.cid,
      accion: 'rechazo',
      motivo: parsed.data.motivo_rechazo,
      usuario_id: auth.userId,
      ip: clientIp(request),
      user_agent: clientUserAgent(request),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
