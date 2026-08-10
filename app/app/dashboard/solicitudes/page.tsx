'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/rbac/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Paginacion } from '@/components/ui/paginacion';
import { RangoFechas } from '@/components/ui/rango-fechas';
import { CAMBIO_CONTROLADO_LABELS, SOLICITUD_ESTADO_LABELS } from '@/lib/entidades/config';
import { CAMBIOS_CONTROLADOS } from '@/lib/entidades/schemas';
import { REGLAS_APROBACION, type CambioControlado } from '@/lib/entidades/permisos';
import { ROLE_LABELS } from '@/lib/rbac/config';
import type { SolicitudCambio, SolicitudEstado } from '@/types/entidades';
import { AlertCircle, Check, FileCheck2, Loader2, Search, X } from 'lucide-react';

type Fila = SolicitudCambio & { entidad_nombre: string | null; solicitante_nombre: string | null };

// Gap de UI (contexto/AUDITORIA_QA_ROLES_2026-08-06.md §4): había una
// solicitud pendiente real de esta campaña (bloqueo temporal de
// "QA Proveedor Uno") sin ninguna pantalla donde dirección/super_admin
// pudiera verla ni resolverla — POST .../resolver ya existía. Reservada
// a super_admin/direccion (MATRIZ.solicitudes_cambio.select,
// lib/entidades/permisos.ts); el sidebar sólo la muestra a esos roles.
//
// Búsqueda/filtros agregados después: 7 tipos de cambio muy distintos
// (fiscal, crédito, bloqueo, condición de proveedor) se mezclaban en una
// sola lista sin forma de aislar uno ni de saber quién lo pidió — filtros
// y query params construidos en lib/entidades/listado-solicitudes.ts, el
// mismo pivote anti-duplicación que ya usa Ventas para sus listados.
const PAGE_SIZE = 20;

export default function SolicitudesPage() {
  const { role, user } = useAuth();
  const [data, setData] = useState<Fila[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState<SolicitudEstado>('pendiente');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [tipoCambio, setTipoCambio] = useState<CambioControlado | ''>('');
  const [fechas, setFechas] = useState<{ desde: string | null; hasta: string | null }>({ desde: null, hasta: null });
  const [soloMias, setSoloMias] = useState(false);
  const [rechazando, setRechazando] = useState<Fila | null>(null);
  const [comentario, setComentario] = useState('');
  const [accionando, setAccionando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounce simple — el resto del repo tampoco usa una librería para esto.
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const cargar = useCallback(
    async (p: number = 1) => {
      setLoading(true);
      const params = new URLSearchParams({ estado, page: String(p) });
      if (qDebounced) params.set('q', qDebounced);
      if (tipoCambio) params.set('tipo_cambio', tipoCambio);
      if (fechas.desde) params.set('desde', fechas.desde);
      if (fechas.hasta) params.set('hasta', fechas.hasta);
      if (soloMias) params.set('solo_mias', '1');
      const res = await fetch(`/api/solicitudes-cambio?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      setData(data.data ?? []);
      setCount(data.count ?? 0);
      setPage(p);
      setLoading(false);
    },
    [estado, qDebounced, tipoCambio, fechas, soloMias]
  );

  useEffect(() => {
    void cargar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, qDebounced, tipoCambio, fechas, soloMias]);

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
    void cargar(page);
  };

  // El servidor ya decide con REGLAS_APROBACION[tipo].aprueba (POST
  // .../resolver) — antes el botón se mostraba a cualquiera de los dos
  // roles con acceso a esta pantalla (super_admin/direccion), así que
  // direccion podía intentar aprobar un rfc/razón_social/tipo_persona/
  // reactivación/bloqueo_temporal (aprueba: ['super_admin'] en los 5) y
  // llevarse un 403 en vez de nunca ver el botón. Aquí se espeja la misma
  // regla en cliente para que el botón sólo aparezca cuando el intento
  // fuera a funcionar de verdad.
  const puedeResolverTipo = (tipo: CambioControlado) => (role ? (REGLAS_APROBACION[tipo].aprueba?.includes(role) ?? false) : false);

  if (role && role !== 'super_admin' && role !== 'direccion') {
    return <p className="text-sm text-muted-foreground">Sólo dirección y super_admin resuelven solicitudes de cambio.</p>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
          <FileCheck2 className="w-6 h-6" /> Solicitudes de cambio
        </h1>
        <p className="text-muted-foreground mt-1">P05 · RFC, razón social, crédito, condición de proveedor y bloqueos controlados</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['pendiente', 'aprobada', 'rechazada'] as const).map((f) => (
          <Button key={f} size="sm" variant={estado === f ? 'default' : 'outline'} onClick={() => setEstado(f)}>
            {SOLICITUD_ESTADO_LABELS[f]}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por entidad, RFC, siglas o motivo..."
            className="pl-9"
          />
        </div>
        <select
          value={tipoCambio}
          onChange={(e) => setTipoCambio(e.target.value as CambioControlado | '')}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-white"
        >
          <option value="">Todos los tipos</option>
          {CAMBIOS_CONTROLADOS.map((t) => (
            <option key={t} value={t}>
              {CAMBIO_CONTROLADO_LABELS[t] ?? t}
            </option>
          ))}
        </select>
        <RangoFechas desde={fechas.desde} hasta={fechas.hasta} onChange={setFechas} placeholder="Cualquier fecha" />
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground px-1">
          <input type="checkbox" checked={soloMias} onChange={(e) => setSoloMias(e.target.checked)} className="accent-rtb-teal" />
          Sólo mías
        </label>
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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-rtb-navy text-white">
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Entidad</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Tipo de cambio</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Cambios propuestos</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Motivo</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Solicitante</th>
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
                    <td className="py-3 px-4 text-xs text-muted-foreground">{s.solicitante_nombre ?? '—'}</td>
                    <td className="py-3 px-4">
                      {s.estado === 'pendiente' && s.solicitante_id === user?.id && (
                        <span className="text-xs text-muted-foreground">Solicitada por ti</span>
                      )}
                      {s.estado === 'pendiente' && s.solicitante_id !== user?.id && puedeResolverTipo(s.tipo_cambio as CambioControlado) && (
                        <div className="flex gap-2">
                          <Button size="sm" disabled={accionando === s.id} onClick={() => resolver(s.id, 'aprobar')} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
                            <Check className="w-3.5 h-3.5 mr-1" /> Aprobar
                          </Button>
                          <Button size="sm" variant="outline" disabled={accionando === s.id} onClick={() => setRechazando(s)} className="text-destructive">
                            Rechazar
                          </Button>
                        </div>
                      )}
                      {s.estado === 'pendiente' && s.solicitante_id !== user?.id && !puedeResolverTipo(s.tipo_cambio as CambioControlado) && (
                        <span className="text-xs text-muted-foreground">
                          Sólo lectura — aprueba{' '}
                          {(REGLAS_APROBACION[s.tipo_cambio as CambioControlado].aprueba ?? []).map((r) => ROLE_LABELS[r]).join(', ') || '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-muted-foreground text-sm">
                      Sin solicitudes que coincidan con estos filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {!loading && <Paginacion page={page} pageSize={PAGE_SIZE} count={count} onPageChange={(p) => void cargar(p)} />}
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
