export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { conteoTransicionSchema } from '@/lib/inventario/schemas';
import { CONTEO_TRANSICIONES } from '@/lib/inventario/config';

// POST - transición de estado (salvo 'congelado', que va por /congelar
// porque además genera las líneas). La máquina de estados real vive en
// inventario_conteos_before_update() (012) — este endpoint sólo hace el
// UPDATE y traduce el error a un mensaje de negocio; el RAISE EXCEPTION de
// "sin firma de supervisor/gerente_operaciones" ya viene en español.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'almacen']);
    if (response) return response;

    const parsed = conteoTransicionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    const { estado, motivo_cancelacion } = parsed.data;
    if (estado === 'congelado') {
      return NextResponse.json({ error: 'Usa /congelar para pasar a congelado.' }, { status: 400 });
    }
    // E-04: este endpoint es genérico (super_admin/direccion/almacen) — sin
    // este rechazo, almacen podía "aplicar" un conteo por esta puerta
    // aunque /aplicar exija super_admin/direccion. inventario_aplicar_conteo()
    // (016) ya bloquea el rol también a nivel de función, esto es además
    // para que el error sea claro antes del round-trip.
    if (estado === 'aplicado') {
      return NextResponse.json({ error: 'Usa /aplicar para pasar a aplicado.' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    const { data: conteo } = await supabase.from('inventario_conteos').select('estado').eq('id', params.id).maybeSingle();
    if (!conteo) return NextResponse.json({ error: 'Conteo no encontrado' }, { status: 404 });
    if (!CONTEO_TRANSICIONES[conteo.estado as keyof typeof CONTEO_TRANSICIONES]?.includes(estado)) {
      return NextResponse.json({ error: `Transición no permitida: ${conteo.estado} → ${estado}` }, { status: 409 });
    }

    const payload: Record<string, unknown> = { estado };
    if (estado === 'cancelado') payload.motivo_cancelacion = motivo_cancelacion;

    const { error } = await supabase.from('inventario_conteos').update(payload).eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
