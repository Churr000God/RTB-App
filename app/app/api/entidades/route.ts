export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireApiRole } from '@/lib/supabase/guards';
import { entidadCreateSchema } from '@/lib/entidades/schemas';
import { UMBRAL_APROBACION_CREDITO } from '@/lib/entidades/config';
import { ejecutaDirecto } from '@/lib/entidades/permisos';
import { mensajeDuplicadoEntidad } from '@/lib/entidades/errores';

const PAGE_SIZE = 20;

// GET - listado paginado con filtros (los 8 roles consultan, RLS lo decide)
export async function GET(request: Request) {
  try {
    const { response } = await requireApiRole();
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const tipo = searchParams.get('tipo');
    const estado = searchParams.get('estado');
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from('entidades')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (tipo) query = query.eq('tipo', tipo);
    if (estado) query = query.eq('estado', estado);
    if (q) {
      const like = `%${q.replace(/[%_]/g, '')}%`;
      query = query.or(
        `nombre_legal.ilike.${like},nombre_comercial.ilike.${like},rfc.ilike.${like},clave.ilike.${like},siglas.ilike.${like}`
      );
    }

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const [total, clientesActivos, proveedoresActivos, bloqueadas] = await Promise.all([
      supabase.from('entidades').select('id', { count: 'exact', head: true }),
      supabase
        .from('entidades')
        .select('id', { count: 'exact', head: true })
        .in('tipo', ['cliente', 'mixta'])
        .eq('estado', 'activo'),
      supabase
        .from('entidades')
        .select('id', { count: 'exact', head: true })
        .in('tipo', ['proveedor', 'mixta'])
        .eq('estado', 'activo'),
      supabase
        .from('entidades')
        .select('id', { count: 'exact', head: true })
        .in('estado', ['bloqueado_temporal', 'bloqueado_permanente']),
    ]);

    return NextResponse.json({
      data: data ?? [],
      count: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
      kpis: {
        total: total.count ?? 0,
        clientesActivos: clientesActivos.count ?? 0,
        proveedoresActivos: proveedoresActivos.count ?? 0,
        bloqueadas: bloqueadas.count ?? 0,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}

// POST - alta compuesta: entidad + su extensión de rol + contacto/dirección
// principales opcionales, como arma el formulario de alta-cliente.html.
// Usa el cliente del propio usuario (RLS decide quién puede insertar); si
// un paso posterior a la entidad falla, se revierte con el cliente admin
// porque authenticated no tiene GRANT DELETE.
export async function POST(request: Request) {
  try {
    const { auth, response } = await requireApiRole(['super_admin', 'direccion', 'ventas', 'compras']);
    if (response) return response;

    const parsed = entidadCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }
    const { cliente, proveedor, contacto_principal, direccion_fiscal, ...entidadData } = parsed.data;

    if (auth.profile.role === 'ventas' && entidadData.tipo === 'proveedor') {
      return NextResponse.json({ error: 'Ventas no puede dar de alta un proveedor.' }, { status: 403 });
    }
    if (auth.profile.role === 'compras' && entidadData.tipo === 'cliente') {
      return NextResponse.json({ error: 'Compras no puede dar de alta un cliente.' }, { status: 403 });
    }

    const supabase = createSupabaseServerClient();

    const { data: entidad, error: entidadError } = await supabase
      .from('entidades')
      .insert(entidadData)
      .select('id, clave')
      .single();

    if (entidadError) {
      return NextResponse.json(
        { error: mensajeDuplicadoEntidad(entidadError.message) ?? entidadError.message },
        { status: 400 }
      );
    }

    const revertir = async (mensaje: string) => {
      const admin = createSupabaseAdminClient();
      await admin.from('entidades').delete().eq('id', entidad.id);
      return NextResponse.json({ error: mensaje }, { status: 500 });
    };

    // E-07 (contexto/AUDITORIA_QA_ROLES_2026-08-06.md): el formulario ya
    // avisaba "quedará pendiente de aprobación de dirección" al superar el
    // umbral, pero el POST nunca lo aplicaba — cualquier rol podía otorgar
    // cualquier crédito de inmediato. Se aplica la misma regla que ya rige
    // los cambios sobre una entidad existente (REGLAS_APROBACION.limite_credito,
    // vía ejecutaDirecto): si el rol no ejecuta directo, la entidad nace con
    // crédito 0 y el valor pedido queda pendiente en solicitudes_cambio,
    // resuelto por el mismo endpoint que ya resuelve cambios de crédito
    // (POST /api/solicitudes-cambio/[id]/resolver).
    let creditoPendiente: number | null = null;
    if (cliente) {
      const limiteSolicitado = Number(cliente.limite_credito) || 0;
      const requiereAprobacion = limiteSolicitado > UMBRAL_APROBACION_CREDITO && !ejecutaDirecto('limite_credito', auth.profile.role);
      const clienteInsert = requiereAprobacion ? { ...cliente, limite_credito: 0 } : cliente;

      const { data: clienteRow, error } = await supabase
        .from('clientes')
        .insert({ ...clienteInsert, entidad_id: entidad.id })
        .select('id')
        .single();
      if (error) return revertir('No se pudieron guardar los datos de cliente; la operación fue revertida.');

      if (requiereAprobacion) {
        const { error: solicitudError } = await supabase.from('solicitudes_cambio').insert({
          tabla: 'clientes',
          registro_id: clienteRow.id,
          tipo_cambio: 'limite_credito',
          cambios: { limite_credito: limiteSolicitado },
          motivo: `Límite de crédito solicitado al alta ($${limiteSolicitado.toLocaleString('es-MX')}) supera el umbral de aprobación ($${UMBRAL_APROBACION_CREDITO.toLocaleString('es-MX')}).`,
        });
        if (solicitudError) return revertir('No se pudo registrar la solicitud de aprobación de crédito; la operación fue revertida.');
        creditoPendiente = limiteSolicitado;
      }
    }
    if (proveedor) {
      const { error } = await supabase.from('proveedores').insert({ ...proveedor, entidad_id: entidad.id });
      if (error) return revertir('No se pudieron guardar los datos de proveedor; la operación fue revertida.');
    }
    if (contacto_principal) {
      const { error } = await supabase
        .from('contactos')
        .insert({ ...contacto_principal, entidad_id: entidad.id, es_principal: true });
      if (error) return revertir('No se pudo guardar el contacto principal; la operación fue revertida.');
    }
    if (direccion_fiscal) {
      const { error } = await supabase
        .from('direcciones')
        .insert({ ...direccion_fiscal, entidad_id: entidad.id, tipo: 'fiscal', es_principal: true });
      if (error) return revertir('No se pudo guardar la dirección fiscal; la operación fue revertida.');
    }

    return NextResponse.json(
      { success: true, id: entidad.id, clave: entidad.clave, creditoPendiente },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 });
  }
}
