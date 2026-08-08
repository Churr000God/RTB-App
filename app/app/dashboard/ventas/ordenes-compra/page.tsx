export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ACCESO_PANTALLA } from '@/lib/ventas/permisos';
import {
  ORDENES_COMPRA_PAGE_SIZE,
  ORDENES_COMPRA_VISTA,
  aplicarFiltrosPo,
  construirColumnasTableroPo,
  ordenarPo,
  parsearFiltrosPo,
} from '@/lib/ventas/listado-ordenes-compra';
import { OrdenesCompraExplorer } from './ordenes-compra-explorer';

// Listado de Órdenes de Compra (045): mismo patrón "explorer" que
// Cotizaciones (038) — tablero de tarjetas por estado + tabla, búsqueda por
// folio/número de PO/siglas/nombre/clave y filtros de fecha. Server
// Component: primera carga vía Supabase directo (RLS como barrera real).
// Trae AMBAS vistas (tablero y lista) en la primera pasada porque la vista
// preferida vive en localStorage, ilegible en servidor. Sin `puedeCrear`:
// la PO ya no se da de alta a mano desde 043, nace al aprobar una
// cotización como Vía B.
export default async function OrdenesCompraPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireRole(ACCESO_PANTALLA.ordenes_compra);
  const supabase = createSupabaseServerClient();

  const f = parsearFiltrosPo(searchParams);

  let listaQuery = supabase.from(ORDENES_COMPRA_VISTA).select('*', { count: 'exact' });
  listaQuery = aplicarFiltrosPo(listaQuery, f);
  listaQuery = ordenarPo(listaQuery, f.orden).range(0, ORDENES_COMPRA_PAGE_SIZE - 1);

  const [{ data: lista, count }, columnas] = await Promise.all([listaQuery, construirColumnasTableroPo(supabase, f)]);

  return (
    <OrdenesCompraExplorer
      initialData={lista ?? []}
      initialCount={count ?? 0}
      initialColumnas={columnas}
      pageSize={ORDENES_COMPRA_PAGE_SIZE}
      estadoInicial={typeof searchParams.estado === 'string' ? searchParams.estado : undefined}
    />
  );
}
