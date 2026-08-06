'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { CampoCatalogo, CatalogoMeta, CatalogoTipo } from '@/lib/inventario/catalogos';
import { UNIDAD_TIPO_LABELS } from '@/lib/inventario/config';
import { UNIDAD_TIPOS, type UnidadMedida } from '@/types/inventario';
import type { FilaCatalogo } from './catalogo-tabla';

interface Props {
  tipo: CatalogoTipo;
  meta: CatalogoMeta;
  fila: FilaCatalogo | null; // null = alta
  unidades: UnidadMedida[];
  onClose: () => void;
  onGuardado: () => void;
}

function valorInicial(campo: CampoCatalogo, fila: FilaCatalogo | null): string | boolean {
  if (campo.tipo === 'checkbox') return fila ? Boolean(fila[campo.name]) : false;
  const v = fila?.[campo.name];
  return v == null ? '' : String(v);
}

export function CatalogoModal({ tipo, meta, fila, unidades, onClose, onGuardado }: Props) {
  const esAlta = fila === null;
  const [form, setForm] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(meta.campos.map((c) => [c.name, valorInicial(c, fila)]))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (name: string, value: string | boolean) => setForm((f) => ({ ...f, [name]: value }));

  const submit = async () => {
    // Campos requeridos (clave/nombre/tipo…) deben traer valor tanto al dar
    // de alta como al editar — en edición 'clave' sigue disabled pero
    // conserva su valor original, así que esta validación no lo bloquea.
    const faltante = meta.campos.find((c) => c.requerido && !String(form[c.name] ?? '').trim());
    if (faltante) {
      setError(`${faltante.label} es obligatorio`);
      return;
    }
    setLoading(true);
    setError(null);

    // Strings vacíos de campos opcionales (FK, texto) → null, nunca ''.
    // z.string().uuid() rechaza ''; descripcion:'' guardaría cadena vacía
    // en vez de NULL — mismo bug que en producto-detalle.tsx.
    const payload: Record<string, unknown> = {};
    for (const campo of meta.campos) {
      if (!esAlta && campo.soloAlta) continue; // clave: nunca en el PATCH
      const v = form[campo.name];
      if (campo.tipo === 'checkbox') {
        payload[campo.name] = Boolean(v);
      } else if (campo.tipo === 'numero') {
        payload[campo.name] = v === '' ? undefined : Number(v);
      } else {
        const s = typeof v === 'string' ? v.trim() : v;
        payload[campo.name] = s === '' ? (campo.requerido ? '' : null) : s;
      }
    }

    try {
      const url = esAlta ? `/api/catalogos/${tipo}` : `/api/catalogos/${tipo}/${fila!.id}`;
      const res = await fetch(url, {
        method: esAlta ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'No se pudo guardar');
        setLoading(false);
        return;
      }
      onGuardado();
    } catch {
      setError('Error de conexión');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <h2 className="text-lg font-display font-semibold text-rtb-navy mb-1">
          {esAlta ? `Nueva ${meta.labelSingular}` : `Editar ${meta.labelSingular}`}
        </h2>
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm my-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="space-y-4 mt-4">
          {meta.campos.map((campo) => (
            <CampoInput
              key={campo.name}
              campo={campo}
              value={form[campo.name]}
              disabled={!esAlta && campo.soloAlta}
              unidades={unidades}
              onChange={(v) => set(campo.name, v)}
            />
          ))}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={loading} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {esAlta ? 'Crear' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CampoInput({
  campo,
  value,
  disabled,
  unidades,
  onChange,
}: {
  campo: CampoCatalogo;
  value: string | boolean;
  disabled?: boolean;
  unidades: UnidadMedida[];
  onChange: (v: string | boolean) => void;
}) {
  return (
    <div>
      <Label className="text-xs font-semibold text-rtb-navy-mid">
        {campo.label}
        {campo.requerido && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <div className="mt-1">
        {campo.tipo === 'texto' && campo.name === 'clave' ? (
          <Input
            value={String(value)}
            disabled={disabled}
            maxLength={campo.maxLength}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="tabular-nums"
          />
        ) : campo.tipo === 'texto' ? (
          <Input value={String(value)} disabled={disabled} maxLength={campo.maxLength} onChange={(e) => onChange(e.target.value)} />
        ) : campo.tipo === 'textarea' ? (
          <textarea
            value={String(value)}
            disabled={disabled}
            maxLength={campo.maxLength}
            onChange={(e) => onChange(e.target.value)}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 min-h-[72px]"
          />
        ) : campo.tipo === 'numero' ? (
          <Input
            type="number"
            min={campo.min}
            max={campo.max}
            value={String(value)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="tabular-nums"
          />
        ) : campo.tipo === 'checkbox' ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(value)}
              disabled={disabled}
              onChange={(e) => onChange(e.target.checked)}
            />
            {campo.ayuda}
          </label>
        ) : campo.tipo === 'select_unidad' ? (
          <select
            value={String(value)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="w-full text-sm border border-border rounded-lg px-3 py-2"
          >
            <option value="">Sin unidad por defecto</option>
            {unidades
              .filter((u) => u.activo)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.clave} — {u.nombre}
                </option>
              ))}
          </select>
        ) : campo.tipo === 'select_unidad_tipo' ? (
          <select
            value={String(value)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="w-full text-sm border border-border rounded-lg px-3 py-2"
          >
            <option value="">Selecciona un tipo</option>
            {UNIDAD_TIPOS.map((t) => (
              <option key={t} value={t}>
                {UNIDAD_TIPO_LABELS[t]}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {campo.ayuda && campo.tipo !== 'checkbox' && <p className="text-[11px] text-muted-foreground mt-1">{campo.ayuda}</p>}
    </div>
  );
}
