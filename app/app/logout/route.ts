export const dynamic = 'force-dynamic';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

// Un Server Component no puede escribir cookies, así que no puede cerrar
// sesión de verdad. Este Route Handler sí, y evita el bucle /login ->
// /dashboard -> /login que provocaría redirigir a /login con la sesión aún
// viva (el middleware rebota a los usuarios autenticados fuera de /login).
export async function GET(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();

  const url = new URL('/login', request.url);
  const reason = request.nextUrl.searchParams.get('reason');
  if (reason) url.searchParams.set('reason', reason);

  return NextResponse.redirect(url);
}
