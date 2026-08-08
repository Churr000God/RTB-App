'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { PedidoEstadoBadge, POEstadoBadge } from '@/components/ventas/estado-badge';
import { ProductoEtiqueta } from '@/components/inventario/producto-etiqueta';
import { Actualizando } from '@/components/ui/actualizando';
import { useAccionServidor } from '@/lib/ui/use-accion-servidor';
import { formatearMoneda } from '@/lib/ventas/validaciones';
import { PEDIDO_VIA_LABELS, ROLES_DESPACHAN_NR } from '@/lib/ventas/config';
import type { PedidoRow, PedidoLineaRow } from '@/types/ventas';
import type { UserRole } from '@/types/database';
import { ArrowLeft, AlertCircle, Loader2, Truck } from 'lucide-react';

interface Props {
  pedido: PedidoRow & { entidades: { nombre_comercial: string | null; nombre_legal: string } };
  lineas: PedidoLineaRow[];
  notaRemision: { id: string; folio: string; estado: string } | null;
  /** Vía B (043): la PO nacida al aprobar, con sus partidas — null si el
   *  pedido es de Vía A (via='nota_remision'). */
  ordenCompra: { id: string; folio: string; numero_po: string; estado: string; partidas: any[] } | null;
  rol: UserRole;
}

// pedido/notaRemision/ordenCompra llegan como props del Server Component;
// el estado nuevo lo dice el servidor tras router.refresh()
// (useAccionServidor), no una inferencia por el string de la URL
// (contexto/AUDITORIA_RTB-VEN-01.md §7.3). `pedido.via` decide qué bloque
// se muestra — nunca ambos, sólo uno existe por diseño (043).
export function PedidoDetalle({ pedido, lineas, notaRemision, ordenCompra, rol }: Props) {
  const { ejecutar, ocupado, refrescando, error } = useAccionServidor();
  const esViaB = pedido.via === 'orden_compra';
  // Surtir es trabajo físico de Almacén — 'ventas' se quitó a propósito
  // (045, pedido explícito del dueño del proyecto). ROLES_DESPACHAN_NR
  // gobierna ambas funciones de despacho (NR y PO), mismo criterio.
  const puedeSurtir = (ROLES_DESPACHAN_NR as readonly string[]).includes(rol);

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
          <p className="text-muted-foreground mt-1">
            {pedido.entidades?.nombre_comercial ?? pedido.entidades?.nombre_legal} · {PEDIDO_VIA_LABELS[pedido.via]}
          </p>
        </div>
        <div className="flex gap-2">
          {!esViaB && !notaRemision && pedido.estado === 'aprobado' && (
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
          {esViaB && puedeSurtir && ordenCompra && (pedido.estado === 'liberado' || pedido.estado === 'entregado_parcial') && (
            <DespacharPoDialog poId={ordenCompra.id} partidas={ordenCompra.partidas} ejecutar={ejecutar} ocupado={ocupado} />
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

      {esViaB && ordenCompra && (
        <div className="p-3 bg-rtb-surface/60 rounded-lg text-sm flex items-center gap-2">
          PO:{' '}
          <Link href={`/dashboard/ventas/ordenes-compra/${ordenCompra.id}`} className="text-rtb-teal hover:underline font-medium">
            {ordenCompra.folio}
          </Link>
          <POEstadoBadge estado={ordenCompra.estado as any} />
          <span className="text-muted-foreground">#{ordenCompra.numero_po}</span>
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

// Punto de entrada real de Almacén a la Vía B: el usuario sólo teclea la
// cantidad por partida pendiente, nunca ubicación ni unidad — mismo
// contrato que DespacharDialog de remisiones/[id]/nr-detalle.tsx, pegando
// a ventas_po_despachar() (044) en vez de ventas_nr_despachar().
function DespacharPoDialog({
  poId,
  partidas,
  ejecutar,
  ocupado,
}: {
  poId: string;
  partidas: any[];
  ejecutar: (url: string, init?: RequestInit) => Promise<{ ok: boolean; data: any }>;
  ocupado: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const pendientes = partidas.filter((p) => Number(p.cantidad) - Number(p.cantidad_entregada) > 0);

  const despachar = async () => {
    const payload = Object.entries(cantidades)
      .filter(([, v]) => v && Number(v) > 0)
      .map(([po_partida_id, cantidad]) => ({ po_partida_id, cantidad: Number(cantidad) }));
    if (payload.length === 0) {
      setErrorLocal('Indica al menos una cantidad a surtir.');
      return;
    }
    setErrorLocal(null);
    const res = await ejecutar(`/api/ventas/ordenes-compra/${poId}/despachar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineas: payload }),
    });
    if (!res.ok) return;
    setOpen(false);
    setCantidades({});
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-rtb-teal hover:bg-rtb-teal/90 text-white" disabled={pendientes.length === 0}>
          <Truck className="w-4 h-4 mr-2" /> Surtir PO
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Surtir partidas pendientes</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {pendientes.map((p) => {
            const pendiente = Number(p.cantidad) - Number(p.cantidad_entregada);
            return (
              <div key={p.id} className="flex items-center justify-between gap-3">
                <div className="text-sm">
                  <ProductoEtiqueta producto={p.productos} productoId={p.producto_id} />
                  <p className="text-xs text-muted-foreground">Pendiente: {pendiente}</p>
                </div>
                <input
                  type="number"
                  min="0"
                  max={pendiente}
                  step="any"
                  value={cantidades[p.id] ?? ''}
                  onChange={(e) => setCantidades((c) => ({ ...c, [p.id]: e.target.value }))}
                  className="w-24 text-sm border border-border rounded-lg px-3 py-2"
                />
              </div>
            );
          })}
          {errorLocal && <p className="text-xs text-destructive">{errorLocal}</p>}
        </div>
        <DialogFooter>
          <Button size="sm" onClick={despachar} disabled={ocupado} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            {ocupado && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            Confirmar surtido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
