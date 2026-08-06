'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/rbac/hooks';
import { Button } from '@/components/ui/button';
import { CAMBIO_CONTROLADO_LABELS, SOLICITUD_ESTADO_LABELS } from '@/lib/entidades/config';
import type { SolicitudCambio, SolicitudEstado } from '@/types/entidades';
import { AlertCircle, Check, FileCheck2, Loader2, X } from 'lucide-react';

type Fila = SolicitudCambio & { entidad_nombre: string | null };

// Gap de UI (contexto/AUDITORIA_QA_ROLES_2026-08-06.md §4): había una
// solicitud pendiente real de esta campaña (bloqueo temporal de
// "QA Proveedor Uno") sin ninguna pantalla donde dirección/super_admin
// pudiera verla ni resolverla — POST .../resolver ya existía. Reservada
// a super_admin/direccion (MATRIZ.solicitudes_cambio.select,
// lib/entidades/permisos.ts); el sidebar sólo la muestra a esos roles.
export default function SolicitudesPage() {
  const { role, user } = useAuth();
  const [data, setData] = useState<Fila[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<SolicitudEstado>('pendiente');
  const [rechazando, setRechazando] = useState<Fila | null>(null);
  const [comentario, setComentario] = useState('');
  const [accionando, setAccionando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/solicitudes-cambio?estado=${filtro}`);
    const data = await res.json().catch(() => ({}));
    setData(data.data ?? []);
    setLoading(false);
  }, [filtro]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const resolver = async (id: string, decision: 'aprobar' | 'rechazar', comentario_resolucion?: string) => {
    setError(null);
    setAccionando(id);
    const res = await fetch(`/api/solicitudes-cambio/${id}/resolver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, comentario_resolucion }),
    });
    const data = await res.json().catch(() => ({}));
    setAccionando(null);
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo resolver la solicitud.');
      return;
    }
    setRechazando(null);
    setComentario('');
    void cargar();
  };

  if (role && role !== 'super_admin' && role !== 'direccion') {
    return <p className="text-sm text-muted-foreground">Sólo dirección y super_admin resuelven solicitudes de cambio.</p>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
          <FileCheck2 className="w-6 h-6" /> Solicitudes de cambio
        </h1>
        <p className="text-muted-foreground mt-1">P05 · RFC, razón social, crédito, condición de proveedor y bloqueos controlados</p>
      </div>

      <div className="flex gap-2">
        {(['pendiente', 'aprobada', 'rechazada'] as const).map((f) => (
          <Button key={f} size="sm" variant={filtro === f ? 'default' : 'outline'} onClick={() => setFiltro(f)}>
            {SOLICITUD_ESTADO_LABELS[f]}
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
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Entidad</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Tipo de cambio</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Cambios propuestos</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Motivo</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((s, i) => (
                <tr key={s.id} className={`border-b border-border/50 ${i % 2 === 1 ? 'bg-rtb-surface/40' : ''}`}>
                  <td className="py-3 px-4 text-sm font-medium text-rtb-navy">{s.entidad_nombre ?? '—'}</td>
                  <td className="py-3 px-4 text-xs">{CAMBIO_CONTROLADO_LABELS[s.tipo_cambio] ?? s.tipo_cambio}</td>
                  <td className="py-3 px-4 text-xs text-muted-foreground tabular-nums">
                    {Object.entries(s.cambios)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(', ')}
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground max-w-xs truncate">{s.motivo}</td>
                  <td className="py-3 px-4">
                    {s.estado === 'pendiente' && s.solicitante_id !== user?.id && (
                      <div className="flex gap-2">
                        <Button size="sm" disabled={accionando === s.id} onClick={() => resolver(s.id, 'aprobar')} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
                          <Check className="w-3.5 h-3.5 mr-1" /> Aprobar
                        </Button>
                        <Button size="sm" variant="outline" disabled={accionando === s.id} onClick={() => setRechazando(s)} className="text-destructive">
                          Rechazar
                        </Button>
                      </div>
                    )}
                    {s.estado === 'pendiente' && s.solicitante_id === user?.id && (
                      <span className="text-xs text-muted-foreground">Solicitada por ti</span>
                    )}
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-muted-foreground text-sm">
                    Sin solicitudes en este estado.
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
              <h2 className="text-lg font-display font-semibold text-rtb-navy">Rechazar solicitud</h2>
              <button onClick={() => setRechazando(null)}>
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Comentario del rechazo (obligatorio)"
              rows={3}
              className="w-full text-sm border border-border rounded-lg px-3 py-2"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => resolver(rechazando.id, 'rechazar', comentario)}
                disabled={!comentario.trim() || accionando === rechazando.id}
                className="bg-destructive hover:bg-destructive/90 text-white"
              >
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
