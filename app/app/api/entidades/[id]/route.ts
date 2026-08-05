export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { entidadUpdateLibreSchema, rfcSchema } from '@/lib/entidades/schemas';

// GET - detalle completo: entidad + extensión de rol + contactos/direcciones
// activos + solicitudes de cambio pendientes.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data: entidad, error } = await supabase.from('entidades').select('*').eq('id', params.id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!entidad) return NextResponse.json({ error: 'Entidad no encontrada' }, { status: 404 });

    const [cliente, proveedor, contactos, direcciones, solicitudes] = await Promise.all([
      supabase.from('clientes').select('*').eq('entidad_id', params.id).maybeSingle(),
      supabase.from('proveedores').select('*').eq('entidad_id', params.id).maybeSingle(),
      supabase
        .from('contactos')
        .select('*')
        .eq('entidad_id', params.id)
        .eq('activo', true)
        .order('es_principal', { ascending: false }),
      supabase.from('direcciones').select('*').eq('entidad_id', params.id).eq('activo', true),
      supabase
        .from('solicitudes_cambio')
        .select('*')
        .eq('tabla', 'entidades')
        .eq('registro_id', params.id)
        .eq('estado', 'pendiente'),
    ]);

    return NextResponse.json({
      entidad,
      cliente: cliente.data ?? null,
      proveedor: proveedor.data ?? null,
      contactos: contactos.data ?? [],
      direcciones: direcciones.data ?? [],
      solicitudesPendientes: solicitudes.data ?? [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

const CAMPOS_SENSIBLES = ['nombre_legal', 'rfc'] as const;

// PATCH - "modificación libre" de P05 para cualquier rol con acceso de
// escritura; nombre_legal/rfc ("modificación controlada") sólo los toca
// super_admin directo aquí — cualquier otro rol debe pasar por
// POST /api/solicitudes-cambio.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { auth, response } = await requireApiRole(['super_admin', 'direccion', 'ventas', 'compras']);
    if (response) return response;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    const sensiblesEnviados = CAMPOS_SENSIBLES.filter((c) => c in (body as Record<string, unknown>));
    if (sensiblesEnviados.length > 0 && auth.profile.role !== 'super_admin') {
      return NextResponse.json(
        {
          error: `${sensiblesEnviados.join(', ')} requiere una solicitud de cambio aprobada (POST /api/solicitudes-cambio).`,
        },
        { status: 403 }
      );
    }

    const schema =
      auth.profile.role === 'super_admin'
        ? entidadUpdateLibreSchema.extend({
            nombre_legal: z.string().trim().min(3).max(200).optional(),
            rfc: rfcSchema.optional().nullable(),
          })
        : entidadUpdateLibreSchema;

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }

    // Los campos libres los actualiza el propio usuario vía RLS; si además
    // incluyen nombre_legal/rfc (sólo super_admin llega hasta aquí con
    // eso), esas dos columnas no tienen GRANT UPDATE para authenticated
    // (ver 002_entidades_core.sql) y hace falta el cliente admin.
    const client = sensiblesEnviados.length > 0 ? createSupabaseAdminClient() : createSupabaseServerClient();
    const { error } = await client.from('entidades').update(parsed.data).eq('id', params.id);
    if (error) {
      const duplicado = /uq_entidades_rfc|duplicate key/i.test(error.message);
      return NextResponse.json({ error: duplicado ? 'Ya existe una entidad con ese RFC.' : error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
