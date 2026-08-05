export const dynamic = 'force-dynamic';

import { requireActiveUser } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EntidadesExplorer } from './entidades-explorer';

const PAGE_SIZE = 20;

// Server Component: primera carga vía Supabase directo (RLS como barrera
// real) en vez del patrón fetch-desde-cliente de /dashboard/admin/users —
// con cientos de entidades, filtrar en memoria en el navegador no escala.
// Las interacciones posteriores (búsqueda, filtros, paginación) las
// resuelve EntidadesExplorer contra /api/entidades.
export default async function EntidadesPage() {
  await requireActiveUser();

  const supabase = createSupabaseServerClient();

  const [{ data, count }, total, clientesActivos, proveedoresActivos, bloqueadas, pendientes] = await Promise.all([
    supabase
      .from('entidades')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(0, PAGE_SIZE - 1),
    supabase.from('entidades').select('id', { count: 'exact', head: true }),
    supabase
      .from('entidades')
      .select('id', { count: 'exact', head: true })
      .in('tipo', ['cliente', 'mixta'])
      .eq('estado', 'activo'),
    supabase
      .from('entidades')
      .select('id', { count: 'exact', head: true })
      .in('tipo', ['proveedor', 'mixta'])
      .eq('estado', 'activo'),
    supabase
      .from('entidades')
      .select('id', { count: 'exact', head: true })
      .in('estado', ['bloqueado_temporal', 'bloqueado_permanente']),
    supabase.from('solicitudes_cambio').select('registro_id').eq('tabla', 'entidades').eq('estado', 'pendiente'),
  ]);

  return (
    <EntidadesExplorer
      initialData={data ?? []}
      initialCount={count ?? 0}
      pageSize={PAGE_SIZE}
      initialPendientes={(pendientes.data ?? []).map((p) => p.registro_id)}
      kpis={{
        total: total.count ?? 0,
        clientesActivos: clientesActivos.count ?? 0,
        proveedoresActivos: proveedoresActivos.count ?? 0,
        bloqueadas: bloqueadas.count ?? 0,
      }}
    />
  );
}
