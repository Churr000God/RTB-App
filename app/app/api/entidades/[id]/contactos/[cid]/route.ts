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

    // B-01 (contexto/QA_INTEGRAL_2026-08-06.md): sin .select(), un contacto
    // fuera de RLS o de otra entidad devolvía 200 sin editarse.
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('contactos')
      .update(parsed.data)
      .eq('id', params.cid)
      .eq('entidad_id', params.id)
      .select('id');

    if (error) {
      const duplicado = /uq_contacto_principal_entidad/i.test(error.message);
      return NextResponse.json(
        { error: duplicado ? 'Ya existe un contacto principal para esta entidad.' : error.message },
        { status: 400 }
      );
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'No se pudo editar: el contacto no existe o no tienes permiso.' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
