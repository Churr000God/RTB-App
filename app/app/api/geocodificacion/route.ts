export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { mapaHabilitado } from '@/lib/mapas/config';
import { geocodificarDirecto, geocodificarInverso } from '@/lib/mapas/mapbox';
import { geocodificacionQuerySchema } from '@/lib/mapas/schemas';

// GET - ?modo=inverso&latitud=&longitud= (coordenada -> dirección) o
// ?modo=directo&q= (texto -> dirección + coordenada). Mismos roles que
// escriben direcciones (lib/entidades/permisos.ts): quien no puede crear
// una dirección tampoco necesita geocodificar una.
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole([
      'super_admin',
      'direccion',
      'ventas',
      'compras',
      'almacen',
      'logistica',
    ]);
    if (response) return response;

    if (!mapaHabilitado()) {
      return NextResponse.json({ error: 'La geocodificación no está configurada todavía.' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = geocodificacionQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Parámetros inválidos' }, { status: 400 });
    }

    const resultado =
      parsed.data.modo === 'inverso'
        ? await geocodificarInverso(parsed.data.latitud, parsed.data.longitud)
        : await geocodificarDirecto(parsed.data.q);

    if (!resultado) {
      return NextResponse.json({ error: 'No se encontró una dirección para esa búsqueda.' }, { status: 404 });
    }

    return NextResponse.json({ data: resultado });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error al consultar Mapbox' }, { status: 502 });
  }
}
