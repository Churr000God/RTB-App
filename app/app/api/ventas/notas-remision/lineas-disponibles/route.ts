export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { ROLES_REGISTRAN_PO } from '@/lib/ventas/permisos';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET - líneas de NR con cantidad disponible para respaldar (requisito 3
// hecho consulta, ventas_nr_lineas_disponibles(), Vía A — 048): una línea ya
// cubierta del todo por vínculos activos no aparece. Alimenta el paso 2 del
// asistente "Registrar PO" (?entidad_id=...&nr_ids=id1,id2 opcional).
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole(ROLES_REGISTRAN_PO);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const entidadId = searchParams.get('entidad_id');
    if (!entidadId || !UUID_RE.test(entidadId)) {
      return NextResponse.json({ error: 'Falta el cliente (entidad_id).' }, { status: 400 });
    }
    const nrIdsRaw = searchParams.get('nr_ids');
    const nrIds = nrIdsRaw
      ? nrIdsRaw.split(',').map((s) => s.trim()).filter((s) => UUID_RE.test(s))
      : null;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('ventas_nr_lineas_disponibles', {
      p_entidad_id: entidadId,
      p_nr_ids: nrIds && nrIds.length > 0 ? nrIds : null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
