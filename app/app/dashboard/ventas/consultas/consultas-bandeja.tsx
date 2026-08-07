'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ProductoCombobox } from '@/components/inventario/producto-combobox';
import { ConsultaEstadoBadge } from '@/components/ventas/estado-badge';
import { CONSULTA_URGENCIA_LABELS, ROLES_RESPONDEN_CONSULTA } from '@/lib/ventas/config';
import type { ConsultaComprasRow } from '@/types/ventas';
import type { UserRole } from '@/types/database';
import { AlertCircle, Loader2 } from 'lucide-react';

export function ConsultasBandeja({ consultas: iniciales, rol }: { consultas: ConsultaComprasRow[]; rol: UserRole }) {
  const [consultas, setConsultas] = useState(iniciales);
  const puedeResponder = (ROLES_RESPONDEN_CONSULTA as readonly string[]).includes(rol);

  const recargar = async () => {
    const res = await fetch('/api/ventas/consultas');
    const data = await res.json().catch(() => ({}));
    setConsultas(data.data ?? []);
  };

  const abiertas = consultas.filter((c) => c.estado === 'abierta' || c.estado === 'en_proceso');
  const resueltas = consultas.filter((c) => c.estado !== 'abierta' && c.estado !== 'en_proceso');

  return (
    <Tabs defaultValue="abiertas">
      <TabsList>
        <TabsTrigger value="abiertas">Abiertas ({abiertas.length})</TabsTrigger>
        <TabsTrigger value="resueltas">Resueltas</TabsTrigger>
      </TabsList>
      <TabsContent value="abiertas" className="mt-4">
        <TablaConsultas consultas={abiertas} puedeResponder={puedeResponder} onCambio={recargar} />
      </TabsContent>
      <TabsContent value="resueltas" className="mt-4">
        <TablaConsultas consultas={resueltas} puedeResponder={false} onCambio={recargar} />
      </TabsContent>
    </Tabs>
  );
}

function TablaConsultas({
  consultas,
  puedeResponder,
  onCambio,
}: {
  consultas: ConsultaComprasRow[];
  puedeResponder: boolean;
  onCambio: () => Promise<void>;
}) {
  return (
    <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-rtb-navy text-white">
            <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Folio</th>
            <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Descripción</th>
            <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Urgencia</th>
            <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Estado</th>
            {puedeResponder && <th className="w-32" />}
          </tr>
        </thead>
        <tbody>
          {consultas.map((c) => (
            <tr key={c.id} className="border-b border-border/50">
              <td className="py-2 px-3 tabular-nums text-xs">{c.folio}</td>
              <td className="py-2 px-3">
                <div className="flex flex-col">
                  <span>{c.descripcion}</span>
                  <span className="text-xs text-muted-foreground">
                    {[c.marca_texto, c.modelo_texto, c.numero_parte].filter(Boolean).join(' · ')}
                    {c.cantidad ? ` · ${c.cantidad} ${c.unidad_texto ?? ''}` : ''}
                  </span>
                </div>
              </td>
              <td className="py-2 px-3 text-xs text-muted-foreground">{CONSULTA_URGENCIA_LABELS[c.urgencia]}</td>
              <td className="py-2 px-3">
                <ConsultaEstadoBadge estado={c.estado} />
              </td>
              {puedeResponder && (
                <td className="py-2 px-3">
                  {(c.estado === 'abierta' || c.estado === 'en_proceso') && <ResponderDialog consulta={c} onRespondida={onCambio} />}
                </td>
              )}
            </tr>
          ))}
          {consultas.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-muted-foreground">
                Sin consultas en esta pestaña.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ResponderDialog({ consulta, onRespondida }: { consulta: ConsultaComprasRow; onRespondida: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [productoId, setProductoId] = useState<string | null>(null);
  const [costoUnitario, setCostoUnitario] = useState('');
  const [plazoDias, setPlazoDias] = useState('');
  const [disponibilidad, setDisponibilidad] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const responder = async () => {
    if (!productoId || !costoUnitario) {
      setError('Elige el producto ya dado de alta y su costo.');
      return;
    }
    setError(null);
    setEnviando(true);
    const res = await fetch(`/api/ventas/consultas/${consulta.id}/responder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        producto_id: productoId,
        costo_unitario: Number(costoUnitario),
        plazo_entrega_dias: plazoDias ? Number(plazoDias) : undefined,
        disponibilidad: disponibilidad || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo responder la consulta.');
      return;
    }
    setOpen(false);
    await onRespondida();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Responder</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Responder consulta {consulta.folio}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Da de alta el producto con tus rutas normales de Compras primero (si no existe); aquí sólo lo ligas a la
          cotización con el costo real.
        </p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Producto ya dado de alta</Label>
            <div className="mt-1">
              <ProductoCombobox value={productoId} onChange={(id) => setProductoId(id)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Costo unitario</Label>
              <input
                type="number"
                min="0"
                step="any"
                value={costoUnitario}
                onChange={(e) => setCostoUnitario(e.target.value)}
                className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <Label className="text-xs">Plazo de entrega (días)</Label>
              <input
                type="number"
                min="0"
                value={plazoDias}
                onChange={(e) => setPlazoDias(e.target.value)}
                className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Disponibilidad</Label>
            <input
              value={disponibilidad}
              onChange={(e) => setDisponibilidad(e.target.value)}
              placeholder="Ej. en stock del proveedor"
              className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button size="sm" onClick={responder} disabled={enviando} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            {enviando && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            Responder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
