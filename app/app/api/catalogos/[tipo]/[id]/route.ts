export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import {
  categoriaUpdateSchema,
  familiaUpdateSchema,
  unidadMedidaUpdateSchema,
} from '@/lib/inventario/schemas';

const TABLAS: Record<string, { tabla: string; schema: any }> = {
  'unidades-medida': { tabla: 'unidades_medida', schema: unidadMedidaUpdateSchema },
  familias: { tabla: 'producto_familias', schema: familiaUpdateSchema },
  categorias: { tabla: 'producto_categorias', schema: categoriaUpdateSchema },
};

// PATCH - edición libre de nombre/descripción/activo (la clave queda fuera
// del GRANT UPDATE de las tres tablas, 009_inventario_catalogo.sql).
export async function PATCH(request: Request, { params }: { params: { tipo: string; id: string } }) {
  try {
    const resolved = TABLAS[params.tipo];
    if (!resolved) return NextResponse.json({ error: 'Catálogo desconocido' }, { status: 404 });

    const { response } = await requireApiRole(['super_admin', 'direccion', 'compras', 'almacen']);
    if (response) return response;

    const parsed = resolved.schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from(resolved.tabla).update(parsed.data).eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
