'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Paginacion } from '@/components/ui/paginacion';
import { PedidoEstadoBadge } from '@/components/ventas/estado-badge';
import { Loader2, PackageCheck } from 'lucide-react';

interface Props {
  initialData: any[];
  initialCount: number;
  pageSize: number;
}

export function PedidosExplorer({ initialData, initialCount, pageSize }: Props) {
  const [data, setData] = useState(initialData);
  const [count, setCount] = useState(initialCount);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const cargar = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ventas/pedidos?page=${p}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setData(json.data ?? []);
        setCount(json.count ?? 0);
        setPage(p);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
          <PackageCheck className="w-6 h-6" /> Pedidos
        </h1>
        <p className="text-muted-foreground mt-1">Nace al aprobar una cotización — reserva de inventario automática.</p>
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
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Cliente</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Estado</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Requiere PO</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p: any, i) => (
                <tr key={p.id} className={`border-b border-border/50 ${i % 2 === 1 ? 'bg-rtb-surface/40' : ''}`}>
                  <td className="py-3 px-4">
                    <Link href={`/dashboard/ventas/pedidos/${p.id}`} className="text-xs tabular-nums text-rtb-teal hover:underline">
                      {p.folio}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-sm">{p.entidades?.nombre_comercial ?? p.entidades?.nombre_legal ?? '—'}</td>
                  <td className="py-3 px-4">
                    <PedidoEstadoBadge estado={p.estado} />
                  </td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">{p.requiere_po ? 'Sí' : 'No'}</td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-muted-foreground text-sm">
                    Sin pedidos todavía.
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
