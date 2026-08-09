export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { ACCESO_PANTALLA, ROLES_REGISTRAN_PO } from '@/lib/ventas/permisos';
import { PO_TABLERO_TOPE } from '@/lib/ventas/config';
import { poDesdeNrSchema } from '@/lib/ventas/schemas';
import { statusPorErrcode } from '@/lib/ventas/errores';
import {
  ORDENES_COMPRA_PAGE_SIZE,
  ORDENES_COMPRA_VISTA,
  aplicarFiltrosPo,
  construirColumnasTableroPo,
  ordenarPo,
  parsearFiltrosPo,
} from '@/lib/ventas/listado-ordenes-compra';

// GET - listado de PO (045, patrón "explorer" calcado de
// /api/ventas/cotizaciones): búsqueda, filtros de fecha, tablero por estado
// o tabla paginada — mismo contrato dual (?vista=tablero) sobre
// ventas_ordenes_compra_listado. La PO no se da de alta a mano por GRANT
// desde 043: nace dentro de ventas_cotizacion_aprobar() (Vía B) o del POST
// de abajo (ventas_po_crear_desde_nr(), Vía A — 048, desde el tablero de NR).
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole(ACCESO_PANTALLA.ordenes_compra);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const supabase = createSupabaseServerClient();
    const f = parsearFiltrosPo(searchParams);
    const vista = searchParams.get('vista') === 'tablero' ? 'tablero' : 'lista';

    if (vista === 'tablero') {
      const tope = Math.min(50, Math.max(1, Number(searchParams.get('tope')) || PO_TABLERO_TOPE));
      const columnas = await construirColumnasTableroPo(supabase, f, tope);
      return NextResponse.json({ vista: 'tablero', columnas, count: columnas.reduce((n, c) => n + c.count, 0), tope });
    }

    let query = supabase.from(ORDENES_COMPRA_VISTA).select('*', { count: 'exact' });
    query = aplicarFiltrosPo(query, f);
    query = ordenarPo(query, f.orden).range((f.page - 1) * ORDENES_COMPRA_PAGE_SIZE, f.page * ORDENES_COMPRA_PAGE_SIZE - 1);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ vista: 'lista', data: data ?? [], count: count ?? 0, page: f.page, pageSize: ORDENES_COMPRA_PAGE_SIZE });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - registra desde el tablero de NR la PO que llega DESPUÉS de una o
// varias NR ya emitidas (ventas_po_crear_desde_nr(), Vía A — 048). Nunca se
// rellena como una cotización nueva: pide los datos de la PO y del cliente,
// deja seleccionar NR/partidas de respaldo (ya entregadas) y partidas por
// entregar (de una cotización existente o nuevas del catálogo).
export async function POST(request: Request) {
  try {
    const { response } = await requireApiRole(ROLES_REGISTRAN_PO);
    if (response) return response;

    const parsed = poDesdeNrSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('ventas_po_crear_desde_nr', { p_payload: parsed.data });
    if (error) return NextResponse.json({ error: error.message }, { status: statusPorErrcode(error.code) });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
