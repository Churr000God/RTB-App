export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { ventasAutorizacionCreateSchema } from '@/lib/ventas/schemas';
import { rolesQuePueden, ACCESO_PANTALLA } from '@/lib/ventas/permisos';

const PAGE_SIZE = 20;

// GET - bandeja de autorizaciones (excepción de subtotal, código
// divergente, duplicidad confirmada, corrección de documento). Paginada
// (mismo patrón que /api/inventario/hallazgos y /api/entidades).
// documento_tipo/documento_id/tipo son aditivos — los usa po-detalle.tsx
// para ofrecer sólo la autorización vigente de ESTA PO en vez de que el
// usuario pegue el UUID a mano (§3.4 de AUDITORIA_RTB-VEN-01.md).
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole(ACCESO_PANTALLA.autorizaciones);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado');
    const tipo = searchParams.get('tipo');
    const documentoTipo = searchParams.get('documento_tipo');
    const documentoId = searchParams.get('documento_id');
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const supabase = createSupabaseServerClient();
    let query = supabase
      .from('ventas_autorizaciones')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (estado) query = query.eq('estado', estado);
    if (tipo) query = query.eq('tipo', tipo);
    if (documentoTipo) query = query.eq('documento_tipo', documentoTipo);
    if (documentoId) query = query.eq('documento_id', documentoId);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [], count: count ?? 0, page, pageSize: PAGE_SIZE });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - solicita una autorización. estado/autorizador_id/autorizado_at
// quedan fuera del GRANT INSERT (033) — sólo ventas_autorizacion_resolver()
// los escribe.
export async function POST(request: Request) {
  try {
    const { response } = await requireApiRole(rolesQuePueden('ventas_autorizaciones', 'insert'));
    if (response) return response;

    const parsed = ventasAutorizacionCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('ventas_autorizaciones').insert(parsed.data).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
