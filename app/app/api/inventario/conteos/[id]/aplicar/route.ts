export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';

// POST - aplica un conteo 'cerrado': copia cantidad_fisica a
// inventario_existencias (fecha_ultimo_conteo/conteo_id_ultimo) para cada
// línea con una medición válida. NO ajusta el teórico — "una diferencia
// sin causa identificada no se ajusta: se declara como hallazgo"
// (Registro de Discrepancias CIE-DIS-01). Ajustar el teórico exige un
// inventario_ajustes autorizado aparte, vía /api/inventario/ajustes.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin', 'direccion']);
    if (response) return response;

    const admin = createSupabaseAdminClient();
    const { data: conteo } = await admin.from('inventario_conteos').select('estado').eq('id', params.id).maybeSingle();
    if (!conteo) return NextResponse.json({ error: 'Conteo no encontrado' }, { status: 404 });
    if (conteo.estado !== 'cerrado') {
      return NextResponse.json({ error: 'Sólo se aplica un conteo en estado cerrado.' }, { status: 409 });
    }

    const { data: detalles, error: detallesError } = await admin
      .from('inventario_conteo_detalles')
      .select('producto_id, ubicacion_id, cantidad_fisica, estado_conteo')
      .eq('conteo_id', params.id)
      .in('estado_conteo', ['contada', 'recontada', 'no_localizada']);
    if (detallesError) return NextResponse.json({ error: detallesError.message }, { status: 500 });

    const ahora = new Date().toISOString();
    let aplicadas = 0;
    for (const linea of detalles ?? []) {
      let query = admin
        .from('inventario_existencias')
        .update({ cantidad_fisica: linea.cantidad_fisica, fecha_ultimo_conteo: ahora, conteo_id_ultimo: params.id })
        .eq('producto_id', linea.producto_id);
      query = linea.ubicacion_id === null ? query.is('ubicacion_id', null) : query.eq('ubicacion_id', linea.ubicacion_id);
      const { error } = await query;
      if (!error) aplicadas += 1;
    }

    const { error: estadoError } = await admin
      .from('inventario_conteos')
      .update({ estado: 'aplicado', aplicado_at: ahora, aplicado_por: auth.userId })
      .eq('id', params.id);
    if (estadoError) return NextResponse.json({ error: estadoError.message }, { status: 400 });

    return NextResponse.json({ success: true, existenciasActualizadas: aplicadas });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
