export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { ajusteUpdateSchema } from '@/lib/inventario/schemas';

// GET - detalle agregado: ajuste + líneas.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data: ajuste, error } = await supabase.from('inventario_ajustes').select('*').eq('id', params.id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!ajuste) return NextResponse.json({ error: 'Ajuste no encontrado' }, { status: 404 });

    const { data: lineas } = await supabase
      .from('inventario_ajuste_lineas')
      .select('*, productos(codigo_interno, nombre)')
      .eq('ajuste_id', params.id);

    return NextResponse.json({ ajuste, lineas: lineas ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// PATCH - edición de contenido, sólo mientras estado='borrador' (RLS +
// ajustes_before_update() lo congelan después, 013).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'almacen', 'compras']);
    if (response) return response;

    const parsed = ajusteUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('inventario_ajustes').update(parsed.data).eq('id', params.id).select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Sólo el solicitante puede editar su ajuste, y sólo en borrador.' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
