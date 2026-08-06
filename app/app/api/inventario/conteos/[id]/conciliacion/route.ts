export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';

// GET - conciliación con teórico visible, vía public.conteo_conciliacion()
// (012): función SECURITY DEFINER que devuelve CERO FILAS si el rol no
// está autorizado o si el conteo sigue en_captura con vista_ciega=true y
// no eres super_admin/direccion — la vista ciega real, no de pantalla.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('conteo_conciliacion', { p_conteo_id: params.id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
