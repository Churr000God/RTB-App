export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { congelamientoLiberarSchema } from '@/lib/ventas/schemas';
import { rolesQuePueden } from '@/lib/ventas/permisos';

// POST - libera el congelamiento (el cliente pagó lo vencido, o Dirección
// decide levantar el bloqueo). cliente_congelamiento_before_update() (029)
// congela entidad_id/motivo/saldo_origen/autorizado_por y estampa
// liberado_at/liberado_por.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(rolesQuePueden('cliente_congelamientos', 'update'));
    if (response) return response;

    const parsed = congelamientoLiberarSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('cliente_congelamientos')
      .update({ estado: 'liberado', motivo_liberacion: parsed.data.motivo_liberacion })
      .eq('id', params.id)
      .eq('estado', 'activo')
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'No se pudo liberar: no está activo o no tienes permiso.' }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
