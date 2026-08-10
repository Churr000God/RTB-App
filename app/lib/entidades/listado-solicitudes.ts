// Parseo de filtros + construcción de la consulta de /api/solicitudes-cambio
// — mismo rol que lib/ventas/listado-cotizaciones.ts (pivote anti-
// duplicación), pero sin importar de lib/ventas/*: ese módulo depende de
// entidades, no al revés, así que valorLike/diaSiguiente se duplican aquí
// en vez de cruzar la dependencia.
import 'server-only';
import { SOLICITUD_ESTADOS, type SolicitudEstado } from '@/types/entidades';
import { CAMBIOS_CONTROLADOS } from '@/lib/entidades/schemas';
import type { CambioControlado } from '@/lib/entidades/permisos';

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Escapa comas/paréntesis/comillas para .or() de PostgREST — sin esto un
 *  motivo o nombre de entidad con coma ("Refacciones, S.A.") rompe el
 *  parser (PGRST100), mismo defecto ya documentado y corregido en
 *  lib/ventas/listado-comun.ts. */
export function valorLike(q: string): string {
  const sinComodines = q.replace(/[%_]/g, '');
  const escapado = sinComodines.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"%${escapado}%"`;
}

export function diaSiguiente(fechaYYYYMMDD: string): string {
  const [y, m, d] = fechaYYYYMMDD.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export interface FiltrosSolicitud {
  q: string | null;
  estado: SolicitudEstado | null;
  tiposCambio: CambioControlado[];
  desde: string | null;
  hasta: string | null;
  soloMias: boolean;
  page: number;
}

type FuenteParams = URLSearchParams;

/** `actorId`: uid real del usuario que hace la petición — "sólo mías" no
 *  puede depender de que el cliente mande su propio uuid honestamente. */
export function parsearFiltrosSolicitud(fuente: FuenteParams, actorId: string | null): FiltrosSolicitud {
  const estadoRaw = fuente.get('estado');
  const estado = (SOLICITUD_ESTADOS as readonly string[]).includes(estadoRaw ?? '') ? (estadoRaw as SolicitudEstado) : null;

  const tiposRaw = (fuente.get('tipo_cambio') ?? '').split(',').map((t) => t.trim());
  const tiposCambio = tiposRaw.filter((t): t is CambioControlado => (CAMBIOS_CONTROLADOS as readonly string[]).includes(t));

  const desdeRaw = fuente.get('desde');
  const hastaRaw = fuente.get('hasta');
  let desde = desdeRaw && FECHA_RE.test(desdeRaw) ? desdeRaw : null;
  let hasta = hastaRaw && FECHA_RE.test(hastaRaw) ? hastaRaw : null;
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];

  const page = Math.max(1, Number(fuente.get('page')) || 1);

  return {
    q: fuente.get('q')?.trim() || null,
    estado,
    tiposCambio,
    desde,
    hasta,
    soloMias: fuente.get('solo_mias') === '1' && !!actorId,
    page,
  };
}

/** Encadena estado/tipo_cambio/fechas/solo_mias sobre un query builder de
 *  .from('solicitudes_cambio') ya iniciado. La búsqueda de texto (`q`) NO
 *  se encadena aquí — necesita resolver ids de entidades/clientes/
 *  proveedores primero (ver construirFiltroTexto), porque registro_id es
 *  polimórfico y no hay columna de nombre directa sobre la que hacer
 *  ilike. */
export function aplicarFiltrosSolicitud<T extends Record<string, any>>(
  query: T,
  f: FiltrosSolicitud,
  actorId: string | null
): T {
  let q = query;
  if (f.estado) q = q.eq('estado', f.estado);
  if (f.tiposCambio.length > 0) q = q.in('tipo_cambio', f.tiposCambio);
  if (f.soloMias && actorId) q = q.eq('solicitante_id', actorId);
  if (f.desde) q = q.gte('created_at', `${f.desde}T00:00:00.000Z`);
  if (f.hasta) q = q.lt('created_at', `${diaSiguiente(f.hasta)}T00:00:00.000Z`);
  return q;
}

/** Resuelve `q` contra entidades/clientes/proveedores (nombre_legal,
 *  nombre_comercial, rfc, clave, siglas) y arma la condición `.or()`
 *  equivalente sobre solicitudes_cambio: `and(tabla.eq.X,registro_id.in.(...))`
 *  por cada tabla — mismo patrón and()-dentro-de-or() que ya usa
 *  app/app/dashboard/entidades/[id]/page.tsx para resolver solicitudes de
 *  una entidad — más `motivo.ilike.%q%` como rama adicional. Devuelve
 *  `null` si `q` no matchea nada en absoluto (ninguna entidad Y el texto
 *  tampoco sirve de ilike por sí solo — en ese caso el propio `.or()` con
 *  sólo la rama de motivo ya es correcto, así que en la práctica esta
 *  función siempre devuelve al menos esa rama). */
export async function construirFiltroTexto(supabase: any, q: string): Promise<string> {
  const like = valorLike(q);
  const { data: entidadesCoincide } = await supabase
    .from('entidades')
    .select('id')
    .or(
      [`nombre_legal.ilike.${like}`, `nombre_comercial.ilike.${like}`, `rfc.ilike.${like}`, `clave.ilike.${like}`, `siglas.ilike.${like}`].join(',')
    );
  const idsEntidades = (entidadesCoincide ?? []).map((e: any) => e.id as string);

  const ramas = [`motivo.ilike.${like}`];
  if (idsEntidades.length > 0) {
    const lista = idsEntidades.join(',');
    ramas.push(`and(tabla.eq.entidades,registro_id.in.(${lista}))`);

    const [clientesCoincide, proveedoresCoincide] = await Promise.all([
      supabase.from('clientes').select('id').in('entidad_id', idsEntidades),
      supabase.from('proveedores').select('id').in('entidad_id', idsEntidades),
    ]);
    const idsClientes = (clientesCoincide.data ?? []).map((c: any) => c.id as string);
    const idsProveedores = (proveedoresCoincide.data ?? []).map((p: any) => p.id as string);
    if (idsClientes.length > 0) ramas.push(`and(tabla.eq.clientes,registro_id.in.(${idsClientes.join(',')}))`);
    if (idsProveedores.length > 0) ramas.push(`and(tabla.eq.proveedores,registro_id.in.(${idsProveedores.join(',')}))`);
  }

  return ramas.join(',');
}
