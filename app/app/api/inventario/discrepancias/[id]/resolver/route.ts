export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { discrepanciaResolverSchema } from '@/lib/inventario/schemas';

// POST - clasifica/resuelve una discrepancia: causa presunta, banda,
// salida (UBI/CAP/AJU/AJU s/s/Justificado/HAL/MEN — vocabulario real de
// CIE-DIS-01 §X). dis_causa_chk (013) es la barrera real: "una diferencia
// sin causa identificada no se ajusta, se declara como hallazgo" — este
// endpoint sólo traduce esa excepción a un mensaje si el zod no la atrapó
// antes del round-trip.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'almacen', 'compras']);
    if (response) return response;

    const parsed = discrepanciaResolverSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from('inventario_discrepancias').update(parsed.data).eq('id', params.id);
    if (error) {
      const sinCausa = /dis_causa_chk/i.test(error.message);
      return NextResponse.json(
        {
          error: sinCausa
            ? 'Esta salida exige causa presunta y banda: una diferencia sin causa identificada se declara hallazgo, no se ajusta.'
            : error.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
