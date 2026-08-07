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

// Traduce el mensaje crudo de Postgres de un POST/PATCH sobre
// ubicaciones_internas a español. El zod de app/lib/entidades/schemas.ts
// (ubicacionCreateSchema/ubicacionUpdateSchema) ya valida en cliente los
// mismos dos CHECK nuevos de 024_ubicaciones_geo.sql, así que estas dos
// ramas sólo se alcanzan si algo llama a la API sin pasar por el schema —
// el CHECK sigue siendo la barrera real, esto es sólo el mensaje.
export function mensajeErrorUbicacion(mensaje: string): string {
  if (/uq_ubicaciones_segmento/i.test(mensaje)) {
    return 'Ya existe una ubicación con ese segmento bajo el mismo padre.';
  }
  if (/ubicaciones_geo_solo_centro_chk/i.test(mensaje)) {
    return 'Sólo un centro operativo puede tener dirección y coordenada.';
  }
  if (/ubicaciones_geo_chk/i.test(mensaje)) {
    return 'Captura ambas coordenadas (latitud y longitud) o ninguna.';
  }
  if (/ubicaciones_cp_chk/i.test(mensaje)) {
    return 'Código postal inválido (5 dígitos).';
  }
  return mensaje;
}
