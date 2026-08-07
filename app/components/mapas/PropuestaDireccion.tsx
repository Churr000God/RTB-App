'use client';

import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DireccionGeocodificada } from '@/lib/mapas/schemas';

interface PropuestaDireccionProps {
  direccion: DireccionGeocodificada | null;
  /** Sólo aquí se sobrescriben los campos del formulario — decisión
   *  confirmada: "proponer y que el usuario confirme", nunca en automático. */
  onUsar: (direccion: DireccionGeocodificada) => void;
  onDescartar: () => void;
}

export function PropuestaDireccion({ direccion, onUsar, onDescartar }: PropuestaDireccionProps) {
  if (!direccion) return null;
  return (
    <div className="sm:col-span-2 rounded-lg border border-rtb-teal/30 bg-rtb-surface p-3 space-y-2">
      <p className="text-xs font-semibold text-rtb-navy-mid">Dirección encontrada</p>
      <p className="text-sm text-rtb-navy">{direccion.texto_completo || 'Sin descripción disponible'}</p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => onUsar(direccion)}
          className="bg-rtb-teal hover:bg-rtb-teal/90 text-white"
        >
          <Check className="w-3.5 h-3.5" /> Usar esta dirección
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDescartar}>
          <X className="w-3.5 h-3.5" /> Descartar
        </Button>
      </div>
    </div>
  );
}
