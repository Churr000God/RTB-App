export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ACCESO_PANTALLA } from '@/lib/ventas/permisos';
import { PedidoDetalle } from './pedido-detalle';

// Vía A (via='nota_remision'): trae la NR, si ya se emitió. Vía B
// (via='orden_compra', 043): trae la PO con sus partidas — es lo que
// PedidoDetalle necesita para ofrecer el despacho directo al kardex sin
// una segunda petición (Almacén entra a la Vía B desde aquí, no tiene
// acceso a la pantalla de Órdenes de Compra).
export default async function PedidoDetallePage({ params }: { params: { id: string } }) {
  const auth = await requireRole(ACCESO_PANTALLA.pedidos);
  const supabase = createSupabaseServerClient();

  const { data: pedido } = await supabase
    .from('ventas_pedidos')
    .select('*, entidades(nombre_comercial, nombre_legal)')
    .eq('id', params.id)
    .maybeSingle();
  if (!pedido) notFound();

  const esViaB = pedido.via === 'orden_compra';

  const [{ data: lineas }, { data: notaRemision }, { data: ordenCompra }] = await Promise.all([
    supabase.from('ventas_pedido_lineas').select('*, productos(codigo_interno, nombre)').eq('pedido_id', params.id),
    esViaB
      ? Promise.resolve({ data: null })
      : supabase.from('ventas_notas_remision').select('id, folio, estado').eq('pedido_id', params.id).maybeSingle(),
    esViaB
      ? supabase
          .from('ventas_ordenes_compra_cliente')
          // Hint de FK explícito (!ventas_po_partidas_po_id_fkey) obligatorio:
          // 043 añadió una SEGUNDA FK compuesta entre estas tablas
          // (po_id, pedido_id) → (id, pedido_id), así que el embed implícito
          // "partidas:ventas_po_partidas(...)" queda ambiguo para PostgREST
          // (PGRST201) sin decir cuál de las dos relaciones usar.
          .select(
            'id, folio, numero_po, estado, partidas:ventas_po_partidas!ventas_po_partidas_po_id_fkey(*, productos(codigo_interno, nombre))'
          )
          .eq('pedido_id', params.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <PedidoDetalle
      pedido={pedido as any}
      lineas={lineas ?? []}
      notaRemision={notaRemision ?? null}
      ordenCompra={ordenCompra ?? null}
      rol={auth.profile.role}
    />
  );
}
