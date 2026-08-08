export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { requireRole } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NREstadoBadge } from '@/components/ventas/estado-badge';
import { formatearMoneda } from '@/lib/ventas/validaciones';
import { NR_ESTADO_LABELS } from '@/lib/ventas/config';
import { ACCESO_PANTALLA } from '@/lib/ventas/permisos';
import { NR_ESTADOS, type TableroNrRow } from '@/types/ventas';
import { FileStack } from 'lucide-react';

// El tablero completo de seguimiento de NR (RTB-PRO-VEN-01 §III), con
// filtro por estado. La antigüedad y el monto pendiente se calculan por
// agregación en ventas_tablero_nr() (034) — nunca almacenados.
export default async function RemisionesPage({ searchParams }: { searchParams: { estado?: string } }) {
  await requireRole(ACCESO_PANTALLA.remisiones);
  const supabase = createSupabaseServerClient();

  const { data: tablero } = await supabase.rpc('ventas_tablero_nr', {
    p_estado: searchParams.estado ?? null,
    p_limit: 100,
    p_offset: 0,
  });
  const filas = (tablero ?? []) as TableroNrRow[];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
          <FileStack className="w-6 h-6" /> Notas de Remisión
        </h1>
        <p className="text-muted-foreground mt-1">
          El tablero de seguimiento — ninguna NR queda sin registro ni sin dueño hasta que llega la PO.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/dashboard/ventas/remisiones"
          className={`text-xs font-medium px-3 py-1.5 rounded-full ${!searchParams.estado ? 'bg-rtb-navy text-white' : 'bg-white text-muted-foreground'}`}
        >
          Todas
        </Link>
        {NR_ESTADOS.map((e) => (
          <Link
            key={e}
            href={`/dashboard/ventas/remisiones?estado=${e}`}
            className={`text-xs font-medium px-3 py-1.5 rounded-full ${searchParams.estado === e ? 'bg-rtb-navy text-white' : 'bg-white text-muted-foreground'}`}
          >
            {NR_ESTADO_LABELS[e]}
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-xl overflow-hidden overflow-x-auto" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <table className="w-full">
          <thead>
            <tr className="bg-rtb-navy text-white">
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Folio</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Cliente</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Canal</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Estado</th>
              <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider">Antigüedad</th>
              <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider">Valor</th>
              <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider">Pendiente</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">PO vinculada</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Último contacto</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr
                key={f.nr_id}
                className={`border-b border-border/50 ${f.estado === 'entregada_sin_po' ? 'border-l-4 border-l-rtb-gold' : i % 2 === 1 ? 'bg-rtb-surface/40' : ''}`}
              >
                <td className="py-3 px-4">
                  <Link href={`/dashboard/ventas/remisiones/${f.nr_id}`} className="text-xs tabular-nums text-rtb-teal hover:underline">
                    {f.folio}
                  </Link>
                </td>
                <td className="py-3 px-4 text-sm">{f.entidad_nombre ?? '—'}</td>
                <td className="py-3 px-4 text-sm text-muted-foreground">{f.canal_origen}</td>
                <td className="py-3 px-4">
                  <NREstadoBadge estado={f.estado} />
                </td>
                <td className="py-3 px-4 text-right tabular-nums text-sm">{f.antiguedad_dias} días</td>
                <td className="py-3 px-4 text-right tabular-nums text-sm">{formatearMoneda(f.valor_total)}</td>
                <td className="py-3 px-4 text-right tabular-nums text-sm">{formatearMoneda(f.monto_pendiente)}</td>
                <td className="py-3 px-4 text-sm text-muted-foreground">{f.po_folios ?? '—'}</td>
                <td className="py-3 px-4 text-xs text-muted-foreground truncate max-w-[200px]">
                  {f.nota_ultimo_contacto ?? '—'}
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-muted-foreground text-sm">
                  Sin notas de remisión en este estado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
