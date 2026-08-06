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

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from('proveedor_productos').update(parsed.data).eq('id', params.id);
    if (error) {
      const preferenteDuplicado = /uq_prov_prod_preferente/i.test(error.message);
      return NextResponse.json(
        { error: preferenteDuplicado ? 'Ya existe un proveedor preferente activo para este producto.' : error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
