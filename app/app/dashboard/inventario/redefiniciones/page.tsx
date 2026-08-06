'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/rbac/hooks';
import { Button } from '@/components/ui/button';
import { AjusteEstadoBadge } from '@/components/inventario/estado-badge';
import { AJUSTE_ESTADO_LABELS } from '@/lib/inventario/config';
import type { ProductoUnidadRedefinicion, UnidadMedida } from '@/types/inventario';
import { AlertCircle, Check, Loader2, Repeat, X } from 'lucide-react';

type Fila = ProductoUnidadRedefinicion & { productos: { codigo_interno: string; nombre: string } | null };

// Gap de UI (contexto/AUDITORIA_QA_ROLES_2026-08-06.md §4): se podía
// *solicitar* una redefinición desde el detalle de producto
// (/dashboard/productos/[id]/redefinir-unidad), pero no había ninguna
// pantalla para verla, autorizarla ni aplicarla — POST .../resolver y
// .../aplicar existían y respondían, sin ningún botón que los llamara.
// Sólo super_admin/direccion pueden resolver/aplicar (mismas rutas), pero
// cualquier rol con acceso a inventario puede ver la cola.
export default function RedefinicionesPage() {
  const { role, user } = useAuth();
  const [data, setData] = useState<Fila[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'pendiente_autorizacion' | 'autorizado'>('pendiente_autorizacion');
  const [rechazando, setRechazando] = useState<Fila | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [accionando, setAccionando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const [resRedef, resUnid] = await Promise.all([
      fetch(`/api/redefiniciones-unidad?estado=${filtro}`),
      fetch('/api/catalogos/unidades-medida'),
    ]);
    const dataRedef = await resRedef.json().catch(() => ({}));
    const dataUnid = await resUnid.json().catch(() => ({}));
    setData(dataRedef.data ?? []);
    setUnidades(dataUnid.data ?? []);
    setLoading(false);
  }, [filtro]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const unidadDe = (id: string) => unidades.find((u) => u.id === id)?.clave ?? '—';
  const puedeResolver = role === 'super_admin' || role === 'direccion';

  const autorizar = async (f: Fila) => {
    setError(null);
    setAccionando(f.id);
    const res = await fetch(`/api/redefiniciones-unidad/${f.id}/resolver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'autorizar' }),
    });
    const data = await res.json().catch(() => ({}));
    setAccionando(null);
    if (!res.ok) return setError(data?.error ?? 'No se pudo autorizar.');
    void cargar();
  };

  const rechazar = async () => {
    if (!rechazando) return;
    setError(null);
    setAccionando(rechazando.id);
    const res = await fetch(`/api/redefiniciones-unidad/${rechazando.id}/resolver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'rechazar', motivo_rechazo: motivoRechazo }),
    });
    const data = await res.json().catch(() => ({}));
    setAccionando(null);
    if (!res.ok) return setError(data?.error ?? 'No se pudo rechazar.');
    setRechazando(null);
    setMotivoRechazo('');
    void cargar();
  };

  const aplicar = async (f: Fila) => {
    setError(null);
    setAccionando(f.id);
    const res = await fetch(`/api/redefiniciones-unidad/${f.id}/aplicar`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setAccionando(null);
    if (!res.ok) return setError(data?.error ?? 'No se pudo aplicar.');
    void cargar();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
          <Repeat className="w-6 h-6" /> Redefiniciones de unidad
        </h1>
        <p className="text-muted-foreground mt-1">
          Corrección de la causa #1 de pérdida medida en el diagnóstico real de RTB — unidad de medida mal definida.
        </p>
      </div>

      <div className="flex gap-2">
        {(['pendiente_autorizacion', 'autorizado'] as const).map((f) => (
          <Button key={f} size="sm" variant={filtro === f ? 'default' : 'outline'} onClick={() => setFiltro(f)}>
            {AJUSTE_ESTADO_LABELS[f]}
          </Button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

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
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Cambio de unidad</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Reconteo</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Estado</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((f, i) => (
                <tr key={f.id} className={`border-b border-border/50 ${i % 2 === 1 ? 'bg-rtb-surface/40' : ''}`}>
                  <td className="py-3 px-4 text-xs tabular-nums text-muted-foreground">{f.folio}</td>
                  <td className="py-3 px-4 text-sm">
                    <p className="font-medium text-rtb-navy">{f.productos?.nombre}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{f.productos?.codigo_interno}</p>
                  </td>
                  <td className="py-3 px-4 text-xs tabular-nums">
                    {f.contenido_anterior} {unidadDe(f.unidad_anterior_id)} → {f.contenido_nuevo} {unidadDe(f.unidad_nueva_id)}
                  </td>
                  <td className="py-3 px-4 text-xs">
                    {f.requiere_reconteo ? (f.conteo_id ? 'Vinculado' : 'Pendiente de vincular') : 'No exige'}
                  </td>
                  <td className="py-3 px-4">
                    <AjusteEstadoBadge estado={f.estado} />
                  </td>
                  <td className="py-3 px-4">
                    {puedeResolver && f.solicitante_id !== user?.id && f.estado === 'pendiente_autorizacion' && (
                      <div className="flex gap-2">
                        <Button size="sm" disabled={accionando === f.id} onClick={() => autorizar(f)} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
                          <Check className="w-3.5 h-3.5 mr-1" /> Autorizar
                        </Button>
                        <Button size="sm" variant="outline" disabled={accionando === f.id} onClick={() => setRechazando(f)} className="text-destructive">
                          Rechazar
                        </Button>
                      </div>
                    )}
                    {puedeResolver &&
                      f.estado === 'autorizado' &&
                      (!f.requiere_reconteo || f.conteo_id) && (
                        <Button size="sm" disabled={accionando === f.id} onClick={() => aplicar(f)} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
                          Aplicar al producto
                        </Button>
                      )}
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground text-sm">
                    Sin redefiniciones en este estado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {rechazando && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setRechazando(null)}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-semibold text-rtb-navy">Rechazar {rechazando.folio}</h2>
              <button onClick={() => setRechazando(null)}>
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <textarea
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              placeholder="Motivo del rechazo (obligatorio)"
              rows={3}
              className="w-full text-sm border border-border rounded-lg px-3 py-2"
            />
            <div className="flex gap-2">
              <Button onClick={rechazar} disabled={!motivoRechazo.trim() || accionando === rechazando.id} className="bg-destructive hover:bg-destructive/90 text-white">
                Rechazar
              </Button>
              <Button variant="outline" onClick={() => setRechazando(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
