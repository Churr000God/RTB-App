'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { EntidadCombobox } from '@/components/ventas/entidad-combobox';
import { ArrowLeft, AlertCircle, CheckCircle2, FileSignature, Loader2 } from 'lucide-react';

export default function NuevaPoPage() {
  const router = useRouter();
  const [entidadId, setEntidadId] = useState<string | null>(null);
  const [numeroPo, setNumeroPo] = useState('');
  const [moneda, setMoneda] = useState('MXN');
  const [rfcDeclarado, setRfcDeclarado] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [fechaPo, setFechaPo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!entidadId || !numeroPo.trim()) {
      setError('Elige el cliente y captura el número de PO.');
      return;
    }
    setError(null);
    setLoading(true);
    const res = await fetch('/api/ventas/ordenes-compra', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entidad_id: entidadId,
        numero_po: numeroPo,
        moneda,
        rfc_declarado: rfcDeclarado || undefined,
        razon_social_declarada: razonSocial || undefined,
        fecha_po: fechaPo || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo registrar la PO.');
      return;
    }
    router.push(`/dashboard/ventas/ordenes-compra/${data.data.id}`);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/ventas/ordenes-compra">
          <ArrowLeft className="w-4 h-4 mr-1" /> Órdenes de Compra
        </Link>
      </Button>

      <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
        <FileSignature className="w-6 h-6" /> Registrar PO del cliente
      </h1>

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
          <Label className="text-xs font-semibold text-rtb-navy-mid">Número de PO (tal como lo puso el cliente)</Label>
          <input value={numeroPo} onChange={(e) => setNumeroPo(e.target.value)} className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-semibold text-rtb-navy-mid">Moneda</Label>
            <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2">
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div>
            <Label className="text-xs font-semibold text-rtb-navy-mid">Fecha de la PO</Label>
            <input type="date" value={fechaPo} onChange={(e) => setFechaPo(e.target.value)} className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2" />
          </div>
        </div>
        <div>
          <Label className="text-xs font-semibold text-rtb-navy-mid">Razón social declarada (opcional)</Label>
          <input value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-rtb-navy-mid">RFC declarado (opcional)</Label>
          <input
            value={rfcDeclarado}
            onChange={(e) => setRfcDeclarado(e.target.value.toUpperCase())}
            className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
          />
        </div>
        <Button onClick={handleSubmit} disabled={loading} className="w-full bg-rtb-teal hover:bg-rtb-teal/90 text-white">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          Registrar PO
        </Button>
      </div>
    </div>
  );
}
