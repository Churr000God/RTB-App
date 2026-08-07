export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { MAPBOX_ESTILO, mapaHabilitado, tokenPublico } from '@/lib/mapas/config';

// GET - entrega el token PÚBLICO de Mapbox a cualquier sesión autenticada
// (los 8 roles leen ubicaciones/direcciones), nunca al bundle de cliente
// directo. Si los tokens no están configurados, `habilitado:false` deja
// que la UI muestre un aviso en vez de romper el formulario (decisión
// confirmada con el dueño del proyecto: se puede construir sin los tokens).
export async function GET() {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    if (!mapaHabilitado()) {
      return NextResponse.json({ habilitado: false, token: null, estilo: null });
    }

    return NextResponse.json({ habilitado: true, token: tokenPublico(), estilo: MAPBOX_ESTILO });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
