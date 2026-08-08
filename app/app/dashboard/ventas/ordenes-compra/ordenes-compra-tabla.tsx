'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { POEstadoBadge } from '@/components/ventas/estado-badge';
import { Paginacion } from '@/components/ui/paginacion';
import { formatearMoneda } from '@/lib/ventas/validaciones';
import type { OrdenCompraListadoRow } from '@/types/ventas';

export function OrdenesCompraTabla({
  data,
  count,
  page,
  pageSize,
  loading,
  onPageChange,
}: {
  data: OrdenCompraListadoRow[];
  count: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onPageChange: (pagina: number) => void;
}) {
  const router = useRouter();

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-rtb-navy text-white">
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Folio</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Número de PO</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Cliente</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Pedido</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Estado</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Partidas</th>
              <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider">Total</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Fecha de PO</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Creada</th>
            </tr>
          </thead>
          <tbody>
            {data.map((po, i) => (
              <tr
                key={po.id}
                onClick={() => router.push(`/dashboard/ventas/ordenes-compra/${po.id}`)}
                className={`border-b border-border/50 cursor-pointer hover:bg-muted/30 ${i % 2 === 1 ? 'bg-rtb-surface/40' : ''}`}
              >
                <td className="py-3 px-4">
                  <Link
                    href={`/dashboard/ventas/ordenes-compra/${po.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs tabular-nums text-rtb-teal hover:underline"
                  >
                    {po.folio}
                  </Link>
                </td>
                <td className="py-3 px-4 text-sm">{po.numero_po}</td>
                <td className="py-3 px-4 text-sm" title={po.entidad_clave ?? undefined}>
                  <span className="font-medium">{po.entidad_siglas ?? '—'}</span>{' '}
                  <span className="text-muted-foreground text-xs">
                    {po.entidad_nombre_comercial ?? po.entidad_nombre_legal ?? 'Cliente sin nombre'}
                  </span>
                </td>
                <td className="py-3 px-4 text-sm text-muted-foreground">{po.pedido_folio ?? '—'}</td>
                <td className="py-3 px-4">
                  <POEstadoBadge estado={po.estado} />
                </td>
                <td className="py-3 px-4 text-sm text-muted-foreground">
                  {po.partidas_count}
                  {po.cantidad_total > 0 && (
                    <span className="ml-1 text-xs">
                      ({po.cantidad_entregada_total}/{po.cantidad_total})
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-sm text-right tabular-nums font-medium">{formatearMoneda(po.total, po.moneda)}</td>
                <td className="py-3 px-4 text-sm text-muted-foreground">{po.fecha_po ?? '—'}</td>
                <td className="py-3 px-4 text-sm text-muted-foreground">{po.created_at.slice(0, 10)}</td>
              </tr>
            ))}
            {!loading && data.length === 0 && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-muted-foreground text-sm">
                  Sin órdenes de compra que coincidan con el filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Paginacion page={page} pageSize={pageSize} count={count} onPageChange={onPageChange} disabled={loading} />
    </div>
  );
}
