// Funciones puras sin dependencias — la base de datos sigue siendo la
// barrera real (triggers/CHECK de 028…034); esto es sólo feedback de UX
// sin round-trip. Si esta capa y SQL alguna vez divergen, manda SQL.
//
// Deliberadamente NO hay ninguna función de comparación de precios aquí:
// PostgREST serializa `numeric` como float64 de JS, y la regla de
// "coincidencia 100%" de ventas_po_validar() (033) sólo es confiable
// comparando en SQL sobre `numeric` — nunca en TypeScript. La UI muestra
// una vista previa informativa; el cruce real siempre lo hace la función.

/** Espejo de nullif(upper(btrim(x)), '') — mismo gotcha que
 *  entidades.siglas (020) y ventas_ordenes_compra_cliente.numero_po_normalizado
 *  (033): btrim('') da '', que NO es NULL. */
export function normalizarNumeroPo(numeroPo: string | null | undefined): string | null {
  const limpio = (numeroPo ?? '').trim().toUpperCase();
  return limpio.length > 0 ? limpio : null;
}

/** Compara RFC ignorando mayúsculas/espacios — mismo criterio que
 *  ventas_po_validar() al rechazar una PO por RFC no coincidente. Sólo
 *  para mostrar una advertencia temprana en la UI; el rechazo real lo
 *  hace la función SQL. */
export function rfcCoincide(rfcDeclarado: string | null | undefined, rfcEntidad: string | null | undefined): boolean {
  if (!rfcDeclarado || !rfcEntidad) return true; // sin dato no se contradice
  return rfcDeclarado.trim().toUpperCase() === rfcEntidad.trim().toUpperCase();
}

/** Antigüedad en días — mismo cálculo que ventas_tablero_nr() (034),
 *  para que una vista client-side (sin round-trip) muestre el mismo
 *  número mientras no haya recargado. */
export function antiguedadDias(fechaIso: string | null | undefined): number | null {
  if (!fechaIso) return null;
  const fecha = new Date(fechaIso).getTime();
  if (Number.isNaN(fecha)) return null;
  return Math.floor((Date.now() - fecha) / (1000 * 60 * 60 * 24));
}

export function formatearMoneda(valor: number | null | undefined, moneda = 'MXN'): string {
  if (valor === null || valor === undefined) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda }).format(valor);
}

export function formatearPorcentaje(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '—';
  return `${valor.toFixed(2)}%`;
}
