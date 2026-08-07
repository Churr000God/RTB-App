'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { formatearMoneda, formatearPorcentaje } from '@/lib/ventas/validaciones';
import type { UserRole } from '@/types/database';
import { AlertCircle, Loader2 } from 'lucide-react';

// Tarjeta de "Costo de Venta" (028): costo base ponderado global, margen
// de la FAMILIA, calculado, y el override manual que congela la fórmula.
// El precio congelado en una cotización nunca se ve afectado por lo que
// se muestra aquí — eso vive en ventas_cotizacion_lineas, no en esta tarjeta.
export function PrecioVentaTab({ productoId, rol }: { productoId: string; rol: UserRole | null }) {
  const [detalle, setDetalle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [precioManual, setPrecioManual] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const puedeEditar = rol === 'super_admin' || rol === 'direccion';

  const cargar = async () => {
    setLoading(true);
    const res = await fetch(`/api/ventas/precios/${productoId}`);
    const data = await res.json().catch(() => ({}));
    setDetalle(data.data?.costo_venta ?? null);
    setLoading(false);
  };

  useEffect(() => {
    void cargar();
  }, [productoId]);

  const fijar = async () => {
    if (!precioManual || motivo.trim().length < 3) {
      setError('Captura el precio y el motivo.');
      return;
    }
    setError(null);
    setEnviando(true);
    const res = await fetch(`/api/ventas/precio-venta/${productoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ precio_manual: Number(precioManual), motivo }),
    });
    const data = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo fijar el precio.');
      return;
    }
    setEditando(false);
    setPrecioManual('');
    setMotivo('');
    await cargar();
  };

  const revertir = async () => {
    setEnviando(true);
    const res = await fetch(`/api/ventas/precio-venta/${productoId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: 'Vuelta a la fórmula' }),
    });
    setEnviando(false);
    if (res.ok) await cargar();
  };

  if (loading) return <Loader2 className="w-5 h-5 text-rtb-teal animate-spin" />;

  return (
    <div className="bg-white rounded-xl p-5 space-y-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <h2 className="text-sm font-display font-semibold text-rtb-navy">Precio de venta (Costo de Venta)</h2>

      {!detalle ? (
        <p className="text-sm text-muted-foreground">No se pudo calcular.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Dato label="Costo base ponderado" valor={formatearMoneda(detalle.costo_base)} />
          <Dato label="Margen de familia" valor={detalle.familia_sin_margen ? 'Sin configurar' : formatearPorcentaje(detalle.margen_porcentaje)} alerta={detalle.familia_sin_margen} />
          <Dato label="Calculado (fórmula)" valor={formatearMoneda(detalle.calculado)} />
          <Dato label="Costo de Venta vigente" valor={detalle.calculable ? formatearMoneda(detalle.costo_venta) : 'No calculable'} alerta={!detalle.calculable} />
        </div>
      )}

      {detalle?.familia_sin_margen && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" /> La familia de este producto no tiene margen configurado (
          /dashboard/catalogos).
        </p>
      )}

      {detalle?.es_manual && (
        <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-xs space-y-2">
          <p>
            Precio manual activo desde {detalle.definido_at ? new Date(detalle.definido_at).toLocaleDateString('es-MX') : '—'}
            {detalle.calculado != null && detalle.costo_venta !== detalle.calculado && (
              <> — la fórmula ahora daría {formatearMoneda(detalle.calculado)}.</>
            )}
          </p>
          {puedeEditar && (
            <Button size="sm" variant="outline" onClick={revertir} disabled={enviando}>
              {enviando && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              Volver a la fórmula
            </Button>
          )}
        </div>
      )}

      {puedeEditar && !detalle?.es_manual && !editando && (
        <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
          Fijar precio manual
        </Button>
      )}

      {editando && (
        <div className="p-3 bg-rtb-surface/60 rounded-lg space-y-2">
          <div>
            <Label className="text-xs">Precio manual</Label>
            <input
              type="number"
              min="0"
              step="any"
              value={precioManual}
              onChange={(e) => setPrecioManual(e.target.value)}
              className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <Label className="text-xs">Motivo</Label>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={fijar} disabled={enviando} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
              {enviando && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              Guardar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Dato({ label, valor, alerta }: { label: string; valor: string; alerta?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-semibold tabular-nums ${alerta ? 'text-destructive' : 'text-rtb-navy'}`}>{valor}</p>
    </div>
  );
}
