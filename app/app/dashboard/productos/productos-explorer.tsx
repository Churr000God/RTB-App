'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/rbac/hooks';
import { puede } from '@/lib/inventario/permisos';
import { ProductoEstadoBadge } from '@/components/inventario/estado-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ProductoConImagen, ProductoEstado } from '@/types/inventario';
import { PRODUCTO_ESTADOS } from '@/types/inventario';
import { PRODUCTO_ESTADO_LABELS } from '@/lib/inventario/config';
import { AlertTriangle, LayoutGrid, List, Loader2, MapPinOff, Package, Plus, Search } from 'lucide-react';

interface Kpis {
  total: number;
  activos: number;
  requierenDepuracion: number;
  sinUbicacion: number;
  sinCosto: number;
}

interface Props {
  initialData: ProductoConImagen[];
  initialCount: number;
  pageSize: number;
  kpis: Kpis;
}

type Vista = 'tabla' | 'galeria';
const VISTA_STORAGE_KEY = 'rtb.productos.vista';

export function ProductosExplorer({ initialData, initialCount, pageSize, kpis }: Props) {
  const { role } = useAuth();
  const router = useRouter();

  const [estadoFiltro, setEstadoFiltro] = useState<'all' | ProductoEstado>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(initialData);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  // 'tabla' fijo en el render inicial (servidor y cliente coinciden) — leer
  // localStorage en un useEffect, nunca en el inicializador de useState:
  // hacerlo ahí produciría un mismatch de hidratación (el HTML del
  // servidor no conoce el localStorage del navegador).
  const [vista, setVista] = useState<Vista>('tabla');
  useEffect(() => {
    const guardada = window.localStorage.getItem(VISTA_STORAGE_KEY);
    if (guardada === 'tabla' || guardada === 'galeria') setVista(guardada);
  }, []);
  const cambiarVista = (v: Vista) => {
    setVista(v);
    window.localStorage.setItem(VISTA_STORAGE_KEY, v);
  };

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const buscar = useCallback(async (opts: { estado: 'all' | ProductoEstado; q: string; page: number }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (opts.estado !== 'all') params.set('estado', opts.estado);
      if (opts.q.trim()) params.set('q', opts.q.trim());
      params.set('page', String(opts.page));

      const res = await fetch(`/api/productos?${params.toString()}`);
      const json = await res.json();
      if (res.ok) {
        setData(json.data ?? []);
        setCount(json.count ?? 0);
      }
    } catch {
      // sin estado de error dedicado; el usuario ve la tabla sin actualizar.
    }
    setLoading(false);
  }, []);

  const aplicarFiltro = (next: Partial<{ estado: 'all' | ProductoEstado; q: string }>) => {
    const nextEstado = next.estado ?? estadoFiltro;
    const nextQ = next.q ?? q;
    setEstadoFiltro(nextEstado);
    setQ(nextQ);
    setPage(1);
    void buscar({ estado: nextEstado, q: nextQ, page: 1 });
  };

  const cambiarPagina = (nueva: number) => {
    setPage(nueva);
    void buscar({ estado: estadoFiltro, q, page: nueva });
  };

  const puedeCrear = useMemo(() => puede(role, 'productos', 'insert'), [role]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
            <Package className="w-6 h-6" /> Catálogo de Productos
          </h1>
          <p className="text-muted-foreground mt-1">Productos, unidades de medida y costos — RTB-INV-01</p>
        </div>
        {puedeCrear && (
          <Button asChild className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            <Link href="/dashboard/productos/nuevo">
              <Plus className="w-4 h-4 mr-2" /> Nuevo Producto
            </Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Total productos" valor={kpis.total} borde="border-l-rtb-teal" />
        <KpiCard label="Activos" valor={kpis.activos} borde="border-l-rtb-teal" />
        <KpiCard
          label="Requieren depuración"
          valor={kpis.requierenDepuracion}
          borde="border-l-rtb-gold"
          valorClassName={kpis.requierenDepuracion > 0 ? 'text-accent' : undefined}
        />
        <KpiCard
          label="Sin ubicación"
          valor={kpis.sinUbicacion}
          borde="border-l-rtb-gold"
          valorClassName={kpis.sinUbicacion > 0 ? 'text-destructive' : undefined}
          nota={kpis.sinUbicacion > 0 ? 'Existe pero nadie lo puede localizar' : undefined}
        />
        <KpiCard
          label="Sin costo"
          valor={kpis.sinCosto}
          borde="border-l-rtb-gold"
          valorClassName={kpis.sinCosto > 0 ? 'text-destructive' : undefined}
        />
      </div>

      <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, código interno, SKU o marca..."
              value={q}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && aplicarFiltro({ q })}
              className="pl-10"
            />
          </div>
          <select
            value={estadoFiltro}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => aplicarFiltro({ estado: e.target.value as 'all' | ProductoEstado })}
            className="text-sm border border-border rounded-lg px-3 py-2 bg-white"
          >
            <option value="all">Todos los estados</option>
            {PRODUCTO_ESTADOS.map((e) => (
              <option key={e} value={e}>
                {PRODUCTO_ESTADO_LABELS[e]}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={() => aplicarFiltro({ q })}>
            <Search className="w-4 h-4 mr-2" /> Buscar
          </Button>
          <ToggleGroup
            type="single"
            value={vista}
            onValueChange={(v) => v && cambiarVista(v as Vista)}
            className="ml-auto border border-border rounded-lg p-0.5"
          >
            <ToggleGroupItem value="tabla" aria-label="Vista de tabla" size="sm">
              <List className="w-4 h-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="galeria" aria-label="Vista de galería" size="sm">
              <LayoutGrid className="w-4 h-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-rtb-teal animate-spin" />
          </div>
        ) : vista === 'tabla' ? (
          <TablaProductos data={data} onFila={(id) => router.push(`/dashboard/productos/${id}`)} />
        ) : (
          <GaleriaProductos data={data} onTarjeta={(id) => router.push(`/dashboard/productos/${id}`)} />
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

function TablaProductos({ data, onFila }: { data: ProductoConImagen[]; onFila: (id: string) => void }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="bg-rtb-navy text-white">
          <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Código interno</th>
          <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Producto</th>
          <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">SKU</th>
          <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Marca</th>
          <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Estado</th>
          <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Alta</th>
        </tr>
      </thead>
      <tbody>
        {data.map((p, i) => (
          <tr
            key={p.id}
            onClick={() => onFila(p.id)}
            className={`border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors ${i % 2 === 1 ? 'bg-rtb-surface/40' : ''}`}
          >
            <td className="py-3 px-4 text-xs tabular-nums text-muted-foreground">{p.codigo_interno}</td>
            <td className="py-3 px-4">
              <p className="text-sm font-display font-medium text-rtb-navy flex items-center gap-1.5">
                {p.nombre}
                {p.requiere_ubicacion === false && <MapPinOff className="w-3.5 h-3.5 text-muted-foreground" />}
              </p>
              {p.descripcion && <p className="text-xs text-muted-foreground truncate max-w-md">{p.descripcion}</p>}
            </td>
            <td className="py-3 px-4 text-xs tabular-nums">{p.sku ?? '—'}</td>
            <td className="py-3 px-4 text-xs">{p.producto_marcas?.nombre ?? '—'}</td>
            <td className="py-3 px-4">
              <ProductoEstadoBadge estado={p.estado} />
            </td>
            <td className="py-3 px-4 text-xs text-muted-foreground tabular-nums">
              {new Date(p.created_at).toLocaleDateString('es-MX', { timeZone: 'UTC' })}
            </td>
          </tr>
        ))}
        {data.length === 0 && (
          <tr>
            <td colSpan={6} className="py-10 text-center text-muted-foreground text-sm">
              <AlertTriangle className="w-6 h-6 mx-auto mb-2 opacity-40" />
              No se encontraron productos
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// Nota: <img>, no next/image — next.config.js tiene images.unoptimized=true
// (sin transformación real), así que next/image no aporta nada aquí y sólo
// añade superficie de fallo. Si algún día se quita unoptimized, hay que
// añadir remotePatterns con el host de Supabase Storage del proyecto.
function GaleriaProductos({ data, onTarjeta }: { data: ProductoConImagen[]; onTarjeta: (id: string) => void }) {
  if (data.length === 0) {
    return (
      <div className="py-10 text-center text-muted-foreground text-sm">
        <AlertTriangle className="w-6 h-6 mx-auto mb-2 opacity-40" />
        No se encontraron productos
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-4">
      {data.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onTarjeta(p.id)}
          className="text-left bg-rtb-surface/40 rounded-xl overflow-hidden hover:shadow-md transition-shadow"
        >
          <div className="aspect-square bg-rtb-surface flex items-center justify-center overflow-hidden">
            {p.imagen_principal ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.imagen_principal.url_miniatura ?? p.imagen_principal.url}
                alt={p.imagen_principal.descripcion ?? p.nombre}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <Package className="w-8 h-8 text-muted-foreground opacity-30" />
            )}
          </div>
          <div className="p-3">
            <p className="text-sm font-display font-medium text-rtb-navy truncate">{p.nombre}</p>
            <p className="text-xs text-muted-foreground tabular-nums truncate">{p.codigo_interno}</p>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs text-muted-foreground truncate">{p.producto_marcas?.nombre ?? '—'}</span>
              <ProductoEstadoBadge estado={p.estado} />
            </div>
          </div>
        </button>
      ))}
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
