'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Loader2, MapPinOff } from 'lucide-react';

interface MapaConfig {
  habilitado: boolean;
  token: string | null;
  estilo: string | null;
}

export interface MapaPuntoProps {
  latitud: number | null;
  longitud: number | null;
  /** Pin arrastrable + clic en el mapa reposiciona (decisión: "ambas: pin
   *  en mapa + campos lat/long"). En falso, sólo lectura. */
  editable?: boolean;
  onCoordenadaChange?: (lat: number, lng: number) => void;
  /** Clase Tailwind de altura del contenedor — literal, no interpolada,
   *  para que Tailwind la detecte en el archivo que la pasa. */
  claseAltura?: string;
}

// Guadalajara — la mayoría de las direcciones de RTB están en Jalisco
// (mismo criterio que el valor de partida de "Estado" en
// dashboard/entidades/nueva/page.tsx).
const CENTRO_DEFAULT: [number, number] = [-103.3496, 20.6597];

export default function MapaPuntoInner({
  latitud,
  longitud,
  editable = false,
  onCoordenadaChange,
  claseAltura = 'h-64',
}: MapaPuntoProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<mapboxgl.Map | null>(null);
  const marcadorRef = useRef<mapboxgl.Marker | null>(null);
  const [config, setConfig] = useState<MapaConfig | null>(null);
  const [mapaListo, setMapaListo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch('/api/mapa/config')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelado) setConfig(data);
      })
      .catch(() => {
        if (!cancelado) setError('No se pudo cargar la configuración del mapa');
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // Crea el mapa una sola vez, en cuanto llega la configuración.
  useEffect(() => {
    if (!config?.habilitado || !config.token || !contenedorRef.current || mapaRef.current) return;

    mapboxgl.accessToken = config.token;
    const centro: [number, number] = latitud != null && longitud != null ? [longitud, latitud] : CENTRO_DEFAULT;
    const mapa = new mapboxgl.Map({
      container: contenedorRef.current,
      style: config.estilo ?? 'mapbox://styles/mapbox/streets-v12',
      center: centro,
      zoom: latitud != null ? 15 : 11,
    });
    mapa.addControl(new mapboxgl.NavigationControl(), 'top-right');

    if (editable) {
      mapa.on('click', (e) => onCoordenadaChange?.(e.lngLat.lat, e.lngLat.lng));
    }

    mapaRef.current = mapa;
    setMapaListo(true);

    return () => {
      mapa.remove();
      mapaRef.current = null;
      marcadorRef.current = null;
      setMapaListo(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // Sincroniza el pin cuando latitud/longitud cambian — desde los campos de
  // texto, desde "usar esta dirección", o al terminar de crear el mapa.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo) return;

    if (latitud == null || longitud == null) {
      marcadorRef.current?.remove();
      marcadorRef.current = null;
      return;
    }

    if (!marcadorRef.current) {
      const marcador = new mapboxgl.Marker({ draggable: editable, color: '#159895' })
        .setLngLat([longitud, latitud])
        .addTo(mapa);
      if (editable) {
        marcador.on('dragend', () => {
          const { lat, lng } = marcador.getLngLat();
          onCoordenadaChange?.(lat, lng);
        });
      }
      marcadorRef.current = marcador;
    } else {
      marcadorRef.current.setLngLat([longitud, latitud]);
    }
    mapa.easeTo({ center: [longitud, latitud], duration: 300 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitud, longitud, mapaListo]);

  if (error) {
    return (
      <div
        className={`${claseAltura} rounded-lg bg-muted flex items-center justify-center gap-2 text-sm text-muted-foreground`}
      >
        <MapPinOff className="w-4 h-4" /> {error}
      </div>
    );
  }

  if (!config) {
    return (
      <div className={`${claseAltura} rounded-lg bg-muted flex items-center justify-center`}>
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config.habilitado) {
    return (
      <div
        className={`${claseAltura} rounded-lg bg-muted flex flex-col items-center justify-center gap-1 px-4 text-center text-sm text-muted-foreground`}
      >
        <MapPinOff className="w-5 h-5" />
        <span>El mapa no está configurado todavía.</span>
      </div>
    );
  }

  return <div ref={contenedorRef} className={`${claseAltura} rounded-lg overflow-hidden`} />;
}
