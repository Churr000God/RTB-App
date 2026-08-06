export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { productoComercialUpdateSchema, productoUpdateLibreSchema } from '@/lib/inventario/schemas';

// GET - detalle agregado: producto + existencias por ubicación + costo
// vigente. Mismo patrón que app/app/api/entidades/[id]/route.ts.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const supabase = createSupabaseServerClient();

    const { data: producto, error: productoError } = await supabase
      .from('productos')
      .select('*')
      .eq('id', params.id)
      .maybeSingle();
    if (productoError) return NextResponse.json({ error: productoError.message }, { status: 500 });
    if (!producto) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

    const [existencias, costoVigente, precios] = await Promise.all([
      supabase.from('inventario_existencias').select('*').eq('producto_id', params.id),
      supabase.rpc('costo_unitario_vigente', { p_producto_id: params.id }),
      supabase.from('producto_precios_referencia').select('*').eq('producto_id', params.id).is('vigente_hasta', null),
    ]);

    return NextResponse.json({
      producto,
      existencias: existencias.data ?? [],
      costoVigente: costoVigente.data ?? null,
      precios: precios.data ?? [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// PATCH - edición libre (nombre/descripción/marca_id/…) por RLS directa, y
// edición "comercial" (stock_minimo/stock_maximo/es_estrategico) por API
// con service_role: son de 'compras' y un GRANT de Postgres no distingue
// rol de negocio dentro de 'authenticated' — mismo criterio que
// entidades.nombre_legal (002_entidades_core.sql).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin', 'direccion', 'compras', 'almacen']);
    if (response) return response;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    const { stock_minimo, stock_maximo, es_estrategico, ...libreBody } = body as Record<string, unknown>;
    const tieneComercial = stock_minimo !== undefined || stock_maximo !== undefined || es_estrategico !== undefined;

    if (tieneComercial && !['super_admin', 'direccion', 'compras'].includes(auth.profile.role)) {
      return NextResponse.json({ error: 'Sólo Compras puede editar los parámetros comerciales.' }, { status: 403 });
    }

    if (Object.keys(libreBody).length > 0) {
      const parsedLibre = productoUpdateLibreSchema.safeParse(libreBody);
      if (!parsedLibre.success) {
        return NextResponse.json({ error: parsedLibre.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
      }
      const supabase = createSupabaseServerClient();
      const { error } = await supabase.from('productos').update(parsedLibre.data).eq('id', params.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (tieneComercial) {
      const parsedComercial = productoComercialUpdateSchema.safeParse({ stock_minimo, stock_maximo, es_estrategico });
      if (!parsedComercial.success) {
        return NextResponse.json(
          { error: parsedComercial.error.issues[0]?.message ?? 'Datos inválidos' },
          { status: 400 }
        );
      }
      const admin = createSupabaseAdminClient();
      const { error } = await admin.from('productos').update(parsedComercial.data).eq('id', params.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
