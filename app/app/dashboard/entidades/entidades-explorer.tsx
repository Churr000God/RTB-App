'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/rbac/hooks';
import { puede } from '@/lib/entidades/permisos';
import { ENTIDAD_TIPO_LABELS } from '@/lib/entidades/config';
import { EntidadEstadoBadge } from '@/components/entidades/estado-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Entidad, EntidadEstado, EntidadTipo } from '@/types/entidades';
import { ENTIDAD_ESTADOS, ENTIDAD_TIPOS } from '@/types/entidades';
import { Building2, Loader2, Plus, Search, Users } from 'lucide-react';

interface Kpis {
  total: number;
  clientesActivos: number;
  proveedoresActivos: number;
  bloqueadas: number;
}

interface Props {
  initialData: Entidad[];
  initialCount: number;
  pageSize: number;
  initialPendientes: string[];
  kpis: Kpis;
}

type Tab = 'todos' | EntidadTipo;

const AREA_RESPONSABLE: Record<EntidadTipo, string> = {
  cliente: 'Ventas',
  proveedor: 'Compras',
  mixta: 'Ventas / Compras',
};

export function EntidadesExplorer({ initialData, initialCount, pageSize, initialPendientes, kpis }: Props) {
  const { role } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('todos');
  const [estadoFiltro, setEstadoFiltro] = useState<'all' | EntidadEstado>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(initialData);
  const [count, setCount] = useState(initialCount);
  const [pendientes, setPendientes] = useState(new Set(initialPendientes));
  const [loading, setLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const buscar = useCallback(
    async (opts: { tab: Tab; estado: 'all' | EntidadEstado; q: string; page: number }) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (opts.tab !== 'todos') params.set('tipo', opts.tab);
        if (opts.estado !== 'all') params.set('estado', opts.estado);
        if (opts.q.trim()) params.set('q', opts.q.trim());
        params.set('page', String(opts.page));

        const res = await fetch(`/api/entidades?${params.toString()}`);
        const json = await res.json();
        if (res.ok) {
          setData(json.data ?? []);
          setCount(json.count ?? 0);
        }
      } catch {
        // el usuario ve la tabla sin actualizar; no hay estado de error
        // dedicado para no bloquear la búsqueda por un fallo transitorio.
      }
      setLoading(false);
    },
    []
  );

  const aplicarFiltro = (next: Partial<{ tab: Tab; estado: 'all' | EntidadEstado; q: string }>) => {
    const nextTab = next.tab ?? tab;
    const nextEstado = next.estado ?? estadoFiltro;
    const nextQ = next.q ?? q;
    setTab(nextTab);
    setEstadoFiltro(nextEstado);
    setQ(nextQ);
    setPage(1);
    void buscar({ tab: nextTab, estado: nextEstado, q: nextQ, page: 1 });
  };

  const cambiarPagina = (nueva: number) => {
    setPage(nueva);
    void buscar({ tab, estado: estadoFiltro, q, page: nueva });
  };

  const puedeCrear = useMemo(() => puede(role, 'entidades', 'insert'), [role]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
            <Building2 className="w-6 h-6" /> Gestión de Entidades
          </h1>
          <p className="text-muted-foreground mt-1">Clientes, proveedores y entidades mixtas del ecosistema RTB</p>
        </div>
        {puedeCrear && (
          <Button asChild className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            <Link href="/dashboard/entidades/nueva">
              <Plus className="w-4 h-4 mr-2" /> Nueva Entidad
            </Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total entidades" valor={kpis.total} borde="border-l-rtb-teal" />
        <KpiCard label="Clientes activos" valor={kpis.clientesActivos} borde="border-l-rtb-teal" />
        <KpiCard label="Proveedores activos" valor={kpis.proveedoresActivos} borde="border-l-rtb-teal" />
        <KpiCard
          label="Bloqueadas"
          valor={kpis.bloqueadas}
          borde="border-l-rtb-gold"
          valorClassName="text-destructive"
          nota={kpis.bloqueadas > 0 ? 'Requieren revisión' : undefined}
        />
      </div>

      <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 pt-4">
          <div className="flex gap-1">
            {(['todos', ...ENTIDAD_TIPOS] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => aplicarFiltro({ tab: t })}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === t
                    ? 'border-rtb-teal text-rtb-teal'
                    : 'border-transparent text-muted-foreground hover:text-rtb-navy'
                }`}
              >
                {t === 'todos' ? 'Todos' : ENTIDAD_TIPO_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por razón social, clave o RFC..."
              value={q}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && aplicarFiltro({ q })}
              className="pl-10"
            />
          </div>
          <select
            value={estadoFiltro}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              aplicarFiltro({ estado: e.target.value as 'all' | EntidadEstado })
            }
            className="text-sm border border-border rounded-lg px-3 py-2 bg-white"
          >
            <option value="all">Todos los estados</option>
            {ENTIDAD_ESTADOS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={() => aplicarFiltro({ q })}>
            <Search className="w-4 h-4 mr-2" /> Buscar
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-rtb-teal animate-spin" />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-rtb-navy text-white">
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Clave</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Razón social</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">RFC</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Tipo</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Estado</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Área responsable</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Alta</th>
              </tr>
            </thead>
            <tbody>
              {data.map((e, i) => (
                <tr
                  key={e.id}
                  onClick={() => router.push(`/dashboard/entidades/${e.id}`)}
                  className={`border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors ${
                    i % 2 === 1 ? 'bg-rtb-surface/40' : ''
                  }`}
                >
                  <td className="py-3 px-4 text-xs tabular-nums text-muted-foreground">{e.clave}</td>
                  <td className="py-3 px-4">
                    <p className="text-sm font-display font-medium text-rtb-navy">{e.nombre_legal}</p>
                    {e.nombre_comercial && <p className="text-xs text-muted-foreground">{e.nombre_comercial}</p>}
                  </td>
                  <td className="py-3 px-4 text-xs tabular-nums">{e.rfc ?? '—'}</td>
                  <td className="py-3 px-4">
                    <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rtb-surface text-rtb-navy-mid">
                      {ENTIDAD_TIPO_LABELS[e.tipo]}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <EntidadEstadoBadge estado={e.estado} pendiente={pendientes.has(e.id)} />
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground">{AREA_RESPONSABLE[e.tipo]}</td>
                  <td className="py-3 px-4 text-xs text-muted-foreground tabular-nums">
                    {new Date(e.created_at).toLocaleDateString('es-MX', { timeZone: 'UTC' })}
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-muted-foreground text-sm">
                    <Users className="w-6 h-6 mx-auto mb-2 opacity-40" />
                    No se encontraron entidades
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm text-muted-foreground">
          <span>
            {count === 0 ? 'Sin resultados' : `Mostrando ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, count)} de ${count}`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => cambiarPagina(page - 1)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => cambiarPagina(page + 1)}>
              Siguiente
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  valor,
  borde,
  valorClassName,
  nota,
}: {
  label: string;
  valor: number;
  borde: string;
  valorClassName?: string;
  nota?: string;
}) {
  return (
    <div className={`bg-white rounded-xl p-4 border-l-4 ${borde}`} style={{ boxShadow: 'var(--shadow-sm)' }}>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-display font-bold text-rtb-navy mt-1 tabular-nums ${valorClassName ?? ''}`}>{valor}</p>
      {nota && <p className="text-xs text-destructive mt-1">{nota}</p>}
    </div>
  );
}
