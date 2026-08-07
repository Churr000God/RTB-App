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
//
// B-01 (contexto/QA_INTEGRAL_2026-08-06.md): el UPDATE de abajo no
// llamaba .select(), así que supabase-js mandaba `Prefer: return=minimal`
// y PostgREST respondía 204 tanto si afectó 1 fila como si el `USING` de
// la política RLS (012) filtró la fila en silencio (0 filas, error=null) —
// un clic real podía devolver 200 sin persistir nada. Mismo patrón que ya
// usan detalles/[detalleId]/route.ts y recontar/route.ts: pedir
// .select('id') y comprobar que sí matcheó.
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

    const { data: conteo, error: lecturaError } = await supabase
      .from('inventario_conteos')
      .select('estado')
      .eq('id', params.id)
      .maybeSingle();
    if (lecturaError) return NextResponse.json({ error: lecturaError.message }, { status: 400 });
    if (!conteo) return NextResponse.json({ error: 'Conteo no encontrado' }, { status: 404 });
    if (!CONTEO_TRANSICIONES[conteo.estado as keyof typeof CONTEO_TRANSICIONES]?.includes(estado)) {
      return NextResponse.json({ error: `Transición no permitida: ${conteo.estado} → ${estado}` }, { status: 409 });
    }

    const payload: Record<string, unknown> = { estado };
    if (estado === 'cancelado') payload.motivo_cancelacion = motivo_cancelacion;

    const { data: actualizado, error } = await supabase
      .from('inventario_conteos')
      .update(payload)
      .eq('id', params.id)
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!actualizado || actualizado.length === 0) {
      return NextResponse.json(
        { error: `No se pudo aplicar la transición ${conteo.estado} → ${estado}: el conteo cambió o no tienes permiso.` },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
