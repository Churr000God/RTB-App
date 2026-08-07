// Traduce el errcode de Postgres (siempre viene en error.code cuando la
// ruta llama a una función RPC de 028…034) al status HTTP correcto.
// Convención uniforme en todo el módulo: cada función SECURITY DEFINER
// usa exactamente estos códigos (ver plantilla de 016/025/027):
//   42501 → 403 (sin permisos / transición no válida)
//   28000 → 401 (auth.uid() NULL — invocada sin el cliente del usuario)
//   P0002 → 404 (no encontrado)
//   22023 → 400 (argumento inválido / regla de negocio violada)
//   23514 → 400 (CHECK violado, casi siempre motivo obligatorio)
//   P0001 → 409 (saldo negativo del kardex)
//   55006 → 409 (congelamiento de conteo activo, ver 011/012)
export function statusPorErrcode(code: string | undefined | null): number {
  switch (code) {
    case '42501':
      return 403;
    case '28000':
      return 401;
    case 'P0002':
      return 404;
    case '22023':
    case '23514':
      return 400;
    case 'P0001':
    case '55006':
      return 409;
    default:
      return 400;
  }
}

/** Traduce el mensaje crudo de Postgres de una violación de índice único
 *  de ventas_ordenes_compra_cliente a un mensaje en español para el
 *  usuario — misma técnica que mensajeDuplicadoEntidad (lib/entidades/errores.ts). */
export function mensajeErrorPo(mensaje: string): string {
  if (/uq_po_numero/i.test(mensaje)) {
    return 'Ya existe una PO con ese número para esta entidad; revisa si es una posible duplicada.';
  }
  if (/uq_po_partida_linea/i.test(mensaje)) {
    return 'Ya existe una partida con ese número de línea en esta PO.';
  }
  return mensaje;
}

export function mensajeErrorCotizacion(mensaje: string): string {
  if (/cot_linea_precio_chk/i.test(mensaje)) {
    return 'Falta elegir un precio para esta línea, o el producto todavía no tiene costo.';
  }
  if (/cot_linea_descripcion_chk/i.test(mensaje)) {
    return 'Describe lo que el cliente pidió si el producto todavía no existe en catálogo.';
  }
  return mensaje;
}
