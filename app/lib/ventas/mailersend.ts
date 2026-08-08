import 'server-only';

/**
 * Integración con la API REST de MailerSend (https://api.mailersend.com/v1/email)
 * para el envío del PDF de una cotización al cliente. Usada sólo por
 * POST /api/ventas/cotizaciones/[id]/correo/route.ts.
 *
 * Sin SDK oficial de MailerSend: es una única llamada, un `fetch` directo
 * evita una dependencia más para una sola operación.
 */

const MAILERSEND_ENDPOINT = 'https://api.mailersend.com/v1/email';
const TAMANO_MAX_ADJUNTO_BYTES = 8 * 1024 * 1024; // ~8 MB — el base64 infla ~33%, MailerSend limita el total del mensaje
const TIMEOUT_MS = 20_000;

export interface AdjuntoCorreo {
  nombre: string;
  contenido: Buffer;
}

export interface EnvioCorreo {
  para: string;
  cc?: string[];
  asunto: string;
  html: string;
  texto: string;
  replyTo?: { email: string; name?: string } | null;
  adjuntos?: AdjuntoCorreo[];
}

export type ResultadoEnvio =
  | { ok: true; mensajeId: string | null }
  | { ok: false; error: string; status: number; configuracion?: boolean };

export async function enviarCorreo(envio: EnvioCorreo): Promise<ResultadoEnvio> {
  const apiKey = process.env.MAILERSEND_API_KEY;
  const fromEmail = process.env.MAILERSEND_FROM_EMAIL;
  const fromName = process.env.MAILERSEND_FROM_NAME || 'RTB Refacciones';

  // Nunca lanzar: el llamador necesita poder registrar el fallo en la
  // bitácora (ventas_cotizacion_envios) y mostrar un mensaje entendible,
  // no un 500 crudo.
  if (!apiKey || !fromEmail) {
    return {
      ok: false,
      configuracion: true,
      status: 503,
      error: 'El envío de correo no está configurado (falta MAILERSEND_API_KEY o MAILERSEND_FROM_EMAIL).',
    };
  }

  const adjuntos = envio.adjuntos ?? [];
  const tamanoTotal = adjuntos.reduce((s, a) => s + a.contenido.byteLength, 0);
  if (tamanoTotal > TAMANO_MAX_ADJUNTO_BYTES) {
    return {
      ok: false,
      status: 400,
      error: 'El PDF de la cotización es demasiado pesado para enviarse por correo.',
    };
  }

  const body: Record<string, unknown> = {
    from: { email: fromEmail, name: fromName },
    to: [{ email: envio.para }],
    subject: envio.asunto,
    text: envio.texto,
    html: envio.html,
  };
  if (envio.cc && envio.cc.length > 0) {
    body.cc = envio.cc.map((email) => ({ email }));
  }
  if (envio.replyTo) {
    body.reply_to = { email: envio.replyTo.email, name: envio.replyTo.name };
  }
  if (adjuntos.length > 0) {
    body.attachments = adjuntos.map((a) => ({
      content: a.contenido.toString('base64'),
      filename: a.nombre,
      disposition: 'attachment',
    }));
  }

  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    const respuesta = await fetch(MAILERSEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controlador.signal,
      cache: 'no-store',
    });

    // Éxito = 202 SIN cuerpo JSON — nunca hacer .json() sobre una respuesta
    // vacía. El único rastro del envío es el header X-Message-Id.
    if (respuesta.status === 202) {
      return { ok: true, mensajeId: respuesta.headers.get('x-message-id') };
    }

    let mensaje = `MailerSend respondió ${respuesta.status}`;
    try {
      const cuerpo = (await respuesta.json()) as { message?: string; errors?: Record<string, string[]> };
      if (cuerpo?.message) mensaje = cuerpo.message;
      if (cuerpo?.errors) {
        const primeros = Object.values(cuerpo.errors).flat().slice(0, 3).join(' ');
        if (primeros) mensaje = `${mensaje}: ${primeros}`;
      }
    } catch {
      // cuerpo no era JSON — se queda el mensaje genérico de arriba
    }

    if (respuesta.status === 401 || respuesta.status === 403) {
      return { ok: false, status: 502, error: 'La clave de MailerSend es inválida o no tiene permiso para enviar.' };
    }
    if (respuesta.status === 422) {
      return { ok: false, status: 400, error: mensaje };
    }
    if (respuesta.status === 429) {
      return {
        ok: false,
        status: 429,
        error: 'Se alcanzó el límite de envíos de MailerSend; inténtalo en unos minutos.',
      };
    }
    return { ok: false, status: 502, error: mensaje };
  } catch (err: any) {
    const abortado = err?.name === 'AbortError';
    return {
      ok: false,
      status: 502,
      error: abortado ? 'MailerSend no respondió a tiempo.' : `No se pudo contactar a MailerSend: ${err?.message ?? err}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
