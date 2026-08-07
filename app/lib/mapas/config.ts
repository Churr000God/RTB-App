import 'server-only';

/**
 * Tokens de Mapbox — SOLO se leen en servidor. Mismo patrón que
 * lib/supabase/admin.ts: `import 'server-only'` hace que el build falle si
 * este módulo termina en un grafo de cliente, en vez de filtrar el token
 * secreto en silencio.
 *
 * - `MAPBOX_TOKEN` (sk.) — Geocoding v6, nunca sale del servidor.
 * - `MAPBOX_PUBLIC_TOKEN` (pk.) — teselas del mapa; se entrega al cliente
 *   sólo a través de `GET /api/mapa/config`, tras `requireApiRole`. Mismo
 *   motivo que `NEXT_PUBLIC_SUPABASE_URL` (ver lib/storage/publico.ts): el
 *   stage `builder` del Dockerfile no recibe variables de entorno, así que
 *   un `pk.` leído directo en código 'use client' quedaría `undefined` en
 *   un build de producción real.
 */
export function mapaHabilitado(): boolean {
  return Boolean(process.env.MAPBOX_TOKEN && process.env.MAPBOX_PUBLIC_TOKEN);
}

export function tokenSecreto(): string {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) throw new Error('Falta MAPBOX_TOKEN en el entorno.');
  return token;
}

export function tokenPublico(): string {
  const token = process.env.MAPBOX_PUBLIC_TOKEN;
  if (!token) throw new Error('Falta MAPBOX_PUBLIC_TOKEN en el entorno.');
  return token;
}

export const MAPBOX_ESTILO = 'mapbox://styles/mapbox/streets-v12';
