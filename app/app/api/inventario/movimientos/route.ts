export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { movimientoCreateSchema, movimientoParSchema } from '@/lib/inventario/schemas';

const PAGE_SIZE = 30;

// GET - kardex, filtrable por producto/ubicación/tipo. Los 8 roles
// consultan (RLS lo decide); el kardex es de lectura amplia por diseño.
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const productoId = searchParams.get('producto_id');
    const ubicacionId = searchParams.get('ubicacion_id');
    const tipo = searchParams.get('tipo');
    const conteoId = searchParams.get('conteo_id');
    const ajusteId = searchParams.get('ajuste_id');
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const supabase = createSupabaseServerClient();
    let query = supabase
      .from('inventario_movimientos')
      .select('*', { count: 'exact' })
      .order('fecha_movimiento', { ascending: false })
      .range(from, to);

    if (productoId) query = query.eq('producto_id', productoId);
    if (ubicacionId) query = query.eq('ubicacion_id', ubicacionId);
    if (tipo) query = query.eq('tipo', tipo);
    if (conteoId) query = query.eq('conteo_id', conteoId);
    if (ajusteId) query = query.eq('ajuste_id', ajusteId);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [], count: count ?? 0, page, pageSize: PAGE_SIZE });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - registra uno o dos movimientos (cross-dock/transferencia van en
// par, mismo operacion_id, en un solo INSERT — así el constraint trigger
// diferido movimiento_valida_par() (011) ve ambas filas al hacer commit; si
// llega una sola pierna, la transacción entera falla y no se aplica ninguna).
export async function POST(request: Request) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'almacen', 'compras', 'logistica']);
    if (response) return response;

    const body = await request.json().catch(() => null);
    const esPar = Array.isArray(body);

    const supabase = createSupabaseServerClient();

    if (esPar) {
      const parsed = movimientoParSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
      }
      // Mismo operacion_id en las dos filas si el cliente no lo mandó.
      const operacionId = parsed.data[0].operacion_id ?? crypto.randomUUID();
      const filas = parsed.data.map((m) => ({ ...m, operacion_id: m.operacion_id ?? operacionId }));

      const { data, error } = await supabase.from('inventario_movimientos').insert(filas).select('*');
      if (error) return NextResponse.json({ error: traducirErrorMovimiento(error.message) }, { status: 400 });

      return NextResponse.json({ success: true, data }, { status: 201 });
    }

    const parsed = movimientoCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const { data, error } = await supabase.from('inventario_movimientos').insert(parsed.data).select('*').single();
    if (error) return NextResponse.json({ error: traducirErrorMovimiento(error.message) }, { status: 400 });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

/** Los RAISE EXCEPTION del trigger del kardex (011) ya son mensajes de
 *  negocio en español; sólo se traduce el mensaje genérico de PostgREST
 *  para cross-dock/transferencia sin pareja (23514, sin texto propio ahí). */
function traducirErrorMovimiento(mensaje: string): string {
  if (/exige las dos piernas/i.test(mensaje)) return mensaje;
  if (/no está balanceada/i.test(mensaje)) return mensaje;
  if (/Saldo negativo no permitido/i.test(mensaje)) return mensaje;
  if (/incompatible con el producto/i.test(mensaje)) return mensaje;
  if (/ajuste no autorizado/i.test(mensaje)) return mensaje;
  if (/congelado por el conteo/i.test(mensaje)) return mensaje;
  return mensaje;
}
