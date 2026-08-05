export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { REGLAS_APROBACION, type CambioControlado } from '@/lib/entidades/permisos';
import { solicitudCambioResolverSchema } from '@/lib/entidades/schemas';
import { clientIp, clientUserAgent } from '@/lib/entidades/http';

/** Campos que un `cambios` de ese tipo puede tocar — defensa en profundidad
 *  además del zod de creación: aunque alguien lograra meter una clave
 *  extra en el jsonb, aquí se descarta antes de aplicar el UPDATE.
 *  'reactivacion' y 'bloqueo_temporal' no están: el servidor decide sus
 *  campos (estado + bloqueo_*) directamente, nunca a partir de `cambios`. */
const CAMPOS_PERMITIDOS: Partial<Record<CambioControlado, string[]>> = {
  rfc: ['rfc'],
  razon_social: ['nombre_legal'],
  limite_credito: ['limite_credito'],
  condicion_proveedor: ['categoria', 'condicion_pago'],
};

// POST - aprobar/rechazar una solicitud de cambio controlado (P05 §III:
// "Si APROBADO → se aplica el cambio... Si RECHAZADO → vuelve a ACTIVO sin
// cambios"). El aprobador lo decide REGLAS_APROBACION según el tipo, y
// nunca puede ser el propio solicitante.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin', 'direccion']);
    if (response) return response;

    const parsed = solicitudCambioResolverSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    const { decision, comentario_resolucion } = parsed.data;

    const admin = createSupabaseAdminClient();
    const { data: solicitud } = await admin
      .from('solicitudes_cambio')
      .select('*')
      .eq('id', params.id)
      .maybeSingle();

    if (!solicitud) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
    if (solicitud.estado !== 'pendiente') {
      return NextResponse.json({ error: 'Esta solicitud ya fue resuelta.' }, { status: 409 });
    }
    if (solicitud.solicitante_id === auth.userId) {
      return NextResponse.json({ error: 'No puedes aprobar tu propia solicitud.' }, { status: 403 });
    }

    const tipoCambio = solicitud.tipo_cambio as CambioControlado;
    const regla = REGLAS_APROBACION[tipoCambio];
    if (!regla.aprueba || !regla.aprueba.includes(auth.profile.role)) {
      return NextResponse.json(
        { error: `Tu rol no puede resolver un cambio de tipo "${tipoCambio}".` },
        { status: 403 }
      );
    }

    if (decision === 'aprobar') {
      if (tipoCambio === 'bloqueo_temporal') {
        const { error } = await admin
          .from('entidades')
          .update({
            estado: 'bloqueado_temporal',
            bloqueo_motivo: solicitud.motivo,
            bloqueado_at: new Date().toISOString(),
            bloqueado_por: auth.userId,
          })
          .eq('id', solicitud.registro_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      } else if (tipoCambio === 'reactivacion') {
        const { error } = await admin
          .from('entidades')
          .update({ estado: 'activo', bloqueo_motivo: null, bloqueado_at: null, bloqueado_por: null })
          .eq('id', solicitud.registro_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      } else {
        const permitidos = CAMPOS_PERMITIDOS[tipoCambio] ?? [];
        const cambios = solicitud.cambios as Record<string, unknown>;
        const payload = Object.fromEntries(
          Object.entries(cambios).filter(([campo]) => permitidos.includes(campo))
        );
        if (Object.keys(payload).length === 0) {
          return NextResponse.json({ error: 'La solicitud no contiene cambios aplicables.' }, { status: 400 });
        }
        const { error } = await admin.from(solicitud.tabla).update(payload).eq('id', solicitud.registro_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    const { error: resolucionError } = await admin
      .from('solicitudes_cambio')
      .update({
        estado: decision === 'aprobar' ? 'aprobada' : 'rechazada',
        aprobador_id: auth.userId,
        comentario_resolucion: comentario_resolucion ?? null,
        resuelto_at: new Date().toISOString(),
      })
      .eq('id', params.id);
    if (resolucionError) return NextResponse.json({ error: resolucionError.message }, { status: 500 });

    await admin.from('audit_log').insert({
      tabla: 'solicitudes_cambio',
      registro_id: params.id,
      accion: decision === 'aprobar' ? 'aprobacion' : 'rechazo',
      motivo: comentario_resolucion ?? solicitud.motivo,
      usuario_id: auth.userId,
      ip: clientIp(request),
      user_agent: clientUserAgent(request),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
