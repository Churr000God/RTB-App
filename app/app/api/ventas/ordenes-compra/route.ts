export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { poCreateSchema } from '@/lib/ventas/schemas';
import { mensajeErrorPo } from '@/lib/ventas/errores';
import { rolesQuePueden } from '@/lib/ventas/permisos';

// GET - listado de PO. Facturación consulta en modo sólo lectura (para
// saber qué está a punto de facturarse).
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado');
    const entidadId = searchParams.get('entidad_id');

    const supabase = createSupabaseServerClient();
    let query = supabase.from('ventas_ordenes_compra_cliente').select('*').order('created_at', { ascending: false });
    if (estado) query = query.eq('estado', estado);
    if (entidadId) query = query.eq('entidad_id', entidadId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - registra la PO del cliente. numero_po_normalizado (columna
// generada, 033) es lo que respalda el índice único parcial — si el
// cliente ya tiene una PO viva con ese número, es una posible duplicada
// (documento §3 del dueño del proyecto): el error se traduce, no se
// asume automáticamente cuál es la válida.
export async function POST(request: Request) {
  try {
    const { response } = await requireApiRole(rolesQuePueden('ordenes_compra', 'insert'));
    if (response) return response;

    const parsed = poCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('ventas_ordenes_compra_cliente')
      .insert(parsed.data)
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: mensajeErrorPo(error.message) }, { status: 400 });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
