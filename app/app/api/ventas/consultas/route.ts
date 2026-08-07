export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { consultaCreateSchema } from '@/lib/ventas/schemas';
import { rolesQuePueden } from '@/lib/ventas/permisos';

// GET - bandeja: 'ventas' ve las suyas (y las de todos si es
// dirección/super_admin), 'compras' ve la cola completa para atenderlas.
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado');

    const supabase = createSupabaseServerClient();
    let query = supabase.from('ventas_consultas_compras').select('*').order('created_at', { ascending: false });
    if (estado) query = query.eq('estado', estado);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
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
