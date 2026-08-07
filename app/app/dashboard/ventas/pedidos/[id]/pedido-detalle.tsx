'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PedidoEstadoBadge } from '@/components/ventas/estado-badge';
import { ProductoEtiqueta } from '@/components/inventario/producto-etiqueta';
import { Actualizando } from '@/components/ui/actualizando';
import { useAccionServidor } from '@/lib/ui/use-accion-servidor';
import { formatearMoneda } from '@/lib/ventas/validaciones';
import type { PedidoRow, PedidoLineaRow } from '@/types/ventas';
import { ArrowLeft, AlertCircle, Loader2 } from 'lucide-react';

interface Props {
  pedido: PedidoRow & { entidades: { nombre_comercial: string | null; nombre_legal: string } };
  lineas: PedidoLineaRow[];
  notaRemision: { id: string; folio: string; estado: string } | null;
}

// pedido/notaRemision llegan como props del Server Component; el estado
// nuevo lo dice el servidor tras router.refresh() (useAccionServidor), no
// una inferencia por el string de la URL (contexto/AUDITORIA_RTB-VEN-01.md §7.3).
export function PedidoDetalle({ pedido, lineas, notaRemision }: Props) {
  const { ejecutar, ocupado, refrescando, error } = useAccionServidor();

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
            <Actualizando activo={refrescando} />
          </h1>
          <p className="text-muted-foreground mt-1">{pedido.entidades?.nombre_comercial ?? pedido.entidades?.nombre_legal}</p>
        </div>
        <div className="flex gap-2">
          {!notaRemision && pedido.estado === 'aprobado' && (
            <Button
              onClick={() => ejecutar(`/api/ventas/pedidos/${pedido.id}/nota-remision`, { method: 'POST' })}
              disabled={ocupado}
              variant="outline"
            >
              {ocupado && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Emitir Nota de Remisión
            </Button>
          )}
          {pedido.estado === 'aprobado' && (
            <Button
              onClick={() => ejecutar(`/api/ventas/pedidos/${pedido.id}/liberar`, { method: 'POST' })}
              disabled={ocupado}
              className="bg-rtb-teal hover:bg-rtb-teal/90 text-white"
            >
              {ocupado && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
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
            {lineas.map((l) => (
              <tr key={l.id} className="border-b border-border/50">
                <td className="py-2 px-3">
                  <ProductoEtiqueta producto={l.productos} productoId={l.producto_id} />
                </td>
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
