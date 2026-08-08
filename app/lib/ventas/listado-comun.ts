// Helpers compartidos por los "explorer" de Ventas (038 cotizaciones, 045
// órdenes de compra) — extraídos de listado-cotizaciones.ts (043) para que
// el escape de .or() de PostgREST no diverja entre los dos listados: es el
// tipo de detalle sutil que ya costó un PGRST100 real la primera vez.

/** Envuelve el valor de un ilike para .or(): las comillas dobles delimitan
 *  el valor y así comas/paréntesis dejan de leerse como separadores
 *  estructurales de or=(...) — sin esto, "Refacciones, S.A." (una razón
 *  social con coma, el caso común) rompe el parser de PostgREST
 *  (PGRST100). El patrón de api/entidades/route.ts sólo neutraliza %/_ y
 *  no cubre este caso. */
export function valorLike(q: string): string {
  const sinComodines = q.replace(/[%_]/g, '');
  const escapado = sinComodines.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"%${escapado}%"`;
}

export function diaSiguiente(fechaYYYYMMDD: string): string {
  const [y, m, d] = fechaYYYYMMDD.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
