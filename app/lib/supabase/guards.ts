import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { type Profile, type UserRole } from '@/types/database';

export type AuthFailure = 'unauthenticated' | 'no_profile' | 'inactive';

export type AuthState =
  | { ok: true; userId: string; email: string | null; profile: Profile }
  | { ok: false; reason: AuthFailure };

const PROFILE_COLUMNS = 'id, full_name, role, is_active, created_at, updated_at';

/**
 * Fuente de verdad del servidor para sesión + perfil + is_active.
 * cache() la deduplica: una sola consulta a la DB por request aunque la
 * invoquen el layout, la página y un route handler en la misma pasada.
 */
export const getAuthState = cache(async (): Promise<AuthState> => {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return { ok: false, reason: 'unauthenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) return { ok: false, reason: 'no_profile' };
  if (!(profile as Profile).is_active) return { ok: false, reason: 'inactive' };

  return {
    ok: true,
    userId: user.id,
    email: user.email ?? null,
    profile: profile as Profile,
  };
});

// ---------- Guards para Server Components / layouts ----------

export async function requireActiveUser(): Promise<Extract<AuthState, { ok: true }>> {
  const state = await getAuthState();
  if (state.ok) return state;
  if (state.reason === 'unauthenticated') redirect('/login');
  // Sesión viva pero inutilizable (sin perfil o desactivada): se destruye en
  // /logout en vez de solo ocultar la UI, para que no siga operando por API.
  redirect(`/logout?reason=${state.reason}`);
}

export async function requireRole(roles: UserRole[]): Promise<Extract<AuthState, { ok: true }>> {
  const auth = await requireActiveUser();
  if (!roles.includes(auth.profile.role)) redirect('/dashboard');
  return auth;
}

// ---------- Guard para Route Handlers ----------

const FAILURE: Record<AuthFailure, { status: number; error: string }> = {
  unauthenticated: { status: 401, error: 'No autenticado' },
  no_profile: {
    status: 403,
    error: 'Tu cuenta no tiene un perfil asignado. Contacta al administrador.',
  },
  inactive: { status: 403, error: 'Tu cuenta está desactivada.' },
};

export type ApiAuth =
  | { auth: Extract<AuthState, { ok: true }>; response: null }
  | { auth: null; response: NextResponse };

/** Orden de validación: sesión -> is_active -> rol. */
export async function requireApiRole(roles?: UserRole[]): Promise<ApiAuth> {
  const state = await getAuthState();

  if (!state.ok) {
    const f = FAILURE[state.reason];
    return { auth: null, response: NextResponse.json({ error: f.error }, { status: f.status }) };
  }

  if (roles && !roles.includes(state.profile.role)) {
    return { auth: null, response: NextResponse.json({ error: 'Sin permisos' }, { status: 403 }) };
  }

  return { auth: state, response: null };
}
