export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { clientePoliticaUpdateSchema } from '@/lib/ventas/schemas';

// PATCH - requiere_po/tipo_cliente (029, RTB-VEN-01). Mismo idioma de
// columnas que dias_credito/canal_origen (002): 'ventas' ya administra
// clientes por RLS, sólo hacía falta el GRANT de columna para estos dos
// campos nuevos.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'ventas']);
    if (response) return response;

    const parsed = clientePoliticaUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('clientes')
      .update(parsed.data)
      .eq('entidad_id', params.id)
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'No se pudo actualizar: esta entidad no tiene extensión de cliente o no tienes permiso.' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
