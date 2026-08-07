export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';

const PAGE_SIZE = 30;

// GET - el tablero de seguimiento de NR (RTB-PRO-VEN-01 §III), vía
// ventas_tablero_nr() (034): antigüedad y monto pendiente calculados por
// agregación, nunca almacenados.
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado');
    const vendedorId = searchParams.get('vendedor_id');
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

    const supabase = createSupabaseServerClient();

    // Barrido oportunista de cotizaciones expiradas (sin cron en el
    // proyecto) — no bloquea la respuesta si falla por cualquier motivo.
    // El query builder de supabase-js es PromiseLike, no Promise (sin
    // .catch()/.finally()): hay que envolverlo con Promise.resolve().
    await Promise.resolve(supabase.rpc('ventas_cotizaciones_expirar')).catch(() => null);

    const { data, error } = await supabase.rpc('ventas_tablero_nr', {
      p_estado: estado ?? null,
      p_vendedor: vendedorId ?? null,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
