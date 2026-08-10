export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { productoCostoCreateSchema } from '@/lib/inventario/schemas';

// GET - histórico de costo de catálogo (con vigencia). El nombre del
// proveedor se resuelve aparte (no con un embed anidado de 3 niveles
// producto_costos->proveedor_productos->proveedores->entidades): 'almacen'
// no tiene GRANT SELECT sobre proveedor_productos, así que un embed ahí
// volvería null en silencio para ese rol — mejor una consulta aparte que
// se salta sola si no hay ningún proveedor_producto_id que resolver.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('producto_costos')
      .select('*')
      .eq('producto_id', params.id)
      .order('vigente_desde', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const filas = data ?? [];
    const idsProveedorProducto = [...new Set(filas.map((c) => c.proveedor_producto_id).filter(Boolean))];
    let nombrePorProveedorProducto = new Map<string, string>();
    if (idsProveedorProducto.length > 0) {
      const { data: pp } = await supabase
        .from('proveedor_productos')
        .select('id, proveedores(entidades(nombre_comercial, nombre_legal))')
        .in('id', idsProveedorProducto);
      nombrePorProveedorProducto = new Map(
        (pp ?? []).map((p: any) => [
          p.id,
          p.proveedores?.entidades?.nombre_comercial ?? p.proveedores?.entidades?.nombre_legal ?? '—',
        ])
      );
    }

    const enriquecidas = filas.map((c) => ({
      ...c,
      proveedor_nombre: c.proveedor_producto_id ? nombrePorProveedorProducto.get(c.proveedor_producto_id) ?? null : null,
    }));

    return NextResponse.json({ data: enriquecidas });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - carga de costo, incluida carga retroactiva ("el costo es un
// atributo del catálogo, no un evento del periodo" — Acta CIE-CON-01 real).
// pc_retroactivo_chk (010) exige motivo si vigente_desde queda en el
// pasado; el zod ya lo valida antes del round-trip.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'compras', 'finanzas']);
    if (response) return response;

    const parsed = productoCostoCreateSchema.safeParse({
      ...(await request.json().catch(() => null)),
      producto_id: params.id,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('producto_costos').insert(parsed.data).select('*').single();
    if (error) {
      const abierto = /uq_producto_costos_abierto|duplicate key/i.test(error.message);
      return NextResponse.json(
        { error: abierto ? 'Ya existe un costo vigente sin fecha de cierre; cierra el anterior primero.' : error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
