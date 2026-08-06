export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';

// GET - alerta de stock (⚪/🔴/🟢), bloqueo de compra y acción sugerida —
// RTB-PRO-COM-01 §III, vía public.inventario_alerta_stock() (014).
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const productoId = searchParams.get('producto_id');
    const soloAlertas = searchParams.get('solo_alertas') === 'true';

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('inventario_alerta_stock', { p_producto_id: productoId ?? null });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const filas = soloAlertas ? (data ?? []).filter((f: any) => f.alerta !== 'ok') : (data ?? []);

    return NextResponse.json({ data: filas });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
