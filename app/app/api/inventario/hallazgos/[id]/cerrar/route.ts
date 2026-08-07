export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { hallazgoCerrarSchema } from '@/lib/inventario/schemas';

// POST - cierra un hallazgo, con o sin causa identificada finalmente.
// cerrado_at/cerrado_por los estampa hallazgos_before_update() (013).
// B-01 (contexto/QA_INTEGRAL_2026-08-06.md): sin .select(), un hallazgo
// fuera de RLS devolvía 200 sin cerrarse.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'almacen', 'compras']);
    if (response) return response;

    const parsed = hallazgoCerrarSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('inventario_hallazgos').update(parsed.data).eq('id', params.id).select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'No se pudo cerrar: el hallazgo no existe o no tienes permiso.' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
