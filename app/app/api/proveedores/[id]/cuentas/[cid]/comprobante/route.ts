export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';

// GET - URL firmada de lectura, de corta duración (60s), para ver el
// comprobante ya subido. Sólo finanzas/super_admin (P03 §II) — direccion
// ni siquiera ve esta ruta en la matriz de permisos.
export async function GET(_request: Request, { params }: { params: { id: string; cid: string } }) {
  try {
    const { response } = await requireApiRole(['finanzas', 'super_admin']);
    if (response) return response;

    const admin = createSupabaseAdminClient();
    const { data: cuenta } = await admin
      .from('proveedor_cuentas_bancarias')
      .select('proveedor_id, comprobante_path')
      .eq('id', params.cid)
      .maybeSingle();

    if (!cuenta || cuenta.proveedor_id !== params.id) {
      return NextResponse.json({ error: 'Cuenta bancaria no encontrada' }, { status: 404 });
    }

    const { data, error } = await admin.storage
      .from('comprobantes-bancarios')
      .createSignedUrl(cuenta.comprobante_path, 60);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
