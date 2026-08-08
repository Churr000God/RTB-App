'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Actualizando } from '@/components/ui/actualizando';
import { MotivoDialog } from '@/components/inventario/motivo-dialog';
import { Paginacion } from '@/components/ui/paginacion';
import { VENTAS_AUTORIZACION_ESTADO_LABELS, VENTAS_AUTORIZACION_TIPO_LABELS } from '@/lib/ventas/config';
import { ROLES_AUTORIZAN } from '@/lib/ventas/permisos';
import { VENTAS_AUTORIZACION_ESTADOS } from '@/types/ventas';
import type { UserRole } from '@/types/database';
import { Loader2 } from 'lucide-react';

// autorizaciones/count llegan como prop del Server Component (page.tsx) —
// primera página. Aprobar/rechazar terminan en router.refresh() (relee esa
// misma primera página en el servidor); cambiar de página o de filtro es
// un fetch propio a /api/ventas/autorizaciones, sin recargar el árbol de
// Server Components completo. El useEffect de abajo resincroniza el
// estado local cuando router.refresh() trae props nuevas — sin él, el
// estado de cliente (congelado en el useState inicial) nunca vería la fila
// recién resuelta.
export function AutorizacionesBandeja({
  autorizaciones,
  count: countInicial,
  pageSize,
  rol,
  userId,
  estadoInicial,
}: {
  autorizaciones: any[];
  count: number;
  pageSize: number;
  rol: UserRole;
  userId: string;
  /** Filtro inicial vía ?estado= — así el contador "Autorizaciones
   *  pendientes" del tablero (037) llega ya filtrado, no sólo a la
   *  bandeja sin filtrar. */
  estadoInicial?: string;
}) {
  const router = useRouter();
  const [refrescando, iniciarRefresco] = useTransition();
  const puedeResolver = (ROLES_AUTORIZAN as readonly string[]).includes(rol);
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const esEstadoValido = (v?: string): v is (typeof VENTAS_AUTORIZACION_ESTADOS)[number] =>
    !!v && (VENTAS_AUTORIZACION_ESTADOS as readonly string[]).includes(v);

  const [estadoFiltro, setEstadoFiltro] = useState<'all' | (typeof VENTAS_AUTORIZACION_ESTADOS)[number]>(
    esEstadoValido(estadoInicial) ? estadoInicial : 'all'
  );
  const [data, setData] = useState(autorizaciones);
  const [count, setCount] = useState(countInicial);
  const [page, setPage] = useState(1);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setData(autorizaciones);
    setCount(countInicial);
    setPage(1);
  }, [autorizaciones, countInicial]);

  const cargar = useCallback(
    async (p: number, estado: typeof estadoFiltro) => {
      setCargando(true);
      try {
        const params = new URLSearchParams({ page: String(p) });
        if (estado !== 'all') params.set('estado', estado);
        const res = await fetch(`/api/ventas/autorizaciones?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          setData(json.data ?? []);
          setCount(json.count ?? 0);
          setPage(p);
        }
      } finally {
        setCargando(false);
      }
    },
    []
  );

  const cambiarFiltro = (estado: typeof estadoFiltro) => {
    setEstadoFiltro(estado);
    void cargar(1, estado);
  };

  const aprobar = async (id: string) => {
    setError(null);
    setAprobandoId(id);
    const res = await fetch(`/api/ventas/autorizaciones/${id}/resolver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ decision: 'aprobar' }),
    });
    const data = await res.json().catch(() => ({}));
    setAprobandoId(null);
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo aprobar.');
      return;
    }
    iniciarRefresco(() => router.refresh());
  };

  const rechazar = (id: string) => async (comentario: string) => {
    const res = await fetch(`/api/ventas/autorizaciones/${id}/resolver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ decision: 'rechazar', comentario_resolucion: comentario }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo rechazar.');
      return false;
    }
    iniciarRefresco(() => router.refresh());
    return true;
  };

  return (
    <div className="space-y-4">
      <Actualizando activo={refrescando} />
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* 043: el único productor de autorizaciones tipo excepcion_subtotal/
          duplicidad_confirmada era la pantalla de validación de PO,
          retirada al pasar la Vía B a nacer directo de la cotización. La
          bandeja y ventas_autorizacion_resolver() siguen intactas — vuelven
          a recibir solicitudes cuando se construya la Vía A (PO que llega
          DESPUÉS de una NR). Aviso siempre visible, no sólo en vacío: las
          filas que se ven ahora son historial, no indican que el flujo
          siga generando nuevas. */}
      <div className="p-3 bg-rtb-surface/60 rounded-lg text-sm text-muted-foreground">
        Las excepciones de PO (subtotal coincidente, duplicidad) dejaron de generarse aquí — vuelven cuando se
        reconstruya la Vía A del ciclo de Órdenes de Compra. Lo que se ve abajo es historial.
      </div>

      <select
        value={estadoFiltro}
        onChange={(e) => cambiarFiltro(e.target.value as typeof estadoFiltro)}
        className="text-sm border border-border rounded-lg px-3 py-2 bg-white"
      >
        <option value="all">Todos los estados</option>
        {VENTAS_AUTORIZACION_ESTADOS.map((e) => (
          <option key={e} value={e}>
            {VENTAS_AUTORIZACION_ESTADO_LABELS[e]}
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
                <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Tipo</th>
                <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Documento</th>
                <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Motivo</th>
                <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Estado</th>
                {puedeResolver && <th className="w-48" />}
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id} className="border-b border-border/50">
                  <td className="py-2 px-3">{VENTAS_AUTORIZACION_TIPO_LABELS[a.tipo as keyof typeof VENTAS_AUTORIZACION_TIPO_LABELS]}</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">
                    {a.documento_tipo} · {a.documento_id}
                  </td>
                  <td className="py-2 px-3 text-xs text-muted-foreground truncate max-w-xs">{a.motivo}</td>
                  <td className="py-2 px-3 text-xs">{VENTAS_AUTORIZACION_ESTADO_LABELS[a.estado as keyof typeof VENTAS_AUTORIZACION_ESTADO_LABELS]}</td>
                  {puedeResolver && (
                    <td className="py-2 px-3">
                      {a.estado === 'pendiente' && a.solicitante_id !== userId && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => aprobar(a.id)} disabled={aprobandoId === a.id}>
                            {aprobandoId === a.id && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                            Aprobar
                          </Button>
                          <MotivoDialog
                            trigger={
                              <Button size="sm" variant="outline" className="text-destructive">
                                Rechazar
                              </Button>
                            }
                            titulo="Rechazar autorización"
                            confirmLabel="Rechazar"
                            destructivo
                            onConfirm={rechazar(a.id)}
                          />
                        </div>
                      )}
                      {a.estado === 'pendiente' && a.solicitante_id === userId && (
                        <span className="text-xs text-muted-foreground">No puedes resolver tu propia solicitud</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">
                    Sin autorizaciones registradas.
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
