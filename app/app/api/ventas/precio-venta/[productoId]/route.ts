export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { precioVentaFijarSchema, precioVentaRevertirSchema } from '@/lib/ventas/schemas';
import { statusPorErrcode } from '@/lib/ventas/errores';
import { rolesQuePueden } from '@/lib/ventas/permisos';

// PUT - fija un precio de venta manual, que congela la fórmula (028).
// Desactiva cualquier override anterior y crea uno nuevo — nunca edita en
// sitio (historial completo).
export async function PUT(request: Request, { params }: { params: { productoId: string } }) {
  try {
    const { response } = await requireApiRole(rolesQuePueden('precio_venta', 'update'));
    if (response) return response;

    const parsed = precioVentaFijarSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc('producto_precio_venta_fijar', {
      p_producto_id: params.productoId,
      p_precio: parsed.data.precio_manual,
      p_motivo: parsed.data.motivo,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusPorErrcode(error.code) });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// DELETE - vuelve a la fórmula (desactiva el override activo).
export async function DELETE(request: Request, { params }: { params: { productoId: string } }) {
  try {
    const { response } = await requireApiRole(rolesQuePueden('precio_venta', 'update'));
    if (response) return response;

    const parsed = precioVentaRevertirSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.rpc('producto_precio_venta_revertir', {
      p_producto_id: params.productoId,
      p_motivo: parsed.data.motivo ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusPorErrcode(error.code) });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
