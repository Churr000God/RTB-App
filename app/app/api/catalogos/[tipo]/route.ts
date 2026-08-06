export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { resolverCatalogoTipo, type CatalogoTipo } from '@/lib/inventario/catalogos';
import { rolesQuePueden } from '@/lib/inventario/permisos';
import {
  categoriaCreateSchema,
  familiaCreateSchema,
  marcaCreateSchema,
  unidadMedidaCreateSchema,
} from '@/lib/inventario/schemas';

// Los cuatro catálogos de apoyo del submódulo (unidades_medida,
// producto_familias, producto_categorias, producto_marcas) comparten
// exactamente el mismo esqueleto de ruta — se resuelven aquí por [tipo] en
// vez de en cuatro archivos casi idénticos. `tabla`/`recurso` vienen del
// descriptor compartido (lib/inventario/catalogos.ts); el schema de zod se
// mantiene aquí, no en el descriptor, para no arrastrar zod al bundle de
// cliente que también importa ese archivo. Record<CatalogoTipo, …> obliga
// a TypeScript a exhaustividad: un 5º catálogo no compila hasta que se
// registre aquí.
const SCHEMAS: Record<CatalogoTipo, any> = {
  'unidades-medida': unidadMedidaCreateSchema,
  familias: familiaCreateSchema,
  categorias: categoriaCreateSchema,
  marcas: marcaCreateSchema,
};

// GET - listado plano (los 8 roles consultan). ?activo=false incluye
// inactivos (la pantalla de administración lo usa así; el formulario de
// alta de producto usa el default y sólo ve activos).
export async function GET(request: Request, { params }: { params: { tipo: string } }) {
  try {
    const meta = resolverCatalogoTipo(params.tipo);
    if (!meta) return NextResponse.json({ error: 'Catálogo desconocido' }, { status: 404 });

    const { response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const soloActivos = searchParams.get('activo') !== 'false';

    const supabase = createSupabaseServerClient();
    let query = supabase.from(meta.tabla).select('*').order(meta.orden, { ascending: true });
    if (soloActivos) query = query.eq('activo', true);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - alta. Roles derivados de la misma matriz que gatea la UI
// (lib/inventario/permisos.ts) — RLS sigue siendo la barrera real.
export async function POST(request: Request, { params }: { params: { tipo: string } }) {
  try {
    const tipo = params.tipo as CatalogoTipo;
    const meta = resolverCatalogoTipo(tipo);
    if (!meta) return NextResponse.json({ error: 'Catálogo desconocido' }, { status: 404 });

    const { response } = await requireApiRole(rolesQuePueden(meta.recurso, 'insert'));
    if (response) return response;

    const schema = SCHEMAS[tipo];
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from(meta.tabla).insert(parsed.data).select('*').single();

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
