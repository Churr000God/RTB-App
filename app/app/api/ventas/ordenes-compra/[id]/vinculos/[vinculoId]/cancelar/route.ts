export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { vinculoCancelarSchema } from '@/lib/ventas/schemas';
import { statusPorErrcode } from '@/lib/ventas/errores';

// POST - deshace un vínculo PO↔NR capturado por error (ventas_vinculo_cancelar(),
// 036). Nunca borra la fila: la marca 'cancelado' con quién/cuándo/por qué,
// y recalcula el estado de la PO y de la NR hacia atrás (el CASE de
// ventas_po_validar() sólo avanza). Bloqueada si el vínculo ya tiene
// consecuencia de facturación (aprobado_para_facturacion/facturado) — sale
// como 42501, no como {success:false}, porque es un intento inválido del
// llamante, no un resultado de negocio nuevo.
export async function POST(
  request: Request,
  { params }: { params: { id: string; vinculoId: string } }
) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'ventas']);
    if (response) return response;

    const parsed = vinculoCancelarSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('ventas_vinculo_cancelar', {
      p_vinculo_id: params.vinculoId,
      p_motivo: parsed.data.motivo,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusPorErrcode(error.code) });

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
