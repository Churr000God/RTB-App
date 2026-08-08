'use client';

import { formatearMoneda, antiguedadDias } from '@/lib/ventas/validaciones';
import type { OrdenCompraListadoRow } from '@/types/ventas';

// Tarjeta de sólo lectura del tablero — clic navega al detalle. Sin
// drag & drop: toda transición de estado pasa por una función SECURITY
// DEFINER (ventas_po_despachar()/ventas_po_cancelar(), 044), mismo criterio
// que CotizacionTarjeta.
export function OrdenCompraTarjeta({ po, onClick }: { po: OrdenCompraListadoRow; onClick: () => void }) {
  const dias = antiguedadDias(po.created_at);
  const pendiente = po.cantidad_total - po.cantidad_entregada_total;
  const necesitaAtencion = po.estado === 'parcialmente_surtida' || (po.estado === 'abierta' && pendiente > 0);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left bg-white rounded-lg p-3 border-l-4 hover:shadow-md transition-shadow ${
        necesitaAtencion ? 'border-l-rtb-gold' : 'border-l-transparent'
      }`}
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs tabular-nums text-rtb-teal font-medium">{po.folio}</span>
        {dias !== null && <span className="text-[11px] text-muted-foreground shrink-0">{dias === 0 ? 'Hoy' : `${dias} d`}</span>}
      </div>

      <div className="mt-1.5">
        <p className="font-display font-medium text-sm text-rtb-navy truncate">
          {po.entidad_siglas ?? po.entidad_nombre_comercial ?? po.entidad_nombre_legal ?? 'Cliente sin nombre'}
        </p>
        <p className="text-xs text-muted-foreground truncate">PO #{po.numero_po}</p>
      </div>

      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums text-rtb-navy">{formatearMoneda(po.total, po.moneda)}</span>
        <span className="text-[11px] text-muted-foreground shrink-0">
          {po.partidas_count} {po.partidas_count === 1 ? 'partida' : 'partidas'}
        </span>
      </div>
      {po.cantidad_total > 0 && (po.estado === 'abierta' || po.estado === 'parcialmente_surtida') && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Entregado {po.cantidad_entregada_total} de {po.cantidad_total}
        </p>
      )}

      <div className="mt-2 pt-2 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{po.pedido_folio ?? '—'}</span>
        {po.fecha_po && <span>PO del {po.fecha_po}</span>}
      </div>
    </button>
  );
}
