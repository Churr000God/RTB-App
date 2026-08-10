export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { REGLAS_APROBACION, type CambioControlado } from '@/lib/entidades/permisos';
import { solicitudCambioCreateSchema } from '@/lib/entidades/schemas';
import { aplicarFiltrosSolicitud, construirFiltroTexto, parsearFiltrosSolicitud } from '@/lib/entidades/listado-solicitudes';

const PAGE_SIZE = 20;

// GET - listado paginado + búsqueda/filtros (mismo patrón que
// /api/entidades). RLS decide: el solicitante ve las suyas,
// direccion/super_admin ven todas.
// Gap de UI (contexto/AUDITORIA_QA_ROLES_2026-08-06.md §4): no había
// ninguna pantalla para ver/resolver solicitudes — POST .../resolver ya
// existía y respondía. `registro_id` es polimórfico (entidades/clientes/
// proveedores, ver `tabla`); se resuelve aquí a un nombre legible en vez
// de dejar que cada pantalla repita el mismo join condicional. La búsqueda
// por texto (`q`) y los filtros de tipo_cambio/fecha/solo_mias viven en
// lib/entidades/listado-solicitudes.ts — mismo pivote anti-duplicación que
// lib/ventas/listado-cotizaciones.ts.
export async function GET(request: Request) {
  try {
    const { auth, response } = await requireApiRole();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const filtros = parsearFiltrosSolicitud(searchParams, auth.userId);
    const from = (filtros.page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const supabase = createSupabaseServerClient();
    let query = supabase.from('solicitudes_cambio').select('*', { count: 'exact' });
    query = aplicarFiltrosSolicitud(query, filtros, auth.userId);
    if (filtros.q) query = query.or(await construirFiltroTexto(supabase, filtros.q));
    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const filas = data ?? [];
    const idsEntidades = filas.filter((s) => s.tabla === 'entidades').map((s) => s.registro_id);
    const idsClientes = filas.filter((s) => s.tabla === 'clientes').map((s) => s.registro_id);
    const idsProveedores = filas.filter((s) => s.tabla === 'proveedores').map((s) => s.registro_id);
    const idsSolicitantes = [...new Set(filas.map((s) => s.solicitante_id))];

    const [entidadesDirectas, clientes, proveedores, directorio] = await Promise.all([
      idsEntidades.length ? supabase.from('entidades').select('id, nombre_legal').in('id', idsEntidades) : { data: [] },
      idsClientes.length ? supabase.from('clientes').select('id, entidad_id').in('id', idsClientes) : { data: [] },
      idsProveedores.length ? supabase.from('proveedores').select('id, entidad_id').in('id', idsProveedores) : { data: [] },
      // profiles_select sólo deja ver la fila propia — sin este RPC
      // (SECURITY DEFINER, 002_entidades_core.sql) no hay forma de mostrar
      // "quién lo pidió" para nadie más que uno mismo. Mismo patrón que
      // usa cotizacion-detalle.tsx/conteo-detalle.tsx.
      idsSolicitantes.length ? supabase.rpc('usuarios_directorio') : { data: [] },
    ]);

    const idsEntidadesVia = [...(clientes.data ?? []), ...(proveedores.data ?? [])].map((r: any) => r.entidad_id);
    const entidadesVia = idsEntidadesVia.length
      ? (await supabase.from('entidades').select('id, nombre_legal').in('id', idsEntidadesVia)).data ?? []
      : [];
    const nombrePorEntidad = new Map([...(entidadesDirectas.data ?? []), ...entidadesVia].map((e: any) => [e.id, e.nombre_legal]));
    const entidadIdPorCliente = new Map((clientes.data ?? []).map((c: any) => [c.id, c.entidad_id]));
    const entidadIdPorProveedor = new Map((proveedores.data ?? []).map((p: any) => [p.id, p.entidad_id]));
    const nombrePorUsuario = new Map(((directorio as any).data ?? []).map((u: any) => [u.id, u.full_name]));

    const enriquecidas = filas.map((s) => {
      const entidadId =
        s.tabla === 'entidades' ? s.registro_id : s.tabla === 'clientes' ? entidadIdPorCliente.get(s.registro_id) : entidadIdPorProveedor.get(s.registro_id);
      return {
        ...s,
        entidad_nombre: entidadId ? nombrePorEntidad.get(entidadId) ?? null : null,
        solicitante_nombre: nombrePorUsuario.get(s.solicitante_id) ?? null,
      };
    });

    return NextResponse.json({ data: enriquecidas, count: count ?? 0, page: filtros.page, pageSize: PAGE_SIZE });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - levantar una solicitud de cambio controlado (P05 §II). Sólo quien
// figura como "inicia" para ese tipo de cambio en REGLAS_APROBACION puede
// crearla — super_admin no necesita pasar por aquí, ejecuta directo.
export async function POST(request: Request) {
  try {
    const { auth, response } = await requireApiRole(['direccion', 'ventas', 'compras']);
    if (response) return response;

    const parsed = solicitudCambioCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    const { tipo_cambio } = parsed.data;

    const regla = REGLAS_APROBACION[tipo_cambio as CambioControlado];
    if (!regla.inicia.includes(auth.profile.role)) {
      return NextResponse.json(
        { error: `Tu rol no puede solicitar un cambio de tipo "${tipo_cambio}".` },
        { status: 403 }
      );
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('solicitudes_cambio')
      .insert(parsed.data)
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
