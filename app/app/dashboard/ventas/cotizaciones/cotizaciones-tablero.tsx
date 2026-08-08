'use client';

import { useRouter } from 'next/navigation';
import { CotizacionEstadoBadge } from '@/components/ventas/estado-badge';
import { CotizacionTarjeta } from './cotizacion-tarjeta';
import type { CotizacionTableroColumna } from '@/types/ventas';

// Seis columnas en el orden del ciclo de vida (VENTAS_COTIZACION_ESTADOS:
// borrador → enviada → aprobada → rechazada → expirada → cancelada). Sólo
// lectura — ver cotizacion-tarjeta.tsx para el porqué de no tener
// drag & drop.
export function CotizacionesTablero({
  columnas,
  onVerTodas,
}: {
  columnas: CotizacionTableroColumna[];
  onVerTodas: (estado: string) => void;
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {columnas.map((col) => (
        <div key={col.estado} className="min-w-[280px] w-[300px] shrink-0 bg-rtb-surface/40 rounded-xl flex flex-col max-h-[70vh]">
          <div className="p-3 sticky top-0 bg-rtb-surface/95 backdrop-blur rounded-t-xl border-b border-border/60 flex items-center justify-between">
            <CotizacionEstadoBadge estado={col.estado} />
            <span className="text-xs font-semibold text-muted-foreground tabular-nums">{col.count}</span>
          </div>

          <div className="p-3 space-y-2 overflow-y-auto">
            {col.data.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Sin cotizaciones en este estado.</p>
            ) : (
              <ColumnaCotizacionTarjeta data={col.data} />
            )}

            {col.count > col.data.length && (
              <button
                type="button"
                onClick={() => onVerTodas(col.estado)}
                className="w-full text-xs text-rtb-teal hover:underline text-center py-2"
              >
                Ver las {col.count - col.data.length} restantes en la tabla
              </button>
            )}
          </div>
        </div>
      ))}
      {columnas.length === 0 && (
        <p className="text-sm text-muted-foreground py-10 text-center w-full">Ningún estado coincide con el filtro aplicado.</p>
      )}
    </div>
  );
}

function ColumnaCotizacionTarjeta({ data }: { data: CotizacionTableroColumna['data'] }) {
  const router = useRouter();
  return (
    <>
      {data.map((c) => (
        <CotizacionTarjeta key={c.id} cotizacion={c} onClick={() => router.push(`/dashboard/ventas/cotizaciones/${c.id}`)} />
      ))}
    </>
  );
}
