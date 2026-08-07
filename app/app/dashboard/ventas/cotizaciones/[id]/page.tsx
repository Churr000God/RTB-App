export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { requireActiveUser } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CotizacionDetalle } from './cotizacion-detalle';

export default async function CotizacionDetallePage({ params }: { params: { id: string } }) {
  const auth = await requireActiveUser();
  const supabase = createSupabaseServerClient();

  const { data: cotizacion } = await supabase
    .from('ventas_cotizaciones')
    .select('*, entidades(nombre_comercial, nombre_legal, rfc)')
    .eq('id', params.id)
    .maybeSingle();
  if (!cotizacion) notFound();

  const { data: lineas } = await supabase
    .from('ventas_cotizacion_lineas')
    .select('*, productos(codigo_interno, nombre)')
    .eq('cotizacion_id', params.id)
    .order('created_at', { ascending: true });

  return <CotizacionDetalle cotizacion={cotizacion as any} lineasIniciales={lineas ?? []} rol={auth.profile.role} userId={auth.userId} />;
}
