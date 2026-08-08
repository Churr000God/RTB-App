export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { cotizacionLineaCreateSchema } from '@/lib/ventas/schemas';
import { mensajeErrorCotizacion } from '@/lib/ventas/errores';
import { rolesQuePueden, ACCESO_PANTALLA } from '@/lib/ventas/permisos';

// GET - líneas de una cotización.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(ACCESO_PANTALLA.cotizaciones);
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('ventas_cotizacion_lineas')
      .select('*')
      .eq('cotizacion_id', params.id)
      .order('created_at', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - agrega una línea (normal o "en consulta" si producto_id es
// nulo). precio_unitario/costo_base_snapshot/margen_snapshot/en_consulta
// NUNCA se envían: los resuelve el trigger
// ventas_cotizacion_linea_before_write() (030) — si el precio elegido no
// tiene costo, lanza 22023 ("producto sin costo no se cotiza").
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(rolesQuePueden('cotizacion_lineas', 'insert'));
    if (response) return response;

    const parsed = cotizacionLineaCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('ventas_cotizacion_lineas')
      .insert({ ...parsed.data, cotizacion_id: params.id })
      .select('*')
      .single();
    if (error) {
      const sinCosto = /22023|precio.*disponible|elige un precio/i.test(error.message);
      return NextResponse.json(
        { error: mensajeErrorCotizacion(error.message) },
        { status: sinCosto ? 400 : error.code === '42501' ? 403 : 400 }
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
