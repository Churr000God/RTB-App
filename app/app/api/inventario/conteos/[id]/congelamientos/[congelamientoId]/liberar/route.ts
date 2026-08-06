export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { conteoCongelamientoLiberarSchema } from '@/lib/inventario/schemas';

// POST - libera un congelamiento (deja de bloquear el kardex para ese
// producto/ubicación). liberado_at/liberado_por los estampa
// congelamientos_before_update() (012), no este payload.
export async function POST(
  request: Request,
  { params }: { params: { id: string; congelamientoId: string } }
) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'almacen']);
    if (response) return response;

    const parsed = conteoCongelamientoLiberarSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from('inventario_congelamientos')
      .update(parsed.data)
      .eq('id', params.congelamientoId)
      .eq('conteo_id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
