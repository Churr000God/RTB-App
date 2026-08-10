export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { requireActiveUser } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EntidadDetalle } from './entidad-detalle';

export default async function EntidadDetallePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { creditoPendiente?: string };
}) {
  await requireActiveUser();

  const supabase = createSupabaseServerClient();
  const { data: entidad } = await supabase.from('entidades').select('*').eq('id', params.id).maybeSingle();
  if (!entidad) notFound();

  const [cliente, proveedor, contactos, direcciones] = await Promise.all([
    supabase.from('clientes').select('*').eq('entidad_id', params.id).maybeSingle(),
    supabase.from('proveedores').select('*').eq('entidad_id', params.id).maybeSingle(),
    supabase
      .from('contactos')
      .select('*')
      .eq('entidad_id', params.id)
      .eq('activo', true)
      .order('es_principal', { ascending: false }),
    supabase.from('direcciones').select('*').eq('entidad_id', params.id).eq('activo', true),
  ]);

  // Una solicitud de crédito vive en tabla='clientes' (registro_id =
  // clientes.id, no entidades.id) — filtrar sólo por 'entidades' dejaba
  // invisible cualquier solicitud de límite de crédito pendiente. Mismo
  // defecto para 'proveedores' (condicion_proveedor, registro_id =
  // proveedores.id) — sin esta rama, "Solicitud pendiente" nunca aparecía
  // en la tarjeta de condiciones comerciales de proveedor.
  const filtroTabla = [`and(tabla.eq.entidades,registro_id.eq.${params.id})`];
  if (cliente.data) filtroTabla.push(`and(tabla.eq.clientes,registro_id.eq.${cliente.data.id})`);
  if (proveedor.data) filtroTabla.push(`and(tabla.eq.proveedores,registro_id.eq.${proveedor.data.id})`);
  const solicitudes = await supabase
    .from('solicitudes_cambio')
    .select('*')
    .eq('estado', 'pendiente')
    .or(filtroTabla.join(','));

  return (
    <EntidadDetalle
      entidad={entidad}
      cliente={cliente.data}
      proveedor={proveedor.data}
      contactos={contactos.data ?? []}
      direcciones={direcciones.data ?? []}
      solicitudesPendientes={solicitudes.data ?? []}
      avisoInicial={
        searchParams.creditoPendiente
          ? `Entidad creada. El límite de crédito solicitado ($${Number(searchParams.creditoPendiente).toLocaleString('es-MX')}) supera el umbral de aprobación y quedó pendiente de dirección — el cliente nació con crédito $0.`
          : null
      }
    />
  );
}
