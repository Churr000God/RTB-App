import { Info, AlertCircle } from 'lucide-react';
import { UMBRAL_APROBACION_CREDITO } from '@/lib/entidades/config';
import { ejecutaDirecto } from '@/lib/entidades/permisos';
import type { UserRole } from '@/types/database';

interface Props {
  role: UserRole | null | undefined;
  limite: number;
  /** Tamaño reducido para paneles densos (p.ej. el editor inline de la ficha de entidad). */
  compacto?: boolean;
}

/**
 * Leyenda de la regla de aprobación de crédito (P05, REGLAS_APROBACION.limite_credito)
 * — SIEMPRE visible junto al campo, no sólo cuando ya se superó el umbral, para que
 * quien captura sepa de antemano qué va a pasar. El veredicto usa ejecutaDirecto(),
 * la misma función que ya deciden POST /api/entidades y PATCH /api/entidades/[id]/cliente
 * — así el texto nunca puede desalinearse de lo que el servidor realmente hace (antes
 * el aviso decía "quedará pendiente de aprobación" incluso para super_admin, que
 * ejecuta directo).
 */
export function AvisoLimiteCredito({ role, limite, compacto }: Props) {
  const directo = ejecutaDirecto('limite_credito', role);
  const supera = limite > UMBRAL_APROBACION_CREDITO;
  const umbral = `$${UMBRAL_APROBACION_CREDITO.toLocaleString('es-MX')}`;

  const texto = directo
    ? supera
      ? `Supera ${umbral} — tu rol lo aplica directo, sin solicitud.`
      : `Los límites mayores a ${umbral} requieren aprobación; tu rol los aplica directo.`
    : supera
      ? `Supera ${umbral} — quedará pendiente de aprobación de dirección.`
      : `Un límite mayor a ${umbral} requiere aprobación de dirección.`;

  const tamanoTexto = compacto ? 'text-[11px]' : 'text-xs';
  const tamanoIcono = compacto ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return supera ? (
    <p className={`${tamanoTexto} text-accent flex items-start gap-1.5`}>
      <AlertCircle className={`${tamanoIcono} shrink-0 mt-0.5`} />
      <span>{texto}</span>
    </p>
  ) : (
    <p className={`${tamanoTexto} text-muted-foreground flex items-start gap-1.5`}>
      <Info className={`${tamanoIcono} shrink-0 mt-0.5 text-rtb-teal`} />
      <span>{texto}</span>
    </p>
  );
}
