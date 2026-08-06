export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { precioReferenciaCreateSchema } from '@/lib/inventario/schemas';

// GET/POST - precios de referencia por canal ("Costo Refacción"/"Costo
// Ariba"/mostrador/lista general). Vocabulario de Notion sin respaldo
// documental (ver comment on table de 010_inventario_costos.sql); se
// conservan como dato de referencia, sin semántica de negocio — la lista
// de precios real es responsabilidad de RTB-VEN-01.
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const productoId = searchParams.get('producto_id');
    if (!productoId) return NextResponse.json({ error: 'Falta producto_id' }, { status: 400 });

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('producto_precios_referencia')
      .select('*')
      .eq('producto_id', productoId)
      .order('vigente_desde', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'ventas', 'compras']);
    if (response) return response;

    const parsed = precioReferenciaCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('producto_precios_referencia').insert(parsed.data).select('*').single();
    if (error) {
      const abierto = /uq_precio_ref_abierto|duplicate key/i.test(error.message);
      return NextResponse.json(
        { error: abierto ? 'Ya existe un precio vigente en ese canal; cierra el anterior primero.' : error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
