export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import {
  categoriaCreateSchema,
  familiaCreateSchema,
  unidadMedidaCreateSchema,
} from '@/lib/inventario/schemas';

// Los tres catálogos de apoyo del submódulo (unidades_medida,
// producto_familias, producto_categorias) comparten exactamente el mismo
// esqueleto de ruta — se resuelven aquí por [tipo] en vez de en tres
// archivos casi idénticos. GRANT INSERT de las tres tablas es sin
// restricción de columna (009_inventario_catalogo.sql); sólo el UPDATE
// congela la clave — eso vive en [id]/route.ts.
const TABLAS: Record<string, { tabla: string; orden: string; schema: any }> = {
  'unidades-medida': { tabla: 'unidades_medida', orden: 'clave', schema: unidadMedidaCreateSchema },
  familias: { tabla: 'producto_familias', orden: 'clave', schema: familiaCreateSchema },
  categorias: { tabla: 'producto_categorias', orden: 'clave', schema: categoriaCreateSchema },
};

function resolverTipo(tipo: string) {
  return TABLAS[tipo] ?? null;
}

// GET - listado plano (los 8 roles consultan). ?activo=false incluye inactivos.
export async function GET(request: Request, { params }: { params: { tipo: string } }) {
  try {
    const resolved = resolverTipo(params.tipo);
    if (!resolved) return NextResponse.json({ error: 'Catálogo desconocido' }, { status: 404 });

    const { response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const soloActivos = searchParams.get('activo') !== 'false';

    const supabase = createSupabaseServerClient();
    let query = supabase.from(resolved.tabla).select('*').order(resolved.orden, { ascending: true });
    if (soloActivos) query = query.eq('activo', true);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - alta. compras/almacen administran el catálogo físico y de costos
// (mismo criterio que las políticas RLS de 009).
export async function POST(request: Request, { params }: { params: { tipo: string } }) {
  try {
    const resolved = resolverTipo(params.tipo);
    if (!resolved) return NextResponse.json({ error: 'Catálogo desconocido' }, { status: 404 });

    const { response } = await requireApiRole(['super_admin', 'direccion', 'compras', 'almacen']);
    if (response) return response;

    const parsed = resolved.schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from(resolved.tabla).insert(parsed.data).select('*').single();

    if (error) {
      const duplicado = /duplicate key|unique/i.test(error.message);
      return NextResponse.json(
        { error: duplicado ? 'Ya existe un registro con esa clave.' : error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
