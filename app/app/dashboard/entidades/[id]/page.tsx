export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { requireActiveUser } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EntidadDetalle } from './entidad-detalle';

export default async function EntidadDetallePage({ params }: { params: { id: string } }) {
  await requireActiveUser();

  const supabase = createSupabaseServerClient();
  const { data: entidad } = await supabase.from('entidades').select('*').eq('id', params.id).maybeSingle();
  if (!entidad) notFound();

  const [cliente, proveedor, contactos, direcciones, solicitudes] = await Promise.all([
    supabase.from('clientes').select('*').eq('entidad_id', params.id).maybeSingle(),
    supabase.from('proveedores').select('*').eq('entidad_id', params.id).maybeSingle(),
    supabase
      .from('contactos')
      .select('*')
      .eq('entidad_id', params.id)
      .eq('activo', true)
      .order('es_principal', { ascending: false }),
    supabase.from('direcciones').select('*').eq('entidad_id', params.id).eq('activo', true),
    supabase
      .from('solicitudes_cambio')
      .select('*')
      .eq('tabla', 'entidades')
      .eq('registro_id', params.id)
      .eq('estado', 'pendiente'),
  ]);

  return (
    <EntidadDetalle
      entidad={entidad}
      cliente={cliente.data}
      proveedor={proveedor.data}
      contactos={contactos.data ?? []}
      direcciones={direcciones.data ?? []}
      solicitudesPendientes={solicitudes.data ?? []}
    />
  );
}
