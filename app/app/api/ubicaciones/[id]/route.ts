export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { ubicacionUpdateSchema } from '@/lib/entidades/schemas';
import { mensajeErrorUbicacion } from '@/lib/entidades/errores';

// PATCH - edición de atributos (nombre, descripción, responsable,
// capacidad, clasificación, uso especial, activo, dirección + coordenada
// si es un centro operativo). El trigger ubicaciones_before_update ya
// rechaza a 'almacen' si intenta tocar 'activo' (P04: "desactivación solo
// super_admin y direccion").
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'almacen']);
    if (response) return response;

    const parsed = ubicacionUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    // 'tipo' sólo viaja en el schema para que el superRefine de geo pueda
    // validar "sólo centro_operativo tiene dirección" en la edición; el
    // trigger lo congela y el GRANT no lo cubre, así que nunca se manda.
    const { tipo: _tipo, ...cambios } = parsed.data;

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from('ubicaciones_internas').update(cambios).eq('id', params.id);
    if (error) {
      const sinPermiso = /42501|no tiene permiso/i.test(error.message);
      return NextResponse.json(
        {
          error: sinPermiso
            ? 'No tienes permiso para activar/desactivar ubicaciones.'
            : mensajeErrorUbicacion(error.message),
        },
        { status: sinPermiso ? 403 : 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
