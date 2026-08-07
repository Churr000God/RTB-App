'use client';

// mapbox-gl toca `window` al importarse, así que MapaPuntoInner sólo puede
// correr en el cliente — se carga con next/dynamic y ssr:false, y este
// archivo es el único punto de importación para el resto de la app
// (import MapaPunto from '@/components/mapas/MapaPunto'), para no repetir
// el dynamic() en cada pantalla que necesita un mapa.
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const MapaPunto = dynamic(() => import('./MapaPuntoInner'), {
  ssr: false,
  loading: () => (
    <div className="h-64 rounded-lg bg-muted flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  ),
});

export default MapaPunto;
export type { MapaPuntoProps } from './MapaPuntoInner';
