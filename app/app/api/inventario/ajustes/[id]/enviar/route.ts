export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';

// POST - envía un ajuste 'borrador' a autorización. estado no está en el
// GRANT UPDATE de authenticated (013): esta transición SIEMPRE pasa por
// aquí. aju_soporte_chk permite 'borrador' sin soporte, pero lo exige al
// salir de ahí — se valida antes del UPDATE para un mensaje de negocio claro.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin', 'direccion', 'almacen', 'compras']);
    if (response) return response;

    const admin = createSupabaseAdminClient();
    const { data: ajuste } = await admin.from('inventario_ajustes').select('*').eq('id', params.id).maybeSingle();
    if (!ajuste) return NextResponse.json({ error: 'Ajuste no encontrado' }, { status: 404 });
    if (ajuste.estado !== 'borrador') {
      return NextResponse.json({ error: 'Este ajuste ya fue enviado a autorización.' }, { status: 409 });
    }
    if (ajuste.solicitante_id !== auth.userId) {
      return NextResponse.json({ error: 'Sólo el solicitante puede enviar su ajuste.' }, { status: 403 });
    }
    if (!ajuste.sin_soporte && !ajuste.soporte_path) {
      return NextResponse.json({ error: 'Sube el soporte documental o marca "sin soporte" con motivo.' }, { status: 400 });
    }

    const { count: lineas } = await admin
      .from('inventario_ajuste_lineas')
      .select('id', { count: 'exact', head: true })
      .eq('ajuste_id', params.id);
    if (!lineas) {
      return NextResponse.json({ error: 'El ajuste necesita al menos una línea (producto + cantidad).' }, { status: 400 });
    }

    const { error } = await admin.from('inventario_ajustes').update({ estado: 'pendiente_autorizacion' }).eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
