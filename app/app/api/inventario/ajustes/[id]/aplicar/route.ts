export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { clientIp, clientUserAgent } from '@/lib/entidades/http';

// POST - aplica un ajuste ya autorizado: genera un inventario_movimientos
// (entrada_ajuste/salida_ajuste, con este ajuste_id) por cada línea.
//
// 027 (contexto/QA_INTEGRAL_2026-08-06.md, verificación del circuito
// completo del puente 025): esto era un for-loop de llamadas sueltas con
// el cliente admin — un INSERT en inventario_movimientos por línea seguido
// de un UPDATE que enlazaba movimiento_id, sin transacción. Un fallo a
// medio camino (el que corrigió 026: el trigger de esa tabla exigía una
// columna updated_by inexistente) dejaba el movimiento YA insertado
// (irreversible: inventario_movimientos_no_update, 011) pero sin enlazar;
// un reintento del usuario volvía a procesar la misma línea y duplicaba el
// movimiento. La corrección de fondo es la misma que ya se aplicó a
// conteos (016) y al puente (025): una función SECURITY DEFINER
// (inventario_ajuste_aplicar(), 027) que hace todo en una sola
// transacción — si algo falla, Postgres revierte también el INSERT del
// kardex, así que nunca puede quedar un movimiento huérfano. Se invoca con
// el cliente del propio usuario (no admin) para que auth.uid() resuelva en
// aplicado_por.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin', 'direccion']);
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('inventario_ajuste_aplicar', { p_ajuste_id: params.id });

    if (error) {
      const status =
        error.code === '42501' ? 403 :
        error.code === '28000' ? 401 :
        error.code === 'P0002' ? 404 :
        error.code === '22023' ? 400 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    const impactoPiezas = Number((data as any)?.impacto_piezas ?? 0);
    const impactoValor = Number((data as any)?.impacto_valor ?? 0);

    // Detalle adicional (IP/user-agent) sobre el registro que audit_row()
    // (013) ya generó automáticamente al cambiar estado — best-effort: si
    // esto falla, el ajuste ya quedó aplicado correctamente, no hay nada
    // que revertir.
    try {
      const admin = createSupabaseAdminClient();
      await admin.from('audit_log').insert({
        tabla: 'inventario_ajustes',
        registro_id: params.id,
        accion: 'aplicacion',
        datos_nuevos: { impacto_piezas: impactoPiezas, impacto_valor: impactoValor },
        usuario_id: auth.userId,
        ip: clientIp(request),
        user_agent: clientUserAgent(request),
      });
    } catch {
      // no-op: detalle de auditoría, no crítico.
    }

    return NextResponse.json({ success: true, impactoPiezas, impactoValor });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
