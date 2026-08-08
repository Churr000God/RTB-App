export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { cotizacionCreateSchema } from '@/lib/ventas/schemas';
import { rolesQuePueden, ACCESO_PANTALLA } from '@/lib/ventas/permisos';
import {
  COTIZACIONES_PAGE_SIZE,
  COTIZACIONES_VISTA,
  aplicarFiltrosCotizacion,
  construirColumnasTablero,
  ordenarCotizaciones,
  parsearFiltrosCotizacion,
} from '@/lib/ventas/listado-cotizaciones';
import { COTIZACION_TABLERO_TOPE } from '@/lib/ventas/config';

// GET - listado de cotizaciones, visible a los 4 roles de
// ACCESO_PANTALLA.cotizaciones (espejo de la RLS select de
// ventas_cotizaciones, que sí es role-agnostic para los 8 operativos).
// Opera sobre la vista ventas_cotizaciones_listado (038): aplana el
// cliente (entidades) y agrega el total de líneas activas para que la
// búsqueda (folio/siglas/nombre/clave), el orden por monto y la
// paginación real se resuelvan con .or()/.range()/.order() nativos de
// PostgREST — antes de 038 esta ruta ni siquiera traía el embed de
// entidades que el listado sí necesitaba.
//
// ?vista=tablero devuelve un bucket por estado con su count REAL (no el
// tamaño de `data`, acotado por `tope`) — mismos filtros que el modo
// lista, sólo cambia la forma de la respuesta. La construcción de
// filtros vive en lib/ventas/listado-cotizaciones.ts para que este
// handler, el modo tablero y el Server Component de la pantalla nunca
// diverjan (el defecto exacto que tenía esta ruta antes de 038).
export async function GET(request: Request) {
  try {
    const { auth, response } = await requireApiRole(ACCESO_PANTALLA.cotizaciones);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const f = parsearFiltrosCotizacion(searchParams, auth.userId);
    const vista = searchParams.get('vista') === 'tablero' ? 'tablero' : 'lista';

    const supabase = createSupabaseServerClient();

    // Barrido oportunista de vigencia (034) — mismo patrón que
    // /api/ventas/notas-remision:29. Sin esto la columna "Expirada" del
    // tablero y su chip mienten hasta que alguien abre Remisiones (único
    // llamador real hasta ahora). No bloquea la respuesta si falla; el
    // query builder es PromiseLike, no Promise, de ahí el Promise.resolve().
    await Promise.resolve(supabase.rpc('ventas_cotizaciones_expirar')).catch(() => null);

    if (vista === 'tablero') {
      const topeParam = Math.min(50, Math.max(1, Number(searchParams.get('tope')) || COTIZACION_TABLERO_TOPE));
      const columnas = await construirColumnasTablero(supabase, f, topeParam);
      return NextResponse.json({
        vista: 'tablero',
        columnas,
        count: columnas.reduce((n, c) => n + c.count, 0),
        tope: topeParam,
      });
    }

    let query = supabase.from(COTIZACIONES_VISTA).select('*', { count: 'exact' });
    query = aplicarFiltrosCotizacion(query, f);
    query = ordenarCotizaciones(query, f.orden).range(
      (f.page - 1) * COTIZACIONES_PAGE_SIZE,
      f.page * COTIZACIONES_PAGE_SIZE - 1
    );

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      vista: 'lista',
      data: data ?? [],
      count: count ?? 0,
      page: f.page,
      pageSize: COTIZACIONES_PAGE_SIZE,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - crea la cotización en borrador. El trigger
// ventas_cotizacion_before_insert() (030) valida que la entidad tenga
// datos de cliente y que cliente_puede_operar() lo permita, y asigna el
// folio — nada de eso se duplica aquí.
export async function POST(request: Request) {
  try {
    const { response } = await requireApiRole(rolesQuePueden('cotizaciones', 'insert'));
    if (response) return response;

    const parsed = cotizacionCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('ventas_cotizaciones').insert(parsed.data).select('*').single();
    if (error) {
      const bloqueada = /42501/.test(error.code ?? '') || /no se puede crear/i.test(error.message);
      return NextResponse.json({ error: error.message }, { status: bloqueada ? 403 : 400 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
