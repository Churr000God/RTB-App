export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { proveedorProductoUpdateSchema } from '@/lib/inventario/schemas';

// PATCH - edición de precio/condiciones. proveedor_id/producto_id quedan
// fuera del GRANT UPDATE (010): la identidad de la fila es inmutable.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'compras']);
    if (response) return response;

    const parsed = proveedorProductoUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    // B-01 (contexto/QA_INTEGRAL_2026-08-06.md): sin .select(), una fila
    // fuera de RLS devolvía 200 sin editarse.
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('proveedor_productos')
      .update(parsed.data)
      .eq('id', params.id)
      .select('id');
    if (error) {
      const preferenteDuplicado = /uq_prov_prod_preferente/i.test(error.message);
      return NextResponse.json(
        { error: preferenteDuplicado ? 'Ya existe un proveedor preferente activo para este producto.' : error.message },
        { status: 400 }
      );
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'No se pudo editar: el registro no existe o no tienes permiso.' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
