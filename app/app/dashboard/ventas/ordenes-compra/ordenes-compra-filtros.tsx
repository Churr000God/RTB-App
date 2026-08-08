'use client';

import { useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RangoFechas } from '@/components/ui/rango-fechas';
import {
  PO_ESTADOS,
  PO_FECHA_CAMPOS,
  PO_ORDENES,
  type PoEstado,
  type PoFechaCampo,
  type PoOrden,
} from '@/types/ventas';
import { PO_ESTADO_LABELS, PO_FECHA_CAMPO_LABELS, PO_ORDEN_LABELS } from '@/lib/ventas/config';

export interface FiltrosUI {
  q: string;
  estados: PoEstado[];
  fechaCampo: PoFechaCampo;
  desde: string | null;
  hasta: string | null;
  orden: PoOrden;
}

const SELECT_CLASES = 'text-sm border border-border rounded-lg px-3 py-2 bg-white';

export function OrdenesCompraFiltrosBar({
  filtros,
  onChange,
}: {
  filtros: FiltrosUI;
  onChange: (siguiente: Partial<FiltrosUI>) => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const [qLocal, setQLocal] = useState(filtros.q);

  const activos = [filtros.desde || filtros.hasta].filter(Boolean).length;

  const limpiarAvanzados = () => onChange({ fechaCampo: 'creacion', desde: null, hasta: null });

  return (
    <div className="p-4 space-y-3 border-b border-border">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por folio, número de PO, siglas, razón social, nombre comercial o clave del cliente…"
            value={qLocal}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setQLocal(e.target.value);
              onChange({ q: e.target.value });
            }}
            className="pl-10"
          />
        </div>

        <select
          value={filtros.orden}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange({ orden: e.target.value as PoOrden })}
          className={SELECT_CLASES}
        >
          {PO_ORDENES.map((o) => (
            <option key={o} value={o}>
              {PO_ORDEN_LABELS[o]}
            </option>
          ))}
        </select>

        <Button variant="outline" onClick={() => setExpandido((v) => !v)} className="relative">
          <SlidersHorizontal className="w-4 h-4 mr-2" /> Filtros
          {activos > 0 && (
            <span className="ml-2 inline-flex items-center justify-center h-5 w-5 rounded-full bg-rtb-teal text-white text-[11px]">
              {activos}
            </span>
          )}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange({ estados: [] })}
          className={`text-xs font-medium px-3 py-1.5 rounded-full ${
            filtros.estados.length === 0 ? 'bg-rtb-navy text-white' : 'bg-white text-muted-foreground border border-border'
          }`}
        >
          Todas
        </button>
        {PO_ESTADOS.map((e) => {
          const activo = filtros.estados.includes(e);
          return (
            <button
              key={e}
              type="button"
              onClick={() =>
                onChange({ estados: activo ? filtros.estados.filter((x) => x !== e) : [...filtros.estados, e] })
              }
              className={`text-xs font-medium px-3 py-1.5 rounded-full ${
                activo ? 'bg-rtb-navy text-white' : 'bg-white text-muted-foreground border border-border'
              }`}
            >
              {PO_ESTADO_LABELS[e]}
            </button>
          );
        })}
      </div>

      {expandido && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="flex items-center gap-2">
            <select
              value={filtros.fechaCampo}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange({ fechaCampo: e.target.value as PoFechaCampo })}
              className={SELECT_CLASES}
            >
              {PO_FECHA_CAMPOS.map((c) => (
                <option key={c} value={c}>
                  {PO_FECHA_CAMPO_LABELS[c]}
                </option>
              ))}
            </select>
            <RangoFechas desde={filtros.desde} hasta={filtros.hasta} onChange={({ desde, hasta }) => onChange({ desde, hasta })} />
          </div>

          {activos > 0 && (
            <Button variant="ghost" size="sm" onClick={limpiarAvanzados} className="text-muted-foreground">
              <X className="w-3.5 h-3.5 mr-1" /> Limpiar filtros
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
