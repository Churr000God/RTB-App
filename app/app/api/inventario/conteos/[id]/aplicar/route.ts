export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';

// POST - aplica un conteo 'cerrado': copia cantidad_fisica a
// inventario_existencias (fecha_ultimo_conteo/conteo_id_ultimo) para cada
// línea con una medición válida. NO ajusta el teórico — "una diferencia
// sin causa identificada no se ajusta: se declara como hallazgo"
// (Registro de Discrepancias CIE-DIS-01). Ajustar el teórico exige un
// inventario_ajustes autorizado aparte, vía /api/inventario/ajustes.
//
// Antes hacía un for-loop de updates uno por uno con el cliente admin,
// tragándose errores individuales (`if (!error) aplicadas += 1`) y
// dejando aplicado_por en NULL porque service_role no lleva JWT
// (cnt_aplicado_chk lo exige NOT NULL — E-03/E-04,
// contexto/AUDITORIA_QA_ROLES_2026-08-06.md). La corrección de fondo
// (016_qa_correcciones.sql) es la misma que en /congelar: un solo UPDATE
// ... FROM set-based dentro de inventario_aplicar_conteo(), invocada con
// el cliente del propio usuario para que auth.uid() resuelva. El chequeo
// de rol vive ahora en la función, no en la ruta — así /estado no puede
// evadir la restricción por la puerta genérica (E-04).
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion']);
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('inventario_aplicar_conteo', { p_conteo_id: params.id });

    if (error) {
      const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ success: true, existenciasActualizadas: data as number });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
