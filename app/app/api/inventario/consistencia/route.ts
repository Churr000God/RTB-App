export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';

// GET - consola de auditoría del submódulo, vía
// public.inventario_verificar_consistencia() (014). Sólo super_admin/
// direccion (la función devuelve cero filas para cualquier otro rol —
// filtro real, no de esta ruta). 'ajuste_sin_autorizacion' debería ser
// SIEMPRE cero filas: si alguna vez no lo es, hay un bug real en el diseño.
export async function GET() {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion']);
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('inventario_verificar_consistencia');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
