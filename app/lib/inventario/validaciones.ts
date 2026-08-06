import type { DiscrepanciaSalida, MovimientoTipo } from '@/types/inventario';
import { DISCREPANCIA_SALIDAS_SIN_CAUSA } from './config';

// Validadores puros. Cada uno tiene un espejo exacto del CHECK/función/
// trigger de Postgres correspondiente (documentado en el comentario), para
// dar feedback inmediato en el formulario sin round-trip a la DB — la base
// de datos sigue siendo la barrera real. Si esta capa y SQL alguna vez
// divergen, manda SQL.

/** Espejo de public.movimiento_signo() (011_inventario_kardex.sql). */
export function movimientoSigno(tipo: MovimientoTipo): 1 | -1 {
  return tipo.startsWith('entrada_') ? 1 : -1;
}

/** Espejo de la validación de decimales dentro de
 *  inventario_movimientos_before_insert() (011): round(cantidad, decimales) = cantidad. */
export function cantidadRespetaDecimales(cantidad: number, decimales: number): boolean {
  const factor = 10 ** decimales;
  return Math.round(cantidad * factor) / factor === cantidad;
}

/** Espejo de dis_causa_chk (013_inventario_discrepancias_ajustes.sql):
 *  "una diferencia sin causa identificada no se ajusta: se declara como
 *  hallazgo" — sólo 'hal'/'men' pueden ir sin causa_presunta+banda. */
export function discrepanciaRequiereCausa(salida: DiscrepanciaSalida | null | undefined): boolean {
  if (!salida) return false;
  return !DISCREPANCIA_SALIDAS_SIN_CAUSA.includes(salida);
}

/** Espejo de productos_unidad_contenido_chk (009): si el contenido por
 *  unidad no es 1 (el producto se lleva en una unidad que agrupa, p.ej.
 *  KIT), hace falta declarar en qué unidad está el contenido. */
export function requiereUnidadContenido(contenidoPorUnidad: number): boolean {
  return contenidoPorUnidad !== 1;
}

/** Resuelve el factor de conversión que el trigger del kardex calcularía,
 *  sólo para mostrarlo en la UI antes de enviar (p.ej. "24 PZ = 2 KIT").
 *  Espejo de la sección 1 de inventario_movimientos_before_insert() (011).
 *  Devuelve null si la unidad de captura es incompatible con el producto
 *  — en ese caso el servidor rechazará el movimiento. */
export function resolverFactorConversion(params: {
  unidadCapturaId: string;
  unidadBaseId: string;
  unidadContenidoId: string | null;
  contenidoPorUnidad: number;
}): number | null {
  const { unidadCapturaId, unidadBaseId, unidadContenidoId, contenidoPorUnidad } = params;
  if (unidadCapturaId === unidadBaseId) return 1;
  if (unidadContenidoId && unidadCapturaId === unidadContenidoId) return 1 / contenidoPorUnidad;
  return null;
}
