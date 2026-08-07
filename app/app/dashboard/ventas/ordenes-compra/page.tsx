export const dynamic = 'force-dynamic';

import { requireActiveUser } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { puede } from '@/lib/ventas/permisos';
import { OrdenesCompraExplorer } from './ordenes-compra-explorer';

const PAGE_SIZE = 20;

// Server Component: primera carga vía Supabase directo (RLS como barrera
// real, mismo patrón que /dashboard/entidades); paginación y filtros
// posteriores los resuelve OrdenesCompraExplorer contra
// /api/ventas/ordenes-compra (antes truncado en .limit(50) sin paginación
// real — AUDITORIA_RTB-VEN-01.md §3.2).
export default async function OrdenesCompraPage() {
  const auth = await requireActiveUser();
  const puedeCrear = puede(auth.profile.role, 'ordenes_compra', 'insert');

  const supabase = createSupabaseServerClient();
  const { data, count } = await supabase
    .from('ventas_ordenes_compra_cliente')
    .select('*, entidades(nombre_comercial, nombre_legal)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(0, PAGE_SIZE - 1);

  return (
    <OrdenesCompraExplorer
      initialData={data ?? []}
      initialCount={count ?? 0}
      pageSize={PAGE_SIZE}
      puedeCrear={puedeCrear}
    />
  );
}
