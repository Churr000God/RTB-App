export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';

const schema = z.object({
  nombreArchivo: z
    .string()
    .trim()
    .min(1)
    .refine((n) => /\.(pdf|jpe?g|png)$/i.test(n), 'Sólo se admite PDF, JPG o PNG'),
});

// POST - URL firmada de subida para el bucket privado 'comprobantes-bancarios'
// (P03 §VI). El comprobante nunca se sirve por URL pública; ni el bucket ni
// el path se exponen sin pasar antes por requireApiRole.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['finanzas', 'super_admin']);
    if (response) return response;

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const path = `${params.id}/${crypto.randomUUID()}-${parsed.data.nombreArchivo}`;

    const { data, error } = await admin.storage.from('comprobantes-bancarios').createSignedUploadUrl(path);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ path, token: data.token, signedUrl: data.signedUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
