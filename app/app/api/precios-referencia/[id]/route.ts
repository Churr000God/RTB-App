export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { precioReferenciaUpdateSchema } from '@/lib/inventario/schemas';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'ventas', 'compras']);
    if (response) return response;

    const parsed = precioReferenciaUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    // B-01 (contexto/QA_INTEGRAL_2026-08-06.md): sin .select(), un precio
    // fuera de RLS devolvía 200 sin editarse.
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('producto_precios_referencia')
      .update(parsed.data)
      .eq('id', params.id)
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'No se pudo editar: el precio no existe o no tienes permiso.' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
