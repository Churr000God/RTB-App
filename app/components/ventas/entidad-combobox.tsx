'use client';

import { useEffect, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Building2, Check, ChevronsUpDown, Loader2 } from 'lucide-react';

interface EntidadOpcion {
  id: string;
  clave: string;
  nombre_legal: string;
  nombre_comercial: string | null;
}

interface Props {
  value: string | null;
  onChange: (id: string | null, entidad: EntidadOpcion | null) => void;
  placeholder?: string;
}

// Mismo patrón que ProductoCombobox (components/inventario/): catálogo
// grande (miles de entidades) → búsqueda por servidor, no <select>
// precargado. Filtra a cliente/mixta — Ventas cotiza a un cliente, no a
// un proveedor puro.
export function EntidadCombobox({ value, onChange, placeholder = 'Buscar cliente…' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [opciones, setOpciones] = useState<EntidadOpcion[]>([]);
  const [seleccionado, setSeleccionado] = useState<EntidadOpcion | null>(null);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setLoading(true);
      fetch(`/api/entidades?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((data) => {
          const filas = (data.data ?? []) as (EntidadOpcion & { tipo: string })[];
          setOpciones(filas.filter((e) => e.tipo === 'cliente' || e.tipo === 'mixta'));
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, open]);

  useEffect(() => {
    if (!value) setSeleccionado(null);
  }, [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className="w-72 flex items-center justify-between text-sm border border-border rounded-lg px-3 py-2 bg-white text-left"
        >
          <span className={cn('truncate flex items-center gap-1.5', !seleccionado && 'text-muted-foreground')}>
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            {seleccionado ? seleccionado.nombre_comercial ?? seleccionado.nombre_legal : placeholder}
          </span>
          <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Razón social, siglas o clave…" value={query} onValueChange={setQuery} />
          <CommandList>
            {loading && (
              <div className="py-6 flex justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && <CommandEmpty>Sin clientes que coincidan.</CommandEmpty>}
            <CommandGroup>
              {opciones.map((e) => (
                <CommandItem
                  key={e.id}
                  value={e.id}
                  onSelect={() => {
                    setSeleccionado(e);
                    onChange(e.id, e);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === e.id ? 'opacity-100' : 'opacity-0')} />
                  <div className="flex flex-col">
                    <span className="text-sm">{e.nombre_comercial ?? e.nombre_legal}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{e.clave}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
