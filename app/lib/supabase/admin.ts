import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/**
 * Cliente con SUPABASE_SERVICE_ROLE_KEY: ignora RLS y grants de columna.
 * Solo debe usarse desde Route Handlers o Server Actions — jamás desde un
 * componente 'use client'. El import 'server-only' hace que el build falle
 * si este módulo termina en un grafo de cliente, en vez de filtrar la clave
 * en silencio.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.'
    );
  }

  if (!cached) {
    cached = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  return cached;
}
