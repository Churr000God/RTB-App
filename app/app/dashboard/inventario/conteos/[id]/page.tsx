export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { requireActiveUser } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ConteoDetalle } from './conteo-detalle';

export default async function ConteoDetallePage({ params }: { params: { id: string } }) {
  await requireActiveUser();

  const supabase = createSupabaseServerClient();
  const { data: conteo } = await supabase.from('inventario_conteos').select('*').eq('id', params.id).maybeSingle();
  if (!conteo) notFound();

  const [asignaciones, firmas, versiones] = await Promise.all([
    supabase.from('inventario_conteo_asignaciones').select('*').eq('conteo_id', params.id),
    supabase.from('inventario_conteo_firmas').select('*').eq('conteo_id', params.id).order('firmado_at'),
    supabase.from('inventario_conteo_versiones').select('*').eq('conteo_id', params.id).order('version'),
  ]);

  return (
    <ConteoDetalle
      conteo={conteo}
      asignacionesIniciales={asignaciones.data ?? []}
      firmasIniciales={firmas.data ?? []}
      versionesIniciales={versiones.data ?? []}
    />
  );
}
