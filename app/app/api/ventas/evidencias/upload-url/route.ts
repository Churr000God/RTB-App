export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { evidenciaUploadSchema } from '@/lib/ventas/schemas';
import { EVIDENCIA_VENTAS_BUCKET } from '@/lib/ventas/config';

// POST - URL firmada de subida para el bucket privado 'evidencias-ventas'
// (029) — evidencia de aprobación del cliente, congelamiento y excepción.
// Mismo patrón que comprobante-upload-url (RTB-ENT-01) y
// soporte-upload-url (RTB-INV-01).
export async function POST(request: Request) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'ventas', 'facturacion', 'finanzas']);
    if (response) return response;

    const parsed = evidenciaUploadSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const path = `${crypto.randomUUID()}-${parsed.data.nombreArchivo}`;

    const { data, error } = await admin.storage.from(EVIDENCIA_VENTAS_BUCKET).createSignedUploadUrl(path);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ path, token: data.token, signedUrl: data.signedUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
