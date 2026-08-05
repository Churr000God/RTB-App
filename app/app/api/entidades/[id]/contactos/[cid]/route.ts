export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { contactoSchema } from '@/lib/entidades/schemas';

const contactoUpdateSchema = contactoSchema.partial().extend({ activo: z.boolean().optional() });

// PATCH - edición libre de un contacto (incluye archivarlo con activo:false;
// "no borrado físico operativo").
export async function PATCH(request: Request, { params }: { params: { id: string; cid: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'ventas', 'compras', 'finanzas']);
    if (response) return response;

    const body = await request.json().catch(() => null);
    const parsed = contactoUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from('contactos')
      .update(parsed.data)
      .eq('id', params.cid)
      .eq('entidad_id', params.id);

    if (error) {
      const duplicado = /uq_contacto_principal_entidad/i.test(error.message);
      return NextResponse.json(
        { error: duplicado ? 'Ya existe un contacto principal para esta entidad.' : error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
