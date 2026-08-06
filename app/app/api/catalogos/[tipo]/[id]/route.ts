export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { resolverCatalogoTipo, type CatalogoTipo } from '@/lib/inventario/catalogos';
import { rolesQuePueden } from '@/lib/inventario/permisos';
import {
  categoriaUpdateSchema,
  familiaUpdateSchema,
  marcaUpdateSchema,
  unidadMedidaUpdateSchema,
} from '@/lib/inventario/schemas';

const SCHEMAS: Record<CatalogoTipo, any> = {
  'unidades-medida': unidadMedidaUpdateSchema,
  familias: familiaUpdateSchema,
  categorias: categoriaUpdateSchema,
  marcas: marcaUpdateSchema,
};

// PATCH - edición libre de nombre/descripción/activo (u otros campos según
// el catálogo — ver GRANT UPDATE por columna de cada tabla). La clave queda
// fuera del GRANT UPDATE de las cuatro tablas (009/015), así que nunca
// llega en el payload de este endpoint.
export async function PATCH(request: Request, { params }: { params: { tipo: string; id: string } }) {
  try {
    const tipo = params.tipo as CatalogoTipo;
    const meta = resolverCatalogoTipo(tipo);
    if (!meta) return NextResponse.json({ error: 'Catálogo desconocido' }, { status: 404 });

    const { response } = await requireApiRole(rolesQuePueden(meta.recurso, 'update'));
    if (response) return response;

    const schema = SCHEMAS[tipo];
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from(meta.tabla).update(parsed.data).eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
