export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { requireActiveUser } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ProductoDetalle } from './producto-detalle';

export default async function ProductoDetallePage({ params }: { params: { id: string } }) {
  await requireActiveUser();

  const supabase = createSupabaseServerClient();

  const { data: producto } = await supabase.from('productos').select('*').eq('id', params.id).maybeSingle();
  if (!producto) notFound();

  const [familia, categoria, marca, unidad, existencias, costoVigente] = await Promise.all([
    supabase.from('producto_familias').select('*').eq('id', producto.familia_id).maybeSingle(),
    producto.categoria_id
      ? supabase.from('producto_categorias').select('*').eq('id', producto.categoria_id).maybeSingle()
      : Promise.resolve({ data: null }),
    producto.marca_id
      ? supabase.from('producto_marcas').select('*').eq('id', producto.marca_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('unidades_medida').select('*').eq('id', producto.unidad_medida_id).maybeSingle(),
    supabase.from('inventario_existencias').select('*, ubicaciones_internas(codigo, nombre)').eq('producto_id', params.id),
    supabase.rpc('costo_unitario_vigente', { p_producto_id: params.id }),
  ]);

  return (
    <ProductoDetalle
      producto={producto}
      familia={familia.data}
      categoria={categoria.data}
      marca={marca.data}
      unidad={unidad.data}
      existenciasIniciales={existencias.data ?? []}
      costoVigente={costoVigente.data ?? null}
    />
  );
}
