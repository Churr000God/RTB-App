export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { puede, ACCESO_PANTALLA } from '@/lib/ventas/permisos';
import {
  COTIZACIONES_PAGE_SIZE,
  COTIZACIONES_VISTA,
  aplicarFiltrosCotizacion,
  construirColumnasTablero,
  ordenarCotizaciones,
  parsearFiltrosCotizacion,
} from '@/lib/ventas/listado-cotizaciones';
import { CotizacionesExplorer } from './cotizaciones-explorer';

// Listado de cotizaciones (038): tablero de tarjetas por estado + tabla,
// búsqueda por folio/siglas/nombre/clave y filtros de fecha/canal/vendedor.
// Server Component: primera carga vía Supabase directo (RLS como barrera
// real), mismo patrón que /dashboard/productos/page.tsx. Trae AMBAS vistas
// (tablero y lista) en la primera pasada porque la vista preferida del
// usuario vive en localStorage, ilegible en servidor — evita el parpadeo
// al hidratar. Acceso de pantalla: ACCESO_PANTALLA.cotizaciones (037).
export default async function CotizacionesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const auth = await requireRole(ACCESO_PANTALLA.cotizaciones);
  const puedeCrear = puede(auth.profile.role, 'cotizaciones', 'insert');

  const supabase = createSupabaseServerClient();

  // Barrido oportunista de vigencia (034) — mismo patrón que
  // /api/ventas/notas-remision. Antes de leer nada: si no corre, la
  // columna "Expirada" del tablero miente en la primera carga.
  await Promise.resolve(supabase.rpc('ventas_cotizaciones_expirar')).catch(() => null);

  const f = parsearFiltrosCotizacion(searchParams, auth.userId);

  let listaQuery = supabase.from(COTIZACIONES_VISTA).select('*', { count: 'exact' });
  listaQuery = aplicarFiltrosCotizacion(listaQuery, f);
  listaQuery = ordenarCotizaciones(listaQuery, f.orden).range(0, COTIZACIONES_PAGE_SIZE - 1);

  const [{ data: lista, count }, columnas, { data: vendedores }] = await Promise.all([
    listaQuery,
    construirColumnasTablero(supabase, f),
    // profiles_select limita a cada usuario a su propia fila: sin este RPC
    // el filtro "por vendedor" mostraría UUIDs crudos. Mismo uso que
    // inventario/conteos/nuevo/page.tsx.
    supabase.rpc('usuarios_directorio'),
  ]);

  return (
    <CotizacionesExplorer
      initialData={lista ?? []}
      initialCount={count ?? 0}
      initialColumnas={columnas}
      pageSize={COTIZACIONES_PAGE_SIZE}
      vendedores={(vendedores ?? []).map((p: any) => ({ id: p.id, full_name: p.full_name }))}
      puedeCrear={puedeCrear}
      estadoInicial={typeof searchParams.estado === 'string' ? searchParams.estado : undefined}
    />
  );
}
