export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { ubicacionCreateSchema } from '@/lib/entidades/schemas';
import { mensajeErrorUbicacion } from '@/lib/entidades/errores';

// GET - listado plano (los 8 roles consultan); la UI arma el árbol con
// parent_id en el cliente.
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const soloActivas = searchParams.get('activo') !== 'false';

    const supabase = createSupabaseServerClient();
    let query = supabase.from('ubicaciones_internas').select('*').order('codigo', { ascending: true });
    if (soloActivas) query = query.eq('activo', true);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - alta de un nodo del árbol (P04). El trigger
// ubicaciones_before_insert calcula nivel/codigo y valida la taxonomía;
// sus mensajes de RAISE EXCEPTION ya son texto de negocio en español, así
// que se devuelven tal cual.
export async function POST(request: Request) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'almacen']);
    if (response) return response;

    const parsed = ubicacionCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('ubicaciones_internas').insert(parsed.data).select('*').single();

    if (error) {
      return NextResponse.json({ error: mensajeErrorUbicacion(error.message) }, { status: 400 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
