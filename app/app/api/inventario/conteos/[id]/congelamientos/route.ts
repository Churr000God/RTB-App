export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { conteoCongelamientoCreateSchema } from '@/lib/inventario/schemas';

// GET - congelamientos del conteo, para la sección "Congelamiento" del
// detalle (E-05/M-09, contexto/AUDITORIA_QA_ROLES_2026-08-06.md): antes no
// existía ninguna ruta para listarlos, así que un producto congelado por
// un conteo terminado se quedaba inmovilizado para siempre — no había
// dónde verlo ni liberarlo desde la app.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('inventario_congelamientos')
      .select('id, conteo_id, ubicacion_id, incluye_descendientes, producto_id, congelado_at, liberado_at, motivo_liberacion, ubicaciones_internas(codigo, nombre), productos(codigo_interno, nombre)')
      .eq('conteo_id', params.id)
      .order('congelado_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - congelamiento manual adicional dentro de un conteo ya congelado
// (p.ej. ampliar el freeze a una ubicación que se sumó tarde). El
// congelamiento masivo inicial lo genera /congelar.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'almacen']);
    if (response) return response;

    const parsed = conteoCongelamientoCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('inventario_congelamientos')
      .insert({ ...parsed.data, conteo_id: params.id })
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
