export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { cotizacionLineaUpdateSchema } from '@/lib/ventas/schemas';
import { mensajeErrorCotizacion } from '@/lib/ventas/errores';
import { rolesQuePueden } from '@/lib/ventas/permisos';

// PATCH - edita una línea mientras la cotización sigue en borrador
// (ventas_cotizacion_linea_before_write() lo congela en cuanto sale de
// borrador, con error explícito). "Quitar una línea" = activo:false,
// nunca DELETE (regla de negocio de todo el esquema).
export async function PATCH(request: Request, { params }: { params: { id: string; lineaId: string } }) {
  try {
    const { response } = await requireApiRole(rolesQuePueden('cotizacion_lineas', 'update'));
    if (response) return response;

    const parsed = cotizacionLineaUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('ventas_cotizacion_lineas')
      .update(parsed.data)
      .eq('id', params.lineaId)
      .eq('cotizacion_id', params.id)
      .select('id');
    if (error) {
      const congelada = /ya no está en borrador/i.test(error.message);
      return NextResponse.json(
        { error: mensajeErrorCotizacion(error.message) },
        { status: congelada ? 409 : error.code === '42501' ? 403 : 400 }
      );
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'No se pudo editar: la línea no existe o no tienes permiso.' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
