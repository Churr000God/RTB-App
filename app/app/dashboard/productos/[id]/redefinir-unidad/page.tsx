'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, ArrowLeftRight, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import type { Producto, UnidadMedida } from '@/types/inventario';

// Solicita una redefinición de unidad de medida (causa #1 de pérdida
// medida por RTB: 14 de 27 folios de no conformidad, -$37,919.77). El
// cliente sólo elige la unidad NUEVA — la API congela la anterior y el
// saldo base desde el propio producto, para que nadie pueda declarar un
// "antes" distinto al real.
export default function RedefinirUnidadPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [producto, setProducto] = useState<Producto | null>(null);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [unidadNuevaId, setUnidadNuevaId] = useState('');
  const [contenidoNuevo, setContenidoNuevo] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [requiereReconteo, setRequiereReconteo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const [p, u] = await Promise.all([
        fetch(`/api/productos/${params.id}`).then((r) => r.json()),
        fetch('/api/catalogos/unidades-medida').then((r) => r.json()),
      ]);
      setProducto(p.producto);
      setUnidades(u.data ?? []);
    })();
  }, [params.id]);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/productos/${params.id}/redefinir-unidad`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unidad_nueva_id: unidadNuevaId,
        contenido_nuevo: Number(contenidoNuevo) || 1,
        motivo,
        requiere_reconteo: requiereReconteo,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'Error al solicitar la redefinición');
      return;
    }
    router.push(`/dashboard/productos/${params.id}`);
  };

  if (!producto) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 text-rtb-teal animate-spin" />
      </div>
    );
  }

  const unidadActual = unidades.find((u) => u.id === producto.unidad_medida_id);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/dashboard/productos/${params.id}`}>
          <ArrowLeft className="w-4 h-4 mr-1" /> {producto.nombre}
        </Link>
      </Button>

      <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
        <ArrowLeftRight className="w-6 h-6" /> Redefinir unidad de medida
      </h1>
      <p className="text-sm text-muted-foreground">
        Esta solicitud requiere autorización de un tercero (nunca puedes autorizar tu propia solicitud) y sólo se
        aplica cuando queda autorizada. Mientras tanto, la unidad actual del producto no cambia.
      </p>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-xl p-5 space-y-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <Label className="text-xs font-semibold text-rtb-navy-mid">Unidad actual</Label>
            <p className="mt-1 text-rtb-navy">
              {unidadActual ? `${unidadActual.clave} — ${unidadActual.nombre}` : '—'} (contenido: {producto.contenido_por_unidad})
            </p>
          </div>
        </div>

        <div>
          <Label className="text-xs font-semibold text-rtb-navy-mid">Unidad nueva</Label>
          <select
            value={unidadNuevaId}
            onChange={(e) => setUnidadNuevaId(e.target.value)}
            className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
          >
            <option value="">Selecciona la unidad nueva</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.clave} — {u.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label className="text-xs font-semibold text-rtb-navy-mid">Contenido por unidad nueva</Label>
          <Input type="number" min="0" step="any" value={contenidoNuevo} onChange={(e) => setContenidoNuevo(e.target.value)} className="mt-1 tabular-nums" />
        </div>

        <div>
          <Label className="text-xs font-semibold text-rtb-navy-mid">
            Motivo <span className="text-destructive">*</span>
          </Label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
            placeholder="Explica por qué la unidad actual está mal definida"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={requiereReconteo} onChange={(e) => setRequiereReconteo(e.target.checked)} />
          Requiere reconteo antes de aplicarse (recomendado)
        </label>

        <Button
          onClick={handleSubmit}
          disabled={loading || !unidadNuevaId || motivo.trim().length < 5}
          className="w-full bg-rtb-teal hover:bg-rtb-teal/90 text-white"
        >
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          Enviar solicitud
        </Button>
      </div>
    </div>
  );
}
