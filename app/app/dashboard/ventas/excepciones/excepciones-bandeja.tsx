'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Actualizando } from '@/components/ui/actualizando';
import { MotivoDialog } from '@/components/inventario/motivo-dialog';
import { Paginacion } from '@/components/ui/paginacion';
import { formatearMoneda } from '@/lib/ventas/validaciones';
import { ROLES_AUTORIZAN } from '@/lib/ventas/permisos';
import type { UserRole } from '@/types/database';
import { Loader2 } from 'lucide-react';

const ESTADO_LABELS: Record<'pendiente' | 'autorizada' | 'rechazada' | 'cancelada', string> = {
  pendiente: 'Pendiente',
  autorizada: 'Autorizada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
};

// Mismo patrón que autorizaciones-bandeja.tsx (misma regla de negocio:
// quien resuelve nunca puede ser quien solicitó — cliente_exc_no_autoaprobacion_chk
// + la comprobación de identidad en /api/ventas/excepciones/[id]/resolver).
export function ExcepcionesBandeja({
  excepciones,
  count: countInicial,
  pageSize,
  rol,
  userId,
  estadoInicial,
}: {
  excepciones: any[];
  count: number;
  pageSize: number;
  rol: UserRole;
  userId: string;
  estadoInicial?: string;
}) {
  const router = useRouter();
  const [refrescando, iniciarRefresco] = useTransition();
  const puedeResolver = (ROLES_AUTORIZAN as readonly string[]).includes(rol);
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const esEstadoValido = (v?: string): v is keyof typeof ESTADO_LABELS => !!v && v in ESTADO_LABELS;

  const [estadoFiltro, setEstadoFiltro] = useState<'all' | keyof typeof ESTADO_LABELS>(
    esEstadoValido(estadoInicial) ? estadoInicial : 'all'
  );
  const [data, setData] = useState(excepciones);
  const [count, setCount] = useState(countInicial);
  const [page, setPage] = useState(1);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setData(excepciones);
    setCount(countInicial);
    setPage(1);
  }, [excepciones, countInicial]);

  const cargar = useCallback(async (p: number, estado: typeof estadoFiltro) => {
    setCargando(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (estado !== 'all') params.set('estado', estado);
      const res = await fetch(`/api/ventas/excepciones?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setData(json.data ?? []);
        setCount(json.count ?? 0);
        setPage(p);
      }
    } finally {
      setCargando(false);
    }
  }, []);

  const cambiarFiltro = (estado: typeof estadoFiltro) => {
    setEstadoFiltro(estado);
    void cargar(1, estado);
  };

  const aprobar = async (id: string) => {
    setError(null);
    setAprobandoId(id);
    const res = await fetch(`/api/ventas/excepciones/${id}/resolver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ decision: 'aprobar' }),
    });
    const json = await res.json().catch(() => ({}));
    setAprobandoId(null);
    if (!res.ok) {
      setError(json?.error ?? 'No se pudo aprobar.');
      return;
    }
    iniciarRefresco(() => router.refresh());
  };

  const rechazar = (id: string) => async (comentario: string) => {
    const res = await fetch(`/api/ventas/excepciones/${id}/resolver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ decision: 'rechazar', comentario_resolucion: comentario }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json?.error ?? 'No se pudo rechazar.');
      return false;
    }
    iniciarRefresco(() => router.refresh());
    return true;
  };

  return (
    <div className="space-y-4">
      <Actualizando activo={refrescando} />
      {error && <p className="text-sm text-destructive">{error}</p>}

      <select
        value={estadoFiltro}
        onChange={(e) => cambiarFiltro(e.target.value as typeof estadoFiltro)}
        className="text-sm border border-border rounded-lg px-3 py-2 bg-white"
      >
        <option value="all">Todos los estados</option>
        {(Object.keys(ESTADO_LABELS) as (keyof typeof ESTADO_LABELS)[]).map((e) => (
          <option key={e} value={e}>
            {ESTADO_LABELS[e]}
          </option>
        ))}
      </select>

      <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
        {cargando ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-rtb-teal animate-spin" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-rtb-navy text-white">
                <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Cliente</th>
                <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider">Monto máximo</th>
                <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Vigencia</th>
                <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Motivo</th>
                <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Estado</th>
                {puedeResolver && <th className="w-48" />}
              </tr>
            </thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id} className="border-b border-border/50">
                  <td className="py-2 px-3">
                    <Link href={`/dashboard/entidades/${e.entidad_id}`} className="text-rtb-teal hover:underline">
                      {e.entidades?.nombre_comercial ?? e.entidades?.nombre_legal ?? e.entidad_id}
                    </Link>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-xs">{formatearMoneda(e.monto_maximo)}</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">
                    {e.vigente_hasta ? new Date(e.vigente_hasta).toLocaleDateString('es-MX') : '—'}
                  </td>
                  <td className="py-2 px-3 text-xs text-muted-foreground truncate max-w-xs">{e.motivo}</td>
                  <td className="py-2 px-3 text-xs">{ESTADO_LABELS[e.estado as keyof typeof ESTADO_LABELS] ?? e.estado}</td>
                  {puedeResolver && (
                    <td className="py-2 px-3">
                      {e.estado === 'pendiente' && e.solicitante_id !== userId && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => aprobar(e.id)} disabled={aprobandoId === e.id}>
                            {aprobandoId === e.id && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                            Aprobar
                          </Button>
                          <MotivoDialog
                            trigger={
                              <Button size="sm" variant="outline" className="text-destructive">
                                Rechazar
                              </Button>
                            }
                            titulo="Rechazar excepción"
                            confirmLabel="Rechazar"
                            destructivo
                            onConfirm={rechazar(e.id)}
                          />
                        </div>
                      )}
                      {e.estado === 'pendiente' && e.solicitante_id === userId && (
                        <span className="text-xs text-muted-foreground">No puedes resolver tu propia solicitud</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                    Sin excepciones registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        <Paginacion page={page} pageSize={pageSize} count={count} onPageChange={(p) => cargar(p, estadoFiltro)} disabled={cargando} />
      </div>
    </div>
  );
}
