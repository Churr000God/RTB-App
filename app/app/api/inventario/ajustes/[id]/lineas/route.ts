export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { ajusteLineaCreateSchema } from '@/lib/inventario/schemas';

// POST - añade una línea (producto + cantidad signada) al ajuste. La RLS
// real (013) sólo lo permite mientras el ajuste padre sigue en 'borrador'
// y eres su solicitante.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'almacen', 'compras']);
    if (response) return response;

    const parsed = ajusteLineaCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('inventario_ajuste_lineas')
      .insert({ ...parsed.data, ajuste_id: params.id })
      .select('*');
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Sólo el solicitante puede añadir líneas, y sólo en borrador.' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: data[0] }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
