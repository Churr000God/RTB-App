// Construcción de filtros del listado/tablero de Notas de Remisión (049) —
// mismo pivote anti-duplicación que listado-cotizaciones.ts (038): el
// Server Component (page.tsx, primera carga), el GET en modo lista y el GET
// en modo tablero (una consulta por columna) necesitan EXACTAMENTE los
// mismos filtros.
//
// Opera sobre public.ventas_notas_remision_listado (049), no sobre
// ventas_notas_remision directo — sustituye a ventas_tablero_nr() (034), que
// no exponía count:'exact' ni admitía .or()/.range()/.order() de PostgREST.
import {
  NR_ESTADOS,
  NR_FECHA_CAMPOS,
  NR_ORDENES,
  type NrEstado,
  type NrFechaCampo,
  type NrListadoRow,
  type NrOrden,
  type NrTableroColumna,
} from '@/types/ventas';
import { CANAL_ORIGENES, type CanalOrigen } from '@/types/entidades';
import { NR_TABLERO_TOPE } from '@/lib/ventas/config';
import { valorLike, diaSiguiente } from '@/lib/ventas/listado-comun';

export const NOTAS_REMISION_VISTA = 'ventas_notas_remision_listado';
export const NOTAS_REMISION_PAGE_SIZE = 20;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

// Los 4 campos de fecha de NR son timestamptz — a diferencia de
// CotizacionFechaCampo (que tiene 'vigencia', tipo date), aquí no hay
// ninguna columna date: el cierre superior del rango siempre necesita
// `.lt(día siguiente)`.
const CAMPO_FECHA_COLUMNA: Record<NrFechaCampo, string> = {
  emision: 'emitida_at',
  entrega: 'entregada_at',
  creacion: 'created_at',
  ultimo_contacto: 'ultimo_contacto_at',
};

export interface FiltrosNr {
  q: string | null;
  estados: NrEstado[];
  fechaCampo: NrFechaCampo;
  desde: string | null;
  hasta: string | null;
  entidadId: string | null;
  vendedorId: string | null;
  soloMias: boolean;
  canal: CanalOrigen | null;
  sinPo: boolean;
  orden: NrOrden;
  page: number;
}

type FuenteParams = URLSearchParams | Record<string, string | string[] | undefined>;

function leer(fuente: FuenteParams, nombre: string): string | undefined {
  if (fuente instanceof URLSearchParams) return fuente.get(nombre) ?? undefined;
  const v = fuente[nombre];
  return Array.isArray(v) ? v[0] : v;
}

/** Mismo parser que parsearFiltrosCotizacion — acepta tanto un
 *  URLSearchParams (Route Handler) como el `searchParams` de Next (Server
 *  Component). `actorId` resuelve `vendedor_id=mias` al uid real: "sólo
 *  mías" no puede depender de que el cliente mande su propio uuid
 *  honestamente. */
export function parsearFiltrosNr(fuente: FuenteParams, actorId: string | null): FiltrosNr {
  const estadoRaw = leer(fuente, 'estado');
  const estados = (estadoRaw ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter((e): e is NrEstado => (NR_ESTADOS as readonly string[]).includes(e));

  const fechaCampoRaw = leer(fuente, 'fecha_campo');
  const fechaCampo = (NR_FECHA_CAMPOS as readonly string[]).includes(fechaCampoRaw ?? '')
    ? (fechaCampoRaw as NrFechaCampo)
    : 'emision';

  const ordenRaw = leer(fuente, 'orden');
  const orden = (NR_ORDENES as readonly string[]).includes(ordenRaw ?? '') ? (ordenRaw as NrOrden) : 'reciente';

  const canalRaw = leer(fuente, 'canal');
  const canal = (CANAL_ORIGENES as readonly string[]).includes(canalRaw ?? '') ? (canalRaw as CanalOrigen) : null;

  const desdeRaw = leer(fuente, 'desde');
  const hastaRaw = leer(fuente, 'hasta');
  let desde = desdeRaw && FECHA_RE.test(desdeRaw) ? desdeRaw : null;
  let hasta = hastaRaw && FECHA_RE.test(hastaRaw) ? hastaRaw : null;
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];

  const entidadIdRaw = leer(fuente, 'entidad_id');
  const entidadId = entidadIdRaw && UUID_RE.test(entidadIdRaw) ? entidadIdRaw : null;

  const vendedorIdRaw = leer(fuente, 'vendedor_id');
  const soloMias = leer(fuente, 'solo_mias') === '1';
  const vendedorId = soloMias ? actorId : vendedorIdRaw && UUID_RE.test(vendedorIdRaw) ? vendedorIdRaw : null;

  const page = Math.max(1, Number(leer(fuente, 'page')) || 1);

  return {
    q: leer(fuente, 'q')?.trim() || null,
    estados,
    fechaCampo,
    desde,
    hasta,
    entidadId,
    vendedorId,
    soloMias,
    canal,
    sinPo: leer(fuente, 'sin_po') === '1',
    orden,
    page,
  };
}

