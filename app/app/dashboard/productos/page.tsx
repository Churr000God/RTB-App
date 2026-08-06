export const dynamic = 'force-dynamic';

import { requireActiveUser } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ProductosExplorer } from './productos-explorer';

const PAGE_SIZE = 20;

// Server Component: primera carga vía Supabase directo (RLS como barrera
// real), mismo patrón que /dashboard/entidades/page.tsx.
export default async function ProductosPage() {
  await requireActiveUser();

  const supabase = createSupabaseServerClient();

  const [{ data, count }, total, activos, requierenDepuracion, sinUbicacion, sinCosto] = await Promise.all([
    supabase
      .from('productos')
      .select('*')
      .neq('estado', 'fusionado')
      .order('created_at', { ascending: false })
      .range(0, PAGE_SIZE - 1),
    supabase.from('productos').select('id', { count: 'exact', head: true }).neq('estado', 'fusionado'),
    supabase.from('productos').select('id', { count: 'exact', head: true }).eq('estado', 'activo'),
    supabase.from('productos').select('id', { count: 'exact', head: true }).eq('estado', 'requiere_depuracion'),
    supabase.from('inventario_existencias').select('id', { count: 'exact', head: true }).is('ubicacion_id', null).neq('cantidad_teorica', 0),
    supabase.from('inventario_existencias').select('id', { count: 'exact', head: true }).is('costo_promedio', null).neq('cantidad_teorica', 0),
  ]);

  return (
    <ProductosExplorer
      initialData={data ?? []}
      initialCount={count ?? 0}
      pageSize={PAGE_SIZE}
      kpis={{
        total: total.count ?? 0,
        activos: activos.count ?? 0,
        requierenDepuracion: requierenDepuracion.count ?? 0,
        sinUbicacion: sinUbicacion.count ?? 0,
        sinCosto: sinCosto.count ?? 0,
      }}
    />
  );
}
