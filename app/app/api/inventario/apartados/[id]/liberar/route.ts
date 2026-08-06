export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { apartadoLiberarSchema } from '@/lib/inventario/schemas';

// POST - libera o consume una reserva. liberado_at/liberado_por los
// estampa apartados_before_update() (011), no este payload.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'ventas', 'almacen']);
    if (response) return response;

    const parsed = apartadoLiberarSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from('inventario_apartados').update(parsed.data).eq('id', params.id);
    if (error) {
      const yaResuelto = /ya no está activo/i.test(error.message);
      return NextResponse.json(
        { error: yaResuelto ? 'Este apartado ya fue liberado o consumido.' : error.message },
        { status: yaResuelto ? 409 : 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
