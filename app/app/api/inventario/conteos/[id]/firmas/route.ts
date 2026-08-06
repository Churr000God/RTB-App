export const dynamic = 'force-dynamic';

import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { conteoFirmaCreateSchema } from '@/lib/inventario/schemas';
import { ROLES_FIRMAN_SUPERVISION } from '@/lib/inventario/permisos';

// POST - firma el acta en su versión vigente. hash_contenido es un digest
// del estado del conteo al momento de firmar (folio+versión+exactitud) —
// una edición del acta después de firmada cambia el hash, dejando la firma
// desalineada de forma detectable. La RLS real exige firmante_id = tu
// propio uid (012); este endpoint también valida qué rol_firma puede
// reclamar cada usuario ("supervisor"/"gerente_operaciones" ⊂
// super_admin/direccion — regla fina que la RLS no puede expresar).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin', 'direccion', 'almacen']);
    if (response) return response;

    const parsed = conteoFirmaCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    const { rol_firma, comentario } = parsed.data;

    if (
      (rol_firma === 'supervisor' || rol_firma === 'gerente_operaciones') &&
      !ROLES_FIRMAN_SUPERVISION.includes(auth.profile.role)
    ) {
      return NextResponse.json({ error: `Tu rol no puede firmar como "${rol_firma}".` }, { status: 403 });
    }

    const supabase = createSupabaseServerClient();
    const { data: conteo } = await supabase
      .from('inventario_conteos')
      .select('folio, version, exactitud_registro, exactitud_pieza, exactitud_valor, cobertura')
      .eq('id', params.id)
      .maybeSingle();
    if (!conteo) return NextResponse.json({ error: 'Conteo no encontrado' }, { status: 404 });

    const hash_contenido = createHash('sha256')
      .update(JSON.stringify({ conteoId: params.id, ...conteo, firmadoEn: Date.now() }))
      .digest('hex');

    const { data, error } = await supabase
      .from('inventario_conteo_firmas')
      .insert({ conteo_id: params.id, version: conteo.version, rol_firma, comentario, hash_contenido })
      .select('*')
      .single();
    if (error) {
      const duplicada = /duplicate key|unique/i.test(error.message);
      return NextResponse.json(
        { error: duplicada ? 'Ya firmaste este conteo con ese rol en esta versión.' : error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
