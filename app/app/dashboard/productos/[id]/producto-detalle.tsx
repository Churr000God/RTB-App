'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { useAuth } from '@/lib/rbac/hooks';
import { puede } from '@/lib/inventario/permisos';
import { ProductoEstadoBadge } from '@/components/inventario/estado-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Actualizando } from '@/components/ui/actualizando';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PrecioVentaTab } from '@/components/ventas/precio-venta-tab';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ImagenUploader } from '@/components/inventario/imagen-uploader';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUp,
  Loader2,
  Package,
  Pencil,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import type {
  CostoOrigen,
  InventarioExistencia,
  InventarioMovimiento,
  Producto,
  ProductoCategoria,
  ProductoFamilia,
  ProductoImagenConUrl,
  ProductoMarca,
  UnidadMedida,
} from '@/types/inventario';
import { COSTO_ORIGENES } from '@/types/inventario';
import { COSTO_ORIGEN_LABELS, MOVIMIENTO_TIPO_LABELS } from '@/lib/inventario/config';

interface Props {
  producto: Producto;
  familia: ProductoFamilia | null;
  categoria: ProductoCategoria | null;
  marca: ProductoMarca | null;
  unidad: UnidadMedida | null;
  existenciasIniciales: (InventarioExistencia & { ubicaciones_internas: { codigo: string; nombre: string } | null })[];
  costoVigente: number | null;
}

