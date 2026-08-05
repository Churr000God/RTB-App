export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { clientIp, clientUserAgent } from '@/lib/entidades/http';

const schema = z.object({ motivo: z.string().trim().min(5, 'El motivo es obligatorio').max(2000) });

// POST - reactivación de un bloqueo temporal (P05 §IV: "requiere
// aprobación de super_admin con motivo documentado"). Un bloqueo
// permanente no tiene ruta de reversión: "no se puede reactivar sin una
// migración especial de datos" — fuera de alcance de este submódulo.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin', 'direccion']);
    if (response) return response;

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    const { motivo } = parsed.data;

    const admin = createSupabaseAdminClient();
    const { data: entidad } = await admin.from('entidades').select('estado').eq('id', params.id).maybeSingle();
    if (!entidad) return NextResponse.json({ error: 'Entidad no encontrada' }, { status: 404 });
    if (entidad.estado === 'bloqueado_permanente') {
      return NextResponse.json(
        { error: 'Un bloqueo permanente no se reactiva desde aquí — requiere migración especial de datos.' },
        { status: 409 }
      );
    }
    if (entidad.estado !== 'bloqueado_temporal') {
      return NextResponse.json({ error: 'La entidad no está bloqueada temporalmente.' }, { status: 409 });
    }

    if (auth.profile.role === 'direccion') {
      const supabase = createSupabaseServerClient();
      const { data: solicitud, error } = await supabase
        .from('solicitudes_cambio')
        .insert({
          tabla: 'entidades',
          registro_id: params.id,
          tipo_cambio: 'reactivacion',
          cambios: { estado: 'activo' },
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
          message: 'Reactivación enviada a aprobación de super_admin.',
        },
        { status: 202 }
      );
    }

    const { error } = await admin
      .from('entidades')
      .update({ estado: 'activo', bloqueo_motivo: null, bloqueado_at: null, bloqueado_por: null })
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await admin.from('audit_log').insert({
      tabla: 'entidades',
      registro_id: params.id,
      accion: 'desbloqueo',
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
