export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { redefinicionCreateSchema } from '@/lib/inventario/schemas';

// POST - solicita una redefinición de unidad de medida/factor de conversión
// (causa #1 de pérdida medida: 14 de 27 folios de no conformidad,
// -2,811 piezas, -$37,919.77). Congela unidad_anterior_id/contenido_anterior
// y el saldo base actual desde el propio producto/existencias — el cliente
// sólo elige la unidad NUEVA, nunca describe la anterior (evita que un
// payload manipulado declare un "antes" distinto al real).
// productos_guard_unidad() (013) es la barrera real: sin una fila aquí en
// estado 'autorizado' con exactamente estos valores, el UPDATE de
// productos.unidad_medida_id/contenido_por_unidad se rechaza aunque este
// endpoint nunca se hubiera llamado.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(['super_admin', 'direccion', 'compras', 'almacen']);
    if (response) return response;

    const supabase = createSupabaseServerClient();

    const { data: producto, error: productoError } = await supabase
      .from('productos')
      .select('id, unidad_medida_id, contenido_por_unidad')
      .eq('id', params.id)
      .maybeSingle();
    if (productoError) return NextResponse.json({ error: productoError.message }, { status: 500 });
    if (!producto) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

    const parsed = redefinicionCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    const { unidad_nueva_id, contenido_nuevo, familia_id, motivo, requiere_reconteo, conteo_id } = parsed.data;

    if (unidad_nueva_id === producto.unidad_medida_id && contenido_nuevo === producto.contenido_por_unidad) {
      return NextResponse.json({ error: 'La unidad nueva es igual a la actual; no hay cambio que redefinir.' }, { status: 400 });
    }

    const { data: existencias, error: existenciasError } = await supabase
      .from('inventario_existencias')
      .select('cantidad_teorica')
      .eq('producto_id', params.id);
    if (existenciasError) return NextResponse.json({ error: existenciasError.message }, { status: 500 });

    const existenciaBase = (existencias ?? []).reduce((acc, fila) => acc + Number(fila.cantidad_teorica), 0);
    // Conversión de saldo: factor viejo → factor nuevo, ambos expresados
    // como "piezas por unidad base". Si el producto no llevaba contenido
    // (contenido_por_unidad=1) el saldo convertido es proporcional al nuevo factor.
    const existenciaConvertida = (existenciaBase * producto.contenido_por_unidad) / contenido_nuevo;

    const { data, error } = await supabase
      .from('producto_unidad_redefiniciones')
      .insert({
        producto_id: params.id,
        familia_id: familia_id ?? null,
        unidad_anterior_id: producto.unidad_medida_id,
        contenido_anterior: producto.contenido_por_unidad,
        unidad_nueva_id,
        contenido_nuevo,
        motivo,
        existencia_base_anterior: existenciaBase,
        existencia_base_convertida: existenciaConvertida,
        requiere_reconteo,
        conteo_id: conteo_id ?? null,
      })
      .select('id, folio')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true, id: data.id, folio: data.folio }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
