'use client';

import { formatearMoneda, antiguedadDias } from '@/lib/ventas/validaciones';
import { CANAL_ORIGEN_LABELS } from '@/lib/entidades/config';
import type { NrListadoRow } from '@/types/ventas';

// Tarjeta de sólo lectura del tablero — clic navega al detalle. "Entregada
// sin PO" es el estado de máxima vigilancia (RTB-PRO-VEN-01 §III): hay
// valor entregado sin respaldar todavía, se resalta con el borde dorado
// igual que una cotización que necesita atención.
export function RemisionTarjeta({ nr, onClick }: { nr: NrListadoRow; onClick: () => void }) {
  const dias = antiguedadDias(nr.emitida_at) ?? nr.antiguedad_dias;
  const necesitaAtencion = nr.monto_pendiente_po > 0;

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
        <span className="text-xs tabular-nums text-rtb-teal font-medium">{nr.folio}</span>
        {dias !== null && <span className="text-[11px] text-muted-foreground shrink-0">{dias === 0 ? 'Hoy' : `${dias} d`}</span>}
      </div>

      <div className="mt-1.5">
        <p className="font-display font-medium text-sm text-rtb-navy truncate">
          {nr.entidad_siglas ?? nr.entidad_nombre_comercial ?? nr.entidad_nombre_legal ?? 'Cliente sin nombre'}
        </p>
        {nr.entidad_siglas && (
          <p className="text-xs text-muted-foreground truncate">{nr.entidad_nombre_comercial ?? nr.entidad_nombre_legal ?? '—'}</p>
        )}
      </div>

      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums text-rtb-navy">{formatearMoneda(nr.valor_total)}</span>
        <span className="text-[11px] text-muted-foreground shrink-0">
          {nr.lineas_count} {nr.lineas_count === 1 ? 'línea' : 'líneas'}
        </span>
      </div>
      {necesitaAtencion && (
        <p className="mt-1 text-[11px] font-medium text-accent">
          {formatearMoneda(nr.monto_pendiente_po)} pendiente de respaldar
        </p>
      )}

      <div className="mt-2 pt-2 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{nr.canal_origen ? CANAL_ORIGEN_LABELS[nr.canal_origen] ?? nr.canal_origen : '—'}</span>
        {nr.po_folios && <span className="truncate max-w-[120px]" title={nr.po_folios}>{nr.po_folios}</span>}
      </div>
    </button>
  );
}
