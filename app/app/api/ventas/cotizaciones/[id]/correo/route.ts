export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // explícito: puppeteer-core no corre en el runtime edge

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { ACCESO_PANTALLA, rolesQuePueden } from '@/lib/ventas/permisos';
import { cotizacionCorreoSchema } from '@/lib/ventas/schemas';
import { armarDocumentoCotizacion } from '@/lib/ventas/documento-cotizacion';
import { renderCotizacionHtml } from '@/lib/ventas/plantilla-cotizacion';
import { generarPdfDesdeHtml } from '@/lib/ventas/generar-pdf';
import { enviarCorreo } from '@/lib/ventas/mailersend';

// POST - envía el PDF de la cotización por correo al cliente (MailerSend).
// Botón INDEPENDIENTE del "Enviar" existente (ventas_cotizacion_enviar(),
// que sólo transiciona estado borrador→enviada y no manda nada real) —
// éste sí manda el correo, en cualquier estado de la cotización (sirve
// para reenviar). Roles: los mismos que pueden EDITAR una cotización
// (rolesQuePueden('cotizaciones','update')) — deliberadamente distinto del
// set más angosto de /enviar; la barrera real de fila sigue siendo la
// política RLS de insert de ventas_cotizacion_envios (042), que sí filtra
// a 'ventas' por vendedor_id.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { auth, response } = await requireApiRole(rolesQuePueden('cotizaciones', 'update'));
  if (response) return response;

  const parsed = cotizacionCorreoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const doc = await armarDocumentoCotizacion(supabase, params.id);
  if (!doc) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });

  if (doc.lineas.length === 0) {
    return NextResponse.json({ error: 'No se puede enviar una cotización sin líneas.' }, { status: 400 });
  }

  let pdf: Buffer;
  try {
    const html = await renderCotizacionHtml(doc);
    pdf = await generarPdfDesdeHtml(html);
  } catch (err: any) {
    // Fallo generando el documento: NO hubo intento real de envío, así que
    // no se registra en la bitácora — sólo el log de servidor.
    console.error('[ventas/cotizaciones/correo] Error generando el PDF adjunto:', err);
    return NextResponse.json({ error: `No se pudo generar el PDF para adjuntar: ${err?.message ?? err}` }, { status: 500 });
  }

  const mensajeHtml = `
    <div style="font-family:Arial,sans-serif;color:#002B5B;font-size:14px;line-height:1.6">
      <p>Estimado(a) ${escapeHtmlSimple(doc.contacto?.nombre ?? doc.cliente.nombre_comercial ?? doc.cliente.nombre_legal ?? 'cliente')},</p>
      ${parsed.data.mensaje ? `<p>${escapeHtmlSimple(parsed.data.mensaje).replace(/\n/g, '<br>')}</p>` : ''}
      <p>Adjuntamos la cotización <b>${escapeHtmlSimple(doc.folio)}</b> de Refacciones Tomás Badillo, S.A. de C.V.</p>
      <p>Quedamos a sus órdenes para cualquier duda.</p>
      <p style="margin-top:20px;color:#5B87A0">Refacciones Tomás Badillo, S.A. de C.V.<br>T. 55 4004 4707 · refacrtb.com.mx</p>
    </div>`;
  const mensajeTexto = `Estimado(a) ${doc.contacto?.nombre ?? doc.cliente.nombre_comercial ?? doc.cliente.nombre_legal ?? 'cliente'},\n\n${
    parsed.data.mensaje ? `${parsed.data.mensaje}\n\n` : ''
  }Adjuntamos la cotización ${doc.folio} de Refacciones Tomás Badillo, S.A. de C.V.\n\nQuedamos a sus órdenes para cualquier duda.\n\nRefacciones Tomás Badillo, S.A. de C.V.\nT. 55 4004 4707 · refacrtb.com.mx`;

  const replyToEmail = process.env.MAILERSEND_REPLY_TO || auth.email || undefined;
  const resultado = await enviarCorreo({
    para: parsed.data.para,
    cc: parsed.data.cc,
    asunto: parsed.data.asunto,
    html: mensajeHtml,
    texto: mensajeTexto,
    replyTo: replyToEmail ? { email: replyToEmail, name: auth.profile.full_name ?? undefined } : null,
    adjuntos: [{ nombre: `${doc.folio}.pdf`, contenido: pdf }],
  });

  // Registrar SIEMPRE (éxito y fallo) con el cliente del propio usuario —
  // nunca admin/service_role, RLS de 042 es la barrera real. Si el propio
  // insert de bitácora falla, sólo se loguea: nunca convertir un correo
  // que YA salió en un 500 que el vendedor interprete como "no se envió"
  // y reenvíe por error.
  const { error: errorBitacora } = await supabase.from('ventas_cotizacion_envios').insert({
    cotizacion_id: params.id,
    para: parsed.data.para,
    cc: parsed.data.cc,
    asunto: parsed.data.asunto,
    mensaje: parsed.data.mensaje ?? null,
    adjunto_nombre: `${doc.folio}.pdf`,
    resultado: resultado.ok ? 'exitoso' : 'fallido',
    proveedor: 'mailersend',
    mensaje_id: resultado.ok ? resultado.mensajeId : null,
    error_detalle: resultado.ok ? null : resultado.error || 'Error desconocido del proveedor',
  });
  if (errorBitacora) {
    console.error('[ventas/cotizaciones/correo] No se pudo registrar el envío en la bitácora:', errorBitacora);
  }

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  }
  return NextResponse.json({ success: true, mensaje_id: resultado.mensajeId });
}

// GET - historial de envíos de la cotización (para depuración/consistencia
// con el resto del módulo — la pantalla de detalle recibe el historial ya
// resuelto desde el Server Component, no llama a este GET en la carga
// inicial).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { response } = await requireApiRole(ACCESO_PANTALLA.cotizaciones);
  if (response) return response;

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('ventas_cotizacion_envios')
    .select('*')
    .eq('cotizacion_id', params.id)
    .order('enviado_at', { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ data: data ?? [] });
}

function escapeHtmlSimple(valor: string): string {
  return valor.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}
