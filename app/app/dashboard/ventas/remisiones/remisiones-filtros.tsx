'use client';

import { useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RangoFechas } from '@/components/ui/rango-fechas';
import { CANAL_ORIGENES, type CanalOrigen } from '@/types/entidades';
import { CANAL_ORIGEN_LABELS } from '@/lib/entidades/config';
import { NR_ESTADOS, NR_FECHA_CAMPOS, NR_ORDENES, type NrEstado, type NrFechaCampo, type NrOrden } from '@/types/ventas';
import { NR_ESTADO_LABELS, NR_FECHA_CAMPO_LABELS, NR_ORDEN_LABELS } from '@/lib/ventas/config';

export interface FiltrosUI {
  q: string;
  estados: NrEstado[];
  fechaCampo: NrFechaCampo;
  desde: string | null;
  hasta: string | null;
  soloMias: boolean;
  vendedorId: string | null;
  canal: CanalOrigen | null;
  sinPo: boolean;
  orden: NrOrden;
}

const SELECT_CLASES = 'text-sm border border-border rounded-lg px-3 py-2 bg-white';

export function RemisionesFiltrosBar({
  filtros,
  onChange,
  vendedores,
}: {
  filtros: FiltrosUI;
  onChange: (siguiente: Partial<FiltrosUI>) => void;
  vendedores: { id: string; full_name: string }[];
}) {
  const [expandido, setExpandido] = useState(false);
  const [qLocal, setQLocal] = useState(filtros.q);

  const activos = [filtros.desde || filtros.hasta, filtros.soloMias, filtros.vendedorId, filtros.canal, filtros.sinPo].filter(
    Boolean
  ).length;

  const limpiarAvanzados = () =>
    onChange({ fechaCampo: 'emision', desde: null, hasta: null, soloMias: false, vendedorId: null, canal: null, sinPo: false });

  return (
    <div className="p-4 space-y-3 border-b border-border">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por folio, siglas, razón social, pedido, cotización o número de PO…"
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
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange({ orden: e.target.value as NrOrden })}
          className={SELECT_CLASES}
        >
          {NR_ORDENES.map((o) => (
            <option key={o} value={o}>
              {NR_ORDEN_LABELS[o]}
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
        {NR_ESTADOS.map((e) => {
          const activo = filtros.estados.includes(e);
          return (
            <button
              key={e}
              type="button"
              onClick={() => onChange({ estados: activo ? filtros.estados.filter((x) => x !== e) : [...filtros.estados, e] })}
              className={`text-xs font-medium px-3 py-1.5 rounded-full ${
                activo ? 'bg-rtb-navy text-white' : 'bg-white text-muted-foreground border border-border'
              }`}
            >
              {NR_ESTADO_LABELS[e]}
            </button>
          );
        })}
      </div>

      {expandido && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="flex items-center gap-2">
            <select
              value={filtros.fechaCampo}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange({ fechaCampo: e.target.value as NrFechaCampo })}
              className={SELECT_CLASES}
            >
              {NR_FECHA_CAMPOS.map((c) => (
                <option key={c} value={c}>
                  {NR_FECHA_CAMPO_LABELS[c]}
                </option>
              ))}
            </select>
            <RangoFechas desde={filtros.desde} hasta={filtros.hasta} onChange={({ desde, hasta }) => onChange({ desde, hasta })} />
          </div>

          <select
            value={filtros.canal ?? ''}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange({ canal: (e.target.value || null) as CanalOrigen | null })}
            className={SELECT_CLASES}
          >
            <option value="">Cualquier canal</option>
            {CANAL_ORIGENES.map((c) => (
              <option key={c} value={c}>
                {CANAL_ORIGEN_LABELS[c]}
              </option>
            ))}
          </select>

          <select
            value={filtros.soloMias ? 'mias' : filtros.vendedorId ?? ''}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              const v = e.target.value;
              if (v === 'mias') onChange({ soloMias: true, vendedorId: null });
              else onChange({ soloMias: false, vendedorId: v || null });
            }}
            className={SELECT_CLASES}
          >
            <option value="">Cualquier vendedor</option>
            <option value="mias">Sólo mías</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.full_name}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={filtros.sinPo}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ sinPo: e.target.checked })}
              className="rounded border-border"
            />
            Con pendiente por respaldar de PO
          </label>

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
