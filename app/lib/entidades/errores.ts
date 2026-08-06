// Traduce el mensaje crudo de Postgres de una violación de índice único de
// `entidades` a un mensaje en español para el usuario. Antes de
// 020_entidades_siglas.sql el regex de las rutas era
// /uq_entidades_rfc|duplicate key/i, que reportaba "Ya existe una entidad
// con ese RFC" para CUALQUIER duplicate key — incluida una colisión de
// siglas. Se ramifica por nombre de constraint para no repetir ese error.
export function mensajeDuplicadoEntidad(mensaje: string): string | null {
  if (/uq_entidades_siglas/i.test(mensaje)) return 'Ya existe una entidad con esas siglas.';
  if (/uq_entidades_rfc/i.test(mensaje)) return 'Ya existe una entidad con ese RFC.';
  if (/entidades_clave_key/i.test(mensaje)) return 'Conflicto al generar la clave de la entidad; reintenta.';
  if (/duplicate key/i.test(mensaje)) return 'Ya existe una entidad con ese dato único.';
  return null;
}
