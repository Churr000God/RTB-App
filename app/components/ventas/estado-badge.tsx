import { cn } from '@/lib/utils';
import type {
  ClienteCarteraEstado,
  ConsultaEstado,
  DevolucionEstado,
  NrEstado,
  PedidoEstado,
  PoEstado,
  VentasCotizacionEstado,
  VinculoEstado,
} from '@/types/ventas';
import {
  CLIENTE_CARTERA_ESTADO_LABELS,
  CLIENTE_CARTERA_ESTADO_TONO,
  CONSULTA_ESTADO_LABELS,
  CONSULTA_ESTADO_TONO,
  DEVOLUCION_ESTADO_LABELS,
  DEVOLUCION_ESTADO_TONO,
  NR_ESTADO_LABELS,
  NR_ESTADO_TONO,
  PEDIDO_ESTADO_LABELS,
  PEDIDO_ESTADO_TONO,
  PO_ESTADO_LABELS,
  PO_ESTADO_TONO,
  VENTAS_COTIZACION_ESTADO_LABELS,
  VENTAS_COTIZACION_ESTADO_TONO,
  VINCULO_ESTADO_LABELS,
} from '@/lib/ventas/config';

/** Mismo criterio de tono que EntidadEstadoBadge / estado-badge de
 *  inventario: tokens de marca, nunca hex (STYLE_GUIDE.md). */
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
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        TONO_CLASES[tono],
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASES[tono])} />
      {label}
    </span>
  );
}

export function CotizacionEstadoBadge({ estado, className }: { estado: VentasCotizacionEstado; className?: string }) {
  return <Badge tono={VENTAS_COTIZACION_ESTADO_TONO[estado]} label={VENTAS_COTIZACION_ESTADO_LABELS[estado]} className={className} />;
}

export function PedidoEstadoBadge({ estado, className }: { estado: PedidoEstado; className?: string }) {
  return <Badge tono={PEDIDO_ESTADO_TONO[estado]} label={PEDIDO_ESTADO_LABELS[estado]} className={className} />;
}

/** entregada_sin_po es el "estado de máxima vigilancia" del tablero
 *  (RTB-PRO-VEN-01 §III) — su tono ya viene en rojo desde NR_ESTADO_TONO. */
export function NREstadoBadge({ estado, className }: { estado: NrEstado; className?: string }) {
  return <Badge tono={NR_ESTADO_TONO[estado]} label={NR_ESTADO_LABELS[estado]} className={className} />;
}

export function POEstadoBadge({ estado, className }: { estado: PoEstado; className?: string }) {
  return <Badge tono={PO_ESTADO_TONO[estado]} label={PO_ESTADO_LABELS[estado]} className={className} />;
}

export function VinculoEstadoBadge({ estado, className }: { estado: VinculoEstado; className?: string }) {
  const tono = estado === 'validado' || estado === 'aprobado_para_facturacion' || estado === 'facturado'
    ? 'activo'
    : estado === 'pendiente'
      ? 'pendiente'
      : estado === 'cancelado'
        ? 'inactivo'
        : 'bloqueado';
  return <Badge tono={tono} label={VINCULO_ESTADO_LABELS[estado]} className={className} />;
}

export function ConsultaEstadoBadge({ estado, className }: { estado: ConsultaEstado; className?: string }) {
  return <Badge tono={CONSULTA_ESTADO_TONO[estado]} label={CONSULTA_ESTADO_LABELS[estado]} className={className} />;
}

export function DevolucionEstadoBadge({ estado, className }: { estado: DevolucionEstado; className?: string }) {
  return <Badge tono={DEVOLUCION_ESTADO_TONO[estado]} label={DEVOLUCION_ESTADO_LABELS[estado]} className={className} />;
}

/** Estado de cartera (cliente_puede_operar(), 029) — NO es
 *  entidades.estado (bloqueo administrativo, badge propio de RTB-ENT-01). */
export function CarteraEstadoBadge({ estado, className }: { estado: ClienteCarteraEstado; className?: string }) {
  return <Badge tono={CLIENTE_CARTERA_ESTADO_TONO[estado]} label={CLIENTE_CARTERA_ESTADO_LABELS[estado]} className={className} />;
}
