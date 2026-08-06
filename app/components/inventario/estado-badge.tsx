import { cn } from '@/lib/utils';
import type { AjusteEstado, ConteoEstado, DiscrepanciaEstado, ProductoEstado } from '@/types/inventario';
import {
  AJUSTE_ESTADO_LABELS,
  AJUSTE_ESTADO_TONO,
  CONTEO_ESTADO_LABELS,
  CONTEO_ESTADO_TONO,
  DISCREPANCIA_ESTADO_LABELS,
  DISCREPANCIA_ESTADO_TONO,
  PRODUCTO_ESTADO_LABELS,
  PRODUCTO_ESTADO_TONO,
} from '@/lib/inventario/config';

/** Mismo criterio de tono que EntidadEstadoBadge
 *  (components/entidades/estado-badge.tsx): tokens de marca, nunca hex. */
const TONO_CLASES: Record<'activo' | 'bloqueado' | 'pendiente' | 'inactivo', string> = {
  activo: 'bg-primary/10 text-primary',
  bloqueado: 'bg-destructive/10 text-destructive',
  pendiente: 'bg-accent/10 text-accent',
  inactivo: 'bg-muted text-muted-foreground',
};

const DOT_CLASES: Record<'activo' | 'bloqueado' | 'pendiente' | 'inactivo', string> = {
  activo: 'bg-primary',
  bloqueado: 'bg-destructive',
  pendiente: 'bg-accent',
  inactivo: 'bg-muted-foreground',
};

function Badge({ tono, label, className }: { tono: keyof typeof TONO_CLASES; label: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', TONO_CLASES[tono], className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASES[tono])} />
      {label}
    </span>
  );
}

export function ProductoEstadoBadge({ estado, className }: { estado: ProductoEstado; className?: string }) {
  return <Badge tono={PRODUCTO_ESTADO_TONO[estado]} label={PRODUCTO_ESTADO_LABELS[estado]} className={className} />;
}

export function ConteoEstadoBadge({ estado, className }: { estado: ConteoEstado; className?: string }) {
  return <Badge tono={CONTEO_ESTADO_TONO[estado]} label={CONTEO_ESTADO_LABELS[estado]} className={className} />;
}

export function AjusteEstadoBadge({ estado, className }: { estado: AjusteEstado; className?: string }) {
  return <Badge tono={AJUSTE_ESTADO_TONO[estado]} label={AJUSTE_ESTADO_LABELS[estado]} className={className} />;
}

export function DiscrepanciaEstadoBadge({ estado, className }: { estado: DiscrepanciaEstado; className?: string }) {
  return <Badge tono={DISCREPANCIA_ESTADO_TONO[estado]} label={DISCREPANCIA_ESTADO_LABELS[estado]} className={className} />;
}

/** Alerta de stock (⚪/🔴/🟢, RTB-PRO-COM-01 §III) — su propio esquema de
 *  color, no reutiliza el tono de estado genérico. */
export function AlertaStockBadge({ alerta }: { alerta: 'sin_definir' | 'bajo_minimo' | 'ok' }) {
  const config = {
    sin_definir: { label: 'Sin definir', clase: 'bg-muted text-muted-foreground' },
    bajo_minimo: { label: 'Bajo mínimo', clase: 'bg-destructive/10 text-destructive' },
    ok: { label: 'OK', clase: 'bg-primary/10 text-primary' },
  }[alerta];
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', config.clase)}>{config.label}</span>;
}
