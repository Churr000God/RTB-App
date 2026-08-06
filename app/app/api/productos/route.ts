export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { productoCreateSchema } from '@/lib/inventario/schemas';
import { adjuntarImagenPrincipal } from '@/lib/inventario/imagenes';

const PAGE_SIZE = 20;

// GET - listado paginado con filtros + KPIs (los 8 roles consultan, RLS lo decide).
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const estado = searchParams.get('estado');
    const familiaId = searchParams.get('familia_id');
    const categoriaId = searchParams.get('categoria_id');
    const marcaId = searchParams.get('marca_id');
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from('productos')
      .select('*, producto_marcas(clave, nombre)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (estado) query = query.eq('estado', estado);
    else query = query.neq('estado', 'fusionado');
    if (familiaId) query = query.eq('familia_id', familiaId);
    if (categoriaId) query = query.eq('categoria_id', categoriaId);
    if (marcaId) query = query.eq('marca_id', marcaId);
    if (q) {
      const like = `%${q.replace(/[%_]/g, '')}%`;
      const ors = [`nombre.ilike.${like}`, `codigo_interno.ilike.${like}`, `sku.ilike.${like}`];

      // marca ya no es texto en productos (015): se resuelve contra
      // producto_marcas por nombre o clave y se añade como marca_id.in(…).
      // Mejor que antes: exacta por marca, no ILIKE contra texto sucio.
      // .limit(50) acota la URL de PostgREST; los UUID no llevan comas ni
      // paréntesis, no hace falta citarlos.
      const { data: marcasHit } = await supabase
        .from('producto_marcas')
        .select('id')
        .or(`nombre.ilike.${like},clave.ilike.${like}`)
        .limit(50);
      if (marcasHit?.length) ors.push(`marca_id.in.(${marcasHit.map((m) => m.id).join(',')})`);

      query = query.or(ors.join(','));
    }

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const dataConImagen = await adjuntarImagenPrincipal(supabase, data ?? []);

    const [total, activos, requierenDepuracion, sinUbicacion, sinCosto] = await Promise.all([
      supabase.from('productos').select('id', { count: 'exact', head: true }).neq('estado', 'fusionado'),
      supabase.from('productos').select('id', { count: 'exact', head: true }).eq('estado', 'activo'),
      supabase.from('productos').select('id', { count: 'exact', head: true }).eq('estado', 'requiere_depuracion'),
      supabase
        .from('inventario_existencias')
        .select('id', { count: 'exact', head: true })
        .is('ubicacion_id', null)
        .neq('cantidad_teorica', 0),
      supabase
        .from('inventario_existencias')
        .select('id', { count: 'exact', head: true })
        .is('costo_promedio', null)
        .neq('cantidad_teorica', 0),
    ]);

    return NextResponse.json({
      data: dataConImagen,
      count: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
      kpis: {
        total: total.count ?? 0,
        activos: activos.count ?? 0,
        requierenDepuracion: requierenDepuracion.count ?? 0,
        sinUbicacion: sinUbicacion.count ?? 0,
        sinCosto: sinCosto.count ?? 0,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - alta de producto. codigo_interno es opcional (el trigger lo genera
// a partir de la familia si se omite). El GRANT INSERT de productos no
// restringe columnas (009_inventario_catalogo.sql) — sólo el UPDATE
// posterior congela identidad/unidad/lifecycle.
export async function POST(request: Request) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'compras', 'almacen']);
    if (response) return response;

    const parsed = productoCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('productos').insert(parsed.data).select('*').single();

    if (error) {
      const duplicado = /uq_productos_codigo_activo|duplicate key/i.test(error.message);
      return NextResponse.json(
        { error: duplicado ? 'Ya existe un producto activo con ese código interno.' : error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, id: data.id, codigo_interno: data.codigo_interno }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
