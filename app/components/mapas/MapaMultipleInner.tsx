'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Loader2, MapPinOff, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface MapaConfig {
  habilitado: boolean;
  token: string | null;
  estilo: string | null;
}

export interface PuntoMapa {
  id: string;
  latitud: number;
  longitud: number;
  titulo: string;
  subtitulo?: string;
  color?: string;
}

export interface MapaMultipleProps {
  puntos: PuntoMapa[];
  onPuntoClick?: (punto: PuntoMapa) => void;
  claseAltura?: string;
}

const CENTRO_DEFAULT: [number, number] = [-103.3496, 20.6597];

function escaparHtml(texto: string): string {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

// Sin acentos/mayúsculas, para que "bodega" encuentre "Bodega Norte" y
// "camion" encuentre "Camión".
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export default function MapaMultipleInner({ puntos, onPuntoClick, claseAltura = 'h-[32rem]' }: MapaMultipleProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<mapboxgl.Map | null>(null);
  const marcadoresRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const popupsRef = useRef<Map<string, mapboxgl.Popup>>(new Map());
  const activePopupRef = useRef<mapboxgl.Popup | null>(null);
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

  useEffect(() => {
    if (!config?.habilitado || !config.token || !contenedorRef.current || mapaRef.current) return;
    mapboxgl.accessToken = config.token;
    const mapa = new mapboxgl.Map({
      container: contenedorRef.current,
      style: config.estilo ?? 'mapbox://styles/mapbox/streets-v12',
      center: CENTRO_DEFAULT,
      zoom: 10,
    });
    mapa.addControl(new mapboxgl.NavigationControl(), 'top-right');
    mapaRef.current = mapa;
    setMapaListo(true);
    return () => {
      mapa.remove();
      mapaRef.current = null;
      setMapaListo(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // Abre el popup de un punto (por hover o por selección en el buscador),
  // cerrando cualquier otro que haya quedado abierto — un solo popup
  // visible a la vez, sin importar qué lo disparó.
  const abrirPopup = (id: string) => {
    const mapa = mapaRef.current;
    const marcador = marcadoresRef.current.get(id);
    const popup = popupsRef.current.get(id);
    if (!mapa || !marcador || !popup) return;
    if (activePopupRef.current && activePopupRef.current !== popup) activePopupRef.current.remove();
    popup.setLngLat(marcador.getLngLat()).addTo(mapa);
    activePopupRef.current = popup;
  };

  const cerrarPopup = (id: string) => {
    const popup = popupsRef.current.get(id);
    if (popup && activePopupRef.current === popup) {
      popup.remove();
      activePopupRef.current = null;
    }
  };

  const seleccionarPunto = (punto: PuntoMapa) => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    mapa.flyTo({ center: [punto.longitud, punto.latitud], zoom: 15, duration: 800 });
    abrirPopup(punto.id);
  };

  // Redibuja los marcadores cuando cambian los puntos o el mapa termina de
  // crearse (mapaListo cubre el caso en que `puntos` ya llegó antes de que
  // la configuración de Mapbox resolviera). El popup ya NO se liga con
  // marker.setPopup() (eso lo abre mapbox-gl al hacer clic, compitiendo
  // con onPuntoClick) — se abre/cierra a mano con mouseenter/mouseleave,
  // el mismo mecanismo que usa la selección del buscador.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo) return;

    marcadoresRef.current.forEach((m) => m.remove());
    popupsRef.current.forEach((p) => p.remove());
    marcadoresRef.current = new Map();
    popupsRef.current = new Map();
    activePopupRef.current = null;
    if (puntos.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    puntos.forEach((punto) => {
      const popup = new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(
        `<p style="font-weight:600;margin:0 0 2px;font-size:13px">${escaparHtml(punto.titulo)}</p>` +
          (punto.subtitulo
            ? `<p style="margin:0;font-size:12px;color:#6b7280">${escaparHtml(punto.subtitulo)}</p>`
            : '')
      );
      const marcador = new mapboxgl.Marker({ color: punto.color ?? '#159895' })
        .setLngLat([punto.longitud, punto.latitud])
        .addTo(mapa);

      const el = marcador.getElement();
      el.addEventListener('mouseenter', () => abrirPopup(punto.id));
      el.addEventListener('mouseleave', () => cerrarPopup(punto.id));
      if (onPuntoClick) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => onPuntoClick(punto));
      }

      marcadoresRef.current.set(punto.id, marcador);
      popupsRef.current.set(punto.id, popup);
      bounds.extend([punto.longitud, punto.latitud]);
    });

    mapa.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puntos, mapaListo]);

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

  return (
    <div className={`relative ${claseAltura}`}>
      <div ref={contenedorRef} className="w-full h-full rounded-lg overflow-hidden" />
      {puntos.length > 0 && <BuscadorPuntos puntos={puntos} onSeleccionar={seleccionarPunto} />}
    </div>
  );
}

function BuscadorPuntos({
  puntos,
  onSeleccionar,
}: {
  puntos: PuntoMapa[];
  onSeleccionar: (punto: PuntoMapa) => void;
}) {
  const [texto, setTexto] = useState('');
  const [enfocado, setEnfocado] = useState(false);

  const resultados = useMemo(() => {
    const q = normalizar(texto.trim());
    if (!q) return [];
    return puntos
      .filter((p) => normalizar(p.titulo).includes(q) || (p.subtitulo && normalizar(p.subtitulo).includes(q)))
      .slice(0, 8);
  }, [puntos, texto]);

  const mostrarDropdown = enfocado && texto.trim() !== '';

  return (
    <div className="absolute top-3 left-3 z-10 w-64">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onFocus={() => setEnfocado(true)}
          onBlur={() => setEnfocado(false)}
          placeholder="Buscar por nombre…"
          className="pl-8 pr-7 h-9 text-sm bg-white"
          style={{ boxShadow: 'var(--shadow-sm)' }}
        />
        {texto && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setTexto('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-rtb-navy"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {mostrarDropdown && (
        <div
          className="mt-1 bg-white rounded-lg overflow-hidden max-h-72 overflow-y-auto"
          style={{ boxShadow: 'var(--shadow-md, var(--shadow-sm))' }}
        >
          {resultados.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3 py-2">Sin resultados.</p>
          ) : (
            resultados.map((p) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSeleccionar(p);
                  setTexto('');
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-rtb-surface/60 border-b border-border/50 last:border-0"
              >
                <p className="font-medium text-rtb-navy truncate">{p.titulo}</p>
                {p.subtitulo && <p className="text-xs text-muted-foreground truncate">{p.subtitulo}</p>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
