export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { cotizacionCreateSchema } from '@/lib/ventas/schemas';
import { rolesQuePueden, ACCESO_PANTALLA } from '@/lib/ventas/permisos';

const PAGE_SIZE = 20;

// GET - listado de cotizaciones (filtros estado/entidad/vendedor), visible
// a los 8 roles operativos (espejo de la RLS select de ventas_cotizaciones).
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole(ACCESO_PANTALLA.cotizaciones);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado');
    const entidadId = searchParams.get('entidad_id');
    const vendedorId = searchParams.get('vendedor_id');
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const supabase = createSupabaseServerClient();
    let query = supabase
      .from('ventas_cotizaciones')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (estado) query = query.eq('estado', estado);
    if (entidadId) query = query.eq('entidad_id', entidadId);
    if (vendedorId) query = query.eq('vendedor_id', vendedorId);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [], count: count ?? 0, page, pageSize: PAGE_SIZE });
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
