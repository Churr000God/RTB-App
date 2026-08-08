'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Actualizando } from '@/components/ui/actualizando';
import { MotivoDialog } from '@/components/inventario/motivo-dialog';
import { Paginacion } from '@/components/ui/paginacion';
import { DevolucionEstadoBadge } from '@/components/ventas/estado-badge';
import { formatearMoneda } from '@/lib/ventas/validaciones';
import { ROLES_AUTORIZAN } from '@/lib/ventas/permisos';
import type { DevolucionEstado } from '@/types/ventas';
import type { UserRole } from '@/types/database';
import { Loader2 } from 'lucide-react';

// Mismo patrón que congelamientos-bandeja.tsx: props son la primera
// página (Server Component), cambiar de filtro/página es un fetch propio
// a /api/ventas/devoluciones; resolver termina en router.refresh().
export function DevolucionesBandeja({
  devoluciones,
  count: countInicial,
  pageSize,
  rol,
  estadoInicial,
}: {
  devoluciones: any[];
  count: number;
  pageSize: number;
  rol: UserRole;
  estadoInicial?: string;
}) {
  const router = useRouter();
  const [refrescando, iniciarRefresco] = useTransition();
  const puedeResolver = (ROLES_AUTORIZAN as readonly string[]).includes(rol);
  const [error, setError] = useState<string | null>(null);

  const esEstadoValido = (v?: string): v is DevolucionEstado => v === 'pendiente' || v === 'resuelta';

  const [estadoFiltro, setEstadoFiltro] = useState<'all' | DevolucionEstado>(
    esEstadoValido(estadoInicial) ? estadoInicial : 'all'
  );
  const [data, setData] = useState(devoluciones);
  const [count, setCount] = useState(countInicial);
  const [page, setPage] = useState(1);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setData(devoluciones);
    setCount(countInicial);
    setPage(1);
  }, [devoluciones, countInicial]);

  const cargar = useCallback(async (p: number, estado: typeof estadoFiltro) => {
    setCargando(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (estado !== 'all') params.set('estado', estado);
      const res = await fetch(`/api/ventas/devoluciones?${params.toString()}`, { cache: 'no-store' });
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

  const resolver = (id: string) => async (notas: string) => {
    setError(null);
    const res = await fetch(`/api/ventas/devoluciones/${id}/resolver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ notas }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json?.error ?? 'No se pudo resolver la devolución.');
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
        <option value="pendiente">Pendiente</option>
        <option value="resuelta">Resuelta</option>
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
                <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Folio</th>
                <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Cliente</th>
                <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Motivo</th>
                <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider">Valor entregado</th>
                <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Estado</th>
                <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Abierta</th>
                {puedeResolver && <th className="w-40" />}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id} className="border-b border-border/50">
                  <td className="py-2 px-3">
                    <Link href={`/dashboard/ventas/cotizaciones/${d.cotizacion_id}`} className="text-rtb-teal hover:underline">
                      {d.folio}
                    </Link>
                  </td>
                  <td className="py-2 px-3">
                    <Link href={`/dashboard/entidades/${d.entidad_id}`} className="text-rtb-teal hover:underline">
                      {d.entidades?.nombre_comercial ?? d.entidades?.nombre_legal ?? d.entidad_id}
                    </Link>
                  </td>
                  <td className="py-2 px-3 text-xs text-muted-foreground truncate max-w-xs">{d.motivo}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-xs">
                    {d.valor_entregado != null ? formatearMoneda(d.valor_entregado) : '—'}
                  </td>
                  <td className="py-2 px-3">
                    <DevolucionEstadoBadge estado={d.estado} />
                  </td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">
                    {d.created_at ? new Date(d.created_at).toLocaleDateString('es-MX') : '—'}
                  </td>
                  {puedeResolver && (
                    <td className="py-2 px-3">
                      {d.estado === 'pendiente' && (
                        <MotivoDialog
                          trigger={
                            <Button size="sm" variant="outline">
                              Resolver
                            </Button>
                          }
                          titulo="Resolver devolución"
                          descripcion="Describe cómo se cerró: qué se recibió, qué se acordó con el cliente."
                          placeholder="Ej. mercancía recibida en almacén, se acordó nota de crédito manual…"
                          confirmLabel="Resolver"
                          onConfirm={resolver(d.id)}
                        />
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground text-sm">
                    Sin devoluciones registradas.
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
