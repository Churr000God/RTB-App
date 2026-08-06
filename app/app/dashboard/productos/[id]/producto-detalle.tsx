'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/rbac/hooks';
import { puede } from '@/lib/inventario/permisos';
import { ProductoEstadoBadge } from '@/components/inventario/estado-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, ArrowLeftRight, Loader2, Package, Pencil } from 'lucide-react';
import type {
  InventarioExistencia,
  InventarioMovimiento,
  Producto,
  ProductoCategoria,
  ProductoFamilia,
  UnidadMedida,
} from '@/types/inventario';
import { MOVIMIENTO_TIPO_LABELS } from '@/lib/inventario/config';

interface Props {
  producto: Producto;
  familia: ProductoFamilia | null;
  categoria: ProductoCategoria | null;
  unidad: UnidadMedida | null;
  existenciasIniciales: (InventarioExistencia & { ubicaciones_internas: { codigo: string; nombre: string } | null })[];
  costoVigente: number | null;
}

export function ProductoDetalle({ producto, familia, categoria, unidad, existenciasIniciales, costoVigente }: Props) {
  const { role } = useAuth();
  const puedeEditar = puede(role, 'productos', 'update');

  const totalTeorica = existenciasIniciales.reduce((acc, e) => acc + Number(e.cantidad_teorica), 0);
  const totalApartada = existenciasIniciales.reduce((acc, e) => acc + Number(e.cantidad_apartada), 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/productos">
          <ArrowLeft className="w-4 h-4 mr-1" /> Productos
        </Link>
      </Button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
            <Package className="w-6 h-6" /> {producto.nombre}
          </h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <span className="tabular-nums text-xs">{producto.codigo_interno}</span>
            {producto.sku && <span className="tabular-nums text-xs">SKU: {producto.sku}</span>}
            <ProductoEstadoBadge estado={producto.estado} />
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Existencia teórica" valor={totalTeorica.toLocaleString('es-MX')} borde="border-l-rtb-teal" />
        <KpiCard label="Apartada" valor={totalApartada.toLocaleString('es-MX')} borde="border-l-rtb-gold" />
        <KpiCard
          label="Costo vigente"
          valor={costoVigente != null ? `$${Number(costoVigente).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : 'Sin costo'}
          borde={costoVigente != null ? 'border-l-rtb-teal' : 'border-l-destructive'}
        />
        <KpiCard label="Unidad base" valor={unidad?.clave ?? '—'} borde="border-l-rtb-teal" />
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="existencias">Existencias</TabsTrigger>
          <TabsTrigger value="kardex">Kardex</TabsTrigger>
          <TabsTrigger value="costos">Costos</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralTab producto={producto} familia={familia} categoria={categoria} unidad={unidad} puedeEditar={puedeEditar} />
        </TabsContent>
        <TabsContent value="existencias">
          <ExistenciasTab existencias={existenciasIniciales} />
        </TabsContent>
        <TabsContent value="kardex">
          <KardexTab productoId={producto.id} />
        </TabsContent>
        <TabsContent value="costos">
          <CostosTab productoId={producto.id} costoVigente={costoVigente} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GeneralTab({
  producto,
  familia,
  categoria,
  unidad,
  puedeEditar,
}: {
  producto: Producto;
  familia: ProductoFamilia | null;
  categoria: ProductoCategoria | null;
  unidad: UnidadMedida | null;
  puedeEditar: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({
    nombre: producto.nombre,
    descripcion: producto.descripcion ?? '',
    marca: producto.marca ?? '',
    modelo: producto.modelo ?? '',
    observaciones: producto.observaciones ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/productos/${producto.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'Error al guardar');
      return;
    }
    setEditando(false);
    window.location.reload();
  };

  return (
    <div className="bg-white rounded-xl p-5 space-y-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-display font-semibold text-rtb-navy">Información general</h2>
        {puedeEditar && !editando && (
          <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
            <Pencil className="w-3.5 h-3.5 mr-1.5" /> Editar
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {editando ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo label="Nombre">
            <Input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
          </Campo>
          <Campo label="Marca">
            <Input value={form.marca} onChange={(e) => setForm((f) => ({ ...f, marca: e.target.value }))} />
          </Campo>
          <Campo label="Modelo">
            <Input value={form.modelo} onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))} />
          </Campo>
          <Campo label="Descripción" span2>
            <Input value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
          </Campo>
          <Campo label="Observaciones" span2>
            <Input value={form.observaciones} onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))} />
          </Campo>
          <div className="sm:col-span-2 flex gap-2">
            <Button onClick={guardar} disabled={loading} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar
            </Button>
            <Button variant="outline" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Dato label="Familia" valor={familia ? `${familia.clave} — ${familia.nombre}` : '—'} />
          <Dato label="Categoría" valor={categoria?.nombre ?? '—'} />
          <Dato label="Marca" valor={producto.marca ?? '—'} />
          <Dato label="Modelo" valor={producto.modelo ?? '—'} />
          <Dato
            label="Unidad de medida"
            valor={unidad ? `${unidad.clave} — ${unidad.nombre}` : '—'}
          />
          <Dato label="Contenido por unidad" valor={String(producto.contenido_por_unidad)} />
          <Dato label="Stock mínimo" valor={producto.stock_minimo != null ? String(producto.stock_minimo) : 'Sin definir'} />
          <Dato label="Stock máximo" valor={producto.stock_maximo != null ? String(producto.stock_maximo) : '—'} />
          <Dato label="Requiere ubicación" valor={producto.requiere_ubicacion ? 'Sí' : 'No'} />
          <Dato label="Estratégico" valor={producto.es_estrategico ? 'Sí' : 'No'} />
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Descripción</dt>
            <dd className="text-rtb-navy">{producto.descripcion ?? '—'}</dd>
          </div>
        </dl>
      )}

      <div className="pt-2 border-t border-border">
        <Link href={`/dashboard/productos/${producto.id}/redefinir-unidad`} className="text-xs text-rtb-teal hover:underline inline-flex items-center gap-1">
          <ArrowLeftRight className="w-3.5 h-3.5" /> Solicitar redefinición de unidad de medida
        </Link>
      </div>
    </div>
  );
}

function ExistenciasTab({
  existencias,
}: {
  existencias: (InventarioExistencia & { ubicaciones_internas: { codigo: string; nombre: string } | null })[];
}) {
  return (
    <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <table className="w-full">
        <thead>
          <tr className="bg-rtb-navy text-white">
            <th className="text-left py-2.5 px-4 text-xs font-semibold uppercase tracking-wider">Ubicación</th>
            <th className="text-right py-2.5 px-4 text-xs font-semibold uppercase tracking-wider">Teórica</th>
            <th className="text-right py-2.5 px-4 text-xs font-semibold uppercase tracking-wider">Física</th>
            <th className="text-right py-2.5 px-4 text-xs font-semibold uppercase tracking-wider">Apartada</th>
            <th className="text-right py-2.5 px-4 text-xs font-semibold uppercase tracking-wider">Disponible</th>
            <th className="text-right py-2.5 px-4 text-xs font-semibold uppercase tracking-wider">Costo prom.</th>
          </tr>
        </thead>
        <tbody>
          {existencias.map((e, i) => (
            <tr key={e.id} className={`border-b border-border/50 ${i % 2 === 1 ? 'bg-rtb-surface/40' : ''}`}>
              <td className="py-2.5 px-4 text-sm">
                {e.ubicaciones_internas ? `${e.ubicaciones_internas.codigo} — ${e.ubicaciones_internas.nombre}` : (
                  <span className="text-destructive">Sin ubicación</span>
                )}
              </td>
              <td className={`py-2.5 px-4 text-right tabular-nums text-sm ${Number(e.cantidad_teorica) < 0 ? 'text-destructive' : ''}`}>
                {Number(e.cantidad_teorica).toLocaleString('es-MX')}
              </td>
              <td className="py-2.5 px-4 text-right tabular-nums text-sm">
                {e.cantidad_fisica != null ? Number(e.cantidad_fisica).toLocaleString('es-MX') : <span className="text-muted-foreground">Nunca contada</span>}
              </td>
              <td className="py-2.5 px-4 text-right tabular-nums text-sm">{Number(e.cantidad_apartada).toLocaleString('es-MX')}</td>
              <td className="py-2.5 px-4 text-right tabular-nums text-sm font-medium">{Number(e.cantidad_disponible).toLocaleString('es-MX')}</td>
              <td className="py-2.5 px-4 text-right tabular-nums text-sm">
                {e.costo_promedio != null ? `$${Number(e.costo_promedio).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : (
                  <span className="text-destructive">Sin costo</span>
                )}
              </td>
            </tr>
          ))}
          {existencias.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                Sin existencias registradas todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function KardexTab({ productoId }: { productoId: string }) {
  const [movimientos, setMovimientos] = useState<InventarioMovimiento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/inventario/movimientos?producto_id=${productoId}`);
      const data = await res.json();
      setMovimientos(data.data ?? []);
      setLoading(false);
    })();
  }, [productoId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 text-rtb-teal animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <table className="w-full">
        <thead>
          <tr className="bg-rtb-navy text-white">
            <th className="text-left py-2.5 px-4 text-xs font-semibold uppercase tracking-wider">Folio</th>
            <th className="text-left py-2.5 px-4 text-xs font-semibold uppercase tracking-wider">Tipo</th>
            <th className="text-right py-2.5 px-4 text-xs font-semibold uppercase tracking-wider">Cantidad</th>
            <th className="text-right py-2.5 px-4 text-xs font-semibold uppercase tracking-wider">Saldo posterior</th>
            <th className="text-left py-2.5 px-4 text-xs font-semibold uppercase tracking-wider">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map((m, i) => (
            <tr key={m.id} className={`border-b border-border/50 ${i % 2 === 1 ? 'bg-rtb-surface/40' : ''}`}>
              <td className="py-2.5 px-4 text-xs tabular-nums text-muted-foreground">{m.folio}</td>
              <td className="py-2.5 px-4 text-sm">{MOVIMIENTO_TIPO_LABELS[m.tipo]}</td>
              <td className={`py-2.5 px-4 text-right tabular-nums text-sm ${Number(m.cantidad) < 0 ? 'text-destructive' : 'text-primary'}`}>
                {Number(m.cantidad) > 0 ? '+' : ''}
                {Number(m.cantidad).toLocaleString('es-MX')}
              </td>
              <td className="py-2.5 px-4 text-right tabular-nums text-sm">{m.saldo_teorico_posterior != null ? Number(m.saldo_teorico_posterior).toLocaleString('es-MX') : '—'}</td>
              <td className="py-2.5 px-4 text-xs text-muted-foreground tabular-nums">
                {new Date(m.fecha_movimiento).toLocaleString('es-MX', { timeZone: 'UTC' })}
              </td>
            </tr>
          ))}
          {movimientos.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">
                Sin movimientos registrados todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CostosTab({ productoId, costoVigente }: { productoId: string; costoVigente: number | null }) {
  const [costos, setCostos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/productos/${productoId}/costos`);
      const data = await res.json();
      setCostos(data.data ?? []);
      setLoading(false);
    })();
  }, [productoId]);

  return (
    <div className="bg-white rounded-xl p-5 space-y-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-display font-semibold text-rtb-navy">Histórico de costo de catálogo</h2>
        <p className="text-sm">
          Costo vigente:{' '}
          <span className="font-semibold tabular-nums">
            {costoVigente != null ? `$${Number(costoVigente).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : 'Sin costo'}
          </span>
        </p>
      </div>
      {loading ? (
        <Loader2 className="w-5 h-5 text-rtb-teal animate-spin" />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
              <th className="py-2">Vigente desde</th>
              <th className="py-2">Vigente hasta</th>
              <th className="py-2 text-right">Costo</th>
              <th className="py-2">Origen</th>
              <th className="py-2">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {costos.map((c) => (
              <tr key={c.id} className="border-t border-border/50">
                <td className="py-2 tabular-nums">{c.vigente_desde}</td>
                <td className="py-2 tabular-nums">{c.vigente_hasta ?? '—'}</td>
                <td className="py-2 text-right tabular-nums">${Number(c.costo_unitario).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                <td className="py-2">{c.origen}</td>
                <td className="py-2 text-muted-foreground">{c.motivo ?? '—'}</td>
              </tr>
            ))}
            {costos.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-foreground">
                  Sin costos de catálogo registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function KpiCard({ label, valor, borde }: { label: string; valor: string; borde: string }) {
  return (
    <div className={`bg-white rounded-xl p-4 border-l-4 ${borde}`} style={{ boxShadow: 'var(--shadow-sm)' }}>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-display font-bold text-rtb-navy mt-1 tabular-nums">{valor}</p>
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-rtb-navy">{valor}</dd>
    </div>
  );
}

function Campo({ label, children, span2 }: { label: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <div className={span2 ? 'sm:col-span-2' : ''}>
      <Label className="text-xs font-semibold text-rtb-navy-mid">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
