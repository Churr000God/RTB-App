export const dynamic = 'force-dynamic';

import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { productoImagenMetaSchema } from '@/lib/inventario/schemas';
import { IMAGEN_BUCKET, IMAGEN_BYTES_MAX, IMAGEN_MIMES, IMAGENES_MAX_POR_PRODUCTO } from '@/lib/inventario/config';
import { urlPublica } from '@/lib/storage/publico';

const EXTENSION_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const ROLES_ESCRITURA = ['super_admin', 'direccion', 'compras', 'almacen'] as const;

// GET - lista activa de imágenes de un producto, con URL ya resueltas en
// servidor (ver lib/storage/publico.ts — nunca en código de cliente).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('producto_imagenes')
      .select('*')
      .eq('producto_id', params.id)
      .eq('activo', true)
      .order('es_principal', { ascending: false })
      .order('orden', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const conUrl = (data ?? []).map((fila) => ({
      ...fila,
      url: urlPublica(IMAGEN_BUCKET, fila.path),
      url_miniatura: fila.miniatura_path ? urlPublica(IMAGEN_BUCKET, fila.miniatura_path) : null,
    }));

    return NextResponse.json({ data: conUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - subida por FormData directo al Route Handler (no URL firmada): el
// servidor deriva mime/bytes/extensión del archivo REAL, en vez de confiar
// en lo que el cliente declare sobre sí mismo, y no queda un estado
// intermedio "objeto subido, fila nunca insertada" (aquí, si el INSERT
// falla, se borra el objeto recién subido en el mismo request).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole([...ROLES_ESCRITURA]);
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { data: producto, error: productoError } = await supabase
      .from('productos')
      .select('id')
      .eq('id', params.id)
      .maybeSingle();
    if (productoError) return NextResponse.json({ error: productoError.message }, { status: 500 });
    if (!producto) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

    const { count: activas } = await supabase
      .from('producto_imagenes')
      .select('id', { count: 'exact', head: true })
      .eq('producto_id', params.id)
      .eq('activo', true);
    if ((activas ?? 0) >= IMAGENES_MAX_POR_PRODUCTO) {
      return NextResponse.json(
        { error: `Un producto no puede tener más de ${IMAGENES_MAX_POR_PRODUCTO} imágenes activas.` },
        { status: 400 }
      );
    }

    const formData = await request.formData().catch(() => null);
    const archivo = formData?.get('archivo');
    if (!(archivo instanceof File)) {
      return NextResponse.json({ error: 'Falta el archivo de imagen.' }, { status: 400 });
    }
    if (!IMAGEN_MIMES.includes(archivo.type as (typeof IMAGEN_MIMES)[number])) {
      return NextResponse.json({ error: 'Sólo se admiten imágenes JPG, PNG o WebP.' }, { status: 400 });
    }
    if (archivo.size > IMAGEN_BYTES_MAX) {
      return NextResponse.json(
        { error: `La imagen supera el límite de ${Math.round(IMAGEN_BYTES_MAX / 1024 / 1024)} MB.` },
        { status: 400 }
      );
    }

    const miniatura = formData?.get('miniatura');
    const tieneMiniatura = miniatura instanceof File && miniatura.size > 0;

    const anchoRaw = formData?.get('ancho');
    const altoRaw = formData?.get('alto');
    const descripcionRaw = formData?.get('descripcion');

    const parsedMeta = productoImagenMetaSchema.safeParse({
      descripcion: typeof descripcionRaw === 'string' && descripcionRaw.trim() ? descripcionRaw : undefined,
      mime: archivo.type,
      bytes: archivo.size,
      ancho: typeof anchoRaw === 'string' && anchoRaw ? Number(anchoRaw) : undefined,
      alto: typeof altoRaw === 'string' && altoRaw ? Number(altoRaw) : undefined,
    });
    if (!parsedMeta.success) {
      return NextResponse.json({ error: parsedMeta.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const ext = EXTENSION_POR_MIME[archivo.type] ?? 'jpg';
    const uuid = randomUUID();
    const path = `${params.id}/${uuid}.${ext}`;
    const miniaturaPath = tieneMiniatura ? `${params.id}/${uuid}_mini.${ext}` : null;

    const admin = createSupabaseAdminClient();
    const { error: uploadError } = await admin.storage
      .from(IMAGEN_BUCKET)
      .upload(path, archivo, { contentType: archivo.type, upsert: false });
    if (uploadError) {
      return NextResponse.json({ error: `No se pudo subir la imagen: ${uploadError.message}` }, { status: 500 });
    }

    if (miniaturaPath && miniatura instanceof File) {
      const { error: uploadMiniError } = await admin.storage
        .from(IMAGEN_BUCKET)
        .upload(miniaturaPath, miniatura, { contentType: miniatura.type || archivo.type, upsert: false });
      if (uploadMiniError) {
        await admin.storage.from(IMAGEN_BUCKET).remove([path]);
        return NextResponse.json({ error: `No se pudo subir la miniatura: ${uploadMiniError.message}` }, { status: 500 });
      }
    }

    const { data: maxOrdenRow } = await supabase
      .from('producto_imagenes')
      .select('orden')
      .eq('producto_id', params.id)
      .eq('activo', true)
      .order('orden', { ascending: false })
      .limit(1)
      .maybeSingle();
    const orden = (maxOrdenRow?.orden ?? -1) + 1;

    // INSERT con el cliente del propio usuario (RLS): el GRANT por columna
    // es la barrera real (es_principal/activo/created_by no se pueden
    // nombrar aquí — el rol ya se validó arriba, esto es doble control a
    // propósito, mismo patrón que el resto del módulo).
    const { data: fila, error: insertError } = await supabase
      .from('producto_imagenes')
      .insert({
        producto_id: params.id,
        path,
        miniatura_path: miniaturaPath,
        descripcion: parsedMeta.data.descripcion ?? null,
        mime: parsedMeta.data.mime,
        bytes: parsedMeta.data.bytes,
        ancho: parsedMeta.data.ancho ?? null,
        alto: parsedMeta.data.alto ?? null,
        orden,
      })
      .select('*')
      .single();

    if (insertError) {
      await admin.storage.from(IMAGEN_BUCKET).remove([path, ...(miniaturaPath ? [miniaturaPath] : [])]);
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        data: {
          ...fila,
          url: urlPublica(IMAGEN_BUCKET, fila.path),
          url_miniatura: fila.miniatura_path ? urlPublica(IMAGEN_BUCKET, fila.miniatura_path) : null,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
