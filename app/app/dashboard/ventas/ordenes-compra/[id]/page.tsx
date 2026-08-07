export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { requireActiveUser } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PoDetalle } from './po-detalle';

export default async function PoDetallePage({ params }: { params: { id: string } }) {
  await requireActiveUser();
  const supabase = createSupabaseServerClient();

  const { data: po } = await supabase
    .from('ventas_ordenes_compra_cliente')
    .select('*, entidades(nombre_comercial, nombre_legal, rfc)')
    .eq('id', params.id)
    .maybeSingle();
  if (!po) notFound();

  const [{ data: partidas }, { data: vinculos }] = await Promise.all([
    supabase.from('ventas_po_partidas').select('*').eq('po_id', params.id).order('linea_numero'),
    supabase.from('ventas_po_nr_vinculos').select('*'),
  ]);

  // Líneas de NR de esta entidad que todavía tienen algo pendiente de
  // respaldar — el universo contra el que se puede vincular esta PO.
  const { data: nrDeEntidad } = await supabase
    .from('ventas_notas_remision')
    .select('id, folio, estado')
    .eq('entidad_id', po.entidad_id)
    .in('estado', ['entregada_sin_po', 'parcialmente_respaldada', 'po_vinculada']);

  const nrIds = (nrDeEntidad ?? []).map((n) => n.id);
  const { data: nrLineas } = nrIds.length
    ? await supabase.from('ventas_nr_lineas').select('*').in('nr_id', nrIds)
    : { data: [] as any[] };

  const lineasConFolio = (nrLineas ?? []).map((l) => ({
    ...l,
    nr_folio: nrDeEntidad?.find((n) => n.id === l.nr_id)?.folio ?? '',
  }));

  return (
    <PoDetalle
      po={po as any}
      partidas={partidas ?? []}
      vinculos={(vinculos ?? []).filter((v: any) => (partidas ?? []).some((p) => p.id === v.po_partida_id))}
      nrLineas={lineasConFolio}
    />
  );
}
