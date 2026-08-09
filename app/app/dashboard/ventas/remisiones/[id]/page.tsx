export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ACCESO_PANTALLA, ROLES_REGISTRAN_PO } from '@/lib/ventas/permisos';
import { NrDetalle } from './nr-detalle';

export default async function NrDetallePage({ params }: { params: { id: string } }) {
  const auth = await requireRole(ACCESO_PANTALLA.remisiones);
  const supabase = createSupabaseServerClient();

  const { data: nr } = await supabase
    .from('ventas_notas_remision')
    .select('*, entidades(nombre_comercial, nombre_legal)')
    .eq('id', params.id)
    .maybeSingle();
  if (!nr) notFound();

  const [{ data: lineas }, { data: seguimientos }, { data: cobertura }] = await Promise.all([
    supabase.from('ventas_nr_lineas').select('*, productos(codigo_interno, nombre)').eq('nr_id', params.id),
    supabase.from('ventas_nr_seguimientos').select('*').eq('nr_id', params.id).order('created_at', { ascending: false }),
    supabase.rpc('ventas_nr_cobertura', { p_nr_id: params.id }),
  ]);

  return (
    <NrDetalle
      nr={nr as any}
      lineas={lineas ?? []}
      seguimientos={seguimientos ?? []}
      cobertura={cobertura ?? null}
      rol={auth.profile.role}
      puedeRegistrarPo={ROLES_REGISTRAN_PO.includes(auth.profile.role)}
    />
  );
}
