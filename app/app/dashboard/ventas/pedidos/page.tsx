export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ACCESO_PANTALLA } from '@/lib/ventas/permisos';
import { PedidosExplorer } from './pedidos-explorer';

const PAGE_SIZE = 20;

// Server Component: primera carga vía Supabase directo (RLS como barrera
// real); paginación posterior vía PedidosExplorer contra
// /api/ventas/pedidos (antes .limit(50) sin paginación real —
// AUDITORIA_RTB-VEN-01.md §3.2).
export default async function PedidosPage() {
  await requireRole(ACCESO_PANTALLA.pedidos);
  const supabase = createSupabaseServerClient();
  const { data, count } = await supabase
    .from('ventas_pedidos')
    .select('*, entidades(nombre_comercial, nombre_legal)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(0, PAGE_SIZE - 1);

  return <PedidosExplorer initialData={data ?? []} initialCount={count ?? 0} pageSize={PAGE_SIZE} />;
}
