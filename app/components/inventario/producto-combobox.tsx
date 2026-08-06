'use client';

import { useEffect, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, Loader2, Package } from 'lucide-react';

interface ProductoOpcion {
  id: string;
  codigo_interno: string;
  nombre: string;
  sku: string | null;
}

interface Props {
  value: string | null;
  onChange: (id: string | null, producto: ProductoOpcion | null) => void;
  placeholder?: string;
}

// M-03 (contexto/AUDITORIA_QA_ROLES_2026-08-06.md): "Producto ID" era un
// <Input> de texto libre — la pantalla de ubicaciones/productos nunca
// muestra el UUID en ningún lado, así que el usuario no tenía de dónde
// copiarlo. Respaldado por GET /api/productos?q= (ya soporta búsqueda por
// nombre/código/SKU y escapa %/_), no por un <select> con miles de
// productos precargados. `components/ui/command.tsx` (cmdk) ya estaba en
// el proyecto sin ningún consumidor — este es el primero.
export function ProductoCombobox({ value, onChange, placeholder = 'Buscar producto…' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [opciones, setOpciones] = useState<ProductoOpcion[]>([]);
  const [seleccionado, setSeleccionado] = useState<ProductoOpcion | null>(null);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setLoading(true);
      fetch(`/api/productos?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((data) => setOpciones(data.data ?? []))
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, open]);

  // Si el padre resetea value a null (línea agregada), limpia también la
  // etiqueta local — evita mostrar el producto anterior con el campo vacío.
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
          className="w-64 flex items-center justify-between text-sm border border-border rounded-lg px-3 py-2 bg-white text-left"
        >
          <span className={cn('truncate flex items-center gap-1.5', !seleccionado && 'text-muted-foreground')}>
            <Package className="w-3.5 h-3.5 shrink-0" />
            {seleccionado ? `${seleccionado.codigo_interno} — ${seleccionado.nombre}` : placeholder}
          </span>
          <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Nombre, código o SKU…" value={query} onValueChange={setQuery} />
          <CommandList>
            {loading && (
              <div className="py-6 flex justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && <CommandEmpty>Sin productos que coincidan.</CommandEmpty>}
            <CommandGroup>
              {opciones.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() => {
                    setSeleccionado(p);
                    onChange(p.id, p);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === p.id ? 'opacity-100' : 'opacity-0')} />
                  <div className="flex flex-col">
                    <span className="text-sm">{p.nombre}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {p.codigo_interno} {p.sku ? `· SKU ${p.sku}` : ''}
                    </span>
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
