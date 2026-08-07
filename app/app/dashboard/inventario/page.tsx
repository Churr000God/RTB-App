export const dynamic = 'force-dynamic';

import { requireActiveUser } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ExistenciasExplorer } from './existencias-explorer';

const PAGE_SIZE = 50;

// Server Component: primera carga con Promise.all (RLS decide). Cubre
// exactamente las 4 vistas reales del reporte "Existencias de Inventario
// RTB-INV-01": general, sin ubicación (73.9% del catálogo real), sin
// costo, teórico negativo. Paginado (antes `.limit(500)` truncaba en
// silencio — con los 1,388 SKU reales pendientes de cargar deja de
// alcanzar); el resto de páginas las pide ExistenciasExplorer vía
// /api/inventario/existencias, que usa el mismo PAGE_SIZE.
export default async function InventarioPage() {
  await requireActiveUser();

  const supabase = createSupabaseServerClient();

  const [{ data, count }, sinUbicacion, sinCosto, negativas, nuncaContadas] = await Promise.all([
    supabase
      .from('inventario_existencias')
      .select('*, productos(codigo_interno, nombre, sku)', { count: 'exact' })
      .order('fecha_ultimo_movimiento', { ascending: false, nullsFirst: false })
      .range(0, PAGE_SIZE - 1),
    supabase.from('inventario_existencias').select('id', { count: 'exact', head: true }).is('ubicacion_id', null).neq('cantidad_teorica', 0),
    supabase.from('inventario_existencias').select('id', { count: 'exact', head: true }).is('costo_promedio', null).neq('cantidad_teorica', 0),
    supabase.from('inventario_existencias').select('id', { count: 'exact', head: true }).lt('cantidad_teorica', 0),
    supabase.from('inventario_existencias').select('id', { count: 'exact', head: true }).is('cantidad_fisica', null),
  ]);

  return (
    <ExistenciasExplorer
      initialData={data ?? []}
      initialCount={count ?? 0}
      pageSize={PAGE_SIZE}
      kpis={{
        sinUbicacion: sinUbicacion.count ?? 0,
        sinCosto: sinCosto.count ?? 0,
        negativas: negativas.count ?? 0,
        nuncaContadas: nuncaContadas.count ?? 0,
      }}
    />
  );
}
