'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Boxes, ClipboardCheck, Loader2, MapPinOff, Search } from 'lucide-react';
import type { InventarioExistencia, Producto } from '@/types/inventario';

type FilaExistencia = InventarioExistencia & { productos: Pick<Producto, 'codigo_interno' | 'nombre' | 'sku'> | null };

interface Kpis {
  sinUbicacion: number;
  sinCosto: number;
  negativas: number;
  nuncaContadas: number;
}

type Filtro = 'todas' | 'sin_ubicacion' | 'sin_costo' | 'negativa' | 'nunca_contada';

const FILTRO_LABELS: Record<Filtro, string> = {
  todas: 'Todas',
  sin_ubicacion: 'Sin ubicación',
  sin_costo: 'Sin costo',
  negativa: 'Teórico negativo',
  nunca_contada: 'Nunca contada',
};

export function ExistenciasExplorer({ initialData, kpis }: { initialData: FilaExistencia[]; kpis: Kpis }) {
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [q, setQ] = useState('');
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);

  const buscar = useCallback(async (f: Filtro) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (f !== 'todas') params.set('filtro', f);
    const res = await fetch(`/api/inventario/existencias?${params.toString()}`);
    const json = await res.json();
    if (res.ok) setData(json.data ?? []);
    setLoading(false);
  }, []);

  const aplicarFiltro = (f: Filtro) => {
    setFiltro(f);
    void buscar(f);
  };

  const filtrados = q.trim()
    ? data.filter((e) => {
        const texto = `${e.productos?.codigo_interno ?? ''} ${e.productos?.nombre ?? ''} ${e.productos?.sku ?? ''}`.toLowerCase();
        return texto.includes(q.trim().toLowerCase());
      })
    : data;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
            <Boxes className="w-6 h-6" /> Existencias de Inventario
          </h1>
          <p className="text-muted-foreground mt-1">Teórica, física y apartada por producto y ubicación</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/inventario/conteos">
            <ClipboardCheck className="w-4 h-4 mr-2" /> Conteos físicos
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Sin ubicación"
          valor={kpis.sinUbicacion}
          borde="border-l-destructive"
          activo={filtro === 'sin_ubicacion'}
          onClick={() => aplicarFiltro('sin_ubicacion')}
        />
        <KpiCard
          label="Sin costo"
          valor={kpis.sinCosto}
          borde="border-l-destructive"
          activo={filtro === 'sin_costo'}
          onClick={() => aplicarFiltro('sin_costo')}
        />
        <KpiCard
          label="Teórico negativo"
          valor={kpis.negativas}
          borde="border-l-destructive"
          activo={filtro === 'negativa'}
          onClick={() => aplicarFiltro('negativa')}
        />
        <KpiCard
          label="Nunca contada"
          valor={kpis.nuncaContadas}
          borde="border-l-rtb-gold"
          activo={filtro === 'nunca_contada'}
          onClick={() => aplicarFiltro('nunca_contada')}
        />
      </div>

      <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 pt-4">
          <div className="flex gap-1">
            {(Object.keys(FILTRO_LABELS) as Filtro[]).map((f) => (
              <button
                key={f}
                onClick={() => aplicarFiltro(f)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  filtro === f ? 'border-rtb-teal text-rtb-teal' : 'border-transparent text-muted-foreground hover:text-rtb-navy'
                }`}
              >
                {FILTRO_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              placeholder="Buscar por código, nombre o SKU..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full pl-10 text-sm border border-border rounded-lg px-3 py-2"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-rtb-teal animate-spin" />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-rtb-navy text-white">
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Producto</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Ubicación</th>
                <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider">Teórica</th>
                <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider">Física</th>
                <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider">Disponible</th>
                <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider">Valor teórico</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((e, i) => (
                <tr key={e.id} className={`border-b border-border/50 ${i % 2 === 1 ? 'bg-rtb-surface/40' : ''}`}>
                  <td className="py-3 px-4">
                    <p className="text-sm font-medium text-rtb-navy">{e.productos?.nombre ?? '—'}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{e.productos?.codigo_interno}</p>
                  </td>
                  <td className="py-3 px-4 text-sm">
                    {e.ubicacion_id ? (
                      <span className="tabular-nums">{e.ubicacion_id.slice(0, 8)}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-destructive text-xs">
                        <MapPinOff className="w-3.5 h-3.5" /> Sin ubicación
                      </span>
                    )}
                  </td>
                  <td className={`py-3 px-4 text-right tabular-nums text-sm ${Number(e.cantidad_teorica) < 0 ? 'text-destructive font-medium' : ''}`}>
                    {Number(e.cantidad_teorica).toLocaleString('es-MX')}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-sm">
                    {e.cantidad_fisica != null ? Number(e.cantidad_fisica).toLocaleString('es-MX') : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-sm font-medium">{Number(e.cantidad_disponible).toLocaleString('es-MX')}</td>
                  <td className="py-3 px-4 text-right tabular-nums text-sm">
                    {e.costo_promedio != null ? `$${Number(e.valor_teorico).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : (
                      <span className="text-destructive">Sin costo</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground text-sm">
                    Sin existencias que coincidan con el filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  valor,
  borde,
  activo,
  onClick,
}: {
  label: string;
  valor: number;
  borde: string;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left bg-white rounded-xl p-4 border-l-4 ${borde} transition-all ${activo ? 'ring-2 ring-rtb-teal' : ''}`}
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-display font-bold mt-1 tabular-nums ${valor > 0 ? 'text-destructive' : 'text-rtb-navy'}`}>{valor}</p>
    </button>
  );
}
