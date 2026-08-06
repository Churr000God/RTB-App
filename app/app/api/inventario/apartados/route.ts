export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { apartadoCreateSchema } from '@/lib/inventario/schemas';

// GET - reservas activas (ALM-01 §VIII regla 4: "piezas separadas se
// marcan como reservadas en el sistema inmediatamente").
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const productoId = searchParams.get('producto_id');
    const estado = searchParams.get('estado');

    const supabase = createSupabaseServerClient();
    let query = supabase.from('inventario_apartados').select('*').order('created_at', { ascending: false });
    if (productoId) query = query.eq('producto_id', productoId);
    if (estado) query = query.eq('estado', estado);
    else query = query.eq('estado', 'activo');

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - reserva inventario. No mueve stock (no es un movimiento de
// kardex); apartados_before_insert() (011) incrementa
// inventario_existencias.cantidad_apartada. Sobre-reservar no se bloquea a
// propósito (ver comment on table); queda visible en cantidad_disponible.
export async function POST(request: Request) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'ventas', 'almacen']);
    if (response) return response;

    const parsed = apartadoCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('inventario_apartados').insert(parsed.data).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
