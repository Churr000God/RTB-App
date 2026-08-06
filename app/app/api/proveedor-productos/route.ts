export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { proveedorProductoCreateSchema } from '@/lib/inventario/schemas';

// GET - lista de precios de compra. 'almacen' no tiene GRANT SELECT sobre
// esta tabla (proveedor_productos_select en 010_inventario_costos.sql) —
// llega al costo por public.costo_unitario_vigente(), no por aquí.
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'compras', 'finanzas']);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const proveedorId = searchParams.get('proveedor_id');
    const productoId = searchParams.get('producto_id');

    const supabase = createSupabaseServerClient();
    let query = supabase
      .from('proveedor_productos')
      .select('*')
      .order('created_at', { ascending: false });
    if (proveedorId) query = query.eq('proveedor_id', proveedorId);
    if (productoId) query = query.eq('producto_id', productoId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - alta de un precio de proveedor. uq_prov_prod_preferente (010)
// permite un solo preferente activo por producto; el error de duplicado se
// traduce a un mensaje de negocio.
export async function POST(request: Request) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'compras']);
    if (response) return response;

    const parsed = proveedorProductoCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('proveedor_productos').insert(parsed.data).select('*').single();

    if (error) {
      const preferenteDuplicado = /uq_prov_prod_preferente/i.test(error.message);
      const vigenciaDuplicada = /uq_prov_prod_vigencia/i.test(error.message);
      return NextResponse.json(
        {
          error: preferenteDuplicado
            ? 'Ya existe un proveedor preferente activo para este producto.'
            : vigenciaDuplicada
              ? 'Ya existe un precio de este proveedor para este producto con esa misma fecha de vigencia.'
              : error.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
