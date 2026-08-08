'use client';

import { formatearMoneda, antiguedadDias } from '@/lib/ventas/validaciones';
import { CANAL_ORIGEN_LABELS } from '@/lib/entidades/config';
import type { CotizacionListadoRow } from '@/types/ventas';

// Tarjeta de sólo lectura del tablero — clic navega al detalle. Sin
// drag & drop a propósito: toda transición de estado pasa por una función
// SECURITY DEFINER (ventas_cotizacion_enviar/rechazar/cancelar, 030;
// ventas_cotizacion_aprobar, 031) y rechazar/cancelar exigen
// motivo_resolucion no vacío (cot_resolucion_motivo_chk, 030) — un
// arrastre no puede pedir un motivo sin dejar de ser un arrastre.
export function CotizacionTarjeta({ cotizacion, onClick }: { cotizacion: CotizacionListadoRow; onClick: () => void }) {
  const c = cotizacion;
  const dias = antiguedadDias(c.created_at);
  const vencida = c.vigencia_hasta ? c.vigencia_hasta < new Date().toISOString().slice(0, 10) : false;
  const necesitaAtencion = c.lineas_en_consulta > 0 || (vencida && (c.estado === 'borrador' || c.estado === 'enviada'));

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
        <span className="text-xs tabular-nums text-rtb-teal font-medium">{c.folio}</span>
        {dias !== null && <span className="text-[11px] text-muted-foreground shrink-0">{dias === 0 ? 'Hoy' : `${dias} d`}</span>}
      </div>

      <div className="mt-1.5">
        <p className="font-display font-medium text-sm text-rtb-navy truncate">
          {c.entidad_siglas ?? c.entidad_nombre_comercial ?? c.entidad_nombre_legal ?? 'Cliente sin nombre'}
        </p>
        {c.entidad_siglas && (
          <p className="text-xs text-muted-foreground truncate">{c.entidad_nombre_comercial ?? c.entidad_nombre_legal ?? '—'}</p>
        )}
      </div>

      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums text-rtb-navy">{formatearMoneda(c.total, c.moneda)}</span>
        <span className="text-[11px] text-muted-foreground shrink-0">
          {c.lineas_count} {c.lineas_count === 1 ? 'línea' : 'líneas'}
        </span>
      </div>
      {c.lineas_en_consulta > 0 && (
        <p className="mt-1 text-[11px] font-medium text-accent">{c.lineas_en_consulta} en consulta — no se puede enviar</p>
      )}

      <div className="mt-2 pt-2 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{CANAL_ORIGEN_LABELS[c.canal_entrada] ?? c.canal_entrada}</span>
        {c.vigencia_hasta && <span className={vencida ? 'text-destructive font-medium' : undefined}>Vence {c.vigencia_hasta}</span>}
      </div>
    </button>
  );
}
