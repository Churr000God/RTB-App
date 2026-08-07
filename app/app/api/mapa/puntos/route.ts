export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';

// GET - alimenta el mapa global (/dashboard/mapa): direcciones activas de
// entidades con coordenada + centros operativos activos con coordenada.
// Lectura para los 8 roles, igual que direcciones/ubicaciones por
// separado. Los índices parciales idx_direcciones_geo/idx_ubicaciones_geo
// (024_ubicaciones_geo.sql) cubren exactamente este filtro.
export async function GET() {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const supabase = createSupabaseServerClient();

    const [direcciones, centros] = await Promise.all([
      supabase
        .from('direcciones')
        .select('id, entidad_id, tipo, latitud, longitud, entidades(clave, nombre_legal, nombre_comercial, tipo, siglas)')
        .eq('activo', true)
        .not('latitud', 'is', null),
      supabase
        .from('ubicaciones_internas')
        .select('id, codigo, nombre, latitud, longitud')
        .eq('tipo', 'centro_operativo')
        .eq('activo', true)
        .not('latitud', 'is', null),
    ]);

    if (direcciones.error) return NextResponse.json({ error: direcciones.error.message }, { status: 500 });
    if (centros.error) return NextResponse.json({ error: centros.error.message }, { status: 500 });

    return NextResponse.json({
      direcciones: direcciones.data ?? [],
      centros: centros.data ?? [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
