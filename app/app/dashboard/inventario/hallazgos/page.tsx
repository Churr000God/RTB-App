'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/rbac/hooks';
import { Button } from '@/components/ui/button';
import { HallazgoEstadoBadge } from '@/components/inventario/estado-badge';
import { HALLAZGO_ESTADO_LABELS } from '@/lib/inventario/config';
import { puede } from '@/lib/inventario/permisos';
import type { InventarioHallazgo } from '@/types/inventario';
import { AlertCircle, ClipboardList, Loader2, Plus, X } from 'lucide-react';

// Gap de UI (contexto/AUDITORIA_QA_ROLES_2026-08-06.md §4): POST/PATCH
// /api/inventario/hallazgos existían y respondían, pero no había ninguna
// pantalla — un hallazgo abierto (que sobrevive al cierre del conteo que
// lo originó, 013_inventario_discrepancias_ajustes.sql) era invisible.
export default function HallazgosPage() {
  const { role } = useAuth();
  const [data, setData] = useState<InventarioHallazgo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [cerrando, setCerrando] = useState<InventarioHallazgo | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/inventario/hallazgos');
    const data = await res.json().catch(() => ({}));
    setData(data.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const puedeEscribir = puede(role, 'hallazgos', 'insert');

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6" /> Hallazgos
          </h1>
          <p className="text-muted-foreground mt-1">
            Diferencias sin causa identificada — sobreviven al cierre del conteo hasta encontrar la causa real.
          </p>
        </div>
        {puedeEscribir && (
          <Button onClick={() => setCreando(true)} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            <Plus className="w-4 h-4 mr-2" /> Nuevo hallazgo
          </Button>
        )}
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
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Descripción</th>
                <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider">Impacto (piezas)</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Fecha límite</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Estado</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((h, i) => (
                <tr key={h.id} className={`border-b border-border/50 ${i % 2 === 1 ? 'bg-rtb-surface/40' : ''}`}>
                  <td className="py-3 px-4 text-xs tabular-nums text-muted-foreground">{h.folio}</td>
                  <td className="py-3 px-4 text-sm text-rtb-navy max-w-md truncate">{h.descripcion}</td>
                  <td className="py-3 px-4 text-right tabular-nums text-sm">{h.impacto_piezas ?? '—'}</td>
                  <td className="py-3 px-4 text-xs tabular-nums text-muted-foreground">
                    {h.fecha_limite ? new Date(h.fecha_limite).toLocaleDateString('es-MX', { timeZone: 'UTC' }) : '—'}
                  </td>
                  <td className="py-3 px-4">
                    <HallazgoEstadoBadge estado={h.estado} />
                  </td>
                  <td className="py-3 px-4">
                    {puedeEscribir && (h.estado === 'abierto' || h.estado === 'en_seguimiento') && (
                      <Button size="sm" variant="outline" onClick={() => setCerrando(h)}>
                        Cerrar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground text-sm">
                    Sin hallazgos abiertos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {creando && (
        <CrearModal
          onClose={() => setCreando(false)}
          onCreado={() => {
            setCreando(false);
            void cargar();
          }}
        />
      )}
      {cerrando && (
        <CerrarModal
          hallazgo={cerrando}
          onClose={() => setCerrando(null)}
          onCerrado={() => {
            setCerrando(null);
            void cargar();
          }}
        />
      )}
    </div>
  );
}

function CrearModal({ onClose, onCreado }: { onClose: () => void; onCreado: () => void }) {
  const [descripcion, setDescripcion] = useState('');
  const [impactoPiezas, setImpactoPiezas] = useState('');
  const [impactoValor, setImpactoValor] = useState('');
  const [fechaLimite, setFechaLimite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const enviar = async () => {
    setError(null);
    setLoading(true);
    const res = await fetch('/api/inventario/hallazgos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        descripcion,
        impacto_piezas: impactoPiezas ? Number(impactoPiezas) : undefined,
        impacto_valor: impactoValor ? Number(impactoValor) : undefined,
        fecha_limite: fechaLimite || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'Error al registrar el hallazgo');
      return;
    }
    onCreado();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 max-w-lg w-full space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display font-semibold text-rtb-navy">Nuevo hallazgo</h2>
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
          <label className="text-xs font-semibold text-rtb-navy-mid">Descripción</label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={3}
            className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-rtb-navy-mid">Impacto (piezas)</label>
            <input
              type="number"
              step="any"
              value={impactoPiezas}
              onChange={(e) => setImpactoPiezas(e.target.value)}
              className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2 tabular-nums"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-rtb-navy-mid">Impacto (valor $)</label>
            <input
              type="number"
              step="any"
              value={impactoValor}
              onChange={(e) => setImpactoValor(e.target.value)}
              className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2 tabular-nums"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-rtb-navy-mid">Fecha límite (opcional)</label>
          <input
            type="date"
            value={fechaLimite}
            onChange={(e) => setFechaLimite(e.target.value)}
            className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={enviar} disabled={loading || descripcion.trim().length < 5} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Registrar
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

function CerrarModal({
  hallazgo,
  onClose,
  onCerrado,
}: {
  hallazgo: InventarioHallazgo;
  onClose: () => void;
  onCerrado: () => void;
}) {
  const [estado, setEstado] = useState<'cerrado_con_causa' | 'cerrado_sin_causa'>('cerrado_con_causa');
  const [conclusion, setConclusion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const enviar = async () => {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/inventario/hallazgos/${hallazgo.id}/cerrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado, conclusion }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'Error al cerrar el hallazgo');
      return;
    }
    onCerrado();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 max-w-lg w-full space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display font-semibold text-rtb-navy">Cerrar {hallazgo.folio}</h2>
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
          <label className="text-xs font-semibold text-rtb-navy-mid">¿Se identificó la causa?</label>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as typeof estado)}
            className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
          >
            <option value="cerrado_con_causa">Sí — se identificó la causa</option>
            <option value="cerrado_sin_causa">No — se cierra sin causa</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-rtb-navy-mid">Conclusión</label>
          <textarea
            value={conclusion}
            onChange={(e) => setConclusion(e.target.value)}
            rows={3}
            className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={enviar} disabled={loading || conclusion.trim().length < 5} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Cerrar hallazgo
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
