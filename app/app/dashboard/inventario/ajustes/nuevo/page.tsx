'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ArrowLeft, AlertCircle, CheckCircle2, FileEdit, Loader2 } from 'lucide-react';
import { AJUSTE_TIPO_LABELS } from '@/lib/inventario/config';
import { AJUSTE_TIPOS } from '@/types/inventario';
import type { AjusteTipo } from '@/types/inventario';

export default function NuevoAjustePage() {
  const router = useRouter();
  const [tipo, setTipo] = useState<AjusteTipo>('otro');
  const [motivo, setMotivo] = useState('');
  const [sinSoporte, setSinSoporte] = useState(false);
  const [motivoSinSoporte, setMotivoSinSoporte] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    const res = await fetch('/api/inventario/ajustes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, motivo, sin_soporte: sinSoporte, motivo_sin_soporte: sinSoporte ? motivoSinSoporte : undefined }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'Error al crear el ajuste');
      return;
    }
    router.push(`/dashboard/inventario/ajustes/${data.id}`);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/inventario/ajustes">
          <ArrowLeft className="w-4 h-4 mr-1" /> Ajustes
        </Link>
      </Button>

      <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
        <FileEdit className="w-6 h-6" /> Nuevo Ajuste
      </h1>
      <p className="text-sm text-muted-foreground">
        El ajuste nace en borrador. Después de crearlo, añade las líneas (producto + cantidad) desde su detalle,
        súbelo a soporte documental y envíalo a autorización — nadie, ni siquiera con acceso total, puede autorizar
        su propio ajuste.
      </p>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-xl p-5 space-y-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div>
          <Label className="text-xs font-semibold text-rtb-navy-mid">Tipo de ajuste</Label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as AjusteTipo)} className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2">
            {AJUSTE_TIPOS.map((t) => (
              <option key={t} value={t}>
                {AJUSTE_TIPO_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-rtb-navy-mid">
            Motivo <span className="text-destructive">*</span>
          </Label>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sinSoporte} onChange={(e) => setSinSoporte(e.target.checked)} />
          No hay soporte documental (AJU s/s)
        </label>
        {sinSoporte && (
          <div>
            <Label className="text-xs font-semibold text-rtb-navy-mid">Motivo sin soporte</Label>
            <textarea
              value={motivoSinSoporte}
              onChange={(e) => setMotivoSinSoporte(e.target.value)}
              rows={2}
              className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
            />
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={loading || motivo.trim().length < 5 || (sinSoporte && motivoSinSoporte.trim().length === 0)}
          className="w-full bg-rtb-teal hover:bg-rtb-teal/90 text-white"
        >
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          Crear ajuste (borrador)
        </Button>
      </div>
    </div>
  );
}
