export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ACCESO_PANTALLA, ROLES_REGISTRAN_PO } from '@/lib/ventas/permisos';
import {
  NOTAS_REMISION_PAGE_SIZE,
  NOTAS_REMISION_VISTA,
  aplicarFiltrosNr,
  construirColumnasTableroNr,
  ordenarNr,
  parsearFiltrosNr,
} from '@/lib/ventas/listado-notas-remision';
import { RemisionesExplorer } from './remisiones-explorer';

// Listado de Notas de Remisión (049): mismo patrón "explorer" que recibió
// Cotizaciones (038) — tablero de tarjetas por estado + tabla, búsqueda y
// filtros de fecha/canal/vendedor/"sin PO". Sustituye a la tabla estática
// que usaba ventas_tablero_nr() (034, sin count real ni búsqueda). Server
// Component: primera carga vía Supabase directo (RLS como barrera real),
// trae AMBAS vistas (tablero y lista) porque la vista preferida vive en
// localStorage, ilegible en servidor.
export default async function RemisionesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const auth = await requireRole(ACCESO_PANTALLA.remisiones);
  const puedeRegistrarPo = ROLES_REGISTRAN_PO.includes(auth.profile.role);

  const supabase = createSupabaseServerClient();

  await Promise.resolve(supabase.rpc('ventas_cotizaciones_expirar')).catch(() => null);

  const f = parsearFiltrosNr(searchParams, auth.userId);

  let listaQuery = supabase.from(NOTAS_REMISION_VISTA).select('*', { count: 'exact' });
  listaQuery = aplicarFiltrosNr(listaQuery, f);
  listaQuery = ordenarNr(listaQuery, f.orden).range(0, NOTAS_REMISION_PAGE_SIZE - 1);

  const [{ data: lista, count }, columnas, { data: vendedores }] = await Promise.all([
    listaQuery,
    construirColumnasTableroNr(supabase, f),
    // profiles_select limita a cada usuario a su propia fila: sin este RPC
    // el filtro "por vendedor" mostraría UUIDs crudos.
    supabase.rpc('usuarios_directorio'),
  ]);

  return (
    <RemisionesExplorer
      initialData={lista ?? []}
      initialCount={count ?? 0}
      initialColumnas={columnas}
      pageSize={NOTAS_REMISION_PAGE_SIZE}
      vendedores={(vendedores ?? []).map((p: any) => ({ id: p.id, full_name: p.full_name }))}
      puedeRegistrarPo={puedeRegistrarPo}
      estadoInicial={typeof searchParams.estado === 'string' ? searchParams.estado : undefined}
    />
  );
}
