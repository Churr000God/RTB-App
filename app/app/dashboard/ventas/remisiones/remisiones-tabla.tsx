'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NREstadoBadge } from '@/components/ventas/estado-badge';
import { Paginacion } from '@/components/ui/paginacion';
import { formatearMoneda } from '@/lib/ventas/validaciones';
import { CANAL_ORIGEN_LABELS } from '@/lib/entidades/config';
import type { NrListadoRow } from '@/types/ventas';

export function RemisionesTabla({
  data,
  count,
  page,
  pageSize,
  loading,
  vendedores,
  onPageChange,
}: {
  data: NrListadoRow[];
  count: number;
  page: number;
  pageSize: number;
  loading: boolean;
  vendedores: { id: string; full_name: string }[];
  onPageChange: (pagina: number) => void;
}) {
  const router = useRouter();
  const nombreVendedor = (id: string | null) => (id ? vendedores.find((v) => v.id === id)?.full_name ?? '—' : 'Sin asignar');

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-rtb-navy text-white">
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Folio</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Cliente</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Vendedor</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Canal</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Estado</th>
              <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider">Valor</th>
              <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider">Pendiente de PO</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">PO</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Emitida</th>
            </tr>
          </thead>
          <tbody>
            {data.map((nr, i) => (
              <tr
                key={nr.id}
                onClick={() => router.push(`/dashboard/ventas/remisiones/${nr.id}`)}
                className={`border-b border-border/50 cursor-pointer hover:bg-muted/30 ${
                  nr.monto_pendiente_po > 0 ? 'border-l-4 border-l-rtb-gold' : i % 2 === 1 ? 'bg-rtb-surface/40' : ''
                }`}
              >
                <td className="py-3 px-4">
                  <Link
                    href={`/dashboard/ventas/remisiones/${nr.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs tabular-nums text-rtb-teal hover:underline"
                  >
                    {nr.folio}
                  </Link>
                </td>
                <td className="py-3 px-4 text-sm" title={nr.entidad_clave ?? undefined}>
                  <span className="font-medium">{nr.entidad_siglas ?? '—'}</span>{' '}
                  <span className="text-muted-foreground text-xs">
                    {nr.entidad_nombre_comercial ?? nr.entidad_nombre_legal ?? 'Cliente sin nombre'}
                  </span>
                </td>
                <td className="py-3 px-4 text-sm text-muted-foreground">{nombreVendedor(nr.vendedor_id)}</td>
                <td className="py-3 px-4 text-sm text-muted-foreground">
                  {nr.canal_origen ? CANAL_ORIGEN_LABELS[nr.canal_origen] ?? nr.canal_origen : '—'}
                </td>
                <td className="py-3 px-4">
                  <NREstadoBadge estado={nr.estado} />
                </td>
                <td className="py-3 px-4 text-sm text-right tabular-nums font-medium">{formatearMoneda(nr.valor_total)}</td>
                <td
                  className={`py-3 px-4 text-sm text-right tabular-nums ${
                    nr.monto_pendiente_po > 0 ? 'text-accent font-medium' : 'text-muted-foreground'
                  }`}
                >
                  {formatearMoneda(nr.monto_pendiente_po)}
                </td>
                <td className="py-3 px-4 text-sm text-muted-foreground truncate max-w-[160px]" title={nr.po_folios ?? undefined}>
                  {nr.po_folios ?? '—'}
                </td>
                <td className="py-3 px-4 text-sm text-muted-foreground">{nr.emitida_at.slice(0, 10)}</td>
              </tr>
            ))}
            {!loading && data.length === 0 && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-muted-foreground text-sm">
                  Sin notas de remisión que coincidan con el filtro.
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
