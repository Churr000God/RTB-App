import 'server-only';

/** IP del cliente para audit_log — no es accesible desde un trigger de
 *  Postgres, por eso los eventos de negocio (bloqueo, aprobación) la
 *  escriben explícitamente desde la ruta de API. */
export function clientIp(request: Request): string | null {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() ?? null;
  return request.headers.get('x-real-ip');
}

export function clientUserAgent(request: Request): string | null {
  return request.headers.get('user-agent');
}
