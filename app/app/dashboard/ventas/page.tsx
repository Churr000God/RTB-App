export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { requireActiveUser } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NREstadoBadge } from '@/components/ventas/estado-badge';
import { formatearMoneda } from '@/lib/ventas/validaciones';
import type { TableroNrRow } from '@/types/ventas';
import { ShoppingCart } from 'lucide-react';

// Tablero de RTB-VEN-01: KPIs (ventas_kpis, 034) + el tablero de
// seguimiento de NR (ventas_tablero_nr, 034). "entregada_sin_po" es el
// estado de máxima vigilancia (RTB-PRO-VEN-01 §III) — hay valor entregado
// sin factura — y se resalta con el borde dorado, mismo idioma visual que
// "pendientes de autorización" en /dashboard/inventario/ajustes.
export default async function VentasDashboardPage() {
  await requireActiveUser();
  const supabase = createSupabaseServerClient();

  const [{ data: kpis }, { data: tablero }] = await Promise.all([
    supabase.rpc('ventas_kpis'),
    supabase.rpc('ventas_tablero_nr', { p_limit: 15, p_offset: 0 }),
  ]);

  const filas = (tablero ?? []) as TableroNrRow[];

  const tarjetas = [
    { label: 'Cotizaciones en borrador', valor: kpis?.cotizaciones_borrador ?? 0 },
    { label: 'Cotizaciones enviadas', valor: kpis?.cotizaciones_enviadas ?? 0 },
    { label: 'NR entregadas / sin PO', valor: kpis?.nr_entregadas_sin_po ?? 0, alerta: true },
    { label: 'NR parcialmente respaldadas', valor: kpis?.nr_parcialmente_respaldadas ?? 0 },
    { label: 'PO pendiente de confirmación', valor: kpis?.po_pendiente_confirmacion ?? 0 },
    { label: 'Autorizaciones pendientes', valor: kpis?.autorizaciones_pendientes ?? 0 },
    { label: 'Clientes congelados', valor: kpis?.clientes_congelados ?? 0, alerta: true },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
            <ShoppingCart className="w-6 h-6" /> Ventas
          </h1>
          <p className="text-muted-foreground mt-1">
            RTB-PRO-VEN-01 · seguimiento de Notas de Remisión hasta la PO vinculada
          </p>
        </div>
        <Link
          href="/dashboard/ventas/cotizaciones/nueva"
          className="inline-flex items-center rounded-lg bg-rtb-teal hover:bg-rtb-teal/90 text-white text-sm font-medium px-4 py-2"
        >
          Nueva cotización
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tarjetas.map((t) => (
          <div
            key={t.label}
            className={`bg-white rounded-xl p-4 ${t.alerta && Number(t.valor) > 0 ? 'border-l-4 border-l-rtb-gold' : ''}`}
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.label}</p>
            <p className="text-2xl font-display font-bold text-rtb-navy mt-1 tabular-nums">{t.valor}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-display font-semibold text-rtb-navy">Tablero de seguimiento de NR</h2>
        <Link href="/dashboard/ventas/remisiones" className="text-sm text-rtb-teal hover:underline">
          Ver todas →
        </Link>
      </div>

      <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <table className="w-full">
          <thead>
            <tr className="bg-rtb-navy text-white">
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Folio</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Cliente</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Estado</th>
              <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider">Antigüedad</th>
              <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider">Monto pendiente</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">PO vinculada</th>
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
                <td className="py-3 px-4">
                  <NREstadoBadge estado={f.estado} />
                </td>
                <td className="py-3 px-4 text-right tabular-nums text-sm">{f.antiguedad_dias} días</td>
                <td className="py-3 px-4 text-right tabular-nums text-sm">{formatearMoneda(f.monto_pendiente)}</td>
                <td className="py-3 px-4 text-sm text-muted-foreground">{f.po_folios ?? '—'}</td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-muted-foreground text-sm">
                  Sin notas de remisión registradas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