/** Encadena los filtros sobre un query builder de
 *  `.from('ventas_notas_remision_listado')` ya iniciado. `omitirEstado`
 *  aplica cuando ya se filtró por estado con un `.eq()` externo (columnas
 *  del tablero, una consulta por estado). */
export function aplicarFiltrosNr<T extends Record<string, any>>(
  query: T,
  f: FiltrosNr,
  opts: { omitirEstado?: boolean } = {}
): T {
  let q = query;

  if (!opts.omitirEstado && f.estados.length > 0) q = q.in('estado', f.estados);
  if (f.entidadId) q = q.eq('entidad_id', f.entidadId);
  if (f.vendedorId) q = q.eq('vendedor_id', f.vendedorId);
  if (f.canal) q = q.eq('canal_origen', f.canal);
  // "Entregada sin PO" es el estado de máxima vigilancia (RTB-PRO-VEN-01
  // §III) — este filtro es el que de verdad usa el seguimiento comercial:
  // hay valor entregado que todavía no respalda ninguna PO.
  if (f.sinPo) q = q.gt('monto_pendiente_po', 0);

  const columna = CAMPO_FECHA_COLUMNA[f.fechaCampo];
  if (f.desde) q = q.gte(columna, `${f.desde}T00:00:00.000Z`);
  if (f.hasta) q = q.lt(columna, `${diaSiguiente(f.hasta)}T00:00:00.000Z`);

  if (f.q) {
    const like = valorLike(f.q);
    q = q.or(
      [
        `folio.ilike.${like}`,
        `entidad_siglas.ilike.${like}`,
        `entidad_clave.ilike.${like}`,
        `entidad_nombre_legal.ilike.${like}`,
        `entidad_nombre_comercial.ilike.${like}`,
        `pedido_folio.ilike.${like}`,
        `cotizacion_folio.ilike.${like}`,
        `po_folios.ilike.${like}`,
      ].join(',')
    );
  }

  return q;
}

const ORDEN_COLUMNA: Record<NrOrden, { columna: string; asc: boolean }> = {
  reciente: { columna: 'emitida_at', asc: false },
  antigua: { columna: 'emitida_at', asc: true },
  antiguedad_desc: { columna: 'antiguedad_dias', asc: false },
  monto_desc: { columna: 'valor_total', asc: false },
  monto_asc: { columna: 'valor_total', asc: true },
  pendiente_desc: { columna: 'monto_pendiente_po', asc: false },
};

/** `folio` como desempate: es unique y monótono con la emisión — mismo
 *  criterio que ordenarCotizaciones (038). */
export function ordenarNr<T extends { order: (...args: any[]) => any }>(query: T, orden: NrOrden): T {
  const o = ORDEN_COLUMNA[orden];
  return query.order(o.columna, { ascending: o.asc, nullsFirst: false }).order('folio', { ascending: false });
}

/** Un bucket por estado con su count real (no data.length, acotado por
 *  `tope`) — mismo patrón que construirColumnasTablero (038). */
export async function construirColumnasTableroNr(
  supabase: any,
  f: FiltrosNr,
  tope: number = NR_TABLERO_TOPE
): Promise<NrTableroColumna[]> {
  const estados = f.estados.length > 0 ? f.estados : [...NR_ESTADOS];

  return Promise.all(
    estados.map(async (estado) => {
      let q = supabase.from(NOTAS_REMISION_VISTA).select('*', { count: 'exact' }).eq('estado', estado);
      q = aplicarFiltrosNr(q, f, { omitirEstado: true });
      q = ordenarNr(q, f.orden).range(0, tope - 1);
      const { data, error, count } = await q;
      if (error) throw new Error(error.message);
      return { estado, count: count ?? 0, data: (data ?? []) as NrListadoRow[] };
    })
  );
}
