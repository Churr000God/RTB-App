export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { consultaCreateSchema } from '@/lib/ventas/schemas';
import { rolesQuePueden } from '@/lib/ventas/permisos';
import { CONSULTA_ESTADOS_ABIERTOS } from '@/lib/ventas/config';
import { CONSULTA_ESTADOS } from '@/types/ventas';

const PAGE_SIZE = 20;

// GET - bandeja: 'ventas' ve las suyas (y las de todos si es
// dirección/super_admin), 'compras' ve la cola completa para atenderlas.
// Paginado. `estado` acepta una lista separada por comas (mismo patrón
// que .in('estado', [...]) de /api/inventario/hallazgos) — así cada
// pestaña de consultas-bandeja.tsx (Abiertas/Resueltas) pide su propia
// página sin cargar el universo completo en memoria. `abiertas` va en el
// mismo payload (un count aparte, barato con idx_ventas_consultas_estado)
// para que el badge "Abiertas (N)" sea correcto también mientras la
// pestaña activa es Resueltas.
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const estados = (searchParams.get('estado') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => (CONSULTA_ESTADOS as readonly string[]).includes(s));
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const supabase = createSupabaseServerClient();
    let query = supabase
      .from('ventas_consultas_compras')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (estados.length === 1) query = query.eq('estado', estados[0]);
    else if (estados.length > 1) query = query.in('estado', estados);

    // El query builder de supabase-js es PromiseLike, no Promise — Promise.all
    // lo acepta directo (gotcha ya documentado, sin .finally()/.catch() aquí).
    const [{ data, error, count }, abiertasRes] = await Promise.all([
      query,
      supabase
        .from('ventas_consultas_compras')
        .select('id', { count: 'exact', head: true })
        .in('estado', CONSULTA_ESTADOS_ABIERTOS as readonly string[]),
    ]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (abiertasRes.error) return NextResponse.json({ error: abiertasRes.error.message }, { status: 500 });

    return NextResponse.json({
      data: data ?? [],
      count: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
      abiertas: abiertasRes.count ?? 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - levanta la consulta de Compras-ligero con descripción libre, SIN
// que el producto exista todavía (decisión confirmada 2026-08-07).
export async function POST(request: Request) {
  try {
    const { response } = await requireApiRole(rolesQuePueden('consultas_compras', 'insert'));
    if (response) return response;

    const parsed = consultaCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('ventas_consultas_compras').insert(parsed.data).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
