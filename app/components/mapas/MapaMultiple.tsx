'use client';

// Mismo motivo que MapaPunto.tsx: mapbox-gl toca `window`, así que
// MapaMultipleInner sólo puede correr en cliente.
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const MapaMultiple = dynamic(() => import('./MapaMultipleInner'), {
  ssr: false,
  loading: () => (
    <div className="h-[32rem] rounded-lg bg-muted flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  ),
});

export default MapaMultiple;
export type { MapaMultipleProps, PuntoMapa } from './MapaMultipleInner';
