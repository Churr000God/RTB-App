'use client';

import { useCallback, useEffect, useState } from 'react';
import { DiscrepanciaEstadoBadge } from '@/components/inventario/estado-badge';
import { Button } from '@/components/ui/button';
import {
  DISCREPANCIA_BANDA_LABELS,
  DISCREPANCIA_SALIDA_LABELS,
  DISCREPANCIA_SALIDAS_SIN_CAUSA,
} from '@/lib/inventario/config';
import { DISCREPANCIA_BANDAS, DISCREPANCIA_SALIDAS } from '@/types/inventario';
import type { DiscrepanciaBanda, DiscrepanciaSalida, InventarioDiscrepancia } from '@/types/inventario';
import { AlertCircle, AlertTriangle, Loader2, X } from 'lucide-react';

type Fila = InventarioDiscrepancia & { productos: { codigo_interno: string; nombre: string } | null };

// Registro de Discrepancias (CIE-DIS-01). "Una diferencia sin causa
// identificada no se ajusta: se declara como hallazgo" — el modal de
// resolución sólo deja mandar sin causa/banda cuando la salida es HAL o
// MEN (mismo espejo que dis_causa_chk en 013_inventario_discrepancias_ajustes.sql).
export default function DiscrepanciasPage() {
  const [data, setData] = useState<Fila[]>([]);
  const [kpis, setKpis] = useState({ abiertas: 0 });
  const [loading, setLoading] = useState(true);
  const [seleccionada, setSeleccionada] = useState<Fila | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/inventario/discrepancias');
    const json = await res.json();
    setData(json.data ?? []);
    setKpis(json.kpis ?? { abiertas: 0 });
    setLoading(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
          <AlertTriangle className="w-6 h-6" /> Registro de Discrepancias
        </h1>
        <p className="text-muted-foreground mt-1">CIE-DIS-01 · Paso 0 · Reubicación, causa presunta y banda de investigación</p>
      </div>

      <div className="bg-white rounded-xl p-4 border-l-4 border-l-destructive w-fit" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Abiertas</p>
        <p className="text-2xl font-display font-bold text-destructive mt-1 tabular-nums">{kpis.abiertas}</p>
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
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Producto</th>
                <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider">Diferencia</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Estado</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Salida</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={d.id} className={`border-b border-border/50 ${i % 2 === 1 ? 'bg-rtb-surface/40' : ''}`}>
                  <td className="py-3 px-4 text-xs tabular-nums text-muted-foreground">{d.folio}</td>
                  <td className="py-3 px-4 text-sm">
                    <p className="font-medium text-rtb-navy">{d.productos?.nombre}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{d.productos?.codigo_interno}</p>
                  </td>
                  <td className={`py-3 px-4 text-right tabular-nums text-sm font-medium ${d.diferencia < 0 ? 'text-destructive' : 'text-primary'}`}>
                    {d.diferencia > 0 ? '+' : ''}
                    {d.diferencia}
                  </td>
                  <td className="py-3 px-4">
                    <DiscrepanciaEstadoBadge estado={d.estado} />
                  </td>
                  <td className="py-3 px-4 text-xs">{d.salida ? DISCREPANCIA_SALIDA_LABELS[d.salida] : '—'}</td>
                  <td className="py-3 px-4">
                    <Button size="sm" variant="outline" onClick={() => setSeleccionada(d)}>
                      Investigar
                    </Button>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground text-sm">
                    Sin discrepancias abiertas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {seleccionada && (
        <ResolverModal
          discrepancia={seleccionada}
          onClose={() => setSeleccionada(null)}
          onResuelto={() => {
            setSeleccionada(null);
            void cargar();
          }}
        />
      )}
    </div>
  );
}

function ResolverModal({
  discrepancia,
  onClose,
  onResuelto,
}: {
  discrepancia: Fila;
  onClose: () => void;
  onResuelto: () => void;
}) {
  const [salida, setSalida] = useState<DiscrepanciaSalida | ''>('');
  const [banda, setBanda] = useState<DiscrepanciaBanda | ''>('');
  const [causa, setCausa] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requiereCausa = salida !== '' && !DISCREPANCIA_SALIDAS_SIN_CAUSA.includes(salida);

  const enviar = async () => {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/inventario/discrepancias/${discrepancia.id}/resolver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        salida,
        banda: banda || undefined,
        causa_presunta: causa || undefined,
        estado: requiereCausa ? 'con_causa' : salida === 'hal' ? 'hallazgo' : 'resuelta',
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'Error al resolver');
      return;
    }
    onResuelto();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 max-w-lg w-full space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display font-semibold text-rtb-navy">Investigar {discrepancia.folio}</h2>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-rtb-navy-mid">Salida</label>
          <select
            value={salida}
            onChange={(e) => setSalida(e.target.value as DiscrepanciaSalida)}
            className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
          >
            <option value="">Selecciona</option>
            {DISCREPANCIA_SALIDAS.map((s) => (
              <option key={s} value={s}>
                {DISCREPANCIA_SALIDA_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        {requiereCausa && (
          <>
            <div>
              <label className="text-xs font-semibold text-rtb-navy-mid">Banda (quién investiga)</label>
              <select
                value={banda}
                onChange={(e) => setBanda(e.target.value as DiscrepanciaBanda)}
                className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
              >
                <option value="">Selecciona</option>
                {DISCREPANCIA_BANDAS.map((b) => (
                  <option key={b} value={b}>
                    {DISCREPANCIA_BANDA_LABELS[b]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-rtb-navy-mid">Causa presunta</label>
              <textarea
                value={causa}
                onChange={(e) => setCausa(e.target.value)}
                rows={3}
                className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
              />
            </div>
          </>
        )}

        {salida && !requiereCausa && (
          <p className="text-xs text-muted-foreground">
            {salida === 'hal'
              ? 'Se declara como hallazgo — sobrevive al cierre del conteo hasta encontrar la causa real.'
              : 'Diferencia menor no rastreada — no exige causa ni banda.'}
          </p>
        )}

        <div className="flex gap-2">
          <Button onClick={enviar} disabled={loading || !salida || (requiereCausa && (!banda || !causa))} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Guardar
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
