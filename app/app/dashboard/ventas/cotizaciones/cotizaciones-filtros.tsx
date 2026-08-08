'use client';

import { useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RangoFechas } from '@/components/ui/rango-fechas';
import { CANAL_ORIGENES, type CanalOrigen } from '@/types/entidades';
import { CANAL_ORIGEN_LABELS } from '@/lib/entidades/config';
import {
  COTIZACION_FECHA_CAMPOS,
  COTIZACION_ORDENES,
  VENTAS_COTIZACION_ESTADOS,
  type CotizacionFechaCampo,
  type CotizacionOrden,
  type CotizacionVigenciaFiltro,
  type VentasCotizacionEstado,
} from '@/types/ventas';
import { COTIZACION_FECHA_CAMPO_LABELS, COTIZACION_ORDEN_LABELS, VENTAS_COTIZACION_ESTADO_LABELS } from '@/lib/ventas/config';

export interface FiltrosUI {
  q: string;
  estados: VentasCotizacionEstado[];
  fechaCampo: CotizacionFechaCampo;
  desde: string | null;
  hasta: string | null;
  soloMias: boolean;
  vendedorId: string | null;
  canal: CanalOrigen | null;
  vigenciaFiltro: CotizacionVigenciaFiltro | null;
  enConsulta: boolean;
  orden: CotizacionOrden;
}

const SELECT_CLASES = 'text-sm border border-border rounded-lg px-3 py-2 bg-white';

export function CotizacionesFiltrosBar({
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

  const activos = [
    filtros.desde || filtros.hasta,
    filtros.soloMias,
    filtros.vendedorId,
    filtros.canal,
    filtros.vigenciaFiltro,
    filtros.enConsulta,
  ].filter(Boolean).length;

  const limpiarAvanzados = () =>
    onChange({
      fechaCampo: 'creacion',
      desde: null,
      hasta: null,
      soloMias: false,
      vendedorId: null,
      canal: null,
      vigenciaFiltro: null,
      enConsulta: false,
    });

  return (
    <div className="p-4 space-y-3 border-b border-border">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por folio, siglas, razón social, nombre comercial o clave del cliente…"
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
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange({ orden: e.target.value as CotizacionOrden })}
          className={SELECT_CLASES}
        >
          {COTIZACION_ORDENES.map((o) => (
            <option key={o} value={o}>
              {COTIZACION_ORDEN_LABELS[o]}
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
        {VENTAS_COTIZACION_ESTADOS.map((e) => {
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
              {VENTAS_COTIZACION_ESTADO_LABELS[e]}
            </button>
          );
        })}
      </div>

      {expandido && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="flex items-center gap-2">
            <select
              value={filtros.fechaCampo}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange({ fechaCampo: e.target.value as CotizacionFechaCampo })}
              className={SELECT_CLASES}
            >
              {COTIZACION_FECHA_CAMPOS.map((c) => (
                <option key={c} value={c}>
                  {COTIZACION_FECHA_CAMPO_LABELS[c]}
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

          <select
            value={filtros.vigenciaFiltro ?? ''}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              onChange({ vigenciaFiltro: (e.target.value || null) as CotizacionVigenciaFiltro | null })
            }
            className={SELECT_CLASES}
          >
            <option value="">Cualquier vigencia</option>
            <option value="vigente">Vigentes</option>
            <option value="vencida">Vencidas</option>
          </select>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={filtros.enConsulta}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ enConsulta: e.target.checked })}
              className="rounded border-border"
            />
            Con líneas en consulta
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
