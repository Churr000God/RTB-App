export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ACCESO_PANTALLA } from '@/lib/ventas/permisos';
import { PoDetalle } from './po-detalle';

// Detalle de una PO (043/044): cabecera + partidas con avance de entrega.
// Ya no trae vínculos ni NR candidatas — esa maquinaria de la Vía A se
// retiró; la PO nace de un único pedido y se surte directo contra el
// kardex (ventas_po_despachar()).
export default async function PoDetallePage({ params }: { params: { id: string } }) {
  await requireRole(ACCESO_PANTALLA.ordenes_compra);
  const supabase = createSupabaseServerClient();

  const { data: po } = await supabase
    .from('ventas_ordenes_compra_cliente')
    .select('*, entidades(nombre_comercial, nombre_legal, rfc), pedido:ventas_pedidos(id, folio, estado), cotizacion:ventas_cotizaciones(id, folio)')
    .eq('id', params.id)
    .maybeSingle();
  if (!po) notFound();

  const { data: partidas } = await supabase
    .from('ventas_po_partidas')
    .select('*, productos(codigo_interno, nombre)')
    .eq('po_id', params.id)
    .order('linea_numero');

  return <PoDetalle po={po as any} partidas={partidas ?? []} />;
}
