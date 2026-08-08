'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Paginacion } from '@/components/ui/paginacion';
import { POEstadoBadge } from '@/components/ventas/estado-badge';
import { FileSignature, Loader2, Plus } from 'lucide-react';

interface Props {
  initialData: any[];
  initialCount: number;
  pageSize: number;
  puedeCrear: boolean;
  /** Filtro ?estado= con el que llegó la primera página (ya aplicado por
   *  el Server Component) — se repite en cada fetch de paginación para no
   *  perderlo al cambiar de página. */
  estadoInicial?: string;
}

export function OrdenesCompraExplorer({ initialData, initialCount, pageSize, puedeCrear, estadoInicial }: Props) {
  const [data, setData] = useState(initialData);
  const [count, setCount] = useState(initialCount);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const cargar = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p) });
        if (estadoInicial) params.set('estado', estadoInicial);
        const res = await fetch(`/api/ventas/ordenes-compra?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          setData(json.data ?? []);
          setCount(json.count ?? 0);
          setPage(p);
        }
      } finally {
        setLoading(false);
      }
    },
    [estadoInicial]
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
            <FileSignature className="w-6 h-6" /> Órdenes de Compra del cliente
          </h1>
          <p className="text-muted-foreground mt-1">
            Una sola partida con costo distinto bloquea la PO completa — sin excepción de Dirección.
          </p>
          {estadoInicial && (
            <Link href="/dashboard/ventas/ordenes-compra" className="text-xs text-rtb-teal hover:underline">
              Filtrando por estado «{estadoInicial}» — ver todas
            </Link>
          )}
        </div>
        {puedeCrear && (
          <Link
            href="/dashboard/ventas/ordenes-compra/nueva"
            className="inline-flex items-center rounded-lg bg-rtb-teal hover:bg-rtb-teal/90 text-white text-sm font-medium px-4 py-2"
          >
            <Plus className="w-4 h-4 mr-2" /> Registrar PO
          </Link>
        )}
      </div>

      <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-rtb-teal animate-spin" />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-rtb-navy text-white">
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Folio</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Número de PO</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Cliente</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.map((po: any, i) => (
                <tr key={po.id} className={`border-b border-border/50 ${i % 2 === 1 ? 'bg-rtb-surface/40' : ''}`}>
                  <td className="py-3 px-4">
                    <Link href={`/dashboard/ventas/ordenes-compra/${po.id}`} className="text-xs tabular-nums text-rtb-teal hover:underline">
                      {po.folio}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-sm">{po.numero_po}</td>
                  <td className="py-3 px-4 text-sm">{po.entidades?.nombre_comercial ?? po.entidades?.nombre_legal ?? '—'}</td>
                  <td className="py-3 px-4">
                    <POEstadoBadge estado={po.estado} />
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-muted-foreground text-sm">
                    Sin órdenes de compra registradas todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        <Paginacion page={page} pageSize={pageSize} count={count} onPageChange={cargar} disabled={loading} />
      </div>
    </div>
  );
}
