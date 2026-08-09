'use client';

import { useRouter } from 'next/navigation';
import { NREstadoBadge } from '@/components/ventas/estado-badge';
import { RemisionTarjeta } from './remision-tarjeta';
import type { NrTableroColumna } from '@/types/ventas';

// 10 columnas (NR_ESTADOS) en el orden del ciclo de vida — mismo criterio
// que CotizacionesTablero (038): sólo lectura, sin drag & drop (toda
// transición pasa por una función SECURITY DEFINER con sus propios
// requisitos, un arrastre no puede reproducirlos).
export function RemisionesTablero({
  columnas,
  onVerTodas,
}: {
  columnas: NrTableroColumna[];
  onVerTodas: (estado: string) => void;
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {columnas.map((col) => (
        <div key={col.estado} className="min-w-[280px] w-[300px] shrink-0 bg-rtb-surface/40 rounded-xl flex flex-col max-h-[70vh]">
          <div className="p-3 sticky top-0 bg-rtb-surface/95 backdrop-blur rounded-t-xl border-b border-border/60 flex items-center justify-between">
            <NREstadoBadge estado={col.estado} />
            <span className="text-xs font-semibold text-muted-foreground tabular-nums">{col.count}</span>
          </div>

          <div className="p-3 space-y-2 overflow-y-auto">
            {col.data.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Sin notas de remisión en este estado.</p>
            ) : (
              <ColumnaRemisionTarjeta data={col.data} />
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

function ColumnaRemisionTarjeta({ data }: { data: NrTableroColumna['data'] }) {
  const router = useRouter();
  return (
    <>
      {data.map((nr) => (
        <RemisionTarjeta key={nr.id} nr={nr} onClick={() => router.push(`/dashboard/ventas/remisiones/${nr.id}`)} />
      ))}
    </>
  );
}
