export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { statusPorErrcode } from '@/lib/ventas/errores';
import { ROLES_LIBERAN_ALMACEN } from '@/lib/ventas/permisos';

// POST - libera el pedido a Almacén: reserva → compromiso, un solo UPDATE
// que no toca cantidad_apartada (ventas_pedido_liberar_almacen(), 031).
// ROLES_LIBERAN_ALMACEN (no ROLES_DESPACHAN, 045): liberar es el hand-off
// comercial hacia Almacén, Ventas lo sigue haciendo — sólo se le quitó el
// surtido en sí.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(ROLES_LIBERAN_ALMACEN);
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('ventas_pedido_liberar_almacen', { p_pedido_id: params.id });
    if (error) return NextResponse.json({ error: error.message }, { status: statusPorErrcode(error.code) });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
