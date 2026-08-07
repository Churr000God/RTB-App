export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { productoImagenUpdateSchema } from '@/lib/inventario/schemas';
import { IMAGEN_BUCKET } from '@/lib/inventario/config';

const ROLES_ESCRITURA = ['super_admin', 'direccion', 'compras', 'almacen'] as const;

async function obtenerImagenDelProducto(productoId: string, imagenId: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('producto_imagenes')
    .select('*')
    .eq('id', imagenId)
    .eq('producto_id', productoId)
    .maybeSingle();
  return { data, error };
}

// PATCH - dos cuerpos posibles en la misma ruta:
//   {descripcion?, orden?}   -> cliente del propio usuario, GRANT por columna
//   {es_principal: true}     -> cliente admin, vía la función SECURITY DEFINER
//                               que hace el swap en dos sentencias top-level
//                               (ver 022_producto_imagenes_after_fix.sql: un
//                               UPDATE directo de es_principal desde aquí,
//                               en un solo statement, chocaría con el índice
//                               único por un detalle de visibilidad de
//                               Postgres — la función lo evita a propósito).
export async function PATCH(request: Request, { params }: { params: { id: string; imagenId: string } }) {
  try {
    const { response } = await requireApiRole([...ROLES_ESCRITURA]);
    if (response) return response;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    const { data: imagen, error: findError } = await obtenerImagenDelProducto(params.id, params.imagenId);
    if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
    if (!imagen) return NextResponse.json({ error: 'Imagen no encontrada' }, { status: 404 });

    if ('es_principal' in (body as Record<string, unknown>)) {
      const esPrincipal = (body as Record<string, unknown>).es_principal;
      if (esPrincipal !== true) {
        return NextResponse.json(
          { error: 'Para cambiar la imagen principal, marca otra imagen como principal.' },
          { status: 400 }
        );
      }
      if (!imagen.activo) {
        return NextResponse.json({ error: 'No se puede marcar como principal una imagen dada de baja.' }, { status: 400 });
      }
      const admin = createSupabaseAdminClient();
      const { error } = await admin.rpc('producto_imagen_marcar_principal', { p_imagen_id: params.imagenId });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    const parsed = productoImagenUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    // B-01 (contexto/QA_INTEGRAL_2026-08-06.md): sin .select(), esto podía
    // devolver 200 sin editarse si la imagen se desactivó entre el chequeo
    // de arriba y este UPDATE.
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('producto_imagenes').update(parsed.data).eq('id', params.imagenId).select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'No se pudo editar: la imagen ya no está disponible.' }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// DELETE - baja lógica (activo=false; el trigger AFTER promueve otra
// principal en la misma transacción si hace falta) + borrado real del
// objeto en Storage. "No borrado físico" protege el REGISTRO (rastro de
// quién subió qué y cuándo, ver comment on table de 021) — no el binario:
// una foto pública y permanente que el usuario ya quitó del catálogo no
// debe seguir siendo accesible por su URL.
export async function DELETE(_request: Request, { params }: { params: { id: string; imagenId: string } }) {
  try {
    const { response } = await requireApiRole([...ROLES_ESCRITURA]);
    if (response) return response;

    const { data: imagen, error: findError } = await obtenerImagenDelProducto(params.id, params.imagenId);
    if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
    if (!imagen) return NextResponse.json({ error: 'Imagen no encontrada' }, { status: 404 });

    const admin = createSupabaseAdminClient();
    const { data: baja, error } = await admin
      .from('producto_imagenes')
      .update({ activo: false })
      .eq('id', params.imagenId)
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!baja || baja.length === 0) {
      return NextResponse.json({ error: 'No se pudo dar de baja: la imagen ya no existe.' }, { status: 409 });
    }

    const rutas = [imagen.path, ...(imagen.miniatura_path ? [imagen.miniatura_path] : [])];
    const { error: removeError } = await admin.storage.from(IMAGEN_BUCKET).remove(rutas);
    if (removeError) {
      // La fila ya quedó de baja (lo que importa para la app); un objeto
      // huérfano en el bucket es un problema de limpieza, no de
      // consistencia funcional — se registra pero no se falla el request.
      console.error('producto_imagenes DELETE: no se pudo borrar el objeto de Storage', removeError.message);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
