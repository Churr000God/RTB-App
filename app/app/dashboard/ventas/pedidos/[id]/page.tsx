export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { requireActiveUser } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PedidoDetalle } from './pedido-detalle';

export default async function PedidoDetallePage({ params }: { params: { id: string } }) {
  await requireActiveUser();
  const supabase = createSupabaseServerClient();

  const { data: pedido } = await supabase
    .from('ventas_pedidos')
    .select('*, entidades(nombre_comercial, nombre_legal)')
    .eq('id', params.id)
    .maybeSingle();
  if (!pedido) notFound();

  const [{ data: lineas }, { data: notaRemision }] = await Promise.all([
    supabase.from('ventas_pedido_lineas').select('*').eq('pedido_id', params.id),
    supabase.from('ventas_notas_remision').select('id, folio, estado').eq('pedido_id', params.id).maybeSingle(),
  ]);

  return <PedidoDetalle pedido={pedido as any} lineas={lineas ?? []} notaRemision={notaRemision ?? null} />;
}
