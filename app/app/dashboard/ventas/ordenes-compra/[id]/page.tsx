export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ACCESO_PANTALLA, ROLES_CANCELAN_VINCULO, ROLES_LIBERAN_ALMACEN, ROLES_REGISTRAN_PO } from '@/lib/ventas/permisos';
import { PoDetalle } from './po-detalle';

// Detalle de una PO: cabecera + partidas con avance de entrega. Vía B
// (043/044) las copia 1:1 de un único pedido al aprobar; Vía A (048) puede
// traer partidas de respaldo (ya entregadas por una o varias NR — con su
// vínculo activo) y de compromiso (por entregar, de un pedido o sin él).
export default async function PoDetallePage({ params }: { params: { id: string } }) {
  const auth = await requireRole(ACCESO_PANTALLA.ordenes_compra);
  const supabase = createSupabaseServerClient();

  const { data: po } = await supabase
    .from('ventas_ordenes_compra_cliente')
    .select('*, entidades(nombre_comercial, nombre_legal, rfc), pedido:ventas_pedidos(id, folio, estado), cotizacion:ventas_cotizaciones(id, folio)')
    .eq('id', params.id)
    .maybeSingle();
  if (!po) notFound();

  const { data: partidas } = await supabase
    .from('ventas_po_partidas')
    .select('*, productos(codigo_interno, nombre)')
    .eq('po_id', params.id)
    .order('linea_numero');

  const partidaIds = (partidas ?? []).map((p) => p.id);
  const respaldoIds = (partidas ?? []).filter((p) => p.tipo === 'respaldo').map((p) => p.id);

  // Vínculos activos de las partidas de respaldo + su línea de NR (precio
  // para comparar contra el de la PO) — sólo si hay alguna partida de
  // respaldo, mismo criterio de "nunca traer la tabla completa" que ya
  // seguía esta pantalla antes de la Vía A.
  const vinculosQuery =
    respaldoIds.length > 0
      ? supabase
          .from('ventas_po_nr_vinculos')
          .select('*, ventas_nr_lineas(precio_unitario, nr_id, ventas_notas_remision(folio))')
          .in('po_partida_id', respaldoIds)
          .neq('estado', 'cancelado')
      : Promise.resolve({ data: [] as any[] });

  // Autorización pendiente más reciente (precio_po_divergente/ampliacion_po)
  // — sólo si la PO está congelada, para mostrar de qué se trata y enlazar
  // a la bandeja de Dirección.
  const autorizacionQuery =
    po.estado === 'pendiente_de_autorizacion'
      ? supabase
          .from('ventas_autorizaciones')
          .select('*')
          .eq('documento_tipo', 'orden_compra_cliente')
          .eq('documento_id', params.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null as any });

  const [{ data: vinculos }, { data: autorizacionPendiente }] = await Promise.all([vinculosQuery, autorizacionQuery]);

  const rol = auth.profile.role;
  return (
    <PoDetalle
      po={po as any}
      partidas={partidas ?? []}
      vinculos={(vinculos ?? []) as any[]}
      autorizacionPendiente={autorizacionPendiente as any}
      puedeAmpliar={ROLES_REGISTRAN_PO.includes(rol)}
      puedeLiberar={ROLES_LIBERAN_ALMACEN.includes(rol)}
      puedeCancelarVinculo={ROLES_CANCELAN_VINCULO.includes(rol)}
    />
  );
}
