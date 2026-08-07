export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';

// GET - las tres opciones de precio que el vendedor elige al cotizar:
// Costo Refacción / Costo Ariba (producto_precios_referencia, canal
// vigente) y Costo de Venta (costo_venta_detalle(), 028 — fórmula viva +
// override manual). El precio elegido se fotografía en la línea; esta
// ruta sólo PROPONE los tres números, nunca los congela.
export async function GET(_request: Request, { params }: { params: { productoId: string } }) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const supabase = createSupabaseServerClient();

    const [{ data: referencia, error: errorReferencia }, { data: detalle, error: errorDetalle }] = await Promise.all([
      supabase
        .from('producto_precios_referencia')
        .select('canal, precio, moneda, fuente')
        .eq('producto_id', params.productoId)
        .is('vigente_hasta', null),
      supabase.rpc('costo_venta_detalle', { p_producto_id: params.productoId }),
    ]);
    if (errorReferencia) return NextResponse.json({ error: errorReferencia.message }, { status: 500 });
    if (errorDetalle) return NextResponse.json({ error: errorDetalle.message }, { status: 500 });

    const refaccion = referencia?.find((r) => r.canal === 'refaccion') ?? null;
    const ariba = referencia?.find((r) => r.canal === 'ariba') ?? null;

    return NextResponse.json({
      data: {
        refaccion: refaccion ? { precio: refaccion.precio, moneda: refaccion.moneda } : null,
        ariba: ariba ? { precio: ariba.precio, moneda: ariba.moneda } : null,
        costo_venta: detalle,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
