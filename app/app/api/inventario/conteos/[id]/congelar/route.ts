export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';

/**
 * Forma esperada de inventario_conteos.alcance (jsonb libre, interpretado
 * aquí — no en SQL, ver comment on table de 012_inventario_conteos.sql):
 *   { ubicacion_id?: string, incluye_descendientes?: boolean,
 *     familia_id?: string, producto_ids?: string[] }
 * Vacío ({}) = todo el catálogo con existencia registrada.
 */
interface Alcance {
  ubicacion_id?: string;
  incluye_descendientes?: boolean;
  familia_id?: string;
  producto_ids?: string[];
}

// POST - congela el conteo: resuelve `alcance` contra inventario_existencias,
// congela esas ubicaciones/productos (bloqueando el kardex mientras dura,
// public.inventario_congelamiento_activo()) y genera el snapshot de líneas
// en inventario_conteo_detalles. Va por service_role porque
// inventario_conteo_detalles no tiene GRANT INSERT para authenticated bajo
// ninguna circunstancia (012) — sólo el congelamiento genera líneas.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin', 'direccion', 'almacen']);
    if (response) return response;

    const admin = createSupabaseAdminClient();

    const { data: conteo } = await admin.from('inventario_conteos').select('*').eq('id', params.id).maybeSingle();
    if (!conteo) return NextResponse.json({ error: 'Conteo no encontrado' }, { status: 404 });
    if (conteo.estado !== 'planificado') {
      return NextResponse.json({ error: 'Sólo se congela un conteo en estado planificado.' }, { status: 409 });
    }

    const alcance = (conteo.alcance ?? {}) as Alcance;

    // Resuelve ubicaciones en alcance (incluidos descendientes por prefijo
    // de código, mismo idioma que el árbol de ubicaciones_internas: el
    // código hereda el prefijo del padre).
    let ubicacionIds: string[] | null = null;
    if (alcance.ubicacion_id) {
      const { data: raiz } = await admin
        .from('ubicaciones_internas')
        .select('id, codigo')
        .eq('id', alcance.ubicacion_id)
        .maybeSingle();
      if (!raiz) return NextResponse.json({ error: 'La ubicación del alcance no existe.' }, { status: 400 });

      if (alcance.incluye_descendientes ?? true) {
        const { data: hijos } = await admin
          .from('ubicaciones_internas')
          .select('id')
          .or(`id.eq.${raiz.id},codigo.like.${raiz.codigo}-%`);
        ubicacionIds = (hijos ?? []).map((u) => u.id);
      } else {
        ubicacionIds = [raiz.id];
      }
    }

    let productoIds: string[] | null = alcance.producto_ids ?? null;
    if (alcance.familia_id) {
      const { data: productos } = await admin.from('productos').select('id').eq('familia_id', alcance.familia_id);
      const idsFamilia = (productos ?? []).map((p) => p.id);
      productoIds = productoIds ? productoIds.filter((id) => idsFamilia.includes(id)) : idsFamilia;
    }

    let existenciasQuery = admin
      .from('inventario_existencias')
      .select('id, producto_id, ubicacion_id, cantidad_teorica, costo_promedio, productos(unidad_medida_id, contenido_por_unidad)');
    if (ubicacionIds) existenciasQuery = existenciasQuery.in('ubicacion_id', ubicacionIds);
    if (productoIds) existenciasQuery = existenciasQuery.in('producto_id', productoIds);

    const { data: existencias, error: existenciasError } = await existenciasQuery;
    if (existenciasError) return NextResponse.json({ error: existenciasError.message }, { status: 500 });
    if (!existencias || existencias.length === 0) {
      return NextResponse.json({ error: 'El alcance no encontró existencias que congelar.' }, { status: 400 });
    }

    const detalles = existencias.map((e: any) => ({
      conteo_id: params.id,
      producto_id: e.producto_id,
      ubicacion_id: e.ubicacion_id,
      cantidad_teorica: e.cantidad_teorica,
      unidad_base_id: e.productos.unidad_medida_id,
      contenido_por_unidad_snapshot: e.productos.contenido_por_unidad,
      costo_unitario_snapshot: e.costo_promedio,
      costo_origen: e.costo_promedio != null ? 'promedio' : 'sin_costo',
    }));

    const { error: detallesError } = await admin.from('inventario_conteo_detalles').insert(detalles);
    if (detallesError) return NextResponse.json({ error: detallesError.message }, { status: 500 });

    // Congelamiento(s): uno por ubicación raíz en alcance, o uno general
    // (sin ubicacion_id ni producto_id no es válido — cong_alcance_chk
    // exige al menos uno) por cada producto si el alcance es por producto_ids
    // sin ubicación. Para el caso "todo el catálogo" (alcance vacío) se
    // congela por cada producto involucrado, ya que no hay una única
    // ubicación raíz que lo cubra todo.
    const congelamientos: Record<string, unknown>[] = alcance.ubicacion_id
      ? [{ conteo_id: params.id, ubicacion_id: alcance.ubicacion_id, incluye_descendientes: alcance.incluye_descendientes ?? true }]
      : Array.from(new Set(existencias.map((e: any) => e.producto_id))).map((producto_id) => ({
          conteo_id: params.id,
          producto_id,
        }));

    const { error: congelamientoError } = await admin.from('inventario_congelamientos').insert(congelamientos);
    if (congelamientoError) return NextResponse.json({ error: congelamientoError.message }, { status: 500 });

    const { error: estadoError } = await admin
      .from('inventario_conteos')
      .update({ estado: 'congelado' })
      .eq('id', params.id);
    if (estadoError) return NextResponse.json({ error: estadoError.message }, { status: 400 });

    return NextResponse.json({ success: true, lineasGeneradas: detalles.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
