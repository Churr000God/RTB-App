export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { cuentaBancariaCreateSchema } from '@/lib/entidades/schemas';

// GET - P03 §II: finanzas/super_admin ven la tabla completa (RLS lo
// decide); cualquier otro rol autorizado recibe la CLABE enmascarada vía
// public.proveedor_cuentas_resumen() — "direccion sólo ve el estado".
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { auth, response } = await requireApiRole();
    if (response) return response;

    const supabase = createSupabaseServerClient();

    if (auth.profile.role === 'finanzas' || auth.profile.role === 'super_admin') {
      const { data, error } = await supabase
        .from('proveedor_cuentas_bancarias')
        .select('*')
        .eq('proveedor_id', params.id)
        .order('created_at', { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data: data ?? [], enmascarado: false });
    }

    const { data, error } = await supabase.rpc('proveedor_cuentas_resumen', { p_proveedor_id: params.id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [], enmascarado: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - alta o reemplazo de cuenta (P03 §III/§IV). Sólo finanzas/super_admin.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['finanzas', 'super_admin']);
    if (response) return response;

    const body = await request.json().catch(() => null);
    const parsed = cuentaBancariaCreateSchema.safeParse({ ...body, proveedor_id: params.id });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    const { data: activaActual } = await supabase
      .from('proveedor_cuentas_bancarias')
      .select('id')
      .eq('proveedor_id', params.id)
      .eq('estado', 'activa')
      .maybeSingle();

    if (activaActual && !parsed.data.motivo_cambio) {
      return NextResponse.json(
        { error: 'Ya existe una cuenta activa; indica el motivo del reemplazo.' },
        { status: 400 }
      );
    }

    const { data: nueva, error } = await supabase
      .from('proveedor_cuentas_bancarias')
      .insert(parsed.data)
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (activaActual) {
      // 'estado' no tiene GRANT UPDATE para authenticated (004_cuentas_bancarias.sql)
      // — esta transición puntual (activa -> pendiente_reemplazo) exige el
      // cliente admin, no el del usuario.
      const admin = createSupabaseAdminClient();
      const { error: transicionError } = await admin
        .from('proveedor_cuentas_bancarias')
        .update({ estado: 'pendiente_reemplazo' })
        .eq('id', activaActual.id);
      if (transicionError) {
        return NextResponse.json({ error: transicionError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, id: nueva.id }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