export function ProductoDetalle({ producto, familia, categoria, marca, unidad, existenciasIniciales, costoVigente }: Props) {
  const { role } = useAuth();
  const puedeEditar = puede(role, 'productos', 'update');

  const totalTeorica = existenciasIniciales.reduce((acc, e) => acc + Number(e.cantidad_teorica), 0);
  const totalApartada = existenciasIniciales.reduce((acc, e) => acc + Number(e.cantidad_apartada), 0);

  // costo_unitario_vigente() (011_inventario_kardex.sql:690-708) es una
  // cascada: primero inventario_existencias.costo_promedio (la fila con
  // más cantidad_teorica), después producto_costos, después el proveedor
  // preferente. Replicamos SÓLO la primera rama —la única verificable con
  // los datos que esta página ya trae— para explicar por qué un costo de
  // catálogo nuevo puede no mover la tarjeta (contexto/AUDITORIA_RTB-VEN-01.md §7.6).
  const existenciaValuada = [...existenciasIniciales]
    .filter((e) => e.costo_promedio != null)
    .sort((a, b) => Number(b.cantidad_teorica) - Number(a.cantidad_teorica))[0] ?? null;
  const fuenteCosto = costoVigente == null ? null : existenciaValuada ? 'Promedio de inventario' : 'Catálogo o proveedor';

  // Estado de imágenes centralizado aquí (no en ImagenesTab) para que la
  // miniatura de la cabecera y la pestaña compartan una sola carga y una
  // sola verdad tras subir/quitar/reordenar.
  const [imagenes, setImagenes] = useState<ProductoImagenConUrl[]>([]);
  const [imagenesLoading, setImagenesLoading] = useState(true);
  const recargarImagenes = () => {
    setImagenesLoading(true);
    fetch(`/api/productos/${producto.id}/imagenes`)
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (r.ok) setImagenes(json.data ?? []);
      })
      .finally(() => setImagenesLoading(false));
  };
  useEffect(recargarImagenes, [producto.id]);
  const principal = imagenes.find((i) => i.es_principal) ?? null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/productos">
          <ArrowLeft className="w-4 h-4 mr-1" /> Productos
        </Link>
      </Button>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {!imagenesLoading && (
            <div className="w-16 h-16 rounded-lg bg-rtb-surface flex items-center justify-center overflow-hidden shrink-0">
              {principal ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={principal.url_miniatura ?? principal.url} alt={producto.nombre} className="w-full h-full object-cover" />
              ) : (
                <Package className="w-6 h-6 text-muted-foreground opacity-30" />
              )}
            </div>
          )}
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Existencia teórica" valor={totalTeorica.toLocaleString('es-MX')} borde="border-l-rtb-teal" />
        <KpiCard label="Apartada" valor={totalApartada.toLocaleString('es-MX')} borde="border-l-rtb-gold" />
        <KpiCard
          label="Costo vigente"
          valor={costoVigente != null ? `$${Number(costoVigente).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : 'Sin costo'}
          borde={costoVigente != null ? 'border-l-rtb-teal' : 'border-l-destructive'}
          nota={fuenteCosto ?? undefined}
        />
        <KpiCard label="Unidad base" valor={unidad?.clave ?? '—'} borde="border-l-rtb-teal" />
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="imagenes">Imágenes</TabsTrigger>
          <TabsTrigger value="existencias">Existencias</TabsTrigger>
          <TabsTrigger value="kardex">Kardex</TabsTrigger>
          <TabsTrigger value="costos">Costos</TabsTrigger>
          <TabsTrigger value="precio-venta">Precio de venta</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralTab
            producto={producto}
            familia={familia}
            categoria={categoria}
            marca={marca}
            unidad={unidad}
            puedeEditar={puedeEditar}
          />
        </TabsContent>
        <TabsContent value="imagenes">
          <ImagenesTab
            productoId={producto.id}
            imagenes={imagenes}
            loading={imagenesLoading}
            puedeEditar={puedeEditar}
            onCambio={recargarImagenes}
          />
        </TabsContent>
        <TabsContent value="existencias">
          <ExistenciasTab existencias={existenciasIniciales} />
        </TabsContent>
        <TabsContent value="kardex">
          <KardexTab productoId={producto.id} />
        </TabsContent>
        <TabsContent value="costos">
          <CostosTab productoId={producto.id} costoVigente={costoVigente} hayCostoPromedio={existenciaValuada != null} />
        </TabsContent>
        <TabsContent value="precio-venta">
          <PrecioVentaTab productoId={producto.id} rol={role} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ImagenesTab({
  productoId,
  imagenes,
  loading,
  puedeEditar,
  onCambio,
}: {
  productoId: string;
  imagenes: ProductoImagenConUrl[];
  loading: boolean;
  puedeEditar: boolean;
  onCambio: () => void;
}) {
  const [accionando, setAccionando] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<ProductoImagenConUrl | null>(null);

  const patch = async (imagenId: string, body: Record<string, unknown>) => {
    setAccionando(imagenId);
    await fetch(`/api/productos/${productoId}/imagenes/${imagenId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setAccionando(null);
    onCambio();
  };

  const quitar = async (imagenId: string) => {
    setAccionando(imagenId);
    await fetch(`/api/productos/${productoId}/imagenes/${imagenId}`, { method: 'DELETE' });
    setAccionando(null);
    onCambio();
  };

  if (loading) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="bg-white rounded-xl p-5 space-y-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
      {puedeEditar && <ImagenUploader productoId={productoId} onSubida={onCambio} />}

      {imagenes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin fotos todavía.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {imagenes.map((img, i) => (
            <div key={img.id} className="rounded-xl overflow-hidden bg-rtb-surface/40 relative">
              <Dialog open={lightbox?.id === img.id} onOpenChange={(open) => setLightbox(open ? img : null)}>
                <DialogTrigger asChild>
                  <button type="button" className="block w-full aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url_miniatura ?? img.url}
                      alt={img.descripcion ?? ''}
                      className="w-full h-full object-cover"
                    />
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.descripcion ?? ''} className="w-full h-auto rounded-lg" />
                </DialogContent>
              </Dialog>

              {img.es_principal && (
                <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rtb-teal text-white flex items-center gap-0.5">
                  <Star className="w-3 h-3 fill-current" /> PRINCIPAL
                </span>
              )}

              {puedeEditar && (
                <div className="flex items-center justify-between gap-1 p-1.5 bg-white">
                  <div className="flex gap-0.5">
                    <button
                      type="button"
                      disabled={accionando === img.id || i === 0}
                      title="Subir orden"
                      className="p-1 text-rtb-navy-mid disabled:opacity-30"
                      onClick={() => patch(img.id, { orden: Math.max(0, (imagenes[i - 1]?.orden ?? 0)) })}
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={accionando === img.id || i === imagenes.length - 1}
                      title="Bajar orden"
                      className="p-1 text-rtb-navy-mid disabled:opacity-30"
                      onClick={() => patch(img.id, { orden: (imagenes[i + 1]?.orden ?? img.orden) + 1 })}
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    {!img.es_principal && (
                      <button
                        type="button"
                        disabled={accionando === img.id}
                        title="Hacer principal"
                        className="p-1 text-rtb-teal disabled:opacity-30"
                        onClick={() => patch(img.id, { es_principal: true })}
                      >
                        <Star className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button type="button" disabled={accionando === img.id} className="p-1 text-destructive disabled:opacity-30">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Quitar esta foto?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Se borra el archivo del bucket. La acción no se puede deshacer.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => quitar(img.id)} className="bg-destructive hover:bg-destructive/90">
                          Quitar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GeneralTab({
  producto,
  familia,
  categoria,
  marca,
  unidad,
  puedeEditar,
}: {
  producto: Producto;
  familia: ProductoFamilia | null;
  categoria: ProductoCategoria | null;
  marca: ProductoMarca | null;
  unidad: UnidadMedida | null;
  puedeEditar: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({
    nombre: producto.nombre,
    descripcion: producto.descripcion ?? '',
    marca_id: producto.marca_id ?? '',
    categoria_id: producto.categoria_id ?? '',
    modelo: producto.modelo ?? '',
    observaciones: producto.observaciones ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Los selects de marca/categoría sólo se cargan al entrar a editar — la
  // mayoría de visitas al detalle no editan, y así no pagan dos consultas
  // extra. Sólo activas: es un selector de asignación, no de administración.
  const [marcas, setMarcas] = useState<ProductoMarca[]>([]);
  const [categorias, setCategorias] = useState<ProductoCategoria[]>([]);

  useEffect(() => {
    if (!editando || marcas.length > 0 || categorias.length > 0) return;
    void (async () => {
      const [m, c] = await Promise.all([fetch('/api/catalogos/marcas'), fetch('/api/catalogos/categorias')]);
      if (m.ok) setMarcas((await m.json()).data ?? []);
      if (c.ok) setCategorias((await c.json()).data ?? []);
    })();
  }, [editando, marcas.length, categorias.length]);

  const guardar = async () => {
    setLoading(true);
    setError(null);
    // '' → null para marca_id/categoria_id: z.string().uuid() rechaza ''
    // (bug más probable de este cambio — quitar la marca de un producto
    // mandaría '' y el servidor respondería "Datos inválidos").
    const payload = {
      ...form,
      marca_id: form.marca_id || null,
      categoria_id: form.categoria_id || null,
    };
    const res = await fetch(`/api/productos/${producto.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
            <select
              value={form.marca_id}
              onChange={(e) => setForm((f) => ({ ...f, marca_id: e.target.value }))}
              className="w-full text-sm border border-border rounded-lg px-3 py-2"
            >
              <option value="">Sin marca</option>
              {marcas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.clave} — {m.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Categoría">
            <select
              value={form.categoria_id}
              onChange={(e) => setForm((f) => ({ ...f, categoria_id: e.target.value }))}
              className="w-full text-sm border border-border rounded-lg px-3 py-2"
            >
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.clave} — {c.nombre}
                </option>
              ))}
            </select>
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
          <Dato label="Categoría" valor={categoria ? `${categoria.clave} — ${categoria.nombre}` : '—'} />
          <Dato label="Marca" valor={marca ? `${marca.clave} — ${marca.nombre}` : '—'} />
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

function CostosTab({
  productoId,
  costoVigente,
  hayCostoPromedio,
}: {
  productoId: string;
  costoVigente: number | null;
  hayCostoPromedio: boolean;
}) {
  const router = useRouter();
  const { role } = useAuth();
  const [refrescando, iniciarRefresco] = useTransition();
  const [costos, setCostos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Gap de UI (contexto/AUDITORIA_QA_ROLES_2026-08-06.md §4): POST
  // /api/productos/[id]/costos existía y respondía (el rol lo permite:
  // compras, finanzas, direccion, super_admin), no había botón.
  const [creando, setCreando] = useState(false);
  const [costoUnitario, setCostoUnitario] = useState('');
  const [origen, setOrigen] = useState<CostoOrigen>('catalogo_manual');
  const [vigenteDesde, setVigenteDesde] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = async () => {
    setLoading(true);
    const res = await fetch(`/api/productos/${productoId}/costos`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo cargar el histórico de costos.');
      return;
    }
    setCostos(data.data ?? []);
  };

  useEffect(() => {
    void cargar();
  }, [productoId]);

  const registrarCosto = async () => {
    setError(null);
    setEnviando(true);
    const res = await fetch(`/api/productos/${productoId}/costos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        costo_unitario: Number(costoUnitario),
        origen,
        vigente_desde: vigenteDesde || undefined,
        motivo: motivo || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo registrar el costo.');
      return;
    }
    setCreando(false);
    setCostoUnitario('');
    setVigenteDesde('');
    setMotivo('');
    await cargar();
    toast.success('Costo de catálogo registrado.');
    // Reevalúa costo_unitario_vigente() (prop del Server Component) — el
    // KPI de cabecera y el texto de abajo sólo cambian si esta pantalla
    // no tiene ya un costo_promedio de inventario por delante (ver nota).
    iniciarRefresco(() => router.refresh());
  };

  return (
    <div className="bg-white rounded-xl p-5 space-y-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-display font-semibold text-rtb-navy flex items-center gap-2">
          Histórico de costo de catálogo
          <Actualizando activo={refrescando} />
        </h2>
        <div className="flex items-center gap-3">
          <p className="text-sm">
            Costo vigente:{' '}
            <span className="font-semibold tabular-nums">
              {costoVigente != null ? `$${Number(costoVigente).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : 'Sin costo'}
            </span>
          </p>
          {puede(role, 'producto_costos', 'insert') && !creando && (
            <Button size="sm" onClick={() => setCreando(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo costo
            </Button>
          )}
        </div>
      </div>

      {hayCostoPromedio && (
        <div className="flex items-start gap-2 p-3 bg-rtb-surface/60 rounded-lg text-xs text-muted-foreground">
          <AlertCircle className="w-3.5 h-3.5 text-rtb-gold shrink-0 mt-0.5" />
          <span>
            Este producto tiene existencias valuadas. El &quot;Costo vigente&quot; se toma del costo promedio del
            inventario, así que un costo de catálogo nuevo quedará registrado en el histórico pero{' '}
            <strong>no cambiará</strong> esa cifra mientras haya existencias con costo promedio.
          </span>
        </div>
      )}

      {creando && (
        <div className="p-3 bg-rtb-surface/60 rounded-lg space-y-2">
          {error && (
            <div className="flex items-center gap-2 p-2 bg-red-50 text-red-700 rounded-lg text-xs">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Costo unitario</Label>
              <Input type="number" step="any" min="0" value={costoUnitario} onChange={(e) => setCostoUnitario(e.target.value)} className="tabular-nums" />
            </div>
            <div>
              <Label className="text-xs">Origen</Label>
              <select
                value={origen}
                onChange={(e) => setOrigen(e.target.value as CostoOrigen)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2"
              >
                {COSTO_ORIGENES.map((o) => (
                  <option key={o} value={o}>
                    {COSTO_ORIGEN_LABELS[o]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Vigente desde (opcional)</Label>
              <Input type="date" value={vigenteDesde} onChange={(e) => setVigenteDesde(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Motivo (retroactivo lo exige)</Label>
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreando(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={registrarCosto} disabled={enviando || !costoUnitario}>
              Guardar
            </Button>
          </div>
        </div>
      )}

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

function KpiCard({ label, valor, borde, nota }: { label: string; valor: string; borde: string; nota?: string }) {
  return (
    <div className={`bg-white rounded-xl p-4 border-l-4 ${borde}`} style={{ boxShadow: 'var(--shadow-sm)' }}>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-display font-bold text-rtb-navy mt-1 tabular-nums">{valor}</p>
      {nota && <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{nota}</p>}
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
