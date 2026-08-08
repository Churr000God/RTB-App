'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CotizacionEstadoBadge } from '@/components/ventas/estado-badge';
import { Paginacion } from '@/components/ui/paginacion';
import { formatearMoneda } from '@/lib/ventas/validaciones';
import { CANAL_ORIGEN_LABELS } from '@/lib/entidades/config';
import type { CotizacionListadoRow } from '@/types/ventas';

export function CotizacionesTabla({
  data,
  count,
  page,
  pageSize,
  loading,
  vendedores,
  onPageChange,
}: {
  data: CotizacionListadoRow[];
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
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Líneas</th>
              <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider">Total</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Vigencia</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Creada</th>
            </tr>
          </thead>
          <tbody>
            {data.map((c, i) => {
              const vencida = c.vigencia_hasta ? c.vigencia_hasta < new Date().toISOString().slice(0, 10) : false;
              return (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/dashboard/ventas/cotizaciones/${c.id}`)}
                  className={`border-b border-border/50 cursor-pointer hover:bg-muted/30 ${i % 2 === 1 ? 'bg-rtb-surface/40' : ''}`}
                >
                  <td className="py-3 px-4">
                    <Link
                      href={`/dashboard/ventas/cotizaciones/${c.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs tabular-nums text-rtb-teal hover:underline"
                    >
                      {c.folio}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-sm" title={c.entidad_clave ?? undefined}>
                    <span className="font-medium">{c.entidad_siglas ?? '—'}</span>{' '}
                    <span className="text-muted-foreground text-xs">
                      {c.entidad_nombre_comercial ?? c.entidad_nombre_legal ?? 'Cliente sin nombre'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">{nombreVendedor(c.vendedor_id)}</td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">{CANAL_ORIGEN_LABELS[c.canal_entrada] ?? c.canal_entrada}</td>
                  <td className="py-3 px-4">
                    <CotizacionEstadoBadge estado={c.estado} />
                  </td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">
                    {c.lineas_count}
                    {c.lineas_en_consulta > 0 && <span className="ml-1 text-accent font-medium">({c.lineas_en_consulta} en consulta)</span>}
                  </td>
                  <td className="py-3 px-4 text-sm text-right tabular-nums font-medium">{formatearMoneda(c.total, c.moneda)}</td>
                  <td className={`py-3 px-4 text-sm ${vencida ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                    {c.vigencia_hasta ?? '—'}
                  </td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">{c.created_at.slice(0, 10)}</td>
                </tr>
              );
            })}
            {!loading && data.length === 0 && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-muted-foreground text-sm">
                  Sin cotizaciones que coincidan con el filtro.
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
