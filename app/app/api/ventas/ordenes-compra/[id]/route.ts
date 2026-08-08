export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { ACCESO_PANTALLA } from '@/lib/ventas/permisos';

// GET - detalle de una PO con sus partidas (043/044: ya no hay vínculos ni
// NR candidatas que traer — la PO nace de un solo pedido y se surte
// directo, sin la maquinaria PO↔NR de la Vía A retirada en 043). Embed
// `productos(codigo_interno, nombre)` para que la tabla de partidas nunca
// muestre el UUID crudo (patrón `api/inventario/ajustes/[id]/route.ts`).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(ACCESO_PANTALLA.ordenes_compra);
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data: po, error } = await supabase
      .from('ventas_ordenes_compra_cliente')
      .select('*, entidades(nombre_comercial, nombre_legal, rfc)')
      .eq('id', params.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!po) return NextResponse.json({ error: 'PO no encontrada' }, { status: 404 });

    const { data: partidas, error: errorPartidas } = await supabase
      .from('ventas_po_partidas')
      .select('*, productos(codigo_interno, nombre)')
      .eq('po_id', params.id)
      .order('linea_numero', { ascending: true });
    if (errorPartidas) return NextResponse.json({ error: errorPartidas.message }, { status: 500 });

    return NextResponse.json({ data: { ...po, partidas: partidas ?? [] } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
