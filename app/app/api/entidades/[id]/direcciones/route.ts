export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { direccionSchema } from '@/lib/entidades/schemas';

// GET - direcciones activas de la entidad.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('direcciones')
      .select('*')
      .eq('entidad_id', params.id)
      .eq('activo', true);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - alta de dirección ("modificación libre", P05).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole([
      'super_admin',
      'direccion',
      'ventas',
      'compras',
      'almacen',
      'logistica',
    ]);
    if (response) return response;

    const parsed = direccionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('direcciones')
      .insert({ ...parsed.data, entidad_id: params.id })
      .select('*')
      .single();

    if (error) {
      const duplicado = /uq_direccion_principal_entidad_tipo/i.test(error.message);
      return NextResponse.json(
        { error: duplicado ? 'Ya existe una dirección principal de ese tipo para esta entidad.' : error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
