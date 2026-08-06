import type { SupabaseClient } from '@supabase/supabase-js';
import { urlPublica } from '@/lib/storage/publico';
import { IMAGEN_BUCKET } from './config';
import type { ProductoImagenConUrl } from '@/types/inventario';

/**
 * Adjunta la imagen principal (con sus URL ya resueltas en servidor) a una
 * lista de productos, en UNA sola consulta. Compartido por el Server
 * Component de /dashboard/productos y por GET /api/productos para que
 * ambos no puedan divergir en cómo arman la galería.
 *
 * Se prefiere esta consulta aparte a un embed PostgREST
 * (`producto_imagenes(...)` con `.eq('producto_imagenes.es_principal', true)`)
 * porque, sin `!inner`, el filtro sobre el recurso embebido no acota de
 * forma confiable qué fila del embed llega; y con `!inner` desaparecerían
 * de la lista los productos SIN foto — que hoy son todos.
 */
export async function adjuntarImagenPrincipal<T extends { id: string }>(
  supabase: SupabaseClient,
  productos: T[]
): Promise<(T & { imagen_principal: ProductoImagenConUrl | null })[]> {
  if (productos.length === 0) return [];

  const ids = productos.map((p) => p.id);
  const { data } = await supabase
    .from('producto_imagenes')
    .select('*')
    .in('producto_id', ids)
    .eq('es_principal', true)
    .eq('activo', true);

  const porProducto = new Map<string, ProductoImagenConUrl>();
  for (const fila of data ?? []) {
    porProducto.set(fila.producto_id, {
      ...fila,
      url: urlPublica(IMAGEN_BUCKET, fila.path),
      url_miniatura: fila.miniatura_path ? urlPublica(IMAGEN_BUCKET, fila.miniatura_path) : null,
    });
  }

  return productos.map((p) => ({ ...p, imagen_principal: porProducto.get(p.id) ?? null }));
}
