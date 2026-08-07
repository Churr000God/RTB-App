export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { poPartidaCreateSchema } from '@/lib/ventas/schemas';
import { mensajeErrorPo } from '@/lib/ventas/errores';
import { rolesQuePueden } from '@/lib/ventas/permisos';

// POST - captura una partida de la PO. La RLS de ventas_po_partidas (033)
// sólo admite insertar mientras la PO está en 'recibida'/'en_validacion'
// — capturar partidas es parte de la recepción, no de la validación.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(rolesQuePueden('po_partidas', 'insert'));
    if (response) return response;

    const parsed = poPartidaCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('ventas_po_partidas')
      .insert({ ...parsed.data, po_id: params.id })
      .select('*')
      .single();
    if (error) {
      const bloqueada = error.code === '42501';
      return NextResponse.json({ error: mensajeErrorPo(error.message) }, { status: bloqueada ? 403 : 400 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
