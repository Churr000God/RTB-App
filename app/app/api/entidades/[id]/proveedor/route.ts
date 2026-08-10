export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { ejecutaDirecto } from '@/lib/entidades/permisos';
import { CONDICION_PAGOS } from '@/types/entidades';

const condicionProveedorSchema = z.object({
  categoria: z.string().trim().max(100).optional(),
  condicion_pago: z.enum(CONDICION_PAGOS, { errorMap: () => ({ message: 'Condición de pago inválida' }) }),
  // Sólo obligatorio para la rama de solicitud (mismo textarea "Motivo del
  // cambio" que ya usa CampoP05 para rfc/razón social/tipo de persona) —
  // super_admin, en la rama directa, no lo necesita.
  motivo: z.string().trim().max(2000).optional(),
});

// PATCH - único punto de escritura de la "condición de proveedor" (P05,
// REGLAS_APROBACION.condicion_proveedor: compras inicia, direccion
// aprueba). Mismo patrón que /api/entidades/[id]/cliente (limite_credito),
// pero sin umbral: aquí TODO cambio propuesto por compras requiere
// aprobación, no sólo el que supera un monto. categoria/condicion_pago no
// tienen GRANT UPDATE para authenticated (002_entidades_core.sql:547 sólo
// concede plazo_pago/credito_autorizado/moneda_default) — antes de esta
// ruta ningún camino de la app podía siquiera proponer el cambio, aunque
// el resolver ya sabía aplicarlo (CAMPOS_PERMITIDOS.condicion_proveedor).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin', 'compras']);
    if (response) return response;

    const parsed = condicionProveedorSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    const cambios = { categoria: parsed.data.categoria || null, condicion_pago: parsed.data.condicion_pago };

    const supabase = createSupabaseServerClient();
    const { data: proveedor } = await supabase
      .from('proveedores')
      .select('id')
      .eq('entidad_id', params.id)
      .maybeSingle();
    if (!proveedor) return NextResponse.json({ error: 'Esta entidad no tiene extensión de proveedor.' }, { status: 404 });

    if (ejecutaDirecto('condicion_proveedor', auth.profile.role)) {
      // Sólo super_admin llega aquí. Sin GRANT de columna para
      // authenticated, hace falta el cliente admin — mismo patrón que
      // nombre_legal/rfc en entidades/[id]/route.ts.
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.from('proveedores').update(cambios).eq('id', proveedor.id).select('id');
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if (!data || data.length === 0) {
        return NextResponse.json({ error: 'No se pudo actualizar: proveedor no encontrado.' }, { status: 404 });
      }
      return NextResponse.json({ success: true, pendiente: false });
    }

    if (!parsed.data.motivo || parsed.data.motivo.length < 5) {
      return NextResponse.json({ error: 'El motivo debe tener al menos 5 caracteres.' }, { status: 400 });
    }

    const { data: solicitud, error } = await supabase
      .from('solicitudes_cambio')
      .insert({
        tabla: 'proveedores',
        registro_id: proveedor.id,
        tipo_cambio: 'condicion_proveedor',
        cambios,
        motivo: parsed.data.motivo,
      })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(
      { success: true, pendiente: true, solicitudId: solicitud.id, message: 'Condición de proveedor enviada a aprobación de dirección.' },
      { status: 202 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
