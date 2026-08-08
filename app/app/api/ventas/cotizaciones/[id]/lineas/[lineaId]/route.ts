export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { cotizacionLineaUpdateSchema } from '@/lib/ventas/schemas';
import { mensajeErrorCotizacion } from '@/lib/ventas/errores';
import { rolesQuePueden } from '@/lib/ventas/permisos';

// PATCH - edita una línea mientras la cotización está en borrador o
// enviada (ventas_cotizacion_linea_before_write() la congela fuera de esos
// dos estados, con error explícito). "Quitar una línea" en 'enviada' sigue
// siendo activo:false — en 'borrador' ahora existe el DELETE real de abajo
// (039/040: decisión confirmada, el documento que el cliente ya vio en
// 'enviada' conserva su rastro; un borrador nunca se mostró a nadie).
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
      const congelada = /ya no admite editar sus líneas/i.test(error.message);
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

// DELETE - borra una línea de verdad (039): sólo si la cotización sigue en
// borrador — la política RLS ventas_cotizacion_lineas_delete es la barrera
// real. Sin GRANT no habría llegado ni aquí; con GRANT pero cotización en
// otro estado, el .delete() filtra 0 filas SIN lanzar error (comportamiento
// normal de RLS en DELETE, no un 42501) — por eso se comprueba
// data.length, mismo patrón que el PATCH de arriba y el gotcha ya
// documentado de "UPDATE sin .select() esconde 0 filas por RLS".
export async function DELETE(_request: Request, { params }: { params: { id: string; lineaId: string } }) {
  try {
    const { response } = await requireApiRole(rolesQuePueden('cotizacion_lineas', 'delete'));
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('ventas_cotizacion_lineas')
      .delete()
      .eq('id', params.lineaId)
      .eq('cotizacion_id', params.id)
      .select('id');
    if (error) return NextResponse.json({ error: mensajeErrorCotizacion(error.message) }, { status: 400 });
    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'Sólo se borran líneas mientras la cotización está en borrador.' },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
