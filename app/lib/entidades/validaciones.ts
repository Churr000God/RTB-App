// Validadores de captura. Cada uno tiene un espejo exacto del CHECK/función
// de Postgres correspondiente (documentado en el comentario de cada uno),
// para dar feedback inmediato en el formulario sin round-trip a la DB — la
// base de datos sigue siendo la barrera real, esto es sólo UX.

const RFC_MORAL = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/; // 12 caracteres
const RFC_FISICA = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/; // 13 caracteres

export function normalizarRfc(rfc: string): string {
  return rfc.trim().toUpperCase();
}

/** Espejo de entidades_rfc_len_chk (longitud) de 002_entidades_core.sql,
 *  más estricto en captura: valida también el patrón de letras/dígitos del
 *  SAT, no sólo la longitud. */
export function rfcValido(rfc: string): boolean {
  const v = normalizarRfc(rfc);
  return RFC_MORAL.test(v) || RFC_FISICA.test(v);
}

/** Espejo de direcciones_cp_chk. */
export function cpValido(cp: string): boolean {
  return /^\d{5}$/.test(cp.trim());
}

/** Espejo de entidades_correo_chk / contactos_correo_chk. */
export function correoValido(correo: string): boolean {
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(correo.trim());
}

// Espejo exacto de public.clabe_valida() en
// db/migrations/004_cuentas_bancarias.sql — algoritmo de P03 §V: pesos
// [3,7,1] cíclicos sobre los primeros 17 dígitos, suma de (dígito × peso)
// mód 10, verificador = (10 − suma mód 10) mód 10, debe coincidir con el
// dígito 18. Si esta función y la de SQL alguna vez divergen, manda SQL.
const CLABE_PESOS = [3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7];

export function clabeValida(clabe: string): boolean {
  if (!/^\d{18}$/.test(clabe)) return false;
  let suma = 0;
  for (let i = 0; i < 17; i += 1) {
    suma += (Number(clabe[i]) * CLABE_PESOS[i]) % 10;
  }
  const verificador = (10 - (suma % 10)) % 10;
  return verificador === Number(clabe[17]);
}
