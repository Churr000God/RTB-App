// Construcción de filtros del listado/tablero de Órdenes de Compra (045) —
// mismo pivote anti-duplicación que listado-cotizaciones.ts (038): el
// Server Component (page.tsx, primera carga), el GET en modo lista y el GET
// en modo tablero (una consulta por columna) necesitan EXACTAMENTE los
// mismos filtros.
//
// Opera sobre public.ventas_ordenes_compra_listado (043), no sobre
// ventas_ordenes_compra_cliente directo: la vista aplana entidad/pedido/
// cotización y agrega las partidas para que un solo .or()/.range()/.order()
// de PostgREST resuelva búsqueda + paginación + orden por monto.
import {
  PO_ESTADOS,
  PO_FECHA_CAMPOS,
  PO_ORDENES,
  type OrdenCompraListadoRow,
  type PoEstado,
  type PoFechaCampo,
  type PoOrden,
  type PoTableroColumna,
} from '@/types/ventas';
import { PO_TABLERO_TOPE } from '@/lib/ventas/config';
import { valorLike, diaSiguiente } from '@/lib/ventas/listado-comun';

export const ORDENES_COMPRA_VISTA = 'ventas_ordenes_compra_listado';
export const ORDENES_COMPRA_PAGE_SIZE = 20;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Columna real y tipo de cada opción del selector de fecha — mismo
 *  criterio que CAMPO_FECHA_COLUMNA de listado-cotizaciones.ts:
 *  timestamptz necesita `.lt(día siguiente)`, date admite `.lte(hasta)`. */
const CAMPO_FECHA_COLUMNA: Record<PoFechaCampo, { columna: string; tipo: 'timestamptz' | 'date' }> = {
  creacion: { columna: 'created_at', tipo: 'timestamptz' },
  fecha_po: { columna: 'fecha_po', tipo: 'date' },
  surtido: { columna: 'surtida_at', tipo: 'timestamptz' },
};

export interface FiltrosPo {
  q: string | null;
  estados: PoEstado[];
  fechaCampo: PoFechaCampo;
  desde: string | null;
  hasta: string | null;
  entidadId: string | null;
  orden: PoOrden;
  page: number;
}

type FuenteParams = URLSearchParams | Record<string, string | string[] | undefined>;

function leer(fuente: FuenteParams, nombre: string): string | undefined {
  if (fuente instanceof URLSearchParams) return fuente.get(nombre) ?? undefined;
  const v = fuente[nombre];
  return Array.isArray(v) ? v[0] : v;
}

/** Acepta tanto un URLSearchParams (Route Handler) como el `searchParams`
 *  de Next (Server Component) — mismo parser para que la primera carga del
 *  servidor y la paginación del cliente jamás diverjan. */
export function parsearFiltrosPo(fuente: FuenteParams): FiltrosPo {
  const estadoRaw = leer(fuente, 'estado');
  const estados = (estadoRaw ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter((e): e is PoEstado => (PO_ESTADOS as readonly string[]).includes(e));

  const fechaCampoRaw = leer(fuente, 'fecha_campo');
  const fechaCampo = (PO_FECHA_CAMPOS as readonly string[]).includes(fechaCampoRaw ?? '')
    ? (fechaCampoRaw as PoFechaCampo)
    : 'creacion';

  const ordenRaw = leer(fuente, 'orden');
  const orden = (PO_ORDENES as readonly string[]).includes(ordenRaw ?? '') ? (ordenRaw as PoOrden) : 'reciente';

  const desdeRaw = leer(fuente, 'desde');
  const hastaRaw = leer(fuente, 'hasta');
  let desde = desdeRaw && FECHA_RE.test(desdeRaw) ? desdeRaw : null;
  let hasta = hastaRaw && FECHA_RE.test(hastaRaw) ? hastaRaw : null;
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];

  const entidadIdRaw = leer(fuente, 'entidad_id');
  const entidadId = entidadIdRaw && UUID_RE.test(entidadIdRaw) ? entidadIdRaw : null;

  const page = Math.max(1, Number(leer(fuente, 'page')) || 1);

  return {
    q: leer(fuente, 'q')?.trim() || null,
    estados,
    fechaCampo,
    desde,
    hasta,
    entidadId,
    orden,
    page,
  };
}

