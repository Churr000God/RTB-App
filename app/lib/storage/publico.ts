/**
 * Construye la URL pública de un objeto en un bucket público de Supabase
 * Storage. SÓLO se llama desde servidor (Route Handlers, Server Components)
 * — nunca desde código 'use client'.
 *
 * Motivo: NEXT_PUBLIC_SUPABASE_URL llega al bundle de cliente porque Next lo
 * inlina en build time, pero el stage `builder` del Dockerfile no recibe esa
 * variable (.dockerignore excluye los .env y el stage no declara ningún
 * ARG/ENV) — en un build de producción real quedaría `undefined` en
 * cualquier código de cliente que la lea directo. Por eso toda URL pública
 * de Storage se calcula aquí, en servidor (donde la variable sí llega por
 * env_file/entorno de runtime), y viaja ya resuelta en el payload de la API.
 */
export function urlPublica(bucket: string, path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL para construir la URL pública de Storage.');
  }
  const rutaCodificada = path
    .split('/')
    .map((segmento) => encodeURIComponent(segmento))
    .join('/');
  return `${base}/storage/v1/object/public/${bucket}/${rutaCodificada}`;
}
