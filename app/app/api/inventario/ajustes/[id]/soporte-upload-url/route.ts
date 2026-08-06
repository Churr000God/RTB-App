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

// POST - URL firmada de subida para el bucket privado 'soportes-inventario'
// (CIE-AJU-01). Gap de UI (contexto/AUDITORIA_QA_ROLES_2026-08-06.md §4):
// el campo de soporte era una ruta de texto libre — el bucket y sus
// políticas ya existían (013_inventario_discrepancias_ajustes.sql) pero
// nunca hubo ruta ni <input type="file">. Mismo patrón que
// comprobante-upload-url de RTB-ENT-01 (proveedores/[id]/cuentas).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'almacen', 'compras']);
    if (response) return response;

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const path = `${params.id}/${crypto.randomUUID()}-${parsed.data.nombreArchivo}`;

    const { data, error } = await admin.storage.from('soportes-inventario').createSignedUploadUrl(path);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ path, token: data.token, signedUrl: data.signedUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
