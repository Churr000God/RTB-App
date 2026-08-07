'use client';

import { useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DireccionGeocodificada } from '@/lib/mapas/schemas';

interface CampoCoordenadaProps {
  latitud: string;
  longitud: string;
  onLatitudChange: (valor: string) => void;
  onLongitudChange: (valor: string) => void;
  /** Se dispara al pulsar "Obtener dirección de esta coordenada" y Mapbox
   *  encuentra un resultado — el padre decide qué hacer (mostrarlo en
   *  PropuestaDireccion y esperar confirmación, nunca sobrescribir solo). */
  onGeocodificado?: (direccion: DireccionGeocodificada) => void;
}

/** Pega "20.6736, -103.3440" (como se copia desde Google Maps en el
 *  celular) en el campo de latitud y separa ambos valores. */
function parsearPegado(texto: string): [string, string] | null {
  const m = texto.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  return m ? [m[1], m[2]] : null;
}

export function CampoCoordenada({
  latitud,
  longitud,
  onLatitudChange,
  onLongitudChange,
  onGeocodificado,
}: CampoCoordenadaProps) {
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePasteLatitud = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const par = parsearPegado(e.clipboardData.getData('text'));
    if (!par) return;
    e.preventDefault();
    onLatitudChange(par[0]);
    onLongitudChange(par[1]);
  };

  const obtenerDireccion = async () => {
    if (!latitud || !longitud) return;
    setError(null);
    setBuscando(true);
    try {
      const res = await fetch(
        `/api/geocodificacion?modo=inverso&latitud=${encodeURIComponent(latitud)}&longitud=${encodeURIComponent(longitud)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'No se pudo obtener la dirección');
        return;
      }
      onGeocodificado?.(data.data);
    } catch {
      setError('Error de conexión al geocodificar');
    } finally {
      setBuscando(false);
    }
  };

  return (
    <div className="sm:col-span-2 space-y-2">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs font-semibold text-rtb-navy-mid">Latitud</Label>
          <Input
            value={latitud}
            onChange={(e) => onLatitudChange(e.target.value)}
            onPaste={handlePasteLatitud}
            placeholder="20.6736"
            className="tabular-nums mt-1"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-rtb-navy-mid">Longitud</Label>
          <Input
            value={longitud}
            onChange={(e) => onLongitudChange(e.target.value)}
            placeholder="-103.3440"
            className="tabular-nums mt-1"
          />
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={obtenerDireccion}
        disabled={!latitud || !longitud || buscando}
      >
        {buscando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
        Obtener dirección de esta coordenada
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
