export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { poEvidenciaSchema } from '@/lib/ventas/schemas';
import { statusPorErrcode } from '@/lib/ventas/errores';
import { EVIDENCIA_VENTAS_BUCKET } from '@/lib/ventas/config';
import { ROLES_ADJUNTAN_EVIDENCIA_PO } from '@/lib/ventas/permisos';

// PATCH - adjunta o reemplaza el documento de PO que mandó el cliente
// (ventas_po_adjuntar_evidencia(), 044) — el archivo ya se subió antes al
// bucket privado 'evidencias-ventas' vía POST /api/ventas/evidencias/upload-url
// (mismo patrón de 3 pasos que inventario/ajustes/[id]/page.tsx), aquí sólo
// se registra la ruta. No hay GRANT UPDATE de tabla para evidencia_path —
// la función es la única vía, dentro o fuera de esta ruta.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(ROLES_ADJUNTAN_EVIDENCIA_PO);
    if (response) return response;

    const parsed = poEvidenciaSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('ventas_po_adjuntar_evidencia', {
      p_po_id: params.id,
      p_path: parsed.data.evidencia_path,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusPorErrcode(error.code) });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// GET - URL firmada de lectura, de corta duración (60s), para ver el
// documento de PO ya adjuntado — mismo patrón que
// proveedores/[id]/cuentas/[cid]/comprobante/route.ts. No existía ninguna
// ruta de lectura firmada para 'evidencias-ventas' hasta ahora.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(ROLES_ADJUNTAN_EVIDENCIA_PO);
    if (response) return response;

    const admin = createSupabaseAdminClient();
    const { data: po } = await admin
      .from('ventas_ordenes_compra_cliente')
      .select('evidencia_path')
      .eq('id', params.id)
      .maybeSingle();

    if (!po?.evidencia_path) {
      return NextResponse.json({ error: 'Esta PO no tiene ningún documento adjunto.' }, { status: 404 });
    }

    const { data, error } = await admin.storage.from(EVIDENCIA_VENTAS_BUCKET).createSignedUrl(po.evidencia_path, 60);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
