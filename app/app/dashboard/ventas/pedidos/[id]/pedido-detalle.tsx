'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PedidoEstadoBadge } from '@/components/ventas/estado-badge';
import { formatearMoneda } from '@/lib/ventas/validaciones';
import type { PedidoRow, PedidoLineaRow } from '@/types/ventas';
import { ArrowLeft, AlertCircle, Loader2 } from 'lucide-react';

interface Props {
  pedido: PedidoRow & { entidades: { nombre_comercial: string | null; nombre_legal: string } };
  lineas: any[];
  notaRemision: { id: string; folio: string; estado: string } | null;
}

export function PedidoDetalle({ pedido: pedidoInicial, lineas, notaRemision: nrInicial }: Props) {
  const router = useRouter();
  const [pedido, setPedido] = useState(pedidoInicial);
  const [notaRemision, setNotaRemision] = useState(nrInicial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const accion = async (url: string) => {
    setError(null);
    setLoading(true);
    const res = await fetch(url, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'Ocurrió un error');
      return;
    }
    router.refresh();
    if (data.data?.folio) setNotaRemision({ id: data.data.nr_id, folio: data.data.folio, estado: 'abierta' });
    setPedido((p) => ({ ...p, estado: url.includes('liberar') ? 'liberado' : p.estado }));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/ventas/pedidos">
          <ArrowLeft className="w-4 h-4 mr-1" /> Pedidos
        </Link>
      </Button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-3">
            {pedido.folio}
            <PedidoEstadoBadge estado={pedido.estado} />
          </h1>
          <p className="text-muted-foreground mt-1">{pedido.entidades?.nombre_comercial ?? pedido.entidades?.nombre_legal}</p>
        </div>
        <div className="flex gap-2">
          {!notaRemision && pedido.estado === 'aprobado' && (
            <Button onClick={() => accion(`/api/ventas/pedidos/${pedido.id}/nota-remision`)} disabled={loading} variant="outline">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Emitir Nota de Remisión
            </Button>
          )}
          {pedido.estado === 'aprobado' && (
            <Button
              onClick={() => accion(`/api/ventas/pedidos/${pedido.id}/liberar`)}
              disabled={loading}
              className="bg-rtb-teal hover:bg-rtb-teal/90 text-white"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Liberar a Almacén
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notaRemision && (
        <div className="p-3 bg-rtb-surface/60 rounded-lg text-sm">
          NR:{' '}
          <Link href={`/dashboard/ventas/remisiones/${notaRemision.id}`} className="text-rtb-teal hover:underline font-medium">
            {notaRemision.folio}
          </Link>
        </div>
      )}

      <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-rtb-navy text-white">
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Producto</th>
              <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider">Cantidad</th>
              <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider">Unitario</th>
              <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider">Importe</th>
            </tr>
          </thead>
          <tbody>
            {(lineas as PedidoLineaRow[]).map((l: any) => (
              <tr key={l.id} className="border-b border-border/50">
                <td className="py-2 px-3">{l.producto_id}</td>
                <td className="py-2 px-3 text-right tabular-nums">{l.cantidad}</td>
                <td className="py-2 px-3 text-right tabular-nums">{formatearMoneda(l.precio_unitario)}</td>
                <td className="py-2 px-3 text-right tabular-nums font-semibold">{formatearMoneda(l.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
