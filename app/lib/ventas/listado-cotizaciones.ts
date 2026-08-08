// Construcción de filtros del listado/tablero de cotizaciones (038) —
// pivote anti-duplicación: el Server Component (page.tsx, primera carga),
// el GET en modo lista y el GET en modo tablero (una consulta por columna)
// necesitan EXACTAMENTE los mismos filtros. Sin este módulo, la lógica se
// escribiría tres veces y divergiría — el mismo defecto que ya tenía esta
// pantalla entre `page.tsx` (con embed de entidades) y el GET (sin él).
//
// Opera sobre public.ventas_cotizaciones_listado (038), no sobre
// ventas_cotizaciones directo: la vista aplana entidades y agrega el total
// de líneas activas para que un solo .or()/.range()/.order() de PostgREST
// resuelva búsqueda + paginación + orden por monto, sin resolver IDs en
// dos pasos ni sumar importes en JS.
import {
  COTIZACION_FECHA_CAMPOS,
  COTIZACION_ORDENES,
  COTIZACION_VIGENCIA_FILTROS,
  VENTAS_COTIZACION_ESTADOS,
  type CotizacionFechaCampo,
  type CotizacionListadoRow,
  type CotizacionOrden,
  type CotizacionTableroColumna,
  type CotizacionVigenciaFiltro,
  type VentasCotizacionEstado,
} from '@/types/ventas';
import { CANAL_ORIGENES, type CanalOrigen } from '@/types/entidades';
import { COTIZACION_TABLERO_TOPE } from '@/lib/ventas/config';
import { valorLike, diaSiguiente } from '@/lib/ventas/listado-comun';

export const COTIZACIONES_VISTA = 'ventas_cotizaciones_listado';
export const COTIZACIONES_PAGE_SIZE = 20;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Columna real y tipo de cada opción del selector de fecha — el tipo
 *  decide cómo se cierra el extremo superior del rango (ver
 *  aplicarFiltrosCotizacion): timestamptz necesita `.lt(día siguiente)`,
 *  date admite `.lte(hasta)` directo. */
const CAMPO_FECHA_COLUMNA: Record<CotizacionFechaCampo, { columna: string; tipo: 'timestamptz' | 'date' }> = {
  creacion: { columna: 'created_at', tipo: 'timestamptz' },
  envio: { columna: 'enviada_at', tipo: 'timestamptz' },
  resolucion: { columna: 'resuelta_at', tipo: 'timestamptz' },
  vigencia: { columna: 'vigencia_hasta', tipo: 'date' },
};

