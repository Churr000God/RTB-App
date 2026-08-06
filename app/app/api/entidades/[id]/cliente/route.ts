export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { UMBRAL_APROBACION_CREDITO } from '@/lib/entidades/config';
import { ejecutaDirecto } from '@/lib/entidades/permisos';

const clienteCreditoSchema = z.object({
  limite_credito: z.coerce.number().min(0, 'El límite de crédito no puede ser negativo'),
});

// PATCH - único punto de escritura del límite de crédito de un cliente ya
// existente. Antes no existía: REGLAS_APROBACION.limite_credito
// (lib/entidades/permisos.ts) declara la regla y el resolver de
// solicitudes_cambio ya sabe aplicarla, pero ninguna ruta la originaba —
// la regla estaba huérfana, sin forma de que 'ventas' propusiera un nuevo
// límite sobre una entidad ya dada de alta (contexto/AUDITORIA_QA_ROLES_2026-08-06.md,
// hallazgo encontrado al corregir E-07).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin', 'direccion', 'ventas']);
    if (response) return response;

    const parsed = clienteCreditoSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    const { limite_credito } = parsed.data;

    const supabase = createSupabaseServerClient();
    const { data: cliente } = await supabase
      .from('clientes')
      .select('id, limite_credito')
      .eq('entidad_id', params.id)
      .maybeSingle();
    if (!cliente) return NextResponse.json({ error: 'Esta entidad no tiene extensión de cliente.' }, { status: 404 });

    const requiereAprobacion =
      limite_credito > UMBRAL_APROBACION_CREDITO && !ejecutaDirecto('limite_credito', auth.profile.role);

    if (!requiereAprobacion) {
      const { error } = await supabase.from('clientes').update({ limite_credito }).eq('id', cliente.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true, pendiente: false, limiteCredito: limite_credito });
    }

    const { data: solicitud, error } = await supabase
      .from('solicitudes_cambio')
      .insert({
        tabla: 'clientes',
        registro_id: cliente.id,
        tipo_cambio: 'limite_credito',
        cambios: { limite_credito },
        motivo: `Nuevo límite de crédito solicitado ($${limite_credito.toLocaleString('es-MX')}) supera el umbral de aprobación ($${UMBRAL_APROBACION_CREDITO.toLocaleString('es-MX')}).`,
      })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(
      { success: true, pendiente: true, solicitudId: solicitud.id, message: 'Nuevo límite enviado a aprobación de dirección.' },
      { status: 202 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
