export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { conteoVersionCreateSchema } from '@/lib/inventario/schemas';

// POST - publica una nueva versión del acta ("Versión | Corte | Qué
// corrigió", Acta CIE-CON-01 real, V1.0→V3.0). El snapshot congela los
// totales actuales (exactitud + conciliación) para que el acta sea
// reproducible aunque el conteo siga editándose.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion']);
    if (response) return response;

    const parsed = conteoVersionCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const [{ data: conteo }, { data: exactitud }] = await Promise.all([
      supabase.from('inventario_conteos').select('*').eq('id', params.id).maybeSingle(),
      supabase.rpc('inventario_exactitud', { p_conteo_id: params.id }),
    ]);
    if (!conteo) return NextResponse.json({ error: 'Conteo no encontrado' }, { status: 404 });

    const nuevaVersion = Number(conteo.version) + 0.1;

    const { data, error } = await supabase
      .from('inventario_conteo_versiones')
      .insert({
        conteo_id: params.id,
        version: nuevaVersion,
        corte_at: conteo.corte_at ?? new Date().toISOString(),
        que_corrigio: parsed.data.que_corrigio,
        snapshot: { exactitud, cobertura: conteo.cobertura },
      })
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // version no está en el GRANT UPDATE de inventario_conteos (012): sólo
    // service_role la avanza, y sólo tras publicar la versión del acta.
    const admin = createSupabaseAdminClient();
    const { error: versionError } = await admin
      .from('inventario_conteos')
      .update({ version: nuevaVersion })
      .eq('id', params.id);
    if (versionError) return NextResponse.json({ error: versionError.message }, { status: 400 });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
