export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { apartadoLiberarSchema } from '@/lib/inventario/schemas';

// POST - libera o consume una reserva. liberado_at/liberado_por los
// estampa apartados_before_update() (011), no este payload.
// B-01 (contexto/QA_INTEGRAL_2026-08-06.md): sin .select(), un apartado ya
// resuelto o fuera de RLS devolvía 200 sin persistir — el mensaje de
// "ya no está activo" sólo se veía cuando el trigger sí llegaba a correr
// (fila encontrada); con 0 filas el UPDATE ni dispara el trigger.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'ventas', 'almacen']);
    if (response) return response;

    const parsed = apartadoLiberarSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('inventario_apartados').update(parsed.data).eq('id', params.id).select('id');
    if (error) {
      const yaResuelto = /ya no está activo/i.test(error.message);
      return NextResponse.json(
        { error: yaResuelto ? 'Este apartado ya fue liberado o consumido.' : error.message },
        { status: yaResuelto ? 409 : 400 }
      );
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Este apartado ya fue liberado o consumido, o no existe.' }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
