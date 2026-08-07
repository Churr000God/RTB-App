'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { NREstadoBadge } from '@/components/ventas/estado-badge';
import { formatearMoneda } from '@/lib/ventas/validaciones';
import { ROLES_DESPACHAN_NR } from '@/lib/ventas/config';
import { CANAL_ORIGENES } from '@/types/entidades';
import { CANAL_ORIGEN_LABELS } from '@/lib/entidades/config';
import type { UserRole } from '@/types/database';
import { ArrowLeft, AlertCircle, Loader2, Send, Truck } from 'lucide-react';

interface Props {
  nr: any;
  lineas: any[];
  seguimientos: any[];
  cobertura: any;
  rol: UserRole;
}

export function NrDetalle({ nr: nrInicial, lineas: lineasIniciales, seguimientos: seguimientosIniciales, cobertura, rol }: Props) {
  const router = useRouter();
  const [nr, setNr] = useState(nrInicial);
  const [lineas, setLineas] = useState(lineasIniciales);
  const [seguimientos, setSeguimientos] = useState(seguimientosIniciales);
  const [error, setError] = useState<string | null>(null);
  const puedeDespachar = (ROLES_DESPACHAN_NR as readonly string[]).includes(rol);

  const recargar = async () => {
    const res = await fetch(`/api/ventas/notas-remision/${nr.id}`);
    const data = await res.json().catch(() => null);
    if (data?.data) {
      const { lineas: l, seguimientos: s, ...cabecera } = data.data;
      setNr((prev: any) => ({ ...prev, ...cabecera }));
      setLineas(l ?? []);
      setSeguimientos(s ?? []);
    }
    router.refresh();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/ventas/remisiones">
          <ArrowLeft className="w-4 h-4 mr-1" /> Notas de Remisión
        </Link>
      </Button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-3">
            {nr.folio}
            <NREstadoBadge estado={nr.estado} />
          </h1>
          <p className="text-muted-foreground mt-1">{nr.entidades?.nombre_comercial ?? nr.entidades?.nombre_legal}</p>
        </div>
        {puedeDespachar && <DespacharDialog nrId={nr.id} lineas={lineas} onDespachado={recargar} setError={setError} />}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {cobertura && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tarjeta label="Entregado" valor={formatearMoneda(cobertura.monto_entregado)} />
          <Tarjeta label="Respaldado por PO" valor={formatearMoneda(cobertura.monto_respaldado)} />
          <Tarjeta
            label="Pendiente de PO"
            valor={formatearMoneda(cobertura.monto_entregado - cobertura.monto_respaldado)}
            alerta={cobertura.monto_entregado - cobertura.monto_respaldado > 0}
          />
          <Tarjeta label="Valor total" valor={formatearMoneda(nr.valor_total)} />
        </div>
      )}

      <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-rtb-navy text-white">
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Producto</th>
              <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider">Cantidad</th>
              <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider">Entregado</th>
              <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider">Pendiente</th>
              <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider">Unitario</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l: any) => (
              <tr key={l.id} className="border-b border-border/50">
                <td className="py-2 px-3">{l.producto_id}</td>
                <td className="py-2 px-3 text-right tabular-nums">{l.cantidad}</td>
                <td className="py-2 px-3 text-right tabular-nums">{l.cantidad_entregada}</td>
                <td className="py-2 px-3 text-right tabular-nums">{Number(l.cantidad) - Number(l.cantidad_entregada)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{formatearMoneda(l.precio_unitario)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SeguimientoCard nrId={nr.id} seguimientos={seguimientos} onAgregado={recargar} />

      <div className="p-4 bg-rtb-surface/60 rounded-lg text-sm text-muted-foreground">
        Para vincular la PO del cliente contra esta NR, ve a{' '}
        <Link href="/dashboard/ventas/ordenes-compra" className="text-rtb-teal hover:underline font-medium">
          Órdenes de Compra
        </Link>{' '}
        y registra o valida la PO — el cruce se hace por partida, no desde aquí.
      </div>
    </div>
  );
}

function Tarjeta({ label, valor, alerta }: { label: string; valor: string; alerta?: boolean }) {
  return (
    <div className={`bg-white rounded-xl p-4 ${alerta ? 'border-l-4 border-l-rtb-gold' : ''}`} style={{ boxShadow: 'var(--shadow-sm)' }}>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-lg font-display font-bold text-rtb-navy mt-1 tabular-nums">{valor}</p>
    </div>
  );
}

function DespacharDialog({
  nrId,
  lineas,
  onDespachado,
  setError,
}: {
  nrId: string;
  lineas: any[];
  onDespachado: () => Promise<void>;
  setError: (e: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const pendientes = lineas.filter((l) => Number(l.cantidad) - Number(l.cantidad_entregada) > 0);

  const despachar = async () => {
    const payload = Object.entries(cantidades)
      .filter(([, v]) => v && Number(v) > 0)
      .map(([nr_linea_id, cantidad]) => ({ nr_linea_id, cantidad: Number(cantidad) }));
    if (payload.length === 0) {
      setError('Indica al menos una cantidad a despachar.');
      return;
    }
    setError(null);
    setEnviando(true);
    const res = await fetch(`/api/ventas/notas-remision/${nrId}/despachar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineas: payload }),
    });
    const data = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo despachar.');
      return;
    }
    setOpen(false);
    setCantidades({});
    await onDespachado();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-rtb-teal hover:bg-rtb-teal/90 text-white" disabled={pendientes.length === 0}>
          <Truck className="w-4 h-4 mr-2" /> Despachar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Despachar líneas pendientes</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {pendientes.map((l) => {
            const pendiente = Number(l.cantidad) - Number(l.cantidad_entregada);
            return (
              <div key={l.id} className="flex items-center justify-between gap-3">
                <div className="text-sm">
                  <p>{l.producto_id}</p>
                  <p className="text-xs text-muted-foreground">Pendiente: {pendiente}</p>
                </div>
                <input
                  type="number"
                  min="0"
                  max={pendiente}
                  step="any"
                  value={cantidades[l.id] ?? ''}
                  onChange={(e) => setCantidades((c) => ({ ...c, [l.id]: e.target.value }))}
                  className="w-24 text-sm border border-border rounded-lg px-3 py-2"
                />
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button size="sm" onClick={despachar} disabled={enviando} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            {enviando && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            Confirmar despacho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SeguimientoCard({ nrId, seguimientos, onAgregado }: { nrId: string; seguimientos: any[]; onAgregado: () => Promise<void> }) {
  const [canal, setCanal] = useState('telefono');
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agregar = async () => {
    if (nota.trim().length < 3) {
      setError('Escribe la nota de seguimiento.');
      return;
    }
    setError(null);
    setEnviando(true);
    const res = await fetch(`/api/ventas/notas-remision/${nrId}/seguimiento`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canal, nota }),
    });
    const data = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo registrar el seguimiento.');
      return;
    }
    setNota('');
    await onAgregado();
  };

  return (
    <div className="bg-white rounded-xl p-5 space-y-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <h2 className="text-sm font-display font-semibold text-rtb-navy flex items-center gap-2">
        <Send className="w-4 h-4" /> Seguimiento — perseguir la PO con el cliente
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Canal</Label>
          <select value={canal} onChange={(e) => setCanal(e.target.value)} className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2">
            {CANAL_ORIGENES.map((c) => (
              <option key={c} value={c}>
                {CANAL_ORIGEN_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[240px]">
          <Label className="text-xs">Nota</Label>
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Resumen del último contacto…"
            className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
          />
        </div>
        <Button size="sm" onClick={agregar} disabled={enviando} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
          {enviando && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
          Registrar
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {seguimientos.map((s: any) => (
          <div key={s.id} className="text-xs border-l-2 border-rtb-teal/40 pl-2">
            <span className="font-medium">{new Date(s.created_at).toLocaleString('es-MX')}</span> · {s.canal} — {s.nota}
          </div>
        ))}
        {seguimientos.length === 0 && <p className="text-xs text-muted-foreground">Sin seguimiento registrado todavía.</p>}
      </div>
    </div>
  );
}
