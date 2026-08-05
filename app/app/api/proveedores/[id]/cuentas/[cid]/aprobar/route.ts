export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { clientIp, clientUserAgent } from '@/lib/entidades/http';

// POST - aprobación (P03 §II: "solo super_admin aprueba"). Al activar la
// nueva cuenta, cualquier otra en 'pendiente_reemplazo' del mismo
// proveedor pasa a 'inactiva' automáticamente (P03 §IV).
export async function POST(request: Request, { params }: { params: { id: string; cid: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin']);
    if (response) return response;

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
      return NextResponse.json({ error: 'Sólo se pueden aprobar cuentas pendientes de aprobación' }, { status: 409 });
    }

    const { error: cierreError } = await admin
      .from('proveedor_cuentas_bancarias')
      .update({ estado: 'inactiva' })
      .eq('proveedor_id', params.id)
      .eq('estado', 'pendiente_reemplazo');
    if (cierreError) return NextResponse.json({ error: cierreError.message }, { status: 500 });

    const { error } = await admin
      .from('proveedor_cuentas_bancarias')
      .update({ estado: 'activa', aprobada_por: auth.userId, aprobada_at: new Date().toISOString() })
      .eq('id', params.cid);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await admin.from('audit_log').insert({
      tabla: 'proveedor_cuentas_bancarias',
      registro_id: params.cid,
      accion: 'aprobacion',
      usuario_id: auth.userId,
      ip: clientIp(request),
      user_agent: clientUserAgent(request),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
