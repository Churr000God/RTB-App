export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { cotizacionUpdateSchema } from '@/lib/ventas/schemas';
import { rolesQuePueden, ACCESO_PANTALLA } from '@/lib/ventas/permisos';

// GET - detalle de una cotización con sus líneas.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(ACCESO_PANTALLA.cotizaciones);
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data: cotizacion, error } = await supabase
      .from('ventas_cotizaciones')
      .select('*')
      .eq('id', params.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!cotizacion) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });

    const { data: lineas, error: errorLineas } = await supabase
      .from('ventas_cotizacion_lineas')
      .select('*, productos(codigo_interno, nombre)')
      .eq('cotizacion_id', params.id)
      .order('created_at', { ascending: true });
    if (errorLineas) return NextResponse.json({ error: errorLineas.message }, { status: 500 });

    return NextResponse.json({ data: { ...cotizacion, lineas: lineas ?? [] } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// PATCH - edita la cabecera. El trigger ventas_cotizacion_before_update()
// (030) rechaza el cambio si la cotización ya salió de borrador; nunca
// permite tocar estado (fuera de todo GRANT).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(rolesQuePueden('cotizaciones', 'update'));
    if (response) return response;

    const parsed = cotizacionUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('ventas_cotizaciones')
      .update(parsed.data)
      .eq('id', params.id)
      .select('id');
    if (error) {
      const bloqueada = error.message?.includes('ya salió de borrador');
      return NextResponse.json({ error: error.message }, { status: bloqueada ? 409 : 400 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'No se pudo editar: no existe o no tienes permiso.' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
