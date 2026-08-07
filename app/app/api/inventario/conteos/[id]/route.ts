export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { conteoUpdateSchema } from '@/lib/inventario/schemas';

// GET - detalle agregado: conteo + asignaciones + congelamientos activos +
// firmas + versiones. NO incluye las líneas (inventario_conteo_detalles) —
// eso vive en /conciliacion (con teórico, sólo supervisión) y en
// /detalles del lado de captura (sin teórico, vista ciega real de la
// tabla base vía el cliente del usuario, no de esta ruta).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data: conteo, error } = await supabase
      .from('inventario_conteos')
      .select('*')
      .eq('id', params.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!conteo) return NextResponse.json({ error: 'Conteo no encontrado' }, { status: 404 });

    const [asignaciones, congelamientos, firmas, versiones] = await Promise.all([
      supabase.from('inventario_conteo_asignaciones').select('*').eq('conteo_id', params.id),
      supabase.from('inventario_congelamientos').select('*').eq('conteo_id', params.id).is('liberado_at', null),
      supabase.from('inventario_conteo_firmas').select('*').eq('conteo_id', params.id).order('firmado_at'),
      supabase.from('inventario_conteo_versiones').select('*').eq('conteo_id', params.id).order('version'),
    ]);

    return NextResponse.json({
      conteo,
      asignaciones: asignaciones.data ?? [],
      congelamientos: congelamientos.data ?? [],
      firmas: firmas.data ?? [],
      versiones: versiones.data ?? [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// PATCH - edición de metadatos (nombre/alcance_descripcion/fecha_programada/
// supervisor_id) — nunca de estado, eso va por /estado.
//
// B-01 (contexto/QA_INTEGRAL_2026-08-06.md): mismo patrón que estado/route.ts
// — un UPDATE sin .select() no distingue "0 filas por RLS" de "1 fila
// actualizada"; ambos devuelven error=null.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'almacen']);
    if (response) return response;

    const parsed = conteoUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('inventario_conteos').update(parsed.data).eq('id', params.id).select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'No se pudo editar: el conteo no existe o no tienes permiso.' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
