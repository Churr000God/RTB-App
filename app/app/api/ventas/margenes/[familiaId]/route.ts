export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { margenUpdateSchema } from '@/lib/ventas/schemas';
import { rolesQuePueden } from '@/lib/ventas/permisos';

// PATCH - margen de ganancia de la familia (producto_familias.margen_porcentaje,
// 028). Fuera de todo GRANT UPDATE a propósito: es política comercial de
// Dirección, no un parámetro de catálogo — se escribe con service_role
// tras validar rol aquí.
export async function PATCH(request: Request, { params }: { params: { familiaId: string } }) {
  try {
    const { response } = await requireApiRole(rolesQuePueden('margenes', 'update'));
    if (response) return response;

    const parsed = margenUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from('producto_familias')
      .update({ margen_porcentaje: parsed.data.margen_porcentaje })
      .eq('id', params.familiaId)
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Familia no encontrada.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
