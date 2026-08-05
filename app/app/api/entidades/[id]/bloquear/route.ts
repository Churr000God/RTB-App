export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { bloqueoEntidadSchema } from '@/lib/entidades/schemas';
import { clientIp, clientUserAgent } from '@/lib/entidades/http';

// POST - bloqueo temporal o permanente (P05 §IV).
//   - temporal: direccion sólo puede SOLICITARLO (queda pendiente de
//     aprobación de super_admin); super_admin lo aplica directo.
//   - permanente: exclusivo de super_admin, y sólo si no hay operaciones
//     abiertas (public.tiene_operaciones_abiertas — hoy siempre false,
//     Ventas/Compras todavía no existen).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin', 'direccion']);
    if (response) return response;

    const parsed = bloqueoEntidadSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    const { tipo, motivo } = parsed.data;

    if (tipo === 'permanente' && auth.profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Sólo super_admin ejecuta el bloqueo permanente.' }, { status: 403 });
    }

    if (tipo === 'temporal' && auth.profile.role === 'direccion') {
      const supabase = createSupabaseServerClient();
      const { data: solicitud, error } = await supabase
        .from('solicitudes_cambio')
        .insert({
          tabla: 'entidades',
          registro_id: params.id,
          tipo_cambio: 'bloqueo_temporal',
          cambios: { estado: 'bloqueado_temporal', bloqueo_motivo: motivo },
          motivo,
        })
        .select('id')
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(
        {
          success: true,
          pendiente: true,
          solicitudId: solicitud.id,
          message: 'Bloqueo temporal enviado a aprobación de super_admin.',
        },
        { status: 202 }
      );
    }

    const admin = createSupabaseAdminClient();

    if (tipo === 'permanente') {
      const { data: abiertas, error: rpcError } = await admin.rpc('tiene_operaciones_abiertas', {
        p_entidad_id: params.id,
      });
      if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 });
      if (abiertas) {
        return NextResponse.json(
          { error: 'La entidad tiene operaciones abiertas; no puede bloquearse permanentemente.' },
          { status: 409 }
        );
      }
    }

    const estado = tipo === 'temporal' ? 'bloqueado_temporal' : 'bloqueado_permanente';
    const { error } = await admin
      .from('entidades')
      .update({ estado, bloqueo_motivo: motivo, bloqueado_at: new Date().toISOString(), bloqueado_por: auth.userId })
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Evento de negocio explícito con IP/motivo — audit_row() también
    // dispara por el UPDATE, pero corre bajo service_role y no conoce ni
    // la IP ni al usuario real que decidió el bloqueo.
    await admin.from('audit_log').insert({
      tabla: 'entidades',
      registro_id: params.id,
      accion: `bloqueo_${tipo}`,
      motivo,
      usuario_id: auth.userId,
      ip: clientIp(request),
      user_agent: clientUserAgent(request),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
