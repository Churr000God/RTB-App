export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';

// POST - congela el conteo. Antes hacía 4 escrituras sueltas con el
// cliente admin (service_role) directamente desde esta ruta — eso rompía
// siempre con `null value in column "congelado_por"` porque service_role
// no lleva JWT, así que auth.uid() resolvía NULL contra una columna
// NOT NULL (contexto/AUDITORIA_QA_ROLES_2026-08-06.md, E-01), y además
// dejaba líneas huérfanas si la segunda escritura fallaba (sin
// transacción real entre llamadas HTTP separadas a PostgREST).
//
// La corrección de fondo (016_qa_correcciones.sql) fue mover toda la
// lógica a inventario_congelar_conteo(), una función SECURITY DEFINER
// invocada aquí con el cliente del propio usuario: la función gana el
// privilegio que necesita sobre inventario_conteo_detalles/
// inventario_congelamientos (tablas con GRANT restringido), pero como
// nunca se sale del contexto JWT del usuario, auth.uid() resuelve al
// actor real durante todo el flujo — congelado_por queda bien puesto sin
// necesidad de pasarlo a mano. Y al ser una sola llamada RPC, Postgres la
// ejecuta como una sola transacción: si algo falla a medio camino, no
// quedan líneas huérfanas ni el conteo se mueve de 'planificado'.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'almacen']);
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('inventario_congelar_conteo', { p_conteo_id: params.id });

    if (error) {
      const status = error.code === '42501' ? 403 : error.code === '22023' ? 400 : error.code === 'P0002' ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ success: true, lineasGeneradas: data as number });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
