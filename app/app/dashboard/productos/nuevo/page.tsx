'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, AlertCircle, CheckCircle2, Loader2, Package } from 'lucide-react';
import type { ProductoCategoria, ProductoFamilia, UnidadMedida } from '@/types/inventario';

const initialForm = {
  familia_id: '',
  codigo_interno: '',
  sku: '',
  nombre: '',
  descripcion: '',
  marca: '',
  modelo: '',
  categoria_id: '',
  codigo_barras: '',
  unidad_medida_id: '',
  contenido_por_unidad: '1',
  unidad_contenido_id: '',
  requiere_ubicacion: true,
};

export default function NuevoProductoPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [familias, setFamilias] = useState<ProductoFamilia[]>([]);
  const [categorias, setCategorias] = useState<ProductoCategoria[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const [f, c, u] = await Promise.all([
        fetch('/api/catalogos/familias').then((r) => r.json()),
        fetch('/api/catalogos/categorias').then((r) => r.json()),
        fetch('/api/catalogos/unidades-medida').then((r) => r.json()),
      ]);
      setFamilias(f.data ?? []);
      setCategorias(c.data ?? []);
      setUnidades(u.data ?? []);
    })();
  }, []);

  const set = (campo: keyof typeof initialForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  const llevaAgrupacion = Number(form.contenido_por_unidad) !== 1;

  const progreso = useMemo(() => {
    const campos = [form.familia_id, form.nombre, form.unidad_medida_id];
    return Math.round((campos.filter((c) => c.trim().length > 0).length / campos.length) * 100);
  }, [form]);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        familia_id: form.familia_id,
        codigo_interno: form.codigo_interno || undefined,
        sku: form.sku || undefined,
        nombre: form.nombre,
        descripcion: form.descripcion || undefined,
        marca: form.marca || undefined,
        modelo: form.modelo || undefined,
        categoria_id: form.categoria_id || undefined,
        codigo_barras: form.codigo_barras || undefined,
        unidad_medida_id: form.unidad_medida_id,
        contenido_por_unidad: Number(form.contenido_por_unidad) || 1,
        unidad_contenido_id: llevaAgrupacion ? form.unidad_contenido_id || undefined : undefined,
        requiere_ubicacion: form.requiere_ubicacion,
      };

      const res = await fetch('/api/productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'Error al crear el producto');
        setLoading(false);
        return;
      }

      router.push(`/dashboard/productos/${data.id}`);
    } catch {
      setError('Error de conexión');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/productos">
          <ArrowLeft className="w-4 h-4 mr-1" /> Productos
        </Link>
      </Button>

      <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
        <Package className="w-6 h-6" /> Nuevo Producto
      </h1>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Seccion titulo="Identidad">
            <Campo label="Familia" span2 requerido>
              <select value={form.familia_id} onChange={set('familia_id')} className="w-full text-sm border border-border rounded-lg px-3 py-2">
                <option value="">Selecciona una familia</option>
                {familias.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.clave} — {f.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Código interno">
              <Input value={form.codigo_interno} onChange={set('codigo_interno')} placeholder="Se genera automáticamente si se omite" className="tabular-nums" />
            </Campo>
            <Campo label="SKU (número de parte del fabricante)">
              <Input value={form.sku} onChange={set('sku')} className="tabular-nums" />
            </Campo>
            <Campo label="Nombre" span2 requerido>
              <Input value={form.nombre} onChange={set('nombre')} />
            </Campo>
            <Campo label="Descripción" span2>
              <Input value={form.descripcion} onChange={set('descripcion')} />
            </Campo>
            <Campo label="Marca">
              <Input value={form.marca} onChange={set('marca')} />
            </Campo>
            <Campo label="Modelo">
              <Input value={form.modelo} onChange={set('modelo')} />
            </Campo>
            <Campo label="Categoría">
              <select value={form.categoria_id} onChange={set('categoria_id')} className="w-full text-sm border border-border rounded-lg px-3 py-2">
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Código de barras">
              <Input value={form.codigo_barras} onChange={set('codigo_barras')} className="tabular-nums" />
            </Campo>
          </Seccion>

          <Seccion titulo="Unidad de medida">
            <Campo label="Unidad base" requerido>
              <select value={form.unidad_medida_id} onChange={set('unidad_medida_id')} className="w-full text-sm border border-border rounded-lg px-3 py-2">
                <option value="">Selecciona la unidad</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.clave} — {u.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Contenido por unidad">
              <Input type="number" min="0" step="any" value={form.contenido_por_unidad} onChange={set('contenido_por_unidad')} className="tabular-nums" />
            </Campo>
            {llevaAgrupacion && (
              <Campo label="Unidad del contenido" span2 requerido>
                <select value={form.unidad_contenido_id} onChange={set('unidad_contenido_id')} className="w-full text-sm border border-border rounded-lg px-3 py-2">
                  <option value="">¿En qué unidad viene el contenido?</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.clave} — {u.nombre}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-accent mt-1">
                  Causa #1 de pérdida de inventario medida por RTB: una unidad mal definida no se corrige con un
                  UPDATE directo — más adelante sólo se cambia vía redefinición autorizada.
                </p>
              </Campo>
            )}
          </Seccion>

          <Seccion titulo="Ubicación">
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={form.requiere_ubicacion} onChange={(e) => setForm((f) => ({ ...f, requiere_ubicacion: e.target.checked }))} />
              Este producto debe tener ubicación asignada
            </label>
          </Seccion>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 self-start">
          <div className="bg-white rounded-xl p-5 space-y-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="text-sm font-display font-semibold text-rtb-navy">Resumen</h3>
            <dl className="space-y-1.5 text-xs">
              <Resumen label="Nombre" valor={form.nombre || '—'} />
              <Resumen label="Código interno" valor={form.codigo_interno || 'Automático'} />
              <Resumen label="Familia" valor={familias.find((f) => f.id === form.familia_id)?.nombre ?? '—'} />
            </dl>
            <div className="pt-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Progreso de llenado</span>
                <span className="tabular-nums">{progreso}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-rtb-teal transition-all" style={{ width: `${progreso}%` }} />
              </div>
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={loading || !form.nombre || !form.familia_id || !form.unidad_medida_id}
            className="w-full bg-rtb-teal hover:bg-rtb-teal/90 text-white"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Crear producto
          </Button>
        </aside>
      </div>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <h2 className="text-sm font-display font-semibold text-rtb-navy mb-4">{titulo}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Campo({ label, children, span2, requerido }: { label: string; children: React.ReactNode; span2?: boolean; requerido?: boolean }) {
  return (
    <div className={span2 ? 'sm:col-span-2' : ''}>
      <Label className="text-xs font-semibold text-rtb-navy-mid">
        {label}
        {requerido && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Resumen({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-rtb-navy font-medium text-right truncate max-w-[60%]">{valor}</dd>
    </div>
  );
}
