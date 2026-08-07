'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ArrowLeft, AlertCircle, CheckCircle2, FileText, Loader2 } from 'lucide-react';
import { EntidadCombobox } from '@/components/ventas/entidad-combobox';
import { CANAL_ORIGENES } from '@/types/entidades';
import { CANAL_ORIGEN_LABELS } from '@/lib/entidades/config';
import { VIGENCIA_COTIZACION_DIAS_DEFAULT } from '@/lib/ventas/config';

function fechaEnDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export default function NuevaCotizacionPage() {
  const router = useRouter();
  const [entidadId, setEntidadId] = useState<string | null>(null);
  const [canalEntrada, setCanalEntrada] = useState<string>('whatsapp');
  const [vigenciaHasta, setVigenciaHasta] = useState(fechaEnDias(VIGENCIA_COTIZACION_DIAS_DEFAULT));
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!entidadId) {
      setError('Elige el cliente.');
      return;
    }
    setError(null);
    setLoading(true);
    const res = await fetch('/api/ventas/cotizaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entidad_id: entidadId,
        canal_entrada: canalEntrada,
        vigencia_hasta: vigenciaHasta || undefined,
        observaciones: observaciones || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo crear la cotización.');
      return;
    }
    router.push(`/dashboard/ventas/cotizaciones/${data.data.id}`);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/ventas/cotizaciones">
          <ArrowLeft className="w-4 h-4 mr-1" /> Cotizaciones
        </Link>
      </Button>

      <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
        <FileText className="w-6 h-6" /> Nueva cotización
      </h1>
      <p className="text-sm text-muted-foreground">
        Nace en borrador. Si el cliente está congelado o bloqueado, la base de datos rechaza el alta.
      </p>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-xl p-5 space-y-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div>
          <Label className="text-xs font-semibold text-rtb-navy-mid">Cliente</Label>
          <div className="mt-1">
            <EntidadCombobox value={entidadId} onChange={(id) => setEntidadId(id)} />
          </div>
        </div>
        <div>
          <Label className="text-xs font-semibold text-rtb-navy-mid">Canal de entrada</Label>
          <select
            value={canalEntrada}
            onChange={(e) => setCanalEntrada(e.target.value)}
            className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
          >
            {CANAL_ORIGENES.map((c) => (
              <option key={c} value={c}>
                {CANAL_ORIGEN_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-rtb-navy-mid">Vigencia hasta</Label>
          <input
            type="date"
            value={vigenciaHasta}
            onChange={(e) => setVigenciaHasta(e.target.value)}
            className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
          />
          <p className="text-xs text-muted-foreground mt-1">Obligatoria para poder enviarla al cliente.</p>
        </div>
        <div>
          <Label className="text-xs font-semibold text-rtb-navy-mid">Observaciones (opcional)</Label>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={3}
            className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
          />
        </div>
        <Button
          onClick={handleSubmit}
          disabled={loading || !entidadId}
          className="w-full bg-rtb-teal hover:bg-rtb-teal/90 text-white"
        >
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          Crear cotización (borrador)
        </Button>
      </div>
    </div>
  );
}
