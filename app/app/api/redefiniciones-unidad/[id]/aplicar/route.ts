export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { clientIp, clientUserAgent } from '@/lib/entidades/http';

// POST - aplica una redefinición ya autorizada: escribe la nueva unidad en
// productos y sólo DESPUÉS marca la redefinición como 'aplicado'.
// El orden importa: productos_guard_unidad() (013) exige una fila con
// estado='autorizado' (no 'aplicado') que coincida exactamente con la
// unidad/contenido nuevos en el momento del UPDATE sobre productos.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin', 'direccion']);
    if (response) return response;

    const admin = createSupabaseAdminClient();
    const { data: redefinicion } = await admin
      .from('producto_unidad_redefiniciones')
      .select('*')
      .eq('id', params.id)
      .maybeSingle();

    if (!redefinicion) return NextResponse.json({ error: 'Redefinición no encontrada' }, { status: 404 });
    if (redefinicion.estado !== 'autorizado') {
      return NextResponse.json({ error: 'Esta redefinición no está autorizada.' }, { status: 409 });
    }
    if (redefinicion.requiere_reconteo && !redefinicion.conteo_id) {
      return NextResponse.json(
        { error: 'Esta redefinición exige un reconteo antes de aplicarse; vincula el conteo que la cierra.' },
        { status: 409 }
      );
    }

    const { error: productoError } = await admin
      .from('productos')
      .update({
        unidad_medida_id: redefinicion.unidad_nueva_id,
        contenido_por_unidad: redefinicion.contenido_nuevo,
      })
      .eq('id', redefinicion.producto_id);
    if (productoError) return NextResponse.json({ error: productoError.message }, { status: 400 });

    const { error } = await admin
      .from('producto_unidad_redefiniciones')
      .update({ estado: 'aplicado', aplicado_at: new Date().toISOString(), aplicado_por: auth.userId })
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await admin.from('audit_log').insert({
      tabla: 'producto_unidad_redefiniciones',
      registro_id: params.id,
      accion: 'aplicacion',
      motivo: redefinicion.motivo,
      usuario_id: auth.userId,
      ip: clientIp(request),
      user_agent: clientUserAgent(request),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
