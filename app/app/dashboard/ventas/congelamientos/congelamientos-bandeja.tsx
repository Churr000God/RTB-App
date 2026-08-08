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

const ESTADO_LABELS: Record<'activo' | 'liberado', string> = { activo: 'Activo', liberado: 'Liberado' };

// Mismo patrón que autorizaciones-bandeja.tsx: props son la primera página
// (Server Component), cambiar de filtro/página es un fetch propio a
// /api/ventas/congelamientos; liberar termina en router.refresh(). Antes
// de esta pantalla no existía ninguna forma de LIBERAR un congelamiento
// desde la UI — el POST .../[id]/liberar estaba huérfano.
export function CongelamientosBandeja({
  congelamientos,
  count: countInicial,
  pageSize,
  rol,
  estadoInicial,
}: {
  congelamientos: any[];
  count: number;
  pageSize: number;
  rol: UserRole;
  estadoInicial?: string;
}) {
  const router = useRouter();
  const [refrescando, iniciarRefresco] = useTransition();
  const puedeLiberar = (ROLES_AUTORIZAN as readonly string[]).includes(rol);
  const [error, setError] = useState<string | null>(null);

  const esEstadoValido = (v?: string): v is keyof typeof ESTADO_LABELS => !!v && v in ESTADO_LABELS;

  const [estadoFiltro, setEstadoFiltro] = useState<'all' | keyof typeof ESTADO_LABELS>(
    esEstadoValido(estadoInicial) ? estadoInicial : 'all'
  );
  const [data, setData] = useState(congelamientos);
  const [count, setCount] = useState(countInicial);
  const [page, setPage] = useState(1);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setData(congelamientos);
    setCount(countInicial);
    setPage(1);
  }, [congelamientos, countInicial]);

  const cargar = useCallback(async (p: number, estado: typeof estadoFiltro) => {
    setCargando(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (estado !== 'all') params.set('estado', estado);
      const res = await fetch(`/api/ventas/congelamientos?${params.toString()}`, { cache: 'no-store' });
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

  const liberar = (id: string) => async (motivo: string) => {
    setError(null);
    const res = await fetch(`/api/ventas/congelamientos/${id}/liberar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ motivo_liberacion: motivo }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json?.error ?? 'No se pudo liberar el congelamiento.');
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
                <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Motivo</th>
                <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider">Saldo origen</th>
                <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Estado</th>
                <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Congelado</th>
                {puedeLiberar && <th className="w-32" />}
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-b border-border/50">
                  <td className="py-2 px-3">
                    <Link href={`/dashboard/entidades/${c.entidad_id}`} className="text-rtb-teal hover:underline">
                      {c.entidades?.nombre_comercial ?? c.entidades?.nombre_legal ?? c.entidad_id}
                    </Link>
                  </td>
                  <td className="py-2 px-3 text-xs text-muted-foreground truncate max-w-xs">{c.motivo}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-xs">
                    {c.saldo_origen != null ? formatearMoneda(c.saldo_origen) : '—'}
                  </td>
                  <td className="py-2 px-3 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        c.estado === 'activo' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {ESTADO_LABELS[c.estado as keyof typeof ESTADO_LABELS] ?? c.estado}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">
                    {c.congelado_at ? new Date(c.congelado_at).toLocaleDateString('es-MX') : '—'}
                  </td>
                  {puedeLiberar && (
                    <td className="py-2 px-3">
                      {c.estado === 'activo' && (
                        <MotivoDialog
                          trigger={
                            <Button size="sm" variant="outline">
                              Liberar
                            </Button>
                          }
                          titulo="Liberar congelamiento"
                          descripcion="El cliente vuelve a operar normalmente."
                          confirmLabel="Liberar"
                          onConfirm={liberar(c.id)}
                        />
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                    Sin congelamientos registrados.
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
