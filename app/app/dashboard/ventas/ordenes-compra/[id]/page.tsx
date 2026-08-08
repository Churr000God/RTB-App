export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ACCESO_PANTALLA } from '@/lib/ventas/permisos';
import { PoDetalle } from './po-detalle';

export default async function PoDetallePage({ params }: { params: { id: string } }) {
  await requireRole(ACCESO_PANTALLA.ordenes_compra);
  const supabase = createSupabaseServerClient();

  const { data: po } = await supabase
    .from('ventas_ordenes_compra_cliente')
    .select('*, entidades(nombre_comercial, nombre_legal, rfc)')
    .eq('id', params.id)
    .maybeSingle();
  if (!po) notFound();

  // Oleada 1: partidas de esta PO + NR de la entidad que todavía tienen
  // algo pendiente de respaldar (el universo contra el que se puede
  // vincular). Ninguna de las dos depende de la otra.
  const [{ data: partidas }, { data: nrDeEntidad }] = await Promise.all([
    supabase.from('ventas_po_partidas').select('*').eq('po_id', params.id).order('linea_numero'),
    supabase
      .from('ventas_notas_remision')
      .select('id, folio, estado')
      .eq('entidad_id', po.entidad_id)
      .in('estado', ['entregada_sin_po', 'parcialmente_respaldada', 'po_vinculada']),
  ]);

  const partidaIds = (partidas ?? []).map((p) => p.id);
  const nrIds = (nrDeEntidad ?? []).map((n) => n.id);

  // Oleada 2: ya con los ids de la oleada 1 — vínculos SÓLO de las
  // partidas de esta PO (nunca la tabla completa, ver AUDITORIA_RTB-VEN-01
  // §3.1) y líneas SÓLO de las NR de esta entidad.
  const [{ data: vinculos }, { data: nrLineas }] = await Promise.all([
    partidaIds.length
      ? supabase.from('ventas_po_nr_vinculos').select('*').in('po_partida_id', partidaIds)
      : Promise.resolve({ data: [] as any[] }),
    nrIds.length
      ? supabase.from('ventas_nr_lineas').select('*').in('nr_id', nrIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const lineasConFolio = (nrLineas ?? []).map((l) => ({
    ...l,
    nr_folio: nrDeEntidad?.find((n) => n.id === l.nr_id)?.folio ?? '',
  }));

  return (
    <PoDetalle po={po as any} partidas={partidas ?? []} vinculos={vinculos ?? []} nrLineas={lineasConFolio} />
  );
}