export interface FiltrosCotizacion {
  q: string | null;
  estados: VentasCotizacionEstado[];
  fechaCampo: CotizacionFechaCampo;
  desde: string | null;
  hasta: string | null;
  entidadId: string | null;
  vendedorId: string | null;
  soloMias: boolean;
  canal: CanalOrigen | null;
  vigenciaFiltro: CotizacionVigenciaFiltro | null;
  enConsulta: boolean;
  orden: CotizacionOrden;
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
 *  servidor y la paginación del cliente jamás diverjan.
 *
 *  `actorId`: resuelve el valor reservado `vendedor_id=mias` al uid real
 *  del usuario que hace la petición — "sólo mías" no puede depender de que
 *  el cliente mande su propio uuid honestamente. */
export function parsearFiltrosCotizacion(fuente: FuenteParams, actorId: string | null): FiltrosCotizacion {
  const estadoRaw = leer(fuente, 'estado');
  const estados = (estadoRaw ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter((e): e is VentasCotizacionEstado => (VENTAS_COTIZACION_ESTADOS as readonly string[]).includes(e));

  const fechaCampoRaw = leer(fuente, 'fecha_campo');
  const fechaCampo = (COTIZACION_FECHA_CAMPOS as readonly string[]).includes(fechaCampoRaw ?? '')
    ? (fechaCampoRaw as CotizacionFechaCampo)
    : 'creacion';

  const ordenRaw = leer(fuente, 'orden');
  const orden = (COTIZACION_ORDENES as readonly string[]).includes(ordenRaw ?? '')
    ? (ordenRaw as CotizacionOrden)
    : 'reciente';

  const vigenciaRaw = leer(fuente, 'vigencia');
  const vigenciaFiltro = (COTIZACION_VIGENCIA_FILTROS as readonly string[]).includes(vigenciaRaw ?? '')
    ? (vigenciaRaw as CotizacionVigenciaFiltro)
    : null;

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
  const vendedorId = soloMias
    ? actorId
    : vendedorIdRaw && UUID_RE.test(vendedorIdRaw)
      ? vendedorIdRaw
      : null;

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
    vigenciaFiltro,
    enConsulta: leer(fuente, 'en_consulta') === '1',
    orden,
    page,
  };
}

/** Encadena los filtros sobre un query builder de
 *  `.from('ventas_cotizaciones_listado')` ya iniciado. `omitirEstado`
 *  aplica cuando ya se filtró por estado con un `.eq()` externo (columnas
 *  del tablero, una consulta por estado). */
export function aplicarFiltrosCotizacion<T extends Record<string, any>>(
  query: T,
  f: FiltrosCotizacion,
  opts: { omitirEstado?: boolean } = {}
): T {
  let q = query;

  if (!opts.omitirEstado && f.estados.length > 0) q = q.in('estado', f.estados);
  if (f.entidadId) q = q.eq('entidad_id', f.entidadId);
  if (f.vendedorId) q = q.eq('vendedor_id', f.vendedorId);
  if (f.canal) q = q.eq('canal_entrada', f.canal);
  if (f.enConsulta) q = q.gt('lineas_en_consulta', 0);

  if (f.vigenciaFiltro) {
    const hoy = new Date().toISOString().slice(0, 10);
    q = f.vigenciaFiltro === 'vigente' ? q.gte('vigencia_hasta', hoy) : q.lt('vigencia_hasta', hoy);
  }

  const campo = CAMPO_FECHA_COLUMNA[f.fechaCampo];
  if (f.desde) {
    q = q.gte(campo.columna, campo.tipo === 'date' ? f.desde : `${f.desde}T00:00:00.000Z`);
  }
  if (f.hasta) {
    // El cierre superior NO es igual en date que en timestamptz: un
    // .lte('created_at', '2026-08-08') excluiría todo lo creado después de
    // las 00:00:00 de ese día — es decir, casi todo el día que el usuario
    // acaba de marcar en el calendario.
    q = campo.tipo === 'date'
      ? q.lte(campo.columna, f.hasta)
      : q.lt(campo.columna, `${diaSiguiente(f.hasta)}T00:00:00.000Z`);
  }

  if (f.q) {
    const like = valorLike(f.q);
    q = q.or(
      [
        `folio.ilike.${like}`,
        `entidad_siglas.ilike.${like}`,
        `entidad_clave.ilike.${like}`,
        `entidad_nombre_legal.ilike.${like}`,
        `entidad_nombre_comercial.ilike.${like}`,
      ].join(',')
    );
  }

  return q;
}

const ORDEN_COLUMNA: Record<CotizacionOrden, { columna: string; asc: boolean }> = {
  reciente: { columna: 'created_at', asc: false },
  antigua: { columna: 'created_at', asc: true },
  monto_desc: { columna: 'total', asc: false },
  monto_asc: { columna: 'total', asc: true },
  vigencia: { columna: 'vigencia_hasta', asc: true },
};

/** `folio` como desempate: es unique y monótono con la creación. Sin un
 *  desempate determinista, .range() puede repetir o saltar filas entre
 *  páginas cuando dos comparten la clave de orden — el mismo problema que
 *  ya documentó el gotcha de created_at en INSERT...SELECT multi-fila,
 *  aplicado aquí a la paginación en vez de al despacho. */
export function ordenarCotizaciones<T extends { order: (...args: any[]) => any }>(
  query: T,
  orden: CotizacionOrden
): T {
  const o = ORDEN_COLUMNA[orden];
  return query.order(o.columna, { ascending: o.asc, nullsFirst: false }).order('folio', { ascending: false });
}

/** Un bucket por estado con su count real (no data.length, acotado por
 *  `tope`) — para que la cabecera de columna nunca mienta cuando hay más
 *  tarjetas de las que se muestran. */
export async function construirColumnasTablero(
  supabase: any,
  f: FiltrosCotizacion,
  tope: number = COTIZACION_TABLERO_TOPE
): Promise<CotizacionTableroColumna[]> {
  const estados = f.estados.length > 0 ? f.estados : [...VENTAS_COTIZACION_ESTADOS];

  return Promise.all(
    estados.map(async (estado) => {
      let q = supabase.from(COTIZACIONES_VISTA).select('*', { count: 'exact' }).eq('estado', estado);
      q = aplicarFiltrosCotizacion(q, f, { omitirEstado: true });
      q = ordenarCotizaciones(q, f.orden).range(0, tope - 1);
      const { data, error, count } = await q;
      if (error) throw new Error(error.message);
      return { estado, count: count ?? 0, data: (data ?? []) as CotizacionListadoRow[] };
    })
  );
}
