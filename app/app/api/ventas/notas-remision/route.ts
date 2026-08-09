export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { ACCESO_PANTALLA } from '@/lib/ventas/permisos';
import { NR_TABLERO_TOPE } from '@/lib/ventas/config';
import {
  NOTAS_REMISION_PAGE_SIZE,
  NOTAS_REMISION_VISTA,
  aplicarFiltrosNr,
  construirColumnasTableroNr,
  ordenarNr,
  parsearFiltrosNr,
} from '@/lib/ventas/listado-notas-remision';

// GET - listado de NR (049, patrón "explorer" calcado de
// /api/ventas/cotizaciones): búsqueda, filtros de fecha, tablero por estado
// o tabla paginada — mismo contrato dual (?vista=tablero) sobre
// ventas_notas_remision_listado. Sustituye a ventas_tablero_nr() (034), que
// no exponía count:'exact' ni admitía .or()/.range()/.order() de PostgREST.
export async function GET(request: Request) {
  try {
    const { auth, response } = await requireApiRole(ACCESO_PANTALLA.remisiones);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const supabase = createSupabaseServerClient();
    const f = parsearFiltrosNr(searchParams, auth.userId);
    const vista = searchParams.get('vista') === 'tablero' ? 'tablero' : 'lista';

    // Barrido oportunista de cotizaciones expiradas (sin cron en el
    // proyecto) — no bloquea la respuesta si falla por cualquier motivo.
    // El query builder de supabase-js es PromiseLike, no Promise (sin
    // .catch()/.finally()): hay que envolverlo con Promise.resolve().
    await Promise.resolve(supabase.rpc('ventas_cotizaciones_expirar')).catch(() => null);

    if (vista === 'tablero') {
      const tope = Math.min(50, Math.max(1, Number(searchParams.get('tope')) || NR_TABLERO_TOPE));
      const columnas = await construirColumnasTableroNr(supabase, f, tope);
      return NextResponse.json({ vista: 'tablero', columnas, count: columnas.reduce((n, c) => n + c.count, 0), tope });
    }

    let query = supabase.from(NOTAS_REMISION_VISTA).select('*', { count: 'exact' });
    query = aplicarFiltrosNr(query, f);
    query = ordenarNr(query, f.orden).range(
      (f.page - 1) * NOTAS_REMISION_PAGE_SIZE,
      f.page * NOTAS_REMISION_PAGE_SIZE - 1
    );

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      vista: 'lista',
      data: data ?? [],
      count: count ?? 0,
      page: f.page,
      pageSize: NOTAS_REMISION_PAGE_SIZE,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