/** Encadena los filtros sobre un query builder de
 *  `.from('ventas_ordenes_compra_listado')` ya iniciado. `omitirEstado`
 *  aplica cuando ya se filtró por estado con un `.eq()` externo (columnas
 *  del tablero, una consulta por estado). */
export function aplicarFiltrosPo<T extends Record<string, any>>(
  query: T,
  f: FiltrosPo,
  opts: { omitirEstado?: boolean } = {}
): T {
  let q = query;

  if (!opts.omitirEstado && f.estados.length > 0) q = q.in('estado', f.estados);
  if (f.entidadId) q = q.eq('entidad_id', f.entidadId);

  const campo = CAMPO_FECHA_COLUMNA[f.fechaCampo];
  if (f.desde) {
    q = q.gte(campo.columna, campo.tipo === 'date' ? f.desde : `${f.desde}T00:00:00.000Z`);
  }
  if (f.hasta) {
    // Mismo cuidado que listado-cotizaciones.ts: en timestamptz, .lte() del
    // día excluiría casi todo lo ocurrido ese mismo día.
    q = campo.tipo === 'date'
      ? q.lte(campo.columna, f.hasta)
      : q.lt(campo.columna, `${diaSiguiente(f.hasta)}T00:00:00.000Z`);
  }

  if (f.q) {
    const like = valorLike(f.q);
    q = q.or(
      [
        `folio.ilike.${like}`,
        `numero_po.ilike.${like}`,
        `entidad_siglas.ilike.${like}`,
        `entidad_clave.ilike.${like}`,
        `entidad_nombre_legal.ilike.${like}`,
        `entidad_nombre_comercial.ilike.${like}`,
        `pedido_folio.ilike.${like}`,
        `cotizacion_folio.ilike.${like}`,
      ].join(',')
    );
  }

  return q;
}

const ORDEN_COLUMNA: Record<PoOrden, { columna: string; asc: boolean }> = {
  reciente: { columna: 'created_at', asc: false },
  antigua: { columna: 'created_at', asc: true },
  monto_desc: { columna: 'total', asc: false },
  monto_asc: { columna: 'total', asc: true },
  fecha_po: { columna: 'fecha_po', asc: true },
};

/** `folio` como desempate: es unique y monótono con la creación — mismo
 *  motivo que ordenarCotizaciones() en listado-cotizaciones.ts. */
export function ordenarPo<T extends { order: (...args: any[]) => any }>(query: T, orden: PoOrden): T {
  const o = ORDEN_COLUMNA[orden];
  return query.order(o.columna, { ascending: o.asc, nullsFirst: false }).order('folio', { ascending: false });
}

/** Un bucket por estado con su count real (no data.length, acotado por
 *  `tope`) — mismo criterio que construirColumnasTablero() de cotizaciones. */
export async function construirColumnasTableroPo(
  supabase: any,
  f: FiltrosPo,
  tope: number = PO_TABLERO_TOPE
): Promise<PoTableroColumna[]> {
  const estados = f.estados.length > 0 ? f.estados : [...PO_ESTADOS];

  return Promise.all(
    estados.map(async (estado) => {
      let q = supabase.from(ORDENES_COMPRA_VISTA).select('*', { count: 'exact' }).eq('estado', estado);
      q = aplicarFiltrosPo(q, f, { omitirEstado: true });
      q = ordenarPo(q, f.orden).range(0, tope - 1);
      const { data, error, count } = await q;
      if (error) throw new Error(error.message);
      return { estado, count: count ?? 0, data: (data ?? []) as OrdenCompraListadoRow[] };
    })
  );
}
