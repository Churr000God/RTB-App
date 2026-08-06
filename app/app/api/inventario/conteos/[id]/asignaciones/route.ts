export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { conteoAsignacionCreateSchema } from '@/lib/inventario/schemas';

// POST - asigna a alguien la captura de una ubicación/familia dentro del
// conteo (limitación #6 real: "no se registra quién contó qué ubicación").
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'almacen']);
    if (response) return response;

    const parsed = conteoAsignacionCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('inventario_conteo_asignaciones')
      .insert({ ...parsed.data, conteo_id: params.id })
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// PATCH - iniciar/finalizar una asignación propia.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin', 'direccion', 'almacen']);
    if (response) return response;

    const body = await request.json().catch(() => null);
    const asignacionId = body?.asignacion_id as string | undefined;
    const accion = body?.accion as 'iniciar' | 'finalizar' | undefined;
    if (!asignacionId || !accion) return NextResponse.json({ error: 'Faltan asignacion_id/accion' }, { status: 400 });

    const supabase = createSupabaseServerClient();
    const payload = accion === 'iniciar' ? { iniciado_at: new Date().toISOString() } : { finalizado_at: new Date().toISOString() };
    const { error } = await supabase
      .from('inventario_conteo_asignaciones')
      .update(payload)
      .eq('id', asignacionId)
      .eq('conteo_id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
