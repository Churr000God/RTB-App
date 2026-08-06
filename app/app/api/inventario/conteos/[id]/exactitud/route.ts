export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';

// GET - exactitud por cobertura/registro/pieza/valor, vía
// public.inventario_exactitud() (014). El Acta de Conteo Físico real mide
// "exactitud por registro 98.33% · por pieza 88.13% · por valor 98.83%" —
// mismas cuatro filas aquí.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('inventario_exactitud', { p_conteo_id: params.id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
