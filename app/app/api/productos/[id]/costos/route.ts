export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { productoCostoCreateSchema } from '@/lib/inventario/schemas';

// GET - histórico de costo de catálogo (con vigencia).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('producto_costos')
      .select('*')
      .eq('producto_id', params.id)
      .order('vigente_desde', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - carga de costo, incluida carga retroactiva ("el costo es un
// atributo del catálogo, no un evento del periodo" — Acta CIE-CON-01 real).
// pc_retroactivo_chk (010) exige motivo si vigente_desde queda en el
// pasado; el zod ya lo valida antes del round-trip.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'compras', 'finanzas']);
    if (response) return response;

    const parsed = productoCostoCreateSchema.safeParse({
      ...(await request.json().catch(() => null)),
      producto_id: params.id,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('producto_costos').insert(parsed.data).select('*').single();
    if (error) {
      const abierto = /uq_producto_costos_abierto|duplicate key/i.test(error.message);
      return NextResponse.json(
        { error: abierto ? 'Ya existe un costo vigente sin fecha de cierre; cierra el anterior primero.' : error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
