export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { clientIp, clientUserAgent } from '@/lib/entidades/http';

// POST - aplica un ajuste ya autorizado: genera un inventario_movimientos
// (entrada_ajuste/salida_ajuste, con este ajuste_id) por cada línea. Va con
// service_role porque ajuste_id no está en el GRANT INSERT del kardex para
// authenticated bajo ninguna circunstancia (011/013) — sólo así se
// aplica, nunca con la sesión del usuario. La propia inserción vuelve a
// pasar por ajuste_autorizado() dentro del trigger del kardex: aunque este
// endpoint tuviera un bug, Postgres exige de nuevo que el ajuste esté
// 'autorizado'/'aplicado' antes de mover una sola pieza.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin', 'direccion']);
    if (response) return response;

    const admin = createSupabaseAdminClient();
    const { data: ajuste } = await admin.from('inventario_ajustes').select('*').eq('id', params.id).maybeSingle();
    if (!ajuste) return NextResponse.json({ error: 'Ajuste no encontrado' }, { status: 404 });
    if (ajuste.estado !== 'autorizado') {
      return NextResponse.json({ error: 'Este ajuste no está autorizado.' }, { status: 409 });
    }

    const { data: lineas, error: lineasError } = await admin
      .from('inventario_ajuste_lineas')
      .select('*, productos(unidad_medida_id)')
      .eq('ajuste_id', params.id)
      .is('movimiento_id', null);
    if (lineasError) return NextResponse.json({ error: lineasError.message }, { status: 500 });
    if (!lineas || lineas.length === 0) {
      return NextResponse.json({ error: 'El ajuste no tiene líneas pendientes de aplicar.' }, { status: 400 });
    }

    let impactoPiezas = 0;
    let impactoValor = 0;

    for (const linea of lineas) {
      const cantidad = Number(linea.cantidad_ajuste);
      const { data: movimiento, error: movError } = await admin
        .from('inventario_movimientos')
        .insert({
          tipo: cantidad > 0 ? 'entrada_ajuste' : 'salida_ajuste',
          producto_id: linea.producto_id,
          ubicacion_id: linea.ubicacion_id,
          unidad_captura_id: (linea as any).productos.unidad_medida_id,
          cantidad_capturada: Math.abs(cantidad),
          costo_unitario: linea.costo_unitario,
          referencia_tipo: 'ajuste',
          referencia_folio: ajuste.folio,
          ajuste_id: params.id,
        })
        .select('id, costo_unitario')
        .single();
      if (movError) return NextResponse.json({ error: movError.message }, { status: 400 });

      await admin.from('inventario_ajuste_lineas').update({ movimiento_id: movimiento.id }).eq('id', linea.id);

      impactoPiezas += Math.abs(cantidad);
      impactoValor += Math.abs(cantidad) * Number(movimiento.costo_unitario ?? 0);
    }

    const { error } = await admin
      .from('inventario_ajustes')
      .update({
        estado: 'aplicado',
        aplicado_at: new Date().toISOString(),
        aplicado_por: auth.userId,
        impacto_piezas: impactoPiezas,
        impacto_valor: impactoValor,
      })
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await admin.from('audit_log').insert({
      tabla: 'inventario_ajustes',
      registro_id: params.id,
      accion: 'aplicacion',
      motivo: ajuste.motivo,
      datos_nuevos: { impacto_piezas: impactoPiezas, impacto_valor: impactoValor },
      usuario_id: auth.userId,
      ip: clientIp(request),
      user_agent: clientUserAgent(request),
    });

    return NextResponse.json({ success: true, impactoPiezas, impactoValor });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
