export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ACCESO_PANTALLA } from '@/lib/ventas/permisos';
import { CotizacionDetalle } from './cotizacion-detalle';

export default async function CotizacionDetallePage({ params }: { params: { id: string } }) {
  const auth = await requireRole(ACCESO_PANTALLA.cotizaciones);
  const supabase = createSupabaseServerClient();

  const { data: cotizacion } = await supabase
    .from('ventas_cotizaciones')
    .select('*, entidades(nombre_comercial, nombre_legal, rfc, correo_principal)')
    .eq('id', params.id)
    .maybeSingle();
  if (!cotizacion) notFound();

  const { data: lineas } = await supabase
    .from('ventas_cotizacion_lineas')
    .select('*, productos(codigo_interno, nombre)')
    .eq('cotizacion_id', params.id)
    .order('created_at', { ascending: true });

  // Contacto principal + historial de envíos por correo (042) — para
  // prellenar el diálogo "Enviar por correo" y mostrar el historial sin
  // que cotizacion-detalle.tsx tenga que pedirlos aparte al cliente (mismo
  // criterio del resto del módulo: el Server Component es la única fuente
  // de verdad, ver contexto/AUDITORIA_RTB-VEN-01.md §7.3).
  const [{ data: contacto }, { data: envios }] = await Promise.all([
    supabase
      .from('contactos')
      .select('nombre, correo')
      .eq('entidad_id', cotizacion.entidad_id)
      .eq('es_principal', true)
      .eq('activo', true)
      .maybeSingle(),
    supabase
      .from('ventas_cotizacion_envios')
      .select('*')
      .eq('cotizacion_id', params.id)
      .order('enviado_at', { ascending: false })
      .limit(10),
  ]);

  // profiles_select limita cada usuario a su propia fila — el nombre de
  // quien envió sólo se resuelve por usuarios_directorio() (RPC), nunca
  // por un embed a profiles (mismo patrón que el resto del módulo).
  let nombresUsuarios: Record<string, string> = {};
  if (envios && envios.length > 0) {
    const { data: directorio } = await supabase.rpc('usuarios_directorio');
    nombresUsuarios = Object.fromEntries(
      ((directorio ?? []) as { id: string; full_name: string | null }[]).map((u) => [u.id, u.full_name ?? '—'])
    );
  }

  const correoSugerido = contacto?.correo ?? cotizacion.entidades?.correo_principal ?? null;

  // requiere_po prellena la vía sugerida en el diálogo de aprobación (043)
  // — el usuario sigue pudiendo elegir la otra vía, es sólo un default.
  const { data: cliente } = await supabase
    .from('clientes')
    .select('requiere_po, descuento_base')
    .eq('entidad_id', cotizacion.entidad_id)
    .maybeSingle();

  // Sólo se consulta si aplica: en cualquier otro estado no puede existir
  // una devolución ligada (nace únicamente por ventas_cotizacion_cancelar()
  // al pasar a 'en_devolucion').
  let devolucion = null;
  if (cotizacion.estado === 'en_devolucion') {
    const { data } = await supabase
      .from('ventas_devoluciones')
      .select('*')
      .eq('cotizacion_id', params.id)
      .maybeSingle();
    devolucion = data;
  }

  return (
    <CotizacionDetalle
      cotizacion={cotizacion as any}
      lineasIniciales={lineas ?? []}
      rol={auth.profile.role}
      userId={auth.userId}
      devolucion={devolucion}
      correoSugerido={correoSugerido}
      contactoNombre={contacto?.nombre ?? null}
      envios={(envios ?? []) as any}
      nombresUsuarios={nombresUsuarios}
      requierePo={cliente?.requiere_po ?? false}
      descuentoBaseCliente={cliente?.descuento_base ?? 0}
    />
  );
}
