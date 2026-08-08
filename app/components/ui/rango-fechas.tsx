'use client';

import { useState } from 'react';
import { format, parse, startOfMonth, endOfMonth, subDays, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Primer consumidor de components/ui/calendar.tsx (huérfano desde la purga
// de componentes de la sesión de optimizaciones) y primer filtro por rango
// de fechas de todo el repo. Las props entran/salen como 'YYYY-MM-DD' (lo
// que viaja en la URL y en el query param del listado) — nunca como Date
// crudo, para no arrastrar el componente a la capa de datos.
//
// Conversión texto ↔ Date con date-fns, nunca `new Date('2026-08-08')`:
// ese constructor parsea la fecha como medianoche UTC, y en una zona
// negativa (México) el día mostrado se corre uno hacia atrás.
const FORMATO = 'yyyy-MM-dd';

function aFecha(s: string | null): Date | undefined {
  if (!s) return undefined;
  const d = parse(s, FORMATO, new Date());
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function aTexto(d: Date | undefined): string | null {
  return d ? format(d, FORMATO) : null;
}

interface Preset {
  label: string;
  rango: () => { desde: string | null; hasta: string | null };
}

const HOY = () => new Date();

const PRESETS: Preset[] = [
  { label: 'Hoy', rango: () => ({ desde: aTexto(HOY()), hasta: aTexto(HOY()) }) },
  { label: 'Últimos 7 días', rango: () => ({ desde: aTexto(subDays(HOY(), 6)), hasta: aTexto(HOY()) }) },
  { label: 'Últimos 30 días', rango: () => ({ desde: aTexto(subDays(HOY(), 29)), hasta: aTexto(HOY()) }) },
  { label: 'Este mes', rango: () => ({ desde: aTexto(startOfMonth(HOY())), hasta: aTexto(HOY()) }) },
  {
    label: 'Mes anterior',
    rango: () => {
      const anterior = subMonths(HOY(), 1);
      return { desde: aTexto(startOfMonth(anterior)), hasta: aTexto(endOfMonth(anterior)) };
    },
  },
];

export function RangoFechas({
  desde,
  hasta,
  onChange,
  placeholder = 'Cualquier fecha',
  className,
}: {
  desde: string | null;
  hasta: string | null;
  onChange: (rango: { desde: string | null; hasta: string | null }) => void;
  placeholder?: string;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const desdeFecha = aFecha(desde);
  const hastaFecha = aFecha(hasta);

  const etiqueta =
    desdeFecha && hastaFecha
      ? `${format(desdeFecha, 'd MMM yyyy', { locale: es })} – ${format(hastaFecha, 'd MMM yyyy', { locale: es })}`
      : desdeFecha
        ? `Desde ${format(desdeFecha, 'd MMM yyyy', { locale: es })}`
        : placeholder;

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('justify-start text-left font-normal text-sm', !desdeFecha && 'text-muted-foreground', className)}
        >
          <CalendarIcon className="w-4 h-4 mr-2 shrink-0" />
          <span className="truncate">{etiqueta}</span>
          {(desde || hasta) && (
            <X
              className="w-3.5 h-3.5 ml-2 shrink-0 opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onChange({ desde: null, hasta: null });
              }}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          <div className="flex sm:flex-col gap-1 p-2 border-b sm:border-b-0 sm:border-r border-border">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                variant="ghost"
                size="sm"
                className="justify-start text-xs whitespace-nowrap"
                onClick={() => onChange(p.rango())}
              >
                {p.label}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="justify-start text-xs text-muted-foreground"
              onClick={() => onChange({ desde: null, hasta: null })}
            >
              Limpiar
            </Button>
          </div>
          <Calendar
            mode="range"
            numberOfMonths={2}
            locale={es}
            defaultMonth={desdeFecha}
            selected={{ from: desdeFecha, to: hastaFecha }}
            onSelect={(rango) => onChange({ desde: aTexto(rango?.from), hasta: aTexto(rango?.to) })}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
