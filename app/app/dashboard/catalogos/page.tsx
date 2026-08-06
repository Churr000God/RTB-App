export const dynamic = 'force-dynamic';

import { requireActiveUser } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CatalogosExplorer } from './catalogos-explorer';

// Server Component: primera carga vía Supabase directo (RLS como barrera
// real), mismo patrón que /dashboard/productos/page.tsx. A diferencia de
// /api/catalogos/[tipo] (que por defecto sólo trae activos), aquí se traen
// TODOS los registros sin filtrar: una pantalla de administración tiene que
// poder ver — y reactivar — los inactivos.
export default async function CatalogosPage() {
  await requireActiveUser();

  const supabase = createSupabaseServerClient();

  const [familias, categorias, marcas, unidades] = await Promise.all([
    supabase.from('producto_familias').select('*').order('clave', { ascending: true }),
    supabase.from('producto_categorias').select('*').order('clave', { ascending: true }),
    supabase.from('producto_marcas').select('*').order('clave', { ascending: true }),
    supabase.from('unidades_medida').select('*').order('clave', { ascending: true }),
  ]);

  return (
    <CatalogosExplorer
      initialData={{
        familias: familias.data ?? [],
        categorias: categorias.data ?? [],
        marcas: marcas.data ?? [],
        'unidades-medida': unidades.data ?? [],
      }}
    />
  );
}
