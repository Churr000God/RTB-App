export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { productoFusionarSchema } from '@/lib/inventario/schemas';
import { clientIp, clientUserAgent } from '@/lib/entidades/http';

// POST - fusiona un producto duplicado (p.ej. el par real RTB-ILU-SL18B/
// SL18C, mismo SKU y nombre) hacia su canónico. estado/producto_canonico_id
// quedan fuera del GRANT UPDATE (009): identidad y ciclo de vida del
// catálogo se resuelven aquí, con service_role y auditados — nunca en el
// UPDATE directo de la fila. No es un borrado: productos_fusion_chk exige
// (estado='fusionado') = (producto_canonico_id is not null).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin', 'direccion']);
    if (response) return response;

    const parsed = productoFusionarSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    const { producto_canonico_id, motivo } = parsed.data;

    if (producto_canonico_id === params.id) {
      return NextResponse.json({ error: 'Un producto no puede fusionarse consigo mismo.' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();

    const { data: canonico } = await admin.from('productos').select('id, estado').eq('id', producto_canonico_id).maybeSingle();
    if (!canonico) return NextResponse.json({ error: 'El producto canónico no existe.' }, { status: 404 });
    if (canonico.estado === 'fusionado') {
      return NextResponse.json({ error: 'El producto canónico ya está fusionado con otro; elige la raíz.' }, { status: 409 });
    }

    const { error } = await admin
      .from('productos')
      .update({ estado: 'fusionado', producto_canonico_id })
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await admin.from('audit_log').insert({
      tabla: 'productos',
      registro_id: params.id,
      accion: 'fusion',
      motivo,
      datos_nuevos: { producto_canonico_id },
      usuario_id: auth.userId,
      ip: clientIp(request),
      user_agent: clientUserAgent(request),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
