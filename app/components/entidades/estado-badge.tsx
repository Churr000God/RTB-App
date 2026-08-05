import { cn } from '@/lib/utils';
import type { EntidadEstado } from '@/types/entidades';
import { ENTIDAD_ESTADO_LABELS, ENTIDAD_ESTADO_TONO } from '@/lib/entidades/config';

/**
 * Tono semántico -> clases de Tailwind sobre los tokens ya definidos en
 * app/app/globals.css (nunca un hex directo, STYLE_GUIDE.md). No se añaden
 * variables --estado-* nuevas: activo/pendiente/bloqueado ya tienen un
 * token de marca equivalente (teal/oro/rojo); "inactivo" usa la escala
 * neutra existente.
 */
const TONO_CLASES: Record<'activo' | 'bloqueado' | 'pendiente' | 'inactivo', string> = {
  activo: 'bg-primary/10 text-primary',
  bloqueado: 'bg-destructive/10 text-destructive',
  pendiente: 'bg-accent/10 text-accent',
  inactivo: 'bg-muted text-muted-foreground',
};

export function EntidadEstadoBadge({
  estado,
  pendiente = false,
  className,
}: {
  estado: EntidadEstado;
  /** Hay una solicitudes_cambio abierta sobre este registro — el badge
   *  "Pendiente" no es un EntidadEstado real, se deriva aparte. */
  pendiente?: boolean;
  className?: string;
}) {
  const tono = pendiente ? 'pendiente' : ENTIDAD_ESTADO_TONO[estado];
  const label = pendiente ? 'Pendiente de aprobación' : ENTIDAD_ESTADO_LABELS[estado];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        TONO_CLASES[tono],
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', {
        'bg-primary': tono === 'activo',
        'bg-destructive': tono === 'bloqueado',
        'bg-accent': tono === 'pendiente',
        'bg-muted-foreground': tono === 'inactivo',
      })} />
      {label}
    </span>
  );
}
